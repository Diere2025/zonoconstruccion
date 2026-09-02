"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  ShieldCheck, 
  Search, 
  RefreshCw, 
  Volume2, 
  VolumeX, 
  Sparkles, 
  SlidersHorizontal, 
  Copy, 
  Check, 
  Trash2, 
  Smartphone, 
  Plus, 
  ExternalLink, 
  ArrowUpRight, 
  QrCode, 
  CreditCard, 
  Send, 
  X, 
  AlertCircle, 
  TrendingUp, 
  Clock, 
  Wallet,
  CheckCircle2,
  Inbox,
  Loader2,
  Eye,
  EyeOff,
  Link2,
  PackageCheck,
  ShoppingBag,
  UserCheck,
  ChevronRight,
  Filter,
  UserX,
  Users2,
  Lock,
  Unlock,
  Settings
} from 'lucide-react';

interface MPPayment {
  id: string;
  account_id: string;
  account_name: string;
  amount: number;
  formatted_amount: string;
  payer_name: string;
  payment_type: 'TRANSFERENCIA' | 'QR' | 'POINT' | 'OTRO';
  source: string;
  received_at: string;
  raw_title?: string;
  raw_body?: string;
  is_verified?: boolean;
  is_hidden?: boolean;
  is_internal?: boolean;
  order_id?: string;
  order_code?: string;
  linked_by?: string;
  linked_at?: string;
  notes?: string;
}

interface MPAccount {
  id: string;
  name: string;
  alias?: string;
  color?: string;
  is_active?: boolean;
}

interface MPInternalPayer {
  id: string;
  name: string;
  normalized_name: string;
  notes?: string;
  created_at?: string;
}

interface OrderSearchResult {
  id: string;
  order_code: string;
  client_name: string;
  total_amount: number;
  status: string;
  created_at: string;
}

type UserRole = 'admin' | 'administracion' | 'logistica' | 'seller' | 'fletero';

export default function CobrosMercadoPagoPage() {
  const [payments, setPayments] = useState<MPPayment[]>([]);
  const [accounts, setAccounts] = useState<MPAccount[]>([]);
  const [internalPayers, setInternalPayers] = useState<MPInternalPayer[]>([]);
  const [stats, setStats] = useState<{ totalCount: number; totalAmount: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRealtimeActive, setIsRealtimeActive] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // User & Role State
  const [currentUserRole, setCurrentUserRole] = useState<UserRole>('admin');
  const [currentUserName, setCurrentUserName] = useState('Usuario');
  const [isRoleLoaded, setIsRoleLoaded] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('ALL');
  const [selectedType, setSelectedType] = useState('ALL');
  const [selectedDateRange, setSelectedDateRange] = useState('TODAY');
  const [showHidden, setShowHidden] = useState(false);

  // Modals
  const [showTaskerGuide, setShowTaskerGuide] = useState(false);
  const [showSimulator, setShowSimulator] = useState(false);
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
  const [showInternalPayersModal, setShowInternalPayersModal] = useState(false);
  const [showAccountsModal, setShowAccountsModal] = useState(false);

  // Internal Payers Management State
  const [newInternalName, setNewInternalName] = useState('');
  const [newInternalNotes, setNewInternalNotes] = useState('');
  const [isSavingInternal, setIsSavingInternal] = useState(false);

  // Accounts Management State
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [accName, setAccName] = useState('');
  const [accAlias, setAccAlias] = useState('');
  const [accColor, setAccColor] = useState('#0069ff');
  const [isSavingAccount, setIsSavingAccount] = useState(false);

  // Order Linking Modal State
  const [linkingPayment, setLinkingPayment] = useState<MPPayment | null>(null);
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [orderSearchResults, setOrderSearchResults] = useState<OrderSearchResult[]>([]);
  const [isSearchingOrders, setIsSearchingOrders] = useState(false);
  const [manualOrderCode, setManualOrderCode] = useState('');
  const [isSavingLink, setIsSavingLink] = useState(false);

  // Form states for simulator
  const [simName, setSimName] = useState('Mariana Gómez');
  const [simAmount, setSimAmount] = useState('18500');
  const [simType, setSimType] = useState('TRANSFERENCIA');
  const [simAccount, setSimAccount] = useState('Cuenta MP3');
  const [simLoading, setSimLoading] = useState(false);

  const [purgeLoading, setPurgeLoading] = useState(false);
  const [maintenanceMsg, setMaintenanceMsg] = useState<string | null>(null);

  // Unified Amount Formatter (No decimals if integer, with decimals if has cents)
  const formatMPAmount = useCallback((amount: number | string) => {
    const num = typeof amount === 'number' ? amount : parseFloat(String(amount).replace(/[^0-9.-]+/g, '')) || 0;
    const hasDecimals = num % 1 !== 0;
    return `$ ${num.toLocaleString('es-AR', {
      minimumFractionDigits: hasDecimals ? 2 : 0,
      maximumFractionDigits: 2
    })}`;
  }, []);

  // Account Display Resolver (Resolves Alias, Name, Color)
  const getAccountDisplay = useCallback((accountNameOrId: string) => {
    const clean = (accountNameOrId || '').toLowerCase().trim();
    const acc = accounts.find(a => 
      a.id.toLowerCase() === clean || 
      a.name.toLowerCase() === clean || 
      (a.alias && a.alias.toLowerCase() === clean)
    );
    return {
      displayName: acc?.alias || acc?.name || accountNameOrId || 'diegozono.mp',
      fullName: acc?.name || accountNameOrId || 'Cuenta MP3',
      alias: acc?.alias || 'diegozono.mp',
      color: acc?.color || '#0069ff'
    };
  }, [accounts]);

  // Day Info Helper for Date Grouping
  const getDayInfo = useCallback((dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const now = new Date();

      const paymentDate = d.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
      const todayDate = now.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
      
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const yesterdayDate = yesterday.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });

      const weekdayMonth = d.toLocaleDateString('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        weekday: 'long',
        day: 'numeric',
        month: 'long'
      });
      const formattedText = weekdayMonth.charAt(0).toUpperCase() + weekdayMonth.slice(1);

      if (paymentDate === todayDate) {
        return {
          key: paymentDate,
          sectionTitle: 'Hoy',
          subTitle: formattedText,
          isToday: true,
          isYesterday: false,
          isPast: false
        };
      } else if (paymentDate === yesterdayDate) {
        return {
          key: paymentDate,
          sectionTitle: 'Ayer',
          subTitle: formattedText,
          isToday: false,
          isYesterday: true,
          isPast: true
        };
      } else {
        return {
          key: paymentDate,
          sectionTitle: formattedText,
          subTitle: '',
          isToday: false,
          isYesterday: false,
          isPast: true
        };
      }
    } catch {
      return {
        key: 'unknown',
        sectionTitle: 'Transacciones Anteriores',
        subTitle: '',
        isToday: false,
        isYesterday: false,
        isPast: true
      };
    }
  }, []);

  const groupedPayments = useMemo(() => {
    const groups: { [key: string]: { key: string; sectionTitle: string; subTitle: string; isToday: boolean; isYesterday: boolean; isPast: boolean; payments: MPPayment[] } } = {};

    for (const p of payments) {
      const info = getDayInfo(p.received_at);
      if (!groups[info.key]) {
        groups[info.key] = {
          key: info.key,
          sectionTitle: info.sectionTitle,
          subTitle: info.subTitle,
          isToday: info.isToday,
          isYesterday: info.isYesterday,
          isPast: info.isPast,
          payments: []
        };
      }
      groups[info.key].payments.push(p);
    }

    return Object.values(groups);
  }, [payments, getDayInfo]);

  // 1. Detect User and Role
  useEffect(() => {
    async function detectUserRole() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setIsRoleLoaded(true);
          return;
        }

        const emailLower = (user.email || '').toLowerCase();
        let detectedRole: UserRole = 'seller';
        let detectedName = user.email?.split('@')[0] || 'Usuario';

        // Check if Admin
        if (
          emailLower === 'diego.boveda@gmail.com' ||
          emailLower.includes('admin') ||
          emailLower.includes('diego') ||
          emailLower === 'caroibarra.93@gmail.com'
        ) {
          detectedRole = 'admin';
          detectedName = 'Diego Bóveda';
        }

        // Check in sellers table
        const { data: seller } = await supabase
          .from('sellers')
          .select('id, full_name, role')
          .or(`id.eq.${user.id},email.ilike.${emailLower}`)
          .maybeSingle();

        if (seller) {
          if (seller.full_name) detectedName = seller.full_name;
          const r = (seller.role || '').toLowerCase();
          if (r === 'admin') detectedRole = 'admin';
          else if (r === 'administracion' || r === 'admin_staff') detectedRole = 'administracion';
          else if (r === 'logistica' || r === 'deposito') detectedRole = 'logistica';
          else if (r === 'fletero' || r === 'chofer' || r === 'transportista') detectedRole = 'fletero';
          else detectedRole = 'seller';
        }

        setCurrentUserRole(detectedRole);
        setCurrentUserName(detectedName);

        // Adjust default range per role
        if (detectedRole === 'seller') {
          setSelectedDateRange('LAST_3_DAYS');
          setSelectedType('TRANSFERENCIA');
        } else if (detectedRole === 'logistica') {
          setSelectedDateRange('LAST_3_DAYS');
        } else if (detectedRole === 'fletero') {
          setSelectedDateRange('LAST_HOUR');
        }
      } catch (err) {
        console.warn('Error detecting user role:', err);
      } finally {
        setIsRoleLoaded(true);
      }
    }

    detectUserRole();
  }, []);

  // Play audio chime
  const playChime = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08); // A5
      osc.frequency.setValueAtTime(1174.66, ctx.currentTime + 0.16); // D6

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    } catch {
      // Audio not permitted or supported
    }
  }, [soundEnabled]);

  // Load Accounts
  const loadAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/cobros-mp-data?action=accounts');
      const data = await res.json();
      if (data.success && data.data) {
        setAccounts(data.data);
      }
    } catch (e) {
      console.error('Error loading MP accounts:', e);
    }
  }, []);

  // Load Internal Payers
  const loadInternalPayers = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/cobros-mp-data?action=internal-payers');
      const data = await res.json();
      if (data.success && data.data) {
        setInternalPayers(data.data);
      }
    } catch (e) {
      console.error('Error loading internal payers:', e);
    }
  }, []);

  // Load Payments
  const loadPayments = useCallback(async () => {
    if (!isRoleLoaded) return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        action: 'list',
        role: currentUserRole,
        accountId: selectedAccountId,
        dateRange: selectedDateRange,
        type: selectedType,
        search: search,
        showHidden: showHidden ? 'true' : 'false'
      });
      const res = await fetch(`/api/admin/cobros-mp-data?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setPayments(data.data || []);
        setStats(data.todayStats || null);
      }
    } catch (e) {
      console.error('Error loading MP payments:', e);
    } finally {
      setIsLoading(false);
    }
  }, [currentUserRole, isRoleLoaded, selectedAccountId, selectedDateRange, selectedType, search, showHidden]);

  useEffect(() => {
    loadAccounts();
    loadInternalPayers();
  }, [loadAccounts, loadInternalPayers]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  // Periodic background refresh fallback (every 12 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      loadPayments();
    }, 12000);
    return () => clearInterval(interval);
  }, [loadPayments]);

  // Supabase Realtime Subscription
  useEffect(() => {
    const channel = supabase
      .channel('mp_payments_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mp_payments' },
        (payload) => {
          const newPayment = payload.new as MPPayment;
          const isStaff = currentUserRole === 'admin' || currentUserRole === 'administracion';
          if (!isStaff && newPayment.is_internal) return;

          setPayments((prev) => {
            if (prev.some((p) => p.id === newPayment.id)) return prev;
            return [newPayment, ...prev];
          });
          if (stats) {
            setStats((prev) => prev ? ({
              totalCount: prev.totalCount + 1,
              totalAmount: prev.totalAmount + (Number(newPayment.amount) || 0)
            }) : null);
          }
          playChime();
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'mp_payments' },
        (payload) => {
          const updated = payload.new as MPPayment;
          const isStaff = currentUserRole === 'admin' || currentUserRole === 'administracion';
          if (!isStaff && updated.is_internal) {
            setPayments((prev) => prev.filter((p) => p.id !== updated.id));
            return;
          }
          setPayments((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'mp_payments' },
        (payload) => {
          const deletedId = (payload.old as any)?.id;
          if (deletedId) {
            setPayments((prev) => prev.filter((p) => p.id !== deletedId));
          }
        }
      )
      .subscribe((status) => {
        setIsRealtimeActive(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [playChime, stats, currentUserRole]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Order Search for Linking
  const searchOrders = async (queryText: string) => {
    setIsSearchingOrders(true);
    try {
      const res = await fetch(`/api/admin/cobros-mp-data?action=search-orders&q=${encodeURIComponent(queryText)}`);
      const data = await res.json();
      if (data.success) {
        setOrderSearchResults(data.data || []);
      }
    } catch (err) {
      console.error('Error searching orders:', err);
    } finally {
      setIsSearchingOrders(false);
    }
  };

  // Open Linking Modal
  const handleOpenLinkModal = (payment: MPPayment) => {
    setLinkingPayment(payment);
    setManualOrderCode(payment.order_code || '');
    setOrderSearchQuery('');
    setOrderSearchResults([]);
    searchOrders('');
  };

  // Link Order to Payment
  const handleLinkOrder = async (orderId?: string, orderCode?: string) => {
    if (!linkingPayment) return;
    const finalCode = (orderCode || manualOrderCode).trim().toUpperCase();
    if (!finalCode) {
      alert('Por favor ingrese o seleccione un código de pedido.');
      return;
    }

    setIsSavingLink(true);
    try {
      const res = await fetch('/api/admin/cobros-mp-data?action=link-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentId: linkingPayment.id,
          orderId: orderId || null,
          orderCode: finalCode,
          linkedBy: currentUserName
        })
      });

      const data = await res.json();
      if (data.success && data.payment) {
        setPayments(prev => prev.map(p => p.id === data.payment.id ? data.payment : p));
        setLinkingPayment(null);
      } else {
        alert('Error vinculando pedido: ' + (data.error || 'Error desconocido'));
      }
    } catch (err: any) {
      alert('Error de conexión al vincular pedido: ' + err.message);
    } finally {
      setIsSavingLink(false);
    }
  };

  // Unlink Order
  const handleUnlinkOrder = async (paymentId: string) => {
    if (!confirm('¿Desea desvincular el pedido asignado a esta transacción?')) return;
    try {
      const res = await fetch('/api/admin/cobros-mp-data?action=unlink-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId })
      });
      const data = await res.json();
      if (data.success && data.payment) {
        setPayments(prev => prev.map(p => p.id === data.payment.id ? data.payment : p));
        if (linkingPayment?.id === paymentId) {
          setLinkingPayment(null);
        }
      }
    } catch (err: any) {
      alert('Error al desvincular: ' + err.message);
    }
  };

  // Toggle Internal Payer directly from Transaction
  const handleToggleInternalFromPayment = async (payment: MPPayment) => {
    const willBeInternal = !payment.is_internal;
    const confirmMsg = willBeInternal
      ? `¿Marcar a "${payment.payer_name}" como Usuario Propio?\n\nEsta y todas sus transacciones quedarán ocultas para vendedoras y logística, y se resaltarán en color violeta para Administración/Admin.`
      : `¿Desmarcar a "${payment.payer_name}" como Usuario Propio?\n\nSus transacciones volverán a ser visibles según el rol del usuario.`;

    if (!confirm(confirmMsg)) return;

    try {
      const res = await fetch('/api/admin/cobros-mp-data?action=toggle-internal-payer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentId: payment.id,
          payerName: payment.payer_name,
          isInternal: willBeInternal
        })
      });
      const data = await res.json();
      if (data.success) {
        const norm = payment.payer_name.toLowerCase().trim();
        setPayments(prev => prev.map(p => {
          if (p.id === payment.id || p.payer_name.toLowerCase().trim() === norm) {
            return { ...p, is_internal: willBeInternal };
          }
          return p;
        }));
        loadInternalPayers();
      }
    } catch (err: any) {
      alert('Error al modificar usuario propio: ' + err.message);
    }
  };

  // Add Internal Payer from Modal
  const handleAddInternalPayer = async () => {
    if (!newInternalName.trim()) return;
    setIsSavingInternal(true);
    try {
      const res = await fetch('/api/admin/cobros-mp-data?action=add-internal-payer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newInternalName.trim(),
          notes: newInternalNotes.trim()
        })
      });
      const data = await res.json();
      if (data.success) {
        setNewInternalName('');
        setNewInternalNotes('');
        loadInternalPayers();
        loadPayments();
      }
    } catch (err: any) {
      alert('Error agregando persona oculta: ' + err.message);
    } finally {
      setIsSavingInternal(false);
    }
  };

  // Remove Internal Payer from Modal
  const handleRemoveInternalPayer = async (payer: MPInternalPayer) => {
    if (!confirm(`¿Eliminar a "${payer.name}" de la lista de personas ocultas/propias?`)) return;
    try {
      const res = await fetch('/api/admin/cobros-mp-data?action=remove-internal-payer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: payer.id, name: payer.name })
      });
      const data = await res.json();
      if (data.success) {
        loadInternalPayers();
        loadPayments();
      }
    } catch (err: any) {
      alert('Error eliminando persona: ' + err.message);
    }
  };

  // Save / Update Account (Name, Alias, Color)
  const handleSaveAccount = async () => {
    if (!accName.trim()) return;
    setIsSavingAccount(true);
    try {
      const res = await fetch('/api/admin/cobros-mp-data?action=save-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingAccountId || undefined,
          name: accName.trim(),
          alias: accAlias.trim() || accName.trim(),
          color: accColor
        })
      });
      const data = await res.json();
      if (data.success) {
        setEditingAccountId(null);
        setAccName('');
        setAccAlias('');
        setAccColor('#0069ff');
        loadAccounts();
        loadPayments();
      }
    } catch (err: any) {
      alert('Error guardando cuenta: ' + err.message);
    } finally {
      setIsSavingAccount(false);
    }
  };

  // Admin: Toggle Hide
  const handleToggleHide = async (payment: MPPayment) => {
    const newHide = !payment.is_hidden;
    try {
      const res = await fetch('/api/admin/cobros-mp-data?action=toggle-hide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId: payment.id, isHidden: newHide })
      });
      const data = await res.json();
      if (data.success) {
        if (showHidden) {
          setPayments(prev => prev.map(p => p.id === payment.id ? { ...p, is_hidden: newHide } : p));
        } else {
          setPayments(prev => prev.filter(p => p.id !== payment.id));
        }
      }
    } catch (err: any) {
      alert('Error al cambiar visibilidad: ' + err.message);
    }
  };

  // Admin: Delete Payment
  const handleDeletePayment = async (paymentId: string, payer: string, amountFormatted: string) => {
    if (!confirm(`¿Está seguro de eliminar definitivamente la transacción de ${payer} por ${amountFormatted}?`)) return;
    try {
      const res = await fetch('/api/admin/cobros-mp-data?action=delete-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId })
      });
      const data = await res.json();
      if (data.success) {
        setPayments(prev => prev.filter(p => p.id !== paymentId));
      } else {
        alert('Error al eliminar: ' + (data.error || 'Error desconocido'));
      }
    } catch (err: any) {
      alert('Error al eliminar: ' + err.message);
    }
  };

  // Format Date for display
  const formatDateDisplay = (dateString: string) => {
    try {
      const d = new Date(dateString);
      return d.toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }) + ' hs';
    } catch {
      return dateString;
    }
  };

  const isSellerRole = currentUserRole === 'seller';
  const isLogisticaRole = currentUserRole === 'logistica';
  const isFleteroRole = currentUserRole === 'fletero';
  const isAdminOrStaff = currentUserRole === 'admin' || currentUserRole === 'administracion';
  const isFullAdmin = currentUserRole === 'admin';

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://zono-erp.pages.dev';
  const webhookUrl = `${currentOrigin}/api/mp-webhook`;

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 pb-20">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200/80 shadow-xs backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#0069ff] flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-black text-[#001538] tracking-tight">Cobros Mercado Pago</h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-50 text-[#0069ff] border border-blue-200">
                  {currentUserRole === 'admin' ? 'Administrador' :
                   currentUserRole === 'administracion' ? 'Administración' :
                   currentUserRole === 'logistica' ? 'Logística' :
                   currentUserRole === 'fletero' ? 'Fletero' : 'Ventas'}
                </span>
                <div className={`w-2 h-2 rounded-full ${isRealtimeActive ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`} title={isRealtimeActive ? 'Conectado a Realtime' : 'Conectando...'} />
              </div>
              <p className="text-xs text-slate-500 font-medium">
                {isSellerRole ? 'Transferencias entrantes (Últimos 3 días)' :
                 isLogisticaRole ? 'Cobros y transferencias para despacho (Últimos 3 días)' :
                 isFleteroRole ? 'Verificación de cobros en viaje (Última hora)' :
                 'Centro de Control y Conciliación en Tiempo Real'}
              </p>
            </div>
          </div>

          {/* Top Actions */}
          <div className="flex items-center gap-2">
            {isAdminOrStaff && (
              <>
                <button
                  onClick={() => setShowAccountsModal(true)}
                  className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 border border-blue-200 text-[#0069ff] text-xs font-bold hover:bg-blue-100 shadow-xs transition-all"
                  title="Configurar Cuentas y Alias"
                >
                  <Settings className="w-4 h-4" />
                  <span>Cuentas y Alias</span>
                </button>

                <button
                  onClick={() => setShowInternalPayersModal(true)}
                  className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-50 border border-purple-200 text-purple-700 text-xs font-bold hover:bg-purple-100 shadow-xs transition-all"
                  title="Lista de Personas Ocultas / Usuarios Propios"
                >
                  <Users2 className="w-4 h-4 text-purple-600" />
                  <span>Personas Ocultas ({internalPayers.length})</span>
                </button>
              </>
            )}

            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`p-2 rounded-xl border transition-all ${
                soundEnabled 
                  ? 'bg-blue-50/80 border-blue-200 text-[#0069ff] hover:bg-blue-100' 
                  : 'bg-slate-100 border-slate-200 text-slate-400 hover:text-slate-600'
              }`}
              title={soundEnabled ? 'Sonido Activado' : 'Sonido Silenciado'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            <button
              onClick={() => loadPayments()}
              disabled={isLoading}
              className="p-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-all disabled:opacity-50"
              title="Refrescar Lista"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-[#0069ff]' : ''}`} />
            </button>

            {isFullAdmin && (
              <>
                <button
                  onClick={() => setShowTaskerGuide(true)}
                  className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 shadow-xs"
                >
                  <Smartphone className="w-4 h-4 text-[#0069ff]" /> Conectar Tasker
                </button>

                <button
                  onClick={() => setShowSimulator(true)}
                  className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs font-bold shadow-md shadow-blue-500/20 hover:opacity-95"
                >
                  <Sparkles className="w-4 h-4" /> Simular Cobro
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        
        {/* KPI Summary Cards (Hidden for sellers, logistica, and fleteros) */}
        {isAdminOrStaff && stats && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-5 rounded-3xl bg-white border border-slate-200/80 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Recaudado Hoy</span>
                <div className="text-2xl sm:text-3xl font-black text-[#001538] mt-0.5">
                  {formatMPAmount(stats.totalAmount)}
                </div>
                <span className="text-[11px] text-slate-500 font-medium">Ingresos de hoy en cuentas vinculadas</span>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 font-bold shadow-xs">
                <Wallet className="w-6 h-6" />
              </div>
            </div>

            <div className="p-5 rounded-3xl bg-white border border-slate-200/80 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Transacciones de Hoy</span>
                <div className="text-2xl sm:text-3xl font-black text-[#001538] mt-0.5">
                  {stats.totalCount}
                </div>
                <span className="text-[11px] text-slate-500 font-medium">Cobros recibidos y validados</span>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-[#0069ff] font-bold shadow-xs">
                <CheckCircle2 className="w-6 h-6" />
              </div>
            </div>
          </div>
        )}

        {/* Filters and Controls */}
        <div className="p-4 sm:p-5 rounded-3xl bg-white border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por pagador, importe, código de pedido (JS...)..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#0069ff]/20 focus:border-[#0069ff] transition-all"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Date Range Selector (Adapted to user role) */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
              {isAdminOrStaff && (
                <>
                  <button
                    onClick={() => setSelectedDateRange('TODAY')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                      selectedDateRange === 'TODAY' 
                        ? 'bg-[#0069ff] text-white shadow-xs' 
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Hoy
                  </button>
                  <button
                    onClick={() => setSelectedDateRange('YESTERDAY')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                      selectedDateRange === 'YESTERDAY' 
                        ? 'bg-[#0069ff] text-white shadow-xs' 
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Ayer
                  </button>
                  <button
                    onClick={() => setSelectedDateRange('LAST_3_DAYS')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                      selectedDateRange === 'LAST_3_DAYS' 
                        ? 'bg-[#0069ff] text-white shadow-xs' 
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    3 Días
                  </button>
                  <button
                    onClick={() => setSelectedDateRange('LAST_7_DAYS')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                      selectedDateRange === 'LAST_7_DAYS' 
                        ? 'bg-[#0069ff] text-white shadow-xs' 
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    7 Días
                  </button>
                  <button
                    onClick={() => setSelectedDateRange('ALL')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                      selectedDateRange === 'ALL' 
                        ? 'bg-[#0069ff] text-white shadow-xs' 
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Histórico
                  </button>
                </>
              )}

              {isLogisticaRole && (
                <>
                  <button
                    onClick={() => setSelectedDateRange('TODAY')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                      selectedDateRange === 'TODAY' 
                        ? 'bg-[#0069ff] text-white shadow-xs' 
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Hoy
                  </button>
                  <button
                    onClick={() => setSelectedDateRange('YESTERDAY')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                      selectedDateRange === 'YESTERDAY' 
                        ? 'bg-[#0069ff] text-white shadow-xs' 
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Ayer
                  </button>
                  <button
                    onClick={() => setSelectedDateRange('LAST_3_DAYS')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                      selectedDateRange === 'LAST_3_DAYS' 
                        ? 'bg-[#0069ff] text-white shadow-xs' 
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Últimos 3 Días
                  </button>
                </>
              )}

              {isSellerRole && (
                <span className="px-3 py-1.5 rounded-xl bg-blue-50 text-[#0069ff] border border-blue-200 text-xs font-bold">
                  📅 Últimos 3 Días
                </span>
              )}

              {isFleteroRole && (
                <span className="px-3 py-1.5 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 text-xs font-bold flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> Última 1 Hora
                </span>
              )}
            </div>
          </div>

          {/* Secondary Filters */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              {/* Type Filter (Enabled only if not seller) */}
              {!isSellerRole ? (
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 font-bold">Tipo:</span>
                  <select
                    value={selectedType}
                    onChange={(e) => setSelectedType(e.target.value)}
                    className="bg-slate-50 border border-slate-200/80 rounded-xl px-2.5 py-1 font-semibold text-slate-700 focus:outline-none"
                  >
                    <option value="ALL">Todos los tipos</option>
                    <option value="TRANSFERENCIA">Transferencia</option>
                    <option value="QR">Código QR</option>
                    <option value="POINT">Point / Tarjeta</option>
                  </select>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl font-bold">
                  <Send className="w-3.5 h-3.5" /> Solo Transferencias
                </div>
              )}

              {/* Hidden toggle for Admin */}
              {isFullAdmin && (
                <button
                  onClick={() => setShowHidden(!showHidden)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-xl font-bold border transition-all ${
                    showHidden 
                      ? 'bg-amber-100 text-amber-900 border-amber-300' 
                      : 'bg-slate-50 text-slate-500 border-slate-200 hover:text-slate-700'
                  }`}
                  title="Alternar entre transacciones normales y transacciones archivadas"
                >
                  {showHidden ? <EyeOff className="w-3.5 h-3.5 text-amber-700" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{showHidden ? 'Viendo Archivadas' : 'Ver Archivadas'}</span>
                </button>
              )}
            </div>

            {/* Maintenance and clean buttons for Admin */}
            {isFullAdmin && (
              <button
                onClick={() => setShowMaintenanceModal(true)}
                className="text-slate-400 hover:text-slate-700 font-medium flex items-center gap-1 text-[11px]"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" /> Mantenimiento
              </button>
            )}
          </div>
        </div>

        {/* Payments List Grouped by Date */}
        <div className="space-y-6">
          {isLoading && payments.length === 0 ? (
            <div className="py-20 text-center space-y-3 bg-white rounded-3xl border border-slate-200/80 shadow-xs">
              <Loader2 className="w-8 h-8 animate-spin text-[#0069ff] mx-auto" />
              <p className="text-xs text-slate-500 font-medium">Cargando cobros de Mercado Pago...</p>
            </div>
          ) : payments.length === 0 ? (
            <div className="py-20 text-center space-y-3 bg-white rounded-3xl border border-slate-200/80 shadow-xs">
              <div className="w-14 h-14 rounded-3xl bg-slate-50 border border-slate-200 text-slate-400 flex items-center justify-center mx-auto shadow-xs">
                <Inbox className="w-7 h-7" />
              </div>
              <div>
                <h4 className="text-sm font-black text-slate-800">No se encontraron cobros</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 font-medium">
                  {showHidden 
                    ? 'No hay transacciones marcadas como archivadas/ocultas.' 
                    : 'Cuando ingrese una transferencia o cobro de Mercado Pago, aparecerá aquí automáticamente en tiempo real.'}
                </p>
              </div>
            </div>
          ) : (
            groupedPayments.map((group) => (
              <div key={group.key} className="space-y-3">
                {/* Date Header Separator */}
                <div className="flex items-center gap-3 pt-2">
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-2xl text-xs font-black tracking-wide border shadow-2xs ${
                    group.isToday 
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200 ring-1 ring-emerald-300/30' 
                      : group.isYesterday
                        ? 'bg-blue-50 text-[#0069ff] border-blue-200'
                        : 'bg-slate-100 text-slate-700 border-slate-200'
                  }`}>
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    <span>{group.sectionTitle}</span>
                    {group.subTitle && (
                      <span className="text-slate-500 font-semibold text-[11px]">
                        · {group.subTitle}
                      </span>
                    )}
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ml-1 ${
                      group.isToday 
                        ? 'bg-emerald-200/80 text-emerald-900' 
                        : group.isYesterday
                          ? 'bg-blue-200/80 text-blue-900'
                          : 'bg-slate-200 text-slate-800'
                    }`}>
                      {group.payments.length} {group.payments.length === 1 ? 'cobro' : 'cobros'}
                    </span>
                  </div>
                  <div className="flex-1 h-px bg-slate-200/80" />
                </div>

                {/* Cards for this Date */}
                <div className="space-y-3">
                  {group.payments.map((payment) => {
                    const accountInfo = getAccountDisplay(payment.account_name);
                    const isHiddenItem = Boolean(payment.is_hidden);
                    const isInternalItem = Boolean(payment.is_internal);

                    return (
                      <div
                        key={payment.id}
                        className={`p-4 sm:p-5 rounded-3xl border transition-all duration-150 hover:shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                          isInternalItem
                            ? 'border-purple-200 bg-purple-50/50 hover:bg-purple-50/70 shadow-xs ring-1 ring-purple-400/20'
                            : isHiddenItem 
                              ? 'border-dashed border-amber-300 bg-amber-50/20 opacity-75' 
                              : 'bg-white border-slate-200/80 hover:border-slate-300'
                        }`}
                      >
                        {/* Left Column: Icon & Payer & Badges */}
                        <div className="flex items-start sm:items-center gap-3.5">
                          <div 
                            className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold shrink-0 shadow-xs ${
                              isInternalItem ? 'bg-purple-100 text-purple-700 border border-purple-300' :
                              payment.payment_type === 'QR' ? 'bg-amber-50 text-amber-600 border border-amber-200' :
                              payment.payment_type === 'POINT' ? 'bg-indigo-50 text-indigo-600 border border-indigo-200' :
                              'bg-emerald-50 text-emerald-600 border border-emerald-200'
                            }`}
                          >
                            {isInternalItem ? <UserCheck className="w-5 h-5 text-purple-700" /> :
                             payment.payment_type === 'QR' ? <QrCode className="w-5 h-5" /> :
                             payment.payment_type === 'POINT' ? <CreditCard className="w-5 h-5" /> :
                             <Send className="w-5 h-5" />}
                          </div>

                          <div className="space-y-1">
                            {/* Payer Name and Badges */}
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`font-black text-sm sm:text-base tracking-tight ${isInternalItem ? 'text-purple-950' : 'text-slate-900'}`}>
                                {payment.payer_name}
                              </span>

                              {/* Account Badge with Configurable Alias (e.g. diegozono.mp) */}
                              <span 
                                className="px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider text-white shadow-2xs cursor-default"
                                style={{ backgroundColor: accountInfo.color }}
                                title={`Cuenta Interna: ${accountInfo.fullName} (Alias: ${accountInfo.alias})`}
                              >
                                {accountInfo.displayName}
                              </span>

                              {/* Internal User Distinct Badge (Visible for Admin & Administracion) */}
                              {isInternalItem && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-200/80 text-purple-900 border border-purple-300 flex items-center gap-1 shadow-xs">
                                  <Lock className="w-3 h-3 text-purple-700" /> Usuario Propio (Oculto a Ventas)
                                </span>
                              )}

                              {/* Type Badge */}
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                                {payment.payment_type}
                              </span>

                              {/* Order Link Badge / Button (Right next to Account Badge) */}
                              {payment.order_code ? (
                                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-blue-50 border border-blue-200 text-blue-700 rounded-full text-[11px] font-black shadow-xs">
                                  <ShoppingBag className="w-3.5 h-3.5 text-[#0069ff]" />
                                  <span>Pedido: {payment.order_code}</span>
                                  <button
                                    onClick={() => handleOpenLinkModal(payment)}
                                    className="text-blue-500 hover:text-blue-800 ml-0.5 cursor-pointer"
                                    title="Cambiar pedido vinculado"
                                  >
                                    ✏️
                                  </button>
                                  <button
                                    onClick={() => handleUnlinkOrder(payment.id)}
                                    className="text-blue-400 hover:text-rose-600 ml-0.5 cursor-pointer"
                                    title="Desvincular pedido"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => handleOpenLinkModal(payment)}
                                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-50 hover:bg-blue-50 text-slate-600 hover:text-[#0069ff] border border-dashed border-slate-300 hover:border-blue-300 text-[11px] font-black transition-all cursor-pointer shadow-xs"
                                  title="Asignar y vincular este cobro a un código de pedido (JS...)"
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>Vincular Pedido</span>
                                </button>
                              )}

                              {/* Hidden Badge if archived */}
                              {isHiddenItem && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-100 text-amber-800 border border-amber-200">
                                  Archivado
                                </span>
                              )}
                            </div>

                            {/* Subtitle: Date & ID & Vinculado por info */}
                            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 font-medium">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5 text-slate-400" />
                                {formatDateDisplay(payment.received_at)}
                              </span>
                              <span>•</span>
                              <span className="font-mono text-[11px] text-slate-400">
                                ID: {payment.id.substring(0, 14)}...
                              </span>
                              {payment.linked_by && (
                                <>
                                  <span>•</span>
                                  <span className="text-blue-600 font-semibold flex items-center gap-1">
                                    <UserCheck className="w-3 h-3" /> Vinculado por: {payment.linked_by}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Right Column: Amount & Admin Actions */}
                        <div className="flex items-center justify-between sm:justify-end gap-3 pl-14 sm:pl-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100">
                          <div className="text-right">
                            <div className={`text-base sm:text-lg font-black tracking-tight ${isInternalItem ? 'text-purple-700' : 'text-emerald-600'}`}>
                              + {formatMPAmount(payment.amount)}
                            </div>
                            <div className={`text-[10px] uppercase font-bold tracking-wider flex items-center justify-end gap-1 ${isInternalItem ? 'text-purple-600' : 'text-emerald-600'}`}>
                              <Check className="w-3 h-3" /> {isInternalItem ? 'Movimiento Interno' : 'Acreditado'}
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            {/* Copy summary button */}
                            <button
                              onClick={() => handleCopy(`${payment.payer_name} - ${formatMPAmount(payment.amount)} - ${accountInfo.displayName} - ${payment.order_code ? 'Pedido ' + payment.order_code : ''}`, payment.id)}
                              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all"
                              title="Copiar Resumen"
                            >
                              {copiedId === payment.id ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                            </button>

                            {/* Admin & Administracion: Toggle Internal Payer directly from row */}
                            {isAdminOrStaff && (
                              <button
                                onClick={() => handleToggleInternalFromPayment(payment)}
                                className={`p-1.5 rounded-xl transition-all ${
                                  isInternalItem 
                                    ? 'text-purple-700 hover:bg-purple-200 bg-purple-100' 
                                    : 'text-slate-400 hover:text-purple-600 hover:bg-purple-50'
                                }`}
                                title={isInternalItem ? 'Quitar de lista de Usuarios Propios' : 'Marcar como Usuario Propio (Ocultar a Ventas)'}
                              >
                                <UserX className="w-4 h-4" />
                              </button>
                            )}

                            {/* Admin Only: Hide / Unhide */}
                            {isFullAdmin && (
                              <button
                                onClick={() => handleToggleHide(payment)}
                                className={`p-1.5 rounded-xl transition-all ${
                                  isHiddenItem 
                                    ? 'text-amber-600 hover:bg-amber-100 bg-amber-50' 
                                    : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                                }`}
                                title={isHiddenItem ? 'Desarchivar Transacción' : 'Archivar Transacción'}
                              >
                                {isHiddenItem ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                              </button>
                            )}

                            {/* Admin Only: Delete */}
                            {isFullAdmin && (
                              <button
                                onClick={() => handleDeletePayment(payment.id, payment.payer_name, formatMPAmount(payment.amount))}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                                title="Eliminar Transacción Permanentemente"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      {/* MODAL: Gestionar Cuentas y Alias */}
      {showAccountsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl relative max-h-[90vh] overflow-y-auto space-y-5">
            <button
              onClick={() => setShowAccountsModal(false)}
              className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Modal Header */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-200 text-[#0069ff] flex items-center justify-center font-bold shadow-xs">
                <Settings className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-[#001538]">Configuración de Cuentas y Alias</h3>
                <p className="text-xs text-slate-500 font-medium">Asignar el Alias público (ej: diegozono.mp) a las cuentas de Mercado Pago</p>
              </div>
            </div>

            {/* Account List */}
            <div className="space-y-3">
              {accounts.map((acc) => (
                <div key={acc.id} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-black text-slate-900 block">{acc.name}</span>
                      <span className="text-[11px] text-slate-500 font-medium">ID Interno: {acc.id}</span>
                    </div>
                    <span 
                      className="px-2.5 py-0.5 rounded-full text-[10px] font-black text-white"
                      style={{ backgroundColor: acc.color || '#0069ff' }}
                    >
                      {acc.alias || acc.name}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="font-bold text-slate-700 block text-[11px] mb-1">Nombre Administrativo</label>
                      <input
                        type="text"
                        defaultValue={acc.name}
                        onBlur={(e) => {
                          if (e.target.value !== acc.name) {
                            fetch('/api/admin/cobros-mp-data?action=save-account', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ id: acc.id, name: e.target.value, alias: acc.alias, color: acc.color })
                            }).then(() => loadAccounts());
                          }
                        }}
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl font-medium"
                      />
                    </div>

                    <div>
                      <label className="font-bold text-slate-700 block text-[11px] mb-1">Alias (Visible en cobros)</label>
                      <input
                        type="text"
                        defaultValue={acc.alias || ''}
                        placeholder="Ej: diegozono.mp"
                        onBlur={(e) => {
                          if (e.target.value !== acc.alias) {
                            fetch('/api/admin/cobros-mp-data?action=save-account', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ id: acc.id, name: acc.name, alias: e.target.value, color: acc.color })
                            }).then(() => {
                              loadAccounts();
                              loadPayments();
                            });
                          }
                        }}
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl font-bold text-[#0069ff]"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Gestionar Personas Ocultas / Usuarios Propios */}
      {showInternalPayersModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl relative max-h-[90vh] overflow-y-auto space-y-5">
            <button
              onClick={() => setShowInternalPayersModal(false)}
              className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Modal Header */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-purple-50 border border-purple-200 text-purple-700 flex items-center justify-center font-bold shadow-xs">
                <Users2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-[#001538]">Personas Ocultas y Usuarios Propios</h3>
                <p className="text-xs text-slate-500 font-medium">Cobros y transferencias internas invisibles para el equipo de ventas</p>
              </div>
            </div>

            {/* Explanatory Box */}
            <div className="p-3.5 bg-purple-50/70 border border-purple-200 rounded-2xl text-xs text-purple-900 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-purple-700 shrink-0" />
                <span>Regla de Privacidad Automática</span>
              </div>
              <p className="text-purple-800 text-[11px] leading-relaxed">
                Las transacciones de las personas en esta lista <strong>sólo serán visibles para Administración y Administradores</strong> (resaltadas en violeta). El personal de Ventas, Logística y Fleteros <strong>no podrá verlas</strong> ni sumarlas.
              </p>
            </div>

            {/* Add New Person Input */}
            <div className="space-y-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Agregar Nueva Persona Oculta</h4>
              <div className="space-y-2">
                <input
                  type="text"
                  value={newInternalName}
                  onChange={(e) => setNewInternalName(e.target.value)}
                  placeholder="Nombre exacto o aproximado (ej: Diego Alejandro Boveda)"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                />
                <input
                  type="text"
                  value={newInternalNotes}
                  onChange={(e) => setNewInternalNotes(e.target.value)}
                  placeholder="Nota u observación (ej: Transferencias personales socio)"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                />
                <button
                  disabled={isSavingInternal || !newInternalName.trim()}
                  onClick={handleAddInternalPayer}
                  className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-sm shadow-purple-600/20"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isSavingInternal ? 'Guardando...' : 'Agregar Persona a la Lista'}</span>
                </button>
              </div>
            </div>

            {/* Current List */}
            <div className="space-y-2">
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Personas Configuradas ({internalPayers.length})</h4>
              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                {internalPayers.length === 0 ? (
                  <p className="text-xs text-slate-400 p-3 text-center border border-dashed rounded-xl">No hay personas agregadas aún.</p>
                ) : (
                  internalPayers.map((payer) => (
                    <div
                      key={payer.id}
                      className="p-3 bg-white border border-slate-200 rounded-2xl flex items-center justify-between gap-3 shadow-2xs hover:border-slate-300 transition-all"
                    >
                      <div>
                        <span className="font-bold text-xs text-slate-900 block">{payer.name}</span>
                        {payer.notes && <span className="text-[11px] text-slate-500 block">{payer.notes}</span>}
                      </div>
                      <button
                        onClick={() => handleRemoveInternalPayer(payer)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                        title="Eliminar de la lista"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Vincular Pedido a Pago */}
      {linkingPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl relative max-h-[90vh] overflow-y-auto space-y-5">
            <button
              onClick={() => setLinkingPayment(null)}
              className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Modal Header */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-200 text-[#0069ff] flex items-center justify-center font-bold shadow-xs">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-[#001538]">Vincular Pago con Pedido</h3>
                <p className="text-xs text-slate-500 font-medium">Asignar código de pedido oficial de Zono ERP</p>
              </div>
            </div>

            {/* Payment Summary Box */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
              <div>
                <span className="text-slate-500 font-medium block">Pagador</span>
                <span className="font-bold text-slate-900">{linkingPayment.payer_name}</span>
              </div>
              <div className="text-right">
                <span className="text-slate-500 font-medium block">Monto Cobrado</span>
                <span className="font-black text-emerald-600 text-sm">
                  {formatMPAmount(linkingPayment.amount)}
                </span>
              </div>
            </div>

            {/* Primary Action: Direct Code Input (Works whether the order exists in DB or not) */}
            <form 
              onSubmit={(e) => { 
                e.preventDefault(); 
                if (manualOrderCode.trim()) {
                  handleLinkOrder(undefined, manualOrderCode);
                }
              }} 
              className="space-y-2 p-4 bg-slate-50 border border-slate-200 rounded-2xl"
            >
              <label className="text-xs font-black text-slate-800 uppercase tracking-wider block">
                Ingresar Código de Pedido
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    autoFocus
                    value={manualOrderCode}
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase();
                      setManualOrderCode(val);
                      setOrderSearchQuery(val);
                      searchOrders(val);
                    }}
                    placeholder="Ej: JS24940, LK01591, MS00412..."
                    className="w-full pl-3 pr-8 py-2.5 bg-white border border-blue-200 rounded-xl text-sm font-mono font-black uppercase text-[#001538] focus:outline-none focus:ring-2 focus:ring-[#0069ff]/30 focus:border-[#0069ff] shadow-2xs"
                  />
                  {manualOrderCode && (
                    <button
                      type="button"
                      onClick={() => { setManualOrderCode(''); setOrderSearchQuery(''); searchOrders(''); }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isSavingLink || !manualOrderCode.trim()}
                  className="px-5 py-2.5 bg-[#0069ff] hover:bg-blue-700 text-white rounded-xl text-xs font-black transition-all disabled:opacity-50 shrink-0 shadow-sm shadow-blue-500/20 flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>{isSavingLink ? 'Guardando...' : 'Vincular Pedido'}</span>
                </button>
              </div>

              <p className="text-[11px] text-slate-500 font-medium flex items-center gap-1 pt-1">
                <span>💡</span> Podés asignar el código aunque el pedido aún no esté cargado en el sistema.
              </p>
            </form>

            {/* Smart Suggestions & Search Results List */}
            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                {orderSearchQuery ? `Sugerencias para "${orderSearchQuery}"` : 'O seleccionar de pedidos recientes'}
              </span>

              {isSearchingOrders ? (
                <div className="py-5 text-center">
                  <Loader2 className="w-5 h-5 animate-spin text-[#0069ff] mx-auto" />
                </div>
              ) : orderSearchResults.length === 0 ? (
                <div className="p-3 text-center text-xs text-slate-400 border border-dashed rounded-xl">
                  {orderSearchQuery 
                    ? `No se encontró el código "${orderSearchQuery}" en la base de datos (podés vincularlo igual con el botón de arriba).`
                    : 'Escribí el código arriba para vincular directamente.'}
                </div>
              ) : (
                orderSearchResults.map((order) => {
                  const isAmountMatch = Math.abs(order.total_amount - linkingPayment.amount) < 1;
                  return (
                    <div
                      key={order.id}
                      onClick={() => {
                        setManualOrderCode(order.order_code);
                        handleLinkOrder(order.id, order.order_code);
                      }}
                      className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                        isAmountMatch 
                          ? 'border-emerald-200 bg-emerald-50/50 hover:bg-emerald-100/60 shadow-2xs' 
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-xs text-[#001538]">{order.order_code}</span>
                          <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-slate-100 text-slate-600">
                            {order.status}
                          </span>
                          {isAmountMatch && (
                            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-black bg-emerald-100 text-emerald-800">
                              ⭐ Coincide Monto
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-slate-500 font-medium block mt-0.5">{order.client_name}</span>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="font-bold text-xs text-slate-900 block">{formatMPAmount(order.total_amount)}</span>
                        <span className="text-[10px] text-blue-600 font-bold hover:underline">Vincular ➔</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Tasker Setup Guide */}
      {showTaskerGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-xl w-full p-6 sm:p-7 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowTaskerGuide(false)}
              className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-200 text-[#0069ff] flex items-center justify-center font-bold shadow-xs">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-black text-[#001538]">Configuración de Tasker en Android</h3>
                <p className="text-xs text-slate-500 font-medium">Reenvío automático de cobros de Mercado Pago a Zono ERP</p>
              </div>
            </div>

            <div className="space-y-4 text-xs">
              <div className="p-4 bg-blue-50/60 border border-blue-200 rounded-2xl space-y-2">
                <div className="font-bold text-[#001538]">1. URL del Webhook para Tasker / AutoNotification:</div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={webhookUrl}
                    className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono text-[11px] text-slate-800"
                  />
                  <button
                    onClick={() => handleCopy(webhookUrl, 'webhook_url')}
                    className="px-3 py-2 bg-[#0069ff] text-white font-bold rounded-xl shrink-0"
                  >
                    {copiedId === 'webhook_url' ? '¡Copiado!' : 'Copiar'}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="font-bold text-[#001538]">2. Configuración de la Acción en Tasker:</div>
                <ul className="list-disc pl-5 space-y-1 text-slate-600 font-medium">
                  <li><strong>Perfil:</strong> Evento ➔ Plugin ➔ AutoNotification Intercept (Apps: Mercado Pago).</li>
                  <li><strong>Tarea:</strong> Red ➔ <strong>HTTP Request</strong>.</li>
                  <li><strong>Método:</strong> <code>POST</code></li>
                  <li><strong>URL:</strong> <code>{webhookUrl}</code></li>
                  <li><strong>Headers:</strong></li>
                </ul>

                <pre className="p-3 bg-slate-900 text-slate-100 rounded-xl font-mono text-[11px] overflow-x-auto">
{`Content-Type: application/json
x-webhook-token: mpchecker_secret_key_123`}
                </pre>

                <div className="font-bold text-[#001538] mt-2">Body (Cuerpo JSON):</div>
                <div className="relative">
                  <pre className="p-3 bg-slate-900 text-slate-100 rounded-xl font-mono text-[11px] overflow-x-auto">
{`{
  "antitle": "%antitle",
  "antext": "%antext",
  "anbigtext": "%anbigtext",
  "account": "Cuenta MP3"
}`}
                  </pre>
                  <button
                    onClick={() => handleCopy(`{\n  "antitle": "%antitle",\n  "antext": "%antext",\n  "anbigtext": "%anbigtext",\n  "account": "Cuenta MP3"\n}`, 'tasker_body')}
                    className="absolute top-2 right-2 px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-[10px] font-bold"
                  >
                    {copiedId === 'tasker_body' ? 'Copiado' : 'Copiar JSON'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Simulator */}
      {showSimulator && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 shadow-2xl relative space-y-4">
            <button
              onClick={() => setShowSimulator(false)}
              className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center font-bold">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-[#001538]">Simulador de Cobro</h3>
                <p className="text-xs text-slate-500 font-medium">Inyectar un pago de prueba</p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Nombre del Pagador</label>
                <input
                  type="text"
                  value={simName}
                  onChange={(e) => setSimName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Monto ($)</label>
                <input
                  type="number"
                  value={simAmount}
                  onChange={(e) => setSimAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Tipo de Pago</label>
                <select
                  value={simType}
                  onChange={(e) => setSimType(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                >
                  <option value="TRANSFERENCIA">Transferencia</option>
                  <option value="QR">Código QR</option>
                  <option value="POINT">Point</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Cuenta</label>
                <input
                  type="text"
                  value={simAccount}
                  onChange={(e) => setSimAccount(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                />
              </div>

              <button
                disabled={simLoading}
                onClick={async () => {
                  setSimLoading(true);
                  try {
                    await fetch('/api/admin/cobros-mp-data?action=simulate', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        title: 'Mercado Pago',
                        text: `Recibiste $ ${simAmount} de ${simName}`,
                        account: simAccount
                      })
                    });
                    setShowSimulator(false);
                    loadPayments();
                  } catch (e: any) {
                    alert('Error: ' + e.message);
                  } finally {
                    setSimLoading(false);
                  }
                }}
                className="w-full py-2.5 bg-[#0069ff] hover:bg-blue-700 text-white rounded-xl font-bold shadow-md shadow-blue-500/20"
              >
                {simLoading ? 'Simulando...' : 'Inyectar Pago'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Maintenance */}
      {showMaintenanceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 shadow-2xl relative space-y-4 text-xs">
            <button
              onClick={() => setShowMaintenanceModal(false)}
              className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-black text-[#001538]">Mantenimiento de Cobros</h3>

            {maintenanceMsg && (
              <div className="p-3 bg-blue-50 border border-blue-200 text-[#0069ff] rounded-xl font-medium">
                {maintenanceMsg}
              </div>
            )}

            <div className="space-y-2">
              <button
                disabled={purgeLoading}
                onClick={async () => {
                  setPurgeLoading(true);
                  try {
                    const res = await fetch('/api/admin/cobros-mp-data?action=purge-tests', { method: 'POST' });
                    const d = await res.json();
                    setMaintenanceMsg(d.message || 'Pruebas purgadas');
                    loadPayments();
                  } catch (e: any) {
                    setMaintenanceMsg('Error: ' + e.message);
                  } finally {
                    setPurgeLoading(false);
                  }
                }}
                className="w-full p-3 text-left border border-slate-200 rounded-2xl hover:bg-slate-50 font-bold text-slate-700"
              >
                🧹 Limpiar Pagos de Prueba y Simulaciones
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
