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
  Loader2
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
  order_id?: string;
  notes?: string;
}

interface MPAccount {
  id: string;
  name: string;
  alias?: string;
  color?: string;
  is_active?: boolean;
}

export default function CobrosMercadoPagoPage() {
  const [payments, setPayments] = useState<MPPayment[]>([]);
  const [accounts, setAccounts] = useState<MPAccount[]>([]);
  const [stats, setStats] = useState({ totalCount: 0, totalAmount: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isRealtimeActive, setIsRealtimeActive] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('ALL');
  const [selectedType, setSelectedType] = useState('ALL');
  const [selectedDateRange, setSelectedDateRange] = useState('TODAY');

  // Modals
  const [showTaskerGuide, setShowTaskerGuide] = useState(false);
  const [showSimulator, setShowSimulator] = useState(false);
  const [showAccountsModal, setShowAccountsModal] = useState(false);
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<MPPayment | null>(null);

  // Form states for modals
  const [simName, setSimName] = useState('Mariana Gómez');
  const [simAmount, setSimAmount] = useState('18500');
  const [simType, setSimType] = useState('TRANSFERENCIA');
  const [simAccount, setSimAccount] = useState('Cuenta Principal');
  const [simLoading, setSimLoading] = useState(false);

  const [newAccName, setNewAccName] = useState('');
  const [newAccAlias, setNewAccAlias] = useState('');
  const [newAccColor, setNewAccColor] = useState('#0069ff');
  const [accLoading, setAccLoading] = useState(false);

  const [purgeLoading, setPurgeLoading] = useState(false);
  const [maintenanceMsg, setMaintenanceMsg] = useState<string | null>(null);

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

  // Load Payments
  const loadPayments = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        action: 'list',
        accountId: selectedAccountId,
        dateRange: selectedDateRange,
        type: selectedType,
        search: search
      });
      const res = await fetch(`/api/admin/cobros-mp-data?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setPayments(data.data || []);
        if (data.todayStats) {
          setStats(data.todayStats);
        }
      }
    } catch (e) {
      console.error('Error loading MP payments:', e);
    } finally {
      setIsLoading(false);
    }
  }, [selectedAccountId, selectedDateRange, selectedType, search]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

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
          setPayments((prev) => {
            if (prev.some((p) => p.id === newPayment.id)) return prev;
            return [newPayment, ...prev];
          });
          setStats((prev) => ({
            totalCount: prev.totalCount + 1,
            totalAmount: prev.totalAmount + (Number(newPayment.amount) || 0)
          }));
          playChime();
        }
      )
      .subscribe((status) => {
        setIsRealtimeActive(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [playChime]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Simulate Payment Handler
  const handleSimulate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSimLoading(true);
    try {
      const amt = parseFloat(simAmount) || 15000;
      let title = 'Mercado Pago';
      let text = `Recibiste $ ${amt.toLocaleString('es-AR')} de ${simName}`;
      if (simType === 'QR') {
        text = `Cobraste con código QR $ ${amt.toLocaleString('es-AR')} de ${simName}`;
      } else if (simType === 'POINT') {
        text = `Cobraste con Point $ ${amt.toLocaleString('es-AR')} de ${simName}`;
      }

      await fetch('/api/admin/cobros-mp-data?action=simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, text, account: simAccount })
      });

      setShowSimulator(false);
      loadPayments();
    } catch (e) {
      console.error(e);
    } finally {
      setSimLoading(false);
    }
  };

  // Add Account Handler
  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccName) return;
    setAccLoading(true);
    try {
      await fetch('/api/admin/cobros-mp-data?action=save-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newAccName,
          alias: newAccAlias || newAccName,
          color: newAccColor
        })
      });
      setNewAccName('');
      setNewAccAlias('');
      loadAccounts();
    } catch (e) {
      console.error(e);
    } finally {
      setAccLoading(false);
    }
  };

  // Purge Tests Handler
  const handlePurgeTests = async () => {
    setPurgeLoading(true);
    setMaintenanceMsg(null);
    try {
      const res = await fetch('/api/admin/cobros-mp-data?action=purge-tests', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setMaintenanceMsg(`Se eliminaron ${data.deletedCount} pagos de prueba exitosamente.`);
        loadPayments();
      }
    } catch {
      setMaintenanceMsg('Error al purgar pagos.');
    } finally {
      setPurgeLoading(false);
    }
  };

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://zono-erp.pages.dev';
  const webhookUrl = `${currentOrigin}/api/mp-webhook`;

  return (
    <div className="space-y-6 animate-fade-in text-slate-900 pb-16">
      {/* Top Header Card */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-7 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-5 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-[#0069ff]" />
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-200 text-[#0069ff] flex items-center justify-center font-black shadow-sm">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-[#001538] tracking-tight">Cobros Mercado Pago</h1>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                  isRealtimeActive 
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                    : 'bg-blue-50 text-blue-700 border-blue-200'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${isRealtimeActive ? 'bg-emerald-500 animate-pulse' : 'bg-blue-500'}`} />
                  {isRealtimeActive ? 'En vivo (Realtime)' : 'Conectado'}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Supervisión y verificación automática de transferencias, QR y Point para Zono Construcción
              </p>
            </div>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2.5 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 ${
              soundEnabled
                ? 'bg-blue-50 border-blue-200 text-[#0069ff] hover:bg-blue-100'
                : 'bg-slate-100 border-slate-200 text-slate-500 hover:bg-slate-200'
            }`}
            title={soundEnabled ? 'Silenciar campanilla de cobro' : 'Activar campanilla de cobro'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          <button
            onClick={() => setShowTaskerGuide(true)}
            className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
          >
            <Smartphone className="w-4 h-4 text-[#0069ff]" /> Conectar Tasker
          </button>

          <button
            onClick={() => setShowAccountsModal(true)}
            className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
          >
            <Wallet className="w-4 h-4 text-emerald-600" /> Cuentas MP
          </button>

          <button
            onClick={() => setShowSimulator(true)}
            className="px-4 py-2.5 bg-[#0069ff] hover:bg-[#0055d4] text-white rounded-xl text-xs font-bold transition shadow-md shadow-blue-500/20 flex items-center gap-1.5"
          >
            <Sparkles className="w-4 h-4" /> Simular Cobro
          </button>
        </div>
      </div>

      {/* KPI Stats Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Today */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Total Cobrado Hoy</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              $
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-600 tracking-tight">
            $ {stats.totalAmount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-400 font-medium mt-1">
            Monto acreditado en el día
          </div>
        </div>

        {/* Count Today */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Cobros Recibidos Hoy</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#0069ff] flex items-center justify-center font-bold">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-[#001538] tracking-tight">
            {stats.totalCount} {stats.totalCount === 1 ? 'operación' : 'operaciones'}
          </div>
          <div className="text-[11px] text-slate-400 font-medium mt-1">
            Transacciones procesadas
          </div>
        </div>

        {/* Average Ticket */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Promedio por Ticket</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-[#001538] tracking-tight">
            $ {stats.totalCount > 0 ? Math.round(stats.totalAmount / stats.totalCount).toLocaleString('es-AR') : '0'}
          </div>
          <div className="text-[11px] text-slate-400 font-medium mt-1">
            Ticket promedio del día
          </div>
        </div>

        {/* Latest Transaction */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Último Ingreso</span>
            <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-sm font-extrabold text-[#001538] truncate">
            {payments.length > 0 ? payments[0].payer_name : 'Sin cobros'}
          </div>
          <div className="text-[11px] text-emerald-600 font-bold mt-1">
            {payments.length > 0 ? `${payments[0].formatted_amount} (${new Date(payments[0].received_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })})` : 'Esperando transferencias...'}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por pagador, importe o detalle..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-[#0069ff]"
            />
          </div>

          {/* Quick Date Range Buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            {[
              { id: 'TODAY', label: 'Hoy' },
              { id: 'YESTERDAY', label: 'Ayer' },
              { id: 'YESTERDAY_TODAY', label: 'Ayer y Hoy' },
              { id: 'LAST_7_DAYS', label: '7 Días' },
              { id: 'ALL', label: 'Histórico' }
            ].map((range) => (
              <button
                key={range.id}
                onClick={() => setSelectedDateRange(range.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                  selectedDateRange === range.id
                    ? 'bg-[#0069ff] text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {range.label}
              </button>
            ))}

            <button
              onClick={loadPayments}
              disabled={isLoading}
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition"
              title="Refrescar lista"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-[#0069ff]' : ''}`} />
            </button>
          </div>
        </div>

        {/* Secondary filters: Account & Payment Type */}
        <div className="flex items-center gap-3 pt-2 border-t border-slate-100 flex-wrap text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-bold">Cuenta:</span>
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:border-[#0069ff]"
            >
              <option value="ALL">Todas las cuentas</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>{acc.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-bold">Tipo:</span>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:border-[#0069ff]"
            >
              <option value="ALL">Todos los tipos</option>
              <option value="TRANSFERENCIA">Transferencias</option>
              <option value="QR">Cobros QR</option>
              <option value="POINT">Point (Tarjeta)</option>
            </select>
          </div>

          <div className="ml-auto">
            <button
              onClick={() => setShowMaintenanceModal(true)}
              className="text-slate-400 hover:text-slate-700 text-xs font-bold flex items-center gap-1 transition"
            >
              <Trash2 className="w-3.5 h-3.5" /> Limpieza de Pruebas
            </button>
          </div>
        </div>
      </div>

      {/* Payments Feed List */}
      <div className="space-y-3">
        {isLoading && payments.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-3xl border border-slate-200 shadow-sm text-slate-500 text-xs flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-[#0069ff]" /> Cargando cobros de Mercado Pago...
          </div>
        ) : payments.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-3xl border border-dashed border-slate-300 shadow-sm space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 text-[#0069ff] flex items-center justify-center mx-auto shadow-sm">
              <Inbox className="w-7 h-7" />
            </div>
            <h3 className="text-base font-extrabold text-[#001538]">No hay cobros registrados en este período</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Cuando Tasker detecte una transferencia o cobro de Mercado Pago en tu teléfono, ingresará aquí automáticamente en tiempo real.
            </p>
            <button
              onClick={() => setShowSimulator(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0069ff] hover:bg-[#0055d4] text-white text-xs font-bold rounded-xl shadow-sm transition"
            >
              <Sparkles className="w-3.5 h-3.5" /> Probar con un Cobro Simulado
            </button>
          </div>
        ) : (
          payments.map((p) => {
            const timeStr = new Date(p.received_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
            const dateStr = new Date(p.received_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
            
            return (
              <div
                key={p.id}
                onClick={() => setSelectedPayment(p)}
                className="bg-white border border-slate-200 hover:border-[#0069ff]/40 rounded-2xl p-4 sm:p-5 transition shadow-sm hover:shadow-md cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black shrink-0 ${
                    p.payment_type === 'QR'
                      ? 'bg-blue-50 text-[#0069ff] border border-blue-200'
                      : p.payment_type === 'POINT'
                      ? 'bg-indigo-50 text-indigo-600 border border-indigo-200'
                      : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                  }`}>
                    {p.payment_type === 'QR' ? <QrCode className="w-5 h-5" /> : p.payment_type === 'POINT' ? <CreditCard className="w-5 h-5" /> : <Send className="w-5 h-5" />}
                  </div>

                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base font-extrabold text-[#001538] group-hover:text-[#0069ff] transition truncate">
                        {p.payer_name}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                        {p.account_name || 'Cuenta Principal'}
                      </span>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        p.payment_type === 'QR'
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : p.payment_type === 'POINT'
                          ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}>
                        {p.payment_type}
                      </span>
                    </div>

                    <div className="text-xs text-slate-500 font-medium flex items-center gap-2">
                      <span>{dateStr} a las {timeStr} hs</span>
                      <span>&bull;</span>
                      <span className="text-slate-400">ID: {p.id.substring(0, 10)}...</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-100">
                  <div className="text-right">
                    <div className="text-lg sm:text-xl font-black text-emerald-600 tracking-tight">
                      + {p.formatted_amount}
                    </div>
                    <div className="text-[10px] font-bold text-slate-400">
                      Acreditado
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopy(`${p.payer_name} - ${p.formatted_amount} (${dateStr} ${timeStr})`, p.id);
                    }}
                    className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl border border-slate-200 transition"
                    title="Copiar comprobante"
                  >
                    {copiedId === p.id ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* MODAL 1: Tasker Webhook Setup Guide */}
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
              <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-200 text-[#0069ff] flex items-center justify-center font-bold shadow-sm">
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
                  <li><strong>Headers:</strong> <code>x-webhook-token: mpchecker_secret_key_123</code> (o en Content-Type: application/json)</li>
                  <li><strong>Body (Cuerpo JSON):</strong></li>
                </ul>

                <div className="relative">
                  <pre className="p-3 bg-slate-900 text-slate-100 rounded-xl font-mono text-[11px] overflow-x-auto">
{`{
  "antitle": "%antitle",
  "antext": "%antext",
  "anbigtext": "%anbigtext",
  "account": "Cuenta Principal"
}`}
                  </pre>
                  <button
                    onClick={() => handleCopy(`{\n  "antitle": "%antitle",\n  "antext": "%antext",\n  "anbigtext": "%anbigtext",\n  "account": "Cuenta Principal"\n}`, 'tasker_body')}
                    className="absolute top-2 right-2 px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-[10px] font-bold"
                  >
                    {copiedId === 'tasker_body' ? 'Copiado' : 'Copiar JSON'}
                  </button>
                </div>
              </div>

              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 font-medium">
                💡 <strong>Auto-descarte opcional:</strong> En la misma tarea de Tasker, podés agregar como segunda acción <em>AutoNotification Cancel</em> para borrar la notificación de la barra de estado una vez enviada al ERP.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Simulation */}
      {showSimulator && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl relative">
            <button
              onClick={() => setShowSimulator(false)}
              className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-200 text-[#0069ff] flex items-center justify-center font-bold shadow-sm">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-black text-[#001538]">Simulador de Cobro</h3>
                <p className="text-xs text-slate-500 font-medium">Probar recepción en vivo y campanilla</p>
              </div>
            </div>

            <form onSubmit={handleSimulate} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Nombre del Cliente / Pagador</label>
                <input
                  type="text"
                  value={simName}
                  onChange={(e) => setSimName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-900"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Importe ($ ARS)</label>
                <input
                  type="number"
                  value={simAmount}
                  onChange={(e) => setSimAmount(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-900"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Tipo de Cobro</label>
                  <select
                    value={simType}
                    onChange={(e) => setSimType(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-800"
                  >
                    <option value="TRANSFERENCIA">Transferencia</option>
                    <option value="QR">Código QR</option>
                    <option value="POINT">Point</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Cuenta</label>
                  <select
                    value={simAccount}
                    onChange={(e) => setSimAccount(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-800"
                  >
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.name}>{acc.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={simLoading}
                className="w-full py-3 mt-2 bg-[#0069ff] hover:bg-[#0055d4] text-white font-bold rounded-xl shadow-md shadow-blue-500/20 flex items-center justify-center gap-2"
              >
                {simLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Disparar Cobro de Prueba
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Accounts */}
      {showAccountsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl relative">
            <button
              onClick={() => setShowAccountsModal(false)}
              className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center font-bold shadow-sm">
                <Wallet className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-black text-[#001538]">Cuentas de Mercado Pago</h3>
                <p className="text-xs text-slate-500 font-medium">Gestioná tus billeteras y alias</p>
              </div>
            </div>

            <form onSubmit={handleAddAccount} className="space-y-3 mb-5 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs">
              <div className="font-bold text-[#001538]">Agregar Nueva Cuenta:</div>
              <input
                type="text"
                value={newAccName}
                onChange={(e) => setNewAccName(e.target.value)}
                placeholder="Nombre (ej. Zono Mayorista)"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-medium"
                required
              />
              <button
                type="submit"
                disabled={accLoading}
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition"
              >
                {accLoading ? 'Guardando...' : '+ Guardar Cuenta'}
              </button>
            </form>

            <div className="space-y-2 text-xs">
              <div className="font-bold text-slate-700">Cuentas Registradas:</div>
              {accounts.map((acc) => (
                <div key={acc.id} className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between shadow-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: acc.color || '#0069ff' }} />
                    <span className="font-bold text-slate-900">{acc.name}</span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono">{acc.id}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Maintenance */}
      {showMaintenanceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl relative">
            <button
              onClick={() => setShowMaintenanceModal(false)}
              className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center font-bold shadow-sm">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-black text-[#001538]">Mantenimiento de Cobros</h3>
                <p className="text-xs text-slate-500 font-medium">Herramientas de depuración de base de datos</p>
              </div>
            </div>

            {maintenanceMsg && (
              <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold">
                {maintenanceMsg}
              </div>
            )}

            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl space-y-3 text-xs">
              <div className="font-bold text-amber-900">Limpiar Pagos de Prueba:</div>
              <p className="text-amber-800 font-medium">
                Elimina las simulaciones y cobros que contengan "Prueba", "Diego Boveda" o "Carolina Ibarra", conservando los pagos reales.
              </p>
              <button
                onClick={handlePurgeTests}
                disabled={purgeLoading}
                className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl transition"
              >
                {purgeLoading ? 'Borrando...' : 'Borrar Pagos de Prueba'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: Payment Detail */}
      {selectedPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl relative">
            <button
              onClick={() => setSelectedPayment(null)}
              className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center mb-6">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto mb-3 shadow-sm">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-black text-emerald-600 tracking-tight">{selectedPayment.formatted_amount}</h3>
              <p className="text-xs text-slate-500 font-medium mt-0.5">Cobro Verificado de Mercado Pago</p>
            </div>

            <div className="space-y-3 text-xs bg-slate-50 p-4 rounded-2xl border border-slate-200 mb-5">
              <div className="flex justify-between py-1 border-b border-slate-200">
                <span className="text-slate-500 font-bold">Pagador:</span>
                <span className="font-extrabold text-slate-900">{selectedPayment.payer_name}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200">
                <span className="text-slate-500 font-bold">Cuenta Receptora:</span>
                <span className="font-extrabold text-slate-900">{selectedPayment.account_name}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200">
                <span className="text-slate-500 font-bold">Tipo:</span>
                <span className="font-extrabold text-slate-900">{selectedPayment.payment_type}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200">
                <span className="text-slate-500 font-bold">Fecha y Hora:</span>
                <span className="font-extrabold text-slate-900">{new Date(selectedPayment.received_at).toLocaleString('es-AR')}</span>
              </div>
              <div className="py-1">
                <span className="text-slate-500 font-bold block mb-1">Notificación Original:</span>
                <div className="p-2.5 bg-white border border-slate-200 rounded-xl font-mono text-[11px] text-slate-700">
                  {selectedPayment.raw_body || selectedPayment.raw_title || 'Sin cuerpo de texto'}
                </div>
              </div>
            </div>

            <button
              onClick={() => setSelectedPayment(null)}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition"
            >
              Cerrar Detalle
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
