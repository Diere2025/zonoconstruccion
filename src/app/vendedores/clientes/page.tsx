"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { 
  Search, 
  Plus, 
  Edit2, 
  Trash2, 
  Users, 
  MapPin, 
  Phone, 
  FileText, 
  Check, 
  X, 
  Loader2, 
  PlusCircle, 
  UserPlus, 
  ShoppingBag, 
  ExternalLink,
  MapPinned,
  UserCheck,
  Wallet,
  DollarSign,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  Receipt,
  History,
  Link2,
  Unlink,
  Database,
  TrendingUp
} from "lucide-react";
import { Button } from "@/components/ui/Button";

interface Client {
  id: string;
  business_name: string;
  phone_primary: string;
  phone_secondary?: string;
  tax_id?: string;
  billing_address?: string;
  created_at?: string;
  total_charged?: number;
  total_paid?: number;
  balance?: number;
  orders_count?: number;
  is_wholesale?: boolean;
}

interface Address {
  id: string;
  client_id: string;
  alias: string;
  full_address: string;
  locality_id: string;
  map_link?: string;
  delivery_notes?: string;
  is_default: boolean;
  localities?: {
    name: string;
    zones?: {
      name: string;
    };
  };
}

interface Locality {
  id: string;
  name: string;
  zone_id?: string;
  zones?: {
    name: string;
  };
}

const normalizeText = (text: string) => {
  if (!text) return "";
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
};

export default function ClientesPage() {
  const router = useRouter();
  
  // Loading & Data States
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<Client[]>([]);
  const [localities, setLocalities] = useState<Locality[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<'all' | 'top_sales' | 'recurrent' | 'pending_balance'>('all');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [totalClientsDb, setTotalClientsDb] = useState(0);

  // Debounce search query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 400);
    return () => clearTimeout(handler);
  }, [searchQuery]);
  
  // Modals Toggles
  const [showClientModal, setShowClientModal] = useState(false);
  const [showAddressModal, setShowAddressModal] = useState(false);
  
  // Editing contexts
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [selectedClientForAddresses, setSelectedClientForAddresses] = useState<Client | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);

  // Cuenta Corriente States
  const [balances, setBalances] = useState<Record<string, { totalCharged: number; totalPaid: number; balance: number }>>({});
  const [selectedClientForLedger, setSelectedClientForLedger] = useState<Client | null>(null);
  const [showLedgerModal, setShowLedgerModal] = useState(false);
  const [ledgerEntries, setLedgerEntries] = useState<any[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [openRegister, setOpenRegister] = useState<any | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  
  // Form Registrar Cobro States
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentCurrency, setPaymentCurrency] = useState<'ARS' | 'USD'>('ARS');
  const [paymentExchangeRate, setPaymentExchangeRate] = useState("1000");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [submittingPayment, setSubmittingPayment] = useState(false);

  // Imputar Cobro Existente States
  const [activeFormTab, setActiveFormTab] = useState<'new' | 'existing'>('new');
  const [unreconciledIngresos, setUnreconciledIngresos] = useState<any[]>([]);
  const [selectedIngresoId, setSelectedIngresoId] = useState("");
  const [loadingIngresos, setLoadingIngresos] = useState(false);
  const [submittingImputation, setSubmittingImputation] = useState(false);

  // Form Client States
  const [clientName, setClientName] = useState("");
  const [clientPhonePrimary, setClientPhonePrimary] = useState("");
  const [clientPhoneSecondary, setClientPhoneSecondary] = useState("");
  const [clientTaxId, setClientTaxId] = useState("");
  const [clientBillingAddress, setClientBillingAddress] = useState("");
  const [clientIsWholesale, setClientIsWholesale] = useState(false);

  // Form Address States
  const [addressAlias, setAddressAlias] = useState("");
  const [addressFull, setAddressFull] = useState("");
  const [addressLocalityId, setAddressLocalityId] = useState("");
  const [addressLocalitySearch, setAddressLocalitySearch] = useState("");
  const [addressMapLink, setAddressMapLink] = useState("");
  const [addressDeliveryNotes, setAddressDeliveryNotes] = useState("");
  const [addressIsDefault, setAddressIsDefault] = useState(false);
  const [showLocalitySuggestions, setShowLocalitySuggestions] = useState(false);

  // UI state feedback
  const [isSaving, setIsSaving] = useState(false);

  // Load Data
  useEffect(() => {
    console.log("[ClientesPage] useEffect mounted");
    loadLocalities();
    loadPaymentMethods();
    fetchUserAndRegister();
  }, []);

  // Reload clients when filter type or debounced search query changes
  useEffect(() => {
    console.log("[ClientesPage] search/filter changed, reloading clients. debouncedSearchQuery:", debouncedSearchQuery, "filterType:", filterType);
    loadClients();
  }, [debouncedSearchQuery, filterType]);

  async function loadClients() {
    console.log("[ClientesPage] loadClients started");
    try {
      setLoading(true);
      
      // Fetch total count once
      if (totalClientsDb === 0) {
        const { count } = await supabase
          .from("clients")
          .select("*", { count: 'exact', head: true });
        if (count) setTotalClientsDb(count);
      }

      let query = supabase.from("v_client_balances_and_stats").select("*");

      if (debouncedSearchQuery.trim()) {
        const q = debouncedSearchQuery.trim();
        query = query.or(`business_name.ilike.%${q}%,phone_primary.ilike.%${q}%,phone_secondary.ilike.%${q}%,tax_id.ilike.%${q}%`);
      } else {
        if (filterType === 'top_sales') {
          query = query.order('total_charged', { ascending: false });
        } else if (filterType === 'recurrent') {
          query = query.order('orders_count', { ascending: false });
        } else if (filterType === 'pending_balance') {
          query = query.gt('balance', 0).order('balance', { ascending: false });
        } else {
          query = query.order('business_name', { ascending: true });
        }
      }

      // Limit results to 100 to ensure fast loading and UI responsiveness
      query = query.limit(100);

      const { data, error } = await query;
      if (error) throw error;

      setClients(data || []);

      const computedBalances: Record<string, { totalCharged: number; totalPaid: number; balance: number }> = {};
      (data || []).forEach(c => {
        computedBalances[c.id] = {
          totalCharged: Number(c.total_charged) || 0,
          totalPaid: Number(c.total_paid) || 0,
          balance: Number(c.balance) || 0
        };
      });

      setBalances(computedBalances);
    } catch (err) {
      console.error("Error loading clients:", err);
      alert("Error al cargar los clientes.");
    } finally {
      setLoading(false);
    }
  }

  async function loadPaymentMethods() {
    try {
      const { data, error } = await supabase
        .from("payment_methods")
        .select("*")
        .eq("is_active", true);
      if (error) throw error;
      setPaymentMethods(data || []);
      if (data && data.length > 0) {
        const cashMethod = data.find(p => p.name.toLowerCase().includes("efectivo") || p.id === 'a3a890a8-b677-4b7b-8ffb-d36c2e7b5ad3');
        if (cashMethod) setPaymentMethodId(cashMethod.id);
        else setPaymentMethodId(data[0].id);
      }
    } catch (err) {
      console.error("Error loading payment methods:", err);
    }
  }

  async function fetchUserAndRegister() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
      }

      // Check for active open cash register
      const { data: registers } = await supabase
        .from("cash_registers")
        .select("*")
        .eq("status", "Abierta")
        .order("opened_at", { ascending: false });

      if (registers && registers.length > 0) {
        setOpenRegister(registers[0]);
      } else {
        setOpenRegister(null);
      }
    } catch (err) {
      console.error("Error fetching user or register:", err);
    }
  }

  const handleOpenLedger = (client: Client) => {
    setSelectedClientForLedger(client);
    setShowLedgerModal(true);
    setPaymentAmount("");
    setPaymentCurrency("ARS");
    setPaymentExchangeRate("1000");
    setPaymentNotes("");
    setActiveFormTab("new");
    setSelectedIngresoId("");
    
    if (paymentMethods.length > 0) {
      const cashMethod = paymentMethods.find(p => p.name.toLowerCase().includes("efectivo") || p.id === 'a3a890a8-b677-4b7b-8ffb-d36c2e7b5ad3');
      if (cashMethod) setPaymentMethodId(cashMethod.id);
      else setPaymentMethodId(paymentMethods[0].id);
    }

    fetchUserAndRegister();
    loadLedger(client.id);
    loadUnreconciledIngresos();
  };

  async function loadLedger(clientId: string) {
    try {
      setLedgerLoading(true);
      // Fetch orders
      const { data: ordersData, error: ordersError } = await supabase
        .from("orders")
        .select("id, order_date, total_amount, payment_status, status, created_at")
        .eq("client_id", clientId)
        .neq("status", "Anulado")
        .order("created_at", { ascending: true });

      if (ordersError) throw ordersError;

      // Fetch payments
      const { data: paymentsData, error: paymentsError } = await supabase
        .from("client_payments")
        .select(`
          id, amount, currency, exchange_rate, notes, created_at, cash_transaction_id,
          payment_methods(name)
        `)
        .eq("client_id", clientId)
        .order("created_at", { ascending: true });

      if (paymentsError) throw paymentsError;

      // Map and combine
      const entries: any[] = [];
      
      (ordersData || []).forEach(o => {
        entries.push({
          id: o.id,
          type: 'cargo',
          date: o.order_date || o.created_at,
          description: `Pedido de Venta (Estado: ${o.status})`,
          amount: Number(o.total_amount) || 0,
          currency: 'ARS',
          exchange_rate: 1,
          ref_id: o.id,
          notes: `Pago: ${o.payment_status}`,
          created_at: o.created_at
        });
      });

      (paymentsData || []).forEach(p => {
        const pmName = p.payment_methods ? (p.payment_methods as any).name : 'Cobro';
        const amt = Number(p.amount) || 0;
        entries.push({
          id: p.id,
          type: 'abono',
          date: p.created_at,
          description: amt < 0 ? `Crédito por Devolución (${pmName})` : `Cobro a Cuenta (${pmName})`,
          amount: amt,
          currency: p.currency,
          exchange_rate: Number(p.exchange_rate) || 1,
          ref_id: p.id,
          notes: p.notes || '',
          cash_transaction_id: p.cash_transaction_id,
          created_at: p.created_at
        });
      });

      // Sort chronologically
      entries.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      // Calculate running balance
      let runningBalanceArs = 0;
      const ledgerWithBalance = entries.map(entry => {
        const amountInArs = entry.amount * entry.exchange_rate;
        if (entry.type === 'cargo') {
          runningBalanceArs += amountInArs;
        } else {
          runningBalanceArs -= amountInArs;
        }
        return {
          ...entry,
          runningBalance: runningBalanceArs
        };
      });

      setLedgerEntries(ledgerWithBalance);
    } catch (err) {
      console.error("Error loading ledger:", err);
      alert("Error al cargar el historial de cuenta corriente.");
    } finally {
      setLedgerLoading(false);
    }
  }

  async function handleSavePayment(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedClientForLedger || !currentUserId) return;
    if (!openRegister) {
      alert("No hay una caja diaria abierta. Debe abrir caja primero.");
      return;
    }
    const amount = Number(paymentAmount);
    if (isNaN(amount) || amount === 0) {
      alert("Ingrese un monto válido diferente de cero.");
      return;
    }
    if (!paymentMethodId) {
      alert("Seleccione un método de pago.");
      return;
    }

    setSubmittingPayment(true);
    try {
      const exchangeRate = paymentCurrency === 'USD' ? Number(paymentExchangeRate) || 1.0 : 1.0;
      const notesCombined = `Cobro a cuenta de cliente: ${selectedClientForLedger.business_name}. ${paymentNotes}`.trim();

      // 1. Insert into cash_transactions
      const { data: txData, error: txError } = await supabase
        .from('cash_transactions')
        .insert({
          register_id: openRegister.id,
          type: amount > 0 ? 'ingreso' : 'egreso',
          category: amount > 0 ? 'cobro_pedido' : 'devolucion_reembolso',
          amount: Math.abs(amount),
          currency: paymentCurrency,
          exchange_rate: exchangeRate,
          payment_method_id: paymentMethodId,
          notes: notesCombined,
          created_by: currentUserId
        })
        .select()
        .single();

      if (txError) throw txError;

      // 2. Update expected balance of the cash register
      const changeAmountArs = paymentCurrency === 'ARS' ? amount : 0;
      const changeAmountUsd = paymentCurrency === 'USD' ? amount : 0;
      const newExpectedArs = openRegister.expected_balance_ars + changeAmountArs;
      const newExpectedUsd = openRegister.expected_balance_usd + changeAmountUsd;

      const { error: regError } = await supabase
        .from('cash_registers')
        .update({
          expected_balance_ars: newExpectedArs,
          expected_balance_usd: newExpectedUsd
        })
        .eq('id', openRegister.id);

      if (regError) throw regError;

      // 3. Insert into client_payments
      const { error: paymentError } = await supabase
        .from('client_payments')
        .insert({
          client_id: selectedClientForLedger.id,
          amount: amount,
          currency: paymentCurrency,
          exchange_rate: exchangeRate,
          payment_method_id: paymentMethodId,
          cash_transaction_id: txData.id,
          notes: paymentNotes || null,
          created_by: currentUserId
        });

      if (paymentError) throw paymentError;

      // Reset payment form
      setPaymentAmount("");
      setPaymentNotes("");
      
      // Reload ledger and clients to refresh balances
      await loadLedger(selectedClientForLedger.id);
      await loadClients();
      await fetchUserAndRegister();
    } catch (err: any) {
      console.error("Error saving payment:", err);
      alert("Error al registrar el cobro: " + err.message);
    } finally {
      setSubmittingPayment(false);
    }
  }

  async function loadUnreconciledIngresos() {
    try {
      setLoadingIngresos(true);
      const { data: allIngresos, error: ingresosError } = await supabase
        .from('cash_transactions')
        .select(`
          *,
          payment_methods(name)
        `)
        .eq('type', 'ingreso')
        .order('created_at', { ascending: false });

      if (ingresosError) throw ingresosError;

      const { data: linkedPayments, error: linkedError } = await supabase
        .from('client_payments')
        .select('cash_transaction_id')
        .not('cash_transaction_id', 'is', null);

      if (linkedError) throw linkedError;

      const linkedIds = new Set(linkedPayments?.map(p => p.cash_transaction_id) || []);
      const unreconciled = (allIngresos || []).filter(e => !linkedIds.has(e.id));
      setUnreconciledIngresos(unreconciled);
    } catch (err: any) {
      console.error("Error loading unreconciled ingresos:", err);
    } finally {
      setLoadingIngresos(false);
    }
  }

  async function handleImputeExistingCash(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedClientForLedger || !currentUserId) return;
    if (!selectedIngresoId) {
      alert("Seleccione un movimiento de caja para imputar.");
      return;
    }
    const tx = unreconciledIngresos.find(i => i.id === selectedIngresoId);
    if (!tx) {
      alert("Movimiento no encontrado.");
      return;
    }

    setSubmittingImputation(true);
    try {
      const notesCombined = `Imputado desde Caja: ${tx.concept || tx.notes || ''}`.trim();
      const { error: paymentError } = await supabase
        .from('client_payments')
        .insert({
          client_id: selectedClientForLedger.id,
          amount: tx.amount,
          currency: tx.currency,
          exchange_rate: Number(tx.exchange_rate) || 1,
          payment_method_id: tx.payment_method_id,
          cash_transaction_id: tx.id,
          notes: notesCombined,
          created_by: currentUserId
        });

      if (paymentError) throw paymentError;

      alert("Cobro imputado con éxito!");
      setSelectedIngresoId("");
      
      await loadLedger(selectedClientForLedger.id);
      await loadUnreconciledIngresos();
      await loadClients();
    } catch (err: any) {
      console.error("Error imputing payment:", err);
      alert("Error al imputar el cobro: " + err.message);
    } finally {
      setSubmittingImputation(false);
    }
  }

  async function handleUnlinkPayment(paymentId: string) {
    if (!confirm("¿Estás seguro de que deseas desconciliar/eliminar este cobro? El movimiento de caja seguirá existiendo pero ya no estará computado a favor de la cuenta corriente de este cliente.")) return;
    try {
      setLedgerLoading(true);
      const { error } = await supabase
        .from('client_payments')
        .delete()
        .eq('id', paymentId);
        
      if (error) throw error;
      
      alert("Cobro desconciliado/eliminado con éxito.");
      if (selectedClientForLedger) {
        await loadLedger(selectedClientForLedger.id);
        await loadUnreconciledIngresos();
      }
      await loadClients();
    } catch (err: any) {
      console.error("Error unlinking payment:", err);
      alert("Error al desconciliar: " + err.message);
    } finally {
      setLedgerLoading(false);
    }
  }

  async function loadLocalities() {
    try {
      const { data, error } = await supabase
        .from("localities")
        .select("id, name, zone_id, zones(name)")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      
      const mapped = (data || []).map(item => ({
        id: item.id,
        name: item.name,
        zone_id: item.zone_id,
        zones: Array.isArray(item.zones) ? item.zones[0] : item.zones
      }));
      setLocalities(mapped);
    } catch (err) {
      console.error("Error loading localities:", err);
    }
  }

  // Load addresses of a specific client
  async function loadAddresses(clientId: string) {
    try {
      const { data, error } = await supabase
        .from("addresses")
        .select(`
          id, client_id, alias, full_address, locality_id, map_link, delivery_notes, is_default,
          localities(name, zones(name))
        `)
        .eq("client_id", clientId)
        .order("is_default", { ascending: false })
        .order("alias");
      if (error) throw error;
      
      const mapped = (data || []).map((addr: any) => ({
        ...addr,
        localities: Array.isArray(addr.localities) ? addr.localities[0] : addr.localities
      }));
      setAddresses(mapped);
    } catch (err) {
      console.error("Error loading addresses:", err);
      alert("Error al cargar las direcciones del cliente.");
    }
  }

  // Handle Client Search
  const filteredClients = clients.filter(c => {
    const q = normalizeText(searchQuery.trim());
    if (!q) return true;
    return (
      normalizeText(c.business_name).includes(q) ||
      (c.phone_primary && c.phone_primary.includes(q)) ||
      (c.phone_secondary && c.phone_secondary.includes(q)) ||
      (c.tax_id && normalizeText(c.tax_id).includes(q))
    );
  });

  // Open Client Modal for Create/Edit
  const handleOpenClientModal = (client: Client | null = null) => {
    if (client) {
      setEditingClient(client);
      setClientName(client.business_name);
      setClientPhonePrimary(client.phone_primary);
      setClientPhoneSecondary(client.phone_secondary || "");
      setClientTaxId(client.tax_id || "");
      setClientBillingAddress(client.billing_address || "");
      setClientIsWholesale(client.is_wholesale || false);
    } else {
      setEditingClient(null);
      setClientName("");
      setClientPhonePrimary("");
      setClientPhoneSecondary("");
      setClientTaxId("");
      setClientBillingAddress("");
      setClientIsWholesale(false);
    }
    setShowClientModal(true);
  };

  // Save Client Form Submission
  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim()) {
      alert("Razón Social es obligatoria.");
      return;
    }
    if (!clientPhonePrimary.trim()) {
      alert("Teléfono Principal es obligatorio.");
      return;
    }

    const cleanPhoneForSaving = (phone: string): string => {
      const digits = phone.replace(/\D/g, '');
      if (digits.startsWith('549') && digits.length >= 10) {
        return digits.substring(3);
      }
      if (digits.startsWith('54') && digits.length >= 9) {
        return digits.substring(2);
      }
      return digits;
    };

    setIsSaving(true);
    try {
      const payload = {
        business_name: clientName.trim(),
        phone_primary: cleanPhoneForSaving(clientPhonePrimary),
        phone_secondary: clientPhoneSecondary.trim() ? cleanPhoneForSaving(clientPhoneSecondary) : null,
        tax_id: clientTaxId.trim() || null,
        billing_address: clientBillingAddress.trim() || null,
        is_wholesale: clientIsWholesale
      };

      if (editingClient) {
        // Update client
        const { error } = await supabase
          .from("clients")
          .update(payload)
          .eq("id", editingClient.id);
        if (error) throw error;
      } else {
        // Insert client
        const { error } = await supabase
          .from("clients")
          .insert(payload);
        if (error) throw error;
      }
      setShowClientModal(false);
      loadClients();
    } catch (err: any) {
      console.error("Error saving client:", err);
      alert("Error al guardar cliente: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Delete Client
  const handleDeleteClient = async (clientId: string, name: string) => {
    if (!confirm(`¿Estás seguro de que deseas eliminar al cliente "${name}"? Esto eliminará también todas sus direcciones de entrega.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from("clients")
        .delete()
        .eq("id", clientId);
      if (error) throw error;
      
      // Update local client list
      setClients(clients.filter(c => c.id !== clientId));
      if (selectedClientForAddresses?.id === clientId) {
        setSelectedClientForAddresses(null);
        setAddresses([]);
      }
    } catch (err: any) {
      console.error("Error deleting client:", err);
      alert("Error al eliminar cliente: " + err.message);
    }
  };

  // Open Address Modal
  const handleOpenAddressManager = (client: Client) => {
    setSelectedClientForAddresses(client);
    loadAddresses(client.id);
    setShowAddressModal(true);
    resetAddressForm();
  };

  const resetAddressForm = () => {
    setEditingAddress(null);
    setAddressAlias("");
    setAddressFull("");
    setAddressLocalityId("");
    setAddressLocalitySearch("");
    setAddressMapLink("");
    setAddressDeliveryNotes("");
    setAddressIsDefault(false);
  };

  // Filter Locality Suggestions
  const localitySuggestions = addressLocalitySearch.trim()
    ? localities.filter(l => l.name.toLowerCase().includes(addressLocalitySearch.toLowerCase()))
    : [];

  // Edit address from list
  const handleEditAddressInit = (addr: Address) => {
    setEditingAddress(addr);
    setAddressAlias(addr.alias);
    setAddressFull(addr.full_address);
    setAddressLocalityId(addr.locality_id);
    
    // Find locality name
    const loc = localities.find(l => l.id === addr.locality_id);
    setAddressLocalitySearch(loc ? loc.name : "");
    setAddressMapLink(addr.map_link || "");
    setAddressDeliveryNotes(addr.delivery_notes || "");
    setAddressIsDefault(addr.is_default);
  };

  // Save Address Submission
  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClientForAddresses) return;
    if (!addressAlias.trim()) {
      alert("Escribe un alias para la dirección (ej: Principal, Obra Merlo).");
      return;
    }
    if (!addressFull.trim()) {
      alert("Ingresa la dirección exacta.");
      return;
    }
    if (!addressLocalityId) {
      alert("Selecciona una localidad válida de la lista.");
      return;
    }

    setIsSaving(true);
    try {
      const clientId = selectedClientForAddresses.id;

      // If set as default, we make all other addresses for this client non-default first
      if (addressIsDefault) {
        await supabase
          .from("addresses")
          .update({ is_default: false })
          .eq("client_id", clientId);
      }

      const payload = {
        client_id: clientId,
        alias: addressAlias.trim(),
        full_address: addressFull.trim(),
        locality_id: addressLocalityId,
        map_link: addressMapLink.trim() || null,
        delivery_notes: addressDeliveryNotes.trim() || null,
        is_default: addressIsDefault
      };

      if (editingAddress) {
        // Update Address
        const { error } = await supabase
          .from("addresses")
          .update(payload)
          .eq("id", editingAddress.id);
        if (error) throw error;
      } else {
        // If it's the first address, automatically make it default
        const isFirst = addresses.length === 0;
        const { error } = await supabase
          .from("addresses")
          .insert({
            ...payload,
            is_default: isFirst ? true : addressIsDefault
          });
        if (error) throw error;
      }

      resetAddressForm();
      loadAddresses(clientId);
    } catch (err: any) {
      console.error("Error saving address:", err);
      alert("Error al guardar la dirección: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Toggle address as default directly
  const handleSetAddressDefault = async (addr: Address) => {
    try {
      await supabase
        .from("addresses")
        .update({ is_default: false })
        .eq("client_id", addr.client_id);

      const { error } = await supabase
        .from("addresses")
        .update({ is_default: true })
        .eq("id", addr.id);

      if (error) throw error;
      loadAddresses(addr.client_id);
    } catch (err: any) {
      console.error("Error setting default address:", err);
      alert("Error al establecer dirección predeterminada.");
    }
  };

  // Delete Address
  const handleDeleteAddress = async (addrId: string) => {
    if (!confirm("¿Estás seguro de eliminar esta dirección de entrega?")) return;
    try {
      const { error } = await supabase
        .from("addresses")
        .delete()
        .eq("id", addrId);
      if (error) throw error;

      if (selectedClientForAddresses) {
        loadAddresses(selectedClientForAddresses.id);
      }
    } catch (err: any) {
      console.error("Error deleting address:", err);
      alert("Error al eliminar dirección.");
    }
  };

  // Redirect to new order load with client pre-selection
  const handleCreateOrderRedirect = (clientId: string, addressId?: string) => {
    let url = `/vendedores/pedidos?client_id=${clientId}`;
    if (addressId) {
      url += `&address_id=${addressId}`;
    }
    router.push(url);
  };

  // Statistics
  const totalClients = clients.length;
  
  if (loading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 text-brand-600 animate-spin" />
        <p className="text-slate-500 font-medium">Cargando base de clientes...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top Banner and KPI */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-xl border border-slate-200/60 shadow-sm">
        <div>
          <h1 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Users className="w-5 h-5 text-brand-600" />
            Cartera de Clientes
          </h1>
          <p className="text-[11px] text-slate-400 font-semibold">Administra tus contactos, direcciones y cotizaciones frecuentes.</p>
        </div>

        <div className="flex gap-4">
          <div className="bg-slate-50 px-4 py-2 border border-slate-200/50 rounded-xl flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center">
              <Users className="w-4 h-4 text-brand-600" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase leading-none">Clientes Registrados</p>
              <h3 className="text-lg font-black text-slate-950 mt-0.5">{totalClientsDb || totalClients}</h3>
            </div>
          </div>
        </div>
      </div>

      {/* Main Filter & Action Bar */}
      <div className="flex flex-col gap-3 bg-white p-3 rounded-xl border border-slate-200/60 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-400" />
            <input 
              type="text"
              placeholder="Buscar por Razón Social, CUIT, teléfono en toda la base de datos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 bg-slate-50 font-bold text-xs focus:ring-2 focus:ring-brand-500/20 focus:outline-none transition-all"
            />
          </div>
          <Button 
            onClick={() => handleOpenClientModal(null)}
            className="flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs shadow-sm hover:shadow-md transition-all shrink-0"
          >
            <UserPlus className="w-4 h-4" />
            Nuevo Cliente
          </Button>
        </div>
        
        {/* Quick Filters */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 text-[10px] font-bold">
          <span className="text-slate-400 mr-1.5 uppercase tracking-wider text-[9px] font-black">Filtrar por:</span>
          <button
            type="button"
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-lg border transition-all ${
              filterType === 'all'
                ? 'bg-slate-900 border-slate-900 text-white shadow-sm'
                : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-600'
            }`}
          >
            Todos
          </button>
          <button
            type="button"
            onClick={() => setFilterType('top_sales')}
            className={`px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1 ${
              filterType === 'top_sales'
                ? 'bg-brand-600 border-brand-600 text-white shadow-sm'
                : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-600'
            }`}
          >
            <TrendingUp className="w-3 h-3" /> Top Ventas
          </button>
          <button
            type="button"
            onClick={() => setFilterType('recurrent')}
            className={`px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1 ${
              filterType === 'recurrent'
                ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-600'
            }`}
          >
            <ShoppingBag className="w-3 h-3" /> Más Recurrentes
          </button>
          <button
            type="button"
            onClick={() => setFilterType('pending_balance')}
            className={`px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1 ${
              filterType === 'pending_balance'
                ? 'bg-rose-600 border-rose-600 text-white shadow-sm'
                : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-600'
            }`}
          >
            <DollarSign className="w-3 h-3" /> Saldo Pendiente
          </button>
          
          {searchQuery && (
            <span className="ml-auto text-slate-400 font-semibold text-[9px] uppercase">
              Buscando...
            </span>
          )}
          {!searchQuery && (
            <span className="ml-auto text-slate-400 font-semibold text-[9px] uppercase">
              Mostrando {filteredClients.length} de {totalClientsDb} clientes
            </span>
          )}
        </div>
      </div>

      {/* Clients Card List */}
      {filteredClients.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200/60 p-12 text-center">
          <Users className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-sm font-bold text-slate-700">No se encontraron clientes</h3>
          <p className="text-[11px] text-slate-400 mt-1 max-w-sm mx-auto">
            {searchQuery ? "Prueba cambiando el término de búsqueda." : "Comienza registrando tu primer cliente para el ERP."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filteredClients.map((client) => {
            const initials = client.business_name
              .split(/\s+/)
              .map(word => word[0])
              .join("")
              .substring(0, 2)
              .toUpperCase();

            const balInfo = balances[client.id] || { totalCharged: 0, totalPaid: 0, balance: 0 };
            const formattedBalance = balInfo.balance.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            
            return (
              <div 
                key={client.id}
                className="bg-white border border-slate-200/60 hover:border-slate-300/80 rounded-xl p-3 shadow-sm hover:shadow transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                {/* Identity: Avatar & Name */}
                <div className="flex items-center gap-3 min-w-0 flex-1 md:max-w-md">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-indigo-600 flex items-center justify-center text-white font-black text-xs tracking-tight shadow-inner shrink-0">
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-black text-slate-900 text-sm leading-none truncate" title={client.business_name}>
                      {client.business_name}
                    </h3>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      {client.is_wholesale && (
                        <span className="bg-purple-50 border border-purple-200 text-purple-700 font-black text-[9px] uppercase px-1.5 py-0.5 rounded shrink-0">
                          👑 Mayorista
                        </span>
                      )}
                      {client.tax_id && (
                        <span className="bg-slate-100 border text-slate-500 font-bold text-[9px] uppercase px-1.5 py-0.5 rounded">
                          {client.tax_id.replace(/\D/g, "").length <= 8 ? "DNI" : "CUIT"}: {client.tax_id}
                        </span>
                      )}
                       {client.billing_address && (
                        <span className="bg-slate-50 border border-slate-100 text-slate-400 font-medium text-[9px] px-1.5 py-0.5 rounded truncate max-w-[200px]" title={client.billing_address}>
                          Fac: {client.billing_address}
                        </span>
                      )}
                      {client.orders_count !== undefined && client.orders_count > 0 && (
                        <span className="bg-blue-50 border border-blue-100 text-blue-700 font-bold text-[9px] px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0">
                          <ShoppingBag className="w-2.5 h-2.5 text-blue-600 animate-pulse" />
                          {client.orders_count} {client.orders_count === 1 ? 'pedido' : 'pedidos'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Contacts */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-[10px] text-slate-500 font-bold min-w-[240px]">
                  <span className="bg-brand-50 text-brand-700 font-bold text-[10px] px-2 py-0.5 rounded-md flex items-center gap-1 shrink-0 w-fit">
                    <Phone className="w-3 h-3 text-brand-600" />
                    {client.phone_primary}
                  </span>
                  {client.phone_secondary && (
                    <span className="bg-slate-100/80 text-slate-600 font-medium text-[10px] px-2 py-0.5 rounded-md flex items-center gap-1 shrink-0 w-fit">
                      <Phone className="w-3 h-3 text-slate-400" />
                      {client.phone_secondary}
                    </span>
                  )}
                </div>

                {/* Account Balance Status */}
                <div className="flex items-center shrink-0 min-w-[130px]">
                  {balInfo.balance !== 0 ? (
                    <span className={`font-black text-[9px] px-2 py-1 rounded border uppercase ${
                      balInfo.balance > 0 
                        ? 'bg-rose-50 border-rose-100 text-rose-700' 
                        : 'bg-emerald-50 border-emerald-100 text-emerald-700'
                    }`}>
                      {balInfo.balance > 0 ? `Deuda: $${formattedBalance}` : `A Favor: $${Math.abs(balInfo.balance).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    </span>
                  ) : (
                    <span className="bg-slate-50 border text-slate-400 font-bold text-[9px] px-2 py-1 rounded uppercase">
                      Al Día
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button 
                    onClick={() => handleCreateOrderRedirect(client.id)}
                    className="flex items-center gap-1.5 py-1.5 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[9px] uppercase tracking-wider transition-all shadow-sm active:scale-95"
                  >
                    <ShoppingBag className="w-3 h-3" />
                    Cargar Pedido
                  </button>
                  <button 
                    onClick={() => handleOpenLedger(client)}
                    className="flex items-center gap-1.5 py-1.5 px-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-bold text-[9px] uppercase tracking-wider transition-all shadow-sm active:scale-95"
                  >
                    <FileText className="w-3 h-3" />
                    Cta. Corriente
                  </button>
                  <div className="h-4 w-px bg-slate-200 hidden md:block mx-1"></div>
                  <button 
                    onClick={() => handleOpenAddressManager(client)}
                    className="flex items-center gap-1 py-1.5 px-2 rounded-lg border border-slate-200 hover:border-brand-500 text-slate-500 hover:text-brand-600 font-bold text-[9px] uppercase transition-all bg-slate-50/50"
                  >
                    <MapPin className="w-3 h-3" />
                    Direcciones
                  </button>
                  <button 
                    onClick={() => handleOpenClientModal(client)}
                    className="flex items-center justify-center p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-slate-700 font-bold text-[9px] uppercase transition-all"
                    title="Editar"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                  <button 
                    onClick={() => handleDeleteClient(client.id, client.business_name)}
                    className="flex items-center justify-center p-1.5 rounded-lg border border-red-100 hover:bg-red-50 text-red-500 hover:text-red-600 font-bold text-[9px] uppercase transition-all"
                    title="Eliminar"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* --- CLIENT MODAL (CREATE / EDIT) --- */}
      {showClientModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200/80 flex items-center justify-between">
              <h3 className="font-black text-slate-900 text-sm uppercase tracking-tight">
                {editingClient ? "Editar Cliente" : "Registrar Cliente"}
              </h3>
              <button 
                onClick={() => setShowClientModal(false)}
                className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveClient} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Razón Social / Nombre Completo *</label>
                <input 
                  type="text" 
                  required
                  placeholder="Ej: Constructora Diego S.A."
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 font-bold text-xs focus:ring-4 focus:ring-brand-500/10 focus:outline-none transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Teléfono Principal *</label>
                  <input 
                    type="text" 
                    required
                    placeholder="Ej: 1121835943"
                    value={clientPhonePrimary}
                    onChange={(e) => setClientPhonePrimary(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 font-bold text-xs focus:ring-4 focus:ring-brand-500/10 focus:outline-none transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Teléfono Secundario</label>
                  <input 
                    type="text" 
                    placeholder="Ej: 1122556644"
                    value={clientPhoneSecondary}
                    onChange={(e) => setClientPhoneSecondary(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 font-bold text-xs focus:ring-4 focus:ring-brand-500/10 focus:outline-none transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                  {clientTaxId.replace(/\D/g, "").length <= 8 ? "DNI" : "CUIT"}
                </label>
                <input 
                  type="text" 
                  placeholder="Ej: 32410887"
                  value={clientTaxId}
                  onChange={(e) => setClientTaxId(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 font-bold text-xs focus:ring-4 focus:ring-brand-500/10 focus:outline-none transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Dirección de Facturación (Opcional)</label>
                <input 
                  type="text" 
                  placeholder="Ej: Pellegrini 170, Merlo"
                  value={clientBillingAddress}
                  onChange={(e) => setClientBillingAddress(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 font-bold text-xs focus:ring-4 focus:ring-brand-500/10 focus:outline-none transition-all"
                />
              </div>

              <div className="flex items-center gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200/60 mt-2">
                <input 
                  type="checkbox" 
                  id="clientIsWholesale"
                  checked={clientIsWholesale}
                  onChange={(e) => setClientIsWholesale(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/10 cursor-pointer accent-brand-600"
                />
                <label htmlFor="clientIsWholesale" className="text-[10px] font-black uppercase tracking-wider text-slate-600 cursor-pointer select-none">
                  Cliente Mayorista / Recurrente
                </label>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t border-slate-100">
                <Button 
                  type="button"
                  onClick={() => setShowClientModal(false)}
                  className="flex-1 py-3 border border-slate-200 hover:bg-slate-50 rounded-xl font-black text-slate-600 uppercase text-[10px] tracking-wider transition-colors"
                >
                  Cancelar
                </Button>
                <Button 
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-black uppercase text-[10px] tracking-wider transition-colors"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Guardar"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- ADDRESSES MANAGER MODAL (MULTIPLE ADDRESSES) --- */}
      {showAddressModal && selectedClientForAddresses && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200/80 flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-black text-slate-900 text-sm uppercase tracking-tight flex items-center gap-2">
                  <MapPinned className="w-4.5 h-4.5 text-brand-600" />
                  Direcciones de Entrega
                </h3>
                <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                  Gestionando puntos de despacho para: <span className="text-slate-600 font-black">{selectedClientForAddresses.business_name}</span>
                </p>
              </div>
              <button 
                onClick={() => setShowAddressModal(false)}
                className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Split Panel */}
            <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
              {/* Form Block (Add / Edit address) */}
              <div className="w-full md:w-5/12 p-6 border-b md:border-b-0 md:border-r border-slate-100 overflow-y-auto">
                <h4 className="text-[10px] font-black text-slate-700 uppercase tracking-widest mb-4">
                  {editingAddress ? "Editar Dirección de Entrega" : "Nueva Dirección de Entrega"}
                </h4>

                <form onSubmit={handleSaveAddress} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Alias de Ubicación *</label>
                    <input 
                      type="text" 
                      required
                      placeholder="Ej: Obra Merlo, Principal, Depósito CABA"
                      value={addressAlias}
                      onChange={(e) => setAddressAlias(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 font-bold text-xs focus:ring-4 focus:ring-brand-500/10 focus:outline-none transition-all"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Dirección Exacta (Calle y Altura) *</label>
                    <input 
                      type="text" 
                      required
                      placeholder="Ej: Pellegrini 170"
                      value={addressFull}
                      onChange={(e) => setAddressFull(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 font-bold text-xs focus:ring-4 focus:ring-brand-500/10 focus:outline-none transition-all"
                    />
                  </div>

                  {/* Locality Search Autocomplete */}
                  <div className="space-y-1.5 relative">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Localidad de Entrega *</label>
                    <input 
                      type="text" 
                      placeholder="Buscar localidad..."
                      value={addressLocalitySearch}
                      onChange={(e) => {
                        setAddressLocalitySearch(e.target.value);
                        setAddressLocalityId("");
                        setShowLocalitySuggestions(true);
                      }}
                      onFocus={() => setShowLocalitySuggestions(true)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 font-bold text-xs focus:ring-4 focus:ring-brand-500/10 focus:outline-none transition-all"
                    />
                    
                    {showLocalitySuggestions && localitySuggestions.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto">
                        {localitySuggestions.map((loc) => (
                          <div 
                            key={loc.id}
                            onClick={() => {
                              setAddressLocalityId(loc.id);
                              setAddressLocalitySearch(loc.name);
                              setShowLocalitySuggestions(false);
                            }}
                            className="px-4 py-2.5 text-xs font-bold hover:bg-slate-50 cursor-pointer flex items-center justify-between text-slate-700"
                          >
                            <span>{loc.name}</span>
                            {loc.zones?.name && (
                              <span className="text-[9px] bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded font-black uppercase">
                                {loc.zones.name}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Enlace Google Maps (Opcional)</label>
                    <input 
                      type="text" 
                      placeholder="Ej: https://maps.google.com/..."
                      value={addressMapLink}
                      onChange={(e) => setAddressMapLink(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 font-bold text-xs focus:ring-4 focus:ring-brand-500/10 focus:outline-none transition-all"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Aclaraciones de Envío (Opcional)</label>
                    <textarea 
                      placeholder="Ej: Portón negro, tocar timbre, entregar por calle trasera..."
                      value={addressDeliveryNotes}
                      onChange={(e) => setAddressDeliveryNotes(e.target.value)}
                      rows={2}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 font-bold text-xs focus:ring-4 focus:ring-brand-500/10 focus:outline-none transition-all resize-none"
                    />
                  </div>

                  <div className="flex items-center gap-2 py-1">
                    <input 
                      type="checkbox"
                      id="isDefaultAddress"
                      checked={addressIsDefault}
                      onChange={(e) => setAddressIsDefault(e.target.checked)}
                      className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 border-slate-300"
                    />
                    <label htmlFor="isDefaultAddress" className="text-xs font-bold text-slate-600 cursor-pointer select-none">
                      Establecer como dirección de entrega predeterminada
                    </label>
                  </div>

                  <div className="flex gap-2 pt-2">
                    {editingAddress && (
                      <Button 
                        type="button"
                        onClick={resetAddressForm}
                        className="flex-1 py-2 border border-slate-200 hover:bg-slate-50 rounded-xl font-bold text-slate-600 uppercase text-[10px] tracking-wider transition-colors"
                      >
                        Cancelar
                      </Button>
                    )}
                    <Button 
                      type="submit"
                      disabled={isSaving}
                      className="flex-1 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold uppercase text-[10px] tracking-wider transition-colors"
                    >
                      {isSaving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : (editingAddress ? "Actualizar" : "Agregar")}
                    </Button>
                  </div>
                </form>
              </div>

              {/* Addresses List Block */}
              <div className="w-full md:w-7/12 p-6 overflow-y-auto flex flex-col bg-slate-50/50">
                <h4 className="text-[10px] font-black text-slate-700 uppercase tracking-widest mb-4">
                  Direcciones Registradas ({addresses.length})
                </h4>

                {addresses.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-200/60 p-12 text-center flex-1 flex flex-col items-center justify-center">
                    <MapPin className="w-10 h-10 text-slate-300 mb-3" />
                    <h5 className="text-xs font-bold text-slate-600">Sin direcciones registradas</h5>
                    <p className="text-[10px] text-slate-400 mt-1 max-w-[200px]">
                      Registra una dirección a la izquierda para poder cargar despachos para este cliente.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 flex-1">
                    {addresses.map((addr) => (
                      <div 
                        key={addr.id}
                        className={`bg-white border rounded-2xl p-4 transition-all flex flex-col justify-between ${
                          addr.is_default 
                            ? "border-brand-500/80 shadow-md ring-2 ring-brand-500/5" 
                            : "border-slate-200/60 hover:border-slate-300 shadow-sm"
                        }`}
                      >
                        {/* Address Title and badges */}
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-black text-slate-900 text-xs">{addr.alias}</span>
                              {addr.is_default && (
                                <span className="bg-brand-50 text-brand-600 text-[8px] font-black uppercase px-2 py-0.5 rounded-full flex items-center gap-1">
                                  <UserCheck className="w-2.5 h-2.5" />
                                  Predeterminado
                                </span>
                              )}
                            </div>
                            <p className="text-xs font-bold text-slate-600 mt-1">{addr.full_address}</p>
                            <p className="text-[10px] text-slate-400 font-bold flex items-center gap-1 mt-0.5">
                              <MapPin className="w-3 h-3 text-slate-300" />
                              {addr.localities?.name || "Localidad no definida"}
                              {addr.localities?.zones?.name && (
                                <span className="text-[9px] bg-slate-100 text-slate-500 font-black uppercase px-1.5 py-0.2 rounded shrink-0">
                                  {addr.localities.zones.name}
                                </span>
                              )}
                            </p>
                          </div>
                          
                          {/* Map Link external action */}
                          {addr.map_link && (
                            <a 
                              href={addr.map_link} 
                              target="_blank" 
                              rel="noreferrer"
                              className="p-1.5 rounded-lg border border-slate-100 hover:bg-slate-50 text-blue-500 shrink-0"
                              title="Ver ubicación en Google Maps"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>

                        {/* Delivery notes / Aclaraciones */}
                        {addr.delivery_notes && (
                          <div className="bg-slate-50 p-2 border border-slate-200/50 rounded-xl text-[9px] text-slate-500 font-bold mt-2.5">
                            <span className="text-slate-400 font-black uppercase block text-[8px] mb-0.5">Notas de Envío:</span>
                            {addr.delivery_notes}
                          </div>
                        )}

                        {/* Address Quick Actions */}
                        <div className="flex flex-wrap items-center gap-2 mt-4 pt-2.5 border-t border-slate-100 justify-end">
                          {!addr.is_default && (
                            <button 
                              onClick={() => handleSetAddressDefault(addr)}
                              className="text-[9px] font-black uppercase tracking-wider text-brand-600 hover:text-brand-700 bg-brand-50/50 hover:bg-brand-50 px-2.5 py-1.5 rounded-lg transition-all"
                            >
                              Predeterminar
                            </button>
                          )}
                          <button 
                            onClick={() => handleCreateOrderRedirect(selectedClientForAddresses.id, addr.id)}
                            className="text-[9px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-600 hover:bg-emerald-100/80 px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1"
                          >
                            <ShoppingBag className="w-3 h-3" />
                            Usar en Pedido
                          </button>
                          <button 
                            onClick={() => handleEditAddressInit(addr)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
                            title="Editar Dirección"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={() => handleDeleteAddress(addr.id)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition-colors"
                            title="Eliminar Dirección"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- CUENTA CORRIENTE LEDGER MODAL --- */}
      {showLedgerModal && selectedClientForLedger && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200/80 flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-black text-slate-900 text-sm uppercase tracking-tight flex items-center gap-2">
                  <Wallet className="w-4.5 h-4.5 text-brand-600" />
                  Cuenta Corriente y Ledger
                </h3>
                <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                  Movimientos financieros para: <span className="text-slate-600 font-black">{selectedClientForLedger.business_name}</span>
                </p>
              </div>
              <button 
                onClick={() => setShowLedgerModal(false)}
                className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Split Panel */}
            <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
              {/* Left Panel: Registrar Cobro / Ajuste Form */}
              <div className="w-full md:w-5/12 p-6 border-b md:border-b-0 md:border-r border-slate-100 overflow-y-auto">
                {/* Tabs Selector */}
                <div className="flex border-b border-slate-200/60 mb-5 shrink-0">
                  <button
                    onClick={() => setActiveFormTab('new')}
                    className={`flex-1 pb-2.5 text-[10px] font-black uppercase tracking-wider transition-colors border-b-2 flex items-center justify-center gap-1.5 ${
                      activeFormTab === 'new'
                        ? 'border-brand-600 text-brand-600'
                        : 'border-transparent text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    Nuevo Cobro
                  </button>
                  <button
                    onClick={() => setActiveFormTab('existing')}
                    className={`flex-1 pb-2.5 text-[10px] font-black uppercase tracking-wider transition-colors border-b-2 flex items-center justify-center gap-1.5 ${
                      activeFormTab === 'existing'
                        ? 'border-brand-600 text-brand-600'
                        : 'border-transparent text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    <Database className="w-3.5 h-3.5" />
                    Imputar Caja
                  </button>
                </div>

                {activeFormTab === 'new' ? (
                  <>
                    {/* Open Cash Register Warning */}
                    {!openRegister ? (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs font-bold text-amber-800 space-y-2 mb-4">
                        <div className="flex items-center gap-1.5 text-amber-900">
                          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                          Caja Cerrada
                        </div>
                        <p className="font-medium text-[11px] leading-relaxed text-amber-700">
                          No tenés una caja diaria abierta. Para poder registrar cobros o movimientos, debés abrir un turno en la sección de Caja Diaria.
                        </p>
                        <Button 
                          type="button" 
                          onClick={() => {
                            setShowLedgerModal(false);
                            router.push('/vendedores/caja');
                          }}
                          className="w-full mt-1.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition-all"
                        >
                          Ir a Caja Diaria
                        </Button>
                      </div>
                    ) : (
                      <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-xs font-bold text-emerald-800 flex items-center justify-between mb-4">
                        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Caja Abierta Activa</span>
                        <span className="bg-emerald-100 text-emerald-950 px-1.5 py-0.5 rounded text-[9px] uppercase">Turno #{openRegister.id.substring(0, 8)}</span>
                      </div>
                    )}

                    <form onSubmit={handleSavePayment} className="space-y-4">
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2 space-y-1.5">
                          <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Monto *</label>
                          <div className="relative">
                            <input 
                              type="number" 
                              required
                              step="any"
                              disabled={!openRegister}
                              placeholder="Monto cobrado"
                              value={paymentAmount}
                              onChange={(e) => setPaymentAmount(e.target.value)}
                              className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 font-bold text-xs focus:ring-4 focus:ring-brand-500/10 focus:outline-none transition-all disabled:opacity-50"
                            />
                            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs font-mono">
                              {paymentCurrency === 'USD' ? 'US$' : '$'}
                            </span>
                          </div>
                        </div>

                        <div className="col-span-1 space-y-1.5">
                          <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Divisa</label>
                          <select 
                            disabled={!openRegister}
                            value={paymentCurrency}
                            onChange={(e) => setPaymentCurrency(e.target.value as any)}
                            className="w-full px-2 py-2.5 rounded-xl border border-slate-200 bg-white font-bold text-xs focus:outline-none transition-all disabled:opacity-50"
                          >
                            <option value="ARS">ARS</option>
                            <option value="USD">USD</option>
                          </select>
                        </div>
                      </div>

                      {paymentCurrency === 'USD' && (
                        <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
                          <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Tipo de Cambio (ARS por USD) *</label>
                          <input 
                            type="number" 
                            required
                            disabled={!openRegister}
                            placeholder="Tipo de cambio"
                            value={paymentExchangeRate}
                            onChange={(e) => setPaymentExchangeRate(e.target.value)}
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 font-bold text-xs focus:ring-4 focus:ring-brand-500/10 focus:outline-none transition-all disabled:opacity-50"
                          />
                        </div>
                      )}

                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Medio de Pago *</label>
                        <select 
                          disabled={!openRegister}
                          value={paymentMethodId}
                          onChange={(e) => setPaymentMethodId(e.target.value)}
                          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white font-bold text-xs focus:outline-none transition-all disabled:opacity-50"
                        >
                          {paymentMethods.map(pm => (
                            <option key={pm.id} value={pm.id}>{pm.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Comentarios / Observaciones</label>
                        <textarea 
                          disabled={!openRegister}
                          placeholder="Ej: Transferencia Banco Galicia, Efectivo entregado en mano, crédito por artículo defectuoso, etc."
                          value={paymentNotes}
                          onChange={(e) => setPaymentNotes(e.target.value)}
                          rows={3}
                          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 font-bold text-xs focus:ring-4 focus:ring-brand-500/10 focus:outline-none transition-all resize-none disabled:opacity-50"
                        />
                      </div>

                      <Button 
                        type="submit"
                        disabled={!openRegister || submittingPayment}
                        className="w-full py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-black uppercase text-[10px] tracking-wider transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-sm"
                      >
                        {submittingPayment ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Registrar Cobro"}
                      </Button>

                      <p className="text-[9px] text-slate-400 font-bold leading-normal text-center mt-2.5">
                        * Registrar un cobro impactará inmediatamente en el saldo de la Cuenta Corriente del cliente y agregará un registro en el libro diario de la caja activa.
                      </p>
                    </form>
                  </>
                ) : (
                  <form onSubmit={handleImputeExistingCash} className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Movimiento de Caja Libre *</label>
                      {loadingIngresos ? (
                        <div className="flex items-center justify-center p-6 text-slate-400">
                          <Loader2 className="w-5 h-5 animate-spin text-brand-600 mr-2" />
                          <span className="text-xs font-bold">Cargando ingresos libres...</span>
                        </div>
                      ) : unreconciledIngresos.length === 0 ? (
                        <div className="bg-slate-50 rounded-xl p-6 text-center border border-slate-200/50">
                          <AlertCircle className="w-5 h-5 text-slate-400 mx-auto mb-1.5" />
                          <p className="text-[10px] text-slate-500 font-bold">
                            No hay ingresos libres (sin conciliar) registrados en caja.
                          </p>
                        </div>
                      ) : (
                        <select 
                          required
                          value={selectedIngresoId}
                          onChange={(e) => setSelectedIngresoId(e.target.value)}
                          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white font-bold text-xs focus:outline-none transition-all"
                        >
                          <option value="">Seleccione un movimiento...</option>
                          {unreconciledIngresos.map(tx => (
                            <option key={tx.id} value={tx.id}>
                              [{new Date(tx.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}] {tx.concept || tx.notes || 'Ingreso sin concepto'} - {tx.currency === 'USD' ? 'US$' : '$'}{tx.amount.toLocaleString('es-AR')} ({tx.payment_methods?.name || 'S/M'})
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    <Button 
                      type="submit"
                      disabled={loadingIngresos || unreconciledIngresos.length === 0 || !selectedIngresoId || submittingImputation}
                      className="w-full py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-black uppercase text-[10px] tracking-wider transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      {submittingImputation ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Imputar Cobro de Caja"}
                    </Button>

                    <p className="text-[9px] text-slate-400 font-bold leading-normal text-center mt-2.5">
                      * Al imputar un movimiento existente, se vinculará este cobro con la cuenta corriente de este cliente sin generar nuevos movimientos de caja.
                    </p>
                  </form>
                )}
              </div>

              {/* Right Panel: Ledger Entries List */}
              <div className="w-full md:w-7/12 p-6 overflow-y-auto flex flex-col bg-slate-50/50">
                {/* Balance Cards Summary */}
                {(() => {
                  const clientBal = balances[selectedClientForLedger.id] || { totalCharged: 0, totalPaid: 0, balance: 0 };
                  const formattedChg = clientBal.totalCharged.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                  const formattedPaid = clientBal.totalPaid.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                  const formattedBal = Math.abs(clientBal.balance).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                  const isDeudor = clientBal.balance > 0;
                  const isAFavor = clientBal.balance < 0;

                  return (
                    <div className="grid grid-cols-3 gap-2.5 mb-6 shrink-0">
                      <div className="bg-white p-3 border border-slate-200/50 rounded-2xl shadow-sm text-center">
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider block">Total Comprado</span>
                        <h4 className="text-xs font-black text-slate-800 mt-1 font-mono">${formattedChg}</h4>
                      </div>
                      <div className="bg-white p-3 border border-slate-200/50 rounded-2xl shadow-sm text-center">
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider block">Total Abonado</span>
                        <h4 className="text-xs font-black text-slate-800 mt-1 font-mono">${formattedPaid}</h4>
                      </div>
                      <div className={`p-3 border rounded-2xl shadow-sm text-center ${
                        clientBal.balance === 0 
                          ? 'bg-slate-100 border-slate-200 text-slate-700' 
                          : isDeudor 
                            ? 'bg-rose-50 border-rose-100 text-rose-700' 
                            : 'bg-emerald-50 border-emerald-100 text-emerald-700'
                      }`}>
                        <span className="text-[8px] font-black uppercase tracking-wider block opacity-75">Saldo Neto</span>
                        <h4 className="text-xs font-black mt-1 font-mono">
                          {isDeudor ? `$${formattedBal}` : isAFavor ? `-$${formattedBal}` : '$0,00'}
                        </h4>
                        <span className="text-[7px] font-black uppercase block mt-0.5">
                          {clientBal.balance === 0 ? 'Al Día' : isDeudor ? 'Deuda Cliente' : 'Saldo a Favor'}
                        </span>
                      </div>
                    </div>
                  );
                })()}

                <h4 className="text-[10px] font-black text-slate-700 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-brand-600" /> Historial de Movimientos
                </h4>

                {ledgerLoading ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-12 text-slate-400">
                    <Loader2 className="w-8 h-8 animate-spin text-brand-600 mb-2" />
                    <p className="text-xs font-bold">Cargando movimientos...</p>
                  </div>
                ) : ledgerEntries.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-200/60 p-12 text-center flex-1 flex flex-col items-center justify-center">
                    <Receipt className="w-10 h-10 text-slate-300 mb-3" />
                    <h5 className="text-xs font-bold text-slate-600">Sin movimientos registrados</h5>
                    <p className="text-[10px] text-slate-400 mt-1 max-w-[220px]">
                      Este cliente no tiene pedidos activos ni cobros cargados en su cuenta corriente.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5 flex-1 pr-1">
                    {ledgerEntries.map((entry) => {
                      const isCargo = entry.type === 'cargo';
                      const formattedAmt = Math.abs(entry.amount).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                      const formattedBal = entry.runningBalance.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                      
                      return (
                        <div 
                          key={entry.id}
                          className="bg-white border border-slate-200/50 hover:border-slate-300 rounded-xl p-3 shadow-sm flex items-start justify-between gap-3 text-xs"
                        >
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${
                                isCargo 
                                  ? 'bg-rose-50 text-rose-700 border border-rose-100' 
                                  : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                              }`}>
                                {isCargo ? 'Cargo' : 'Abono'}
                              </span>
                              {entry.cash_transaction_id && (
                                <span className="inline-flex items-center gap-0.5 text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100" title="Cobro conciliado con un movimiento de caja">
                                  <Link2 className="w-2.5 h-2.5" />
                                  Conciliado
                                </span>
                              )}
                              <span className="font-bold text-slate-800 truncate" title={entry.description}>
                                {entry.description}
                              </span>
                            </div>
                            <p className="text-[9px] text-slate-400 font-bold">
                              {new Date(entry.date).toLocaleString('es-AR')}
                            </p>
                            {entry.notes && (
                              <p className="text-[10px] text-slate-500 font-semibold bg-slate-50 p-1.5 rounded-lg border border-slate-200/40 mt-1.5 leading-relaxed">
                                {entry.notes}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-2.5 shrink-0">
                            <div className="text-right">
                              <span className={`font-bold font-mono ${isCargo ? 'text-rose-600' : 'text-emerald-600'}`}>
                                {isCargo ? '+' : '-'}${formattedAmt} {entry.currency !== 'ARS' && <span className="text-[9px] text-slate-400">({entry.currency})</span>}
                              </span>
                              <div className="text-[9px] text-slate-400 font-black mt-1 font-mono">
                                Saldo: ${formattedBal}
                              </div>
                            </div>
                            
                            {!isCargo && (
                              <button
                                onClick={() => handleUnlinkPayment(entry.id)}
                                className={`p-1.5 rounded-lg border transition-all ${
                                  entry.cash_transaction_id
                                    ? 'bg-amber-50 hover:bg-amber-100 text-amber-600 border-amber-200/50 hover:border-amber-300'
                                    : 'bg-rose-50 hover:bg-rose-100 text-rose-600 border-rose-200/50 hover:border-rose-300'
                                }`}
                                title={entry.cash_transaction_id ? "Desconciliar cobro de caja" : "Eliminar cobro directo"}
                              >
                                {entry.cash_transaction_id ? (
                                  <Unlink className="w-3.5 h-3.5" />
                                ) : (
                                  <Trash2 className="w-3.5 h-3.5" />
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
