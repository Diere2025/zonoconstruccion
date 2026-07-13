"use client";

import React, { useEffect, useState } from "react";
import { formatPrice } from "@/lib/utils";
import { 
  Wallet, 
  ArrowUpRight, 
  ArrowDownRight, 
  PlusCircle, 
  Calendar, 
  Clock, 
  User, 
  AlertCircle,
  FileText,
  Loader2,
  CheckCircle2,
  Info,
  DollarSign,
  Link2,
  Link2Off,
  UserCheck
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { CashRegister, CashTransaction, PaymentMethod, CostCenter } from "@/types";

export default function CajaDiariaPage() {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userFullName, setUserFullName] = useState("");
  const [activeRegister, setActiveRegister] = useState<CashRegister | null>(null);
  const [transactions, setTransactions] = useState<CashTransaction[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  
  // Modales
  const [isOpeningModalOpen, setIsOpeningModalOpen] = useState(false);
  const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);

  // Form de Apertura
  const [initArs, setInitArs] = useState("0");
  const [initUsd, setInitUsd] = useState("0");
  const [openingNotes, setOpeningNotes] = useState("");

  // Form de Transacción Rápida
  const [txType, setTxType] = useState<'ingreso' | 'egreso'>('egreso');
  const [txCategory, setTxCategory] = useState<'gasto_general' | 'retiro_caja' | 'ingreso_capital' | 'ajuste_arqueo' | 'cobro_pedido' | 'pago_proveedor'>('gasto_general');
  const [txAmount, setTxAmount] = useState("");
  const [txCurrency, setTxCurrency] = useState<'ARS' | 'USD'>('ARS');
  const [txPaymentMethod, setTxPaymentMethod] = useState("");
  const [txNotes, setTxNotes] = useState("");
  const [submittingTx, setSubmittingTx] = useState(false);

  // Nuevos campos para Transacción Enriquecida
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [txConcept, setTxConcept] = useState("");
  const [txCostCenterId, setTxCostCenterId] = useState("");
  const [txCreatedAt, setTxCreatedAt] = useState("");

  // Estado de Conciliación
  const [reconciliations, setReconciliations] = useState<{
    clientPayments: Record<string, any>;
    supplierPayments: Record<string, any>;
  }>({ clientPayments: {}, supplierPayments: {} });

  // Modales de conciliación
  const [isReconcileModalOpen, setIsReconcileModalOpen] = useState(false);
  const [selectedTxForReconciliation, setSelectedTxForReconciliation] = useState<CashTransaction | null>(null);
  const [clients, setClients] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [clientOrders, setClientOrders] = useState<any[]>([]);
  const [supplierPurchases, setSupplierPurchases] = useState<any[]>([]);

  const [reconcileClientId, setReconcileClientId] = useState("");
  const [reconcileOrderId, setReconcileOrderId] = useState("");
  const [reconcileSupplierId, setReconcileSupplierId] = useState("");
  const [reconcilePurchaseId, setReconcilePurchaseId] = useState("");
  const [submittingReconcile, setSubmittingReconcile] = useState(false);

  // Form de Cierre
  const [actualArs, setActualArs] = useState("");
  const [actualUsd, setActualUsd] = useState("");
  const [closingNotes, setClosingNotes] = useState("");
  const [submittingClosing, setSubmittingClosing] = useState(false);

  // Filtros de transacciones
  const [filterCurrency, setFilterCurrency] = useState<'all' | 'ARS' | 'USD'>('all');
  const [filterType, setFilterType] = useState<'all' | 'ingreso' | 'egreso'>('all');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      
      // Prefill datetime-local input
      const now = new Date();
      const tzOffset = now.getTimezoneOffset() * 60000;
      const localISOTime = (new Date(now.getTime() - tzOffset)).toISOString().slice(0, 16);
      setTxCreatedAt(localISOTime);

      // 1. Obtener usuario
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      // Obtener nombre del vendedor
      const { data: seller } = await supabase
        .from('sellers')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle();
      if (seller) {
        setUserFullName(seller.full_name);
      }

      // 2. Obtener metodos de pago
      const { data: pms } = await supabase
        .from('payment_methods')
        .select('*')
        .eq('is_active', true);
      if (pms) {
        setPaymentMethods(pms);
        // Default to cash method if present
        const cashMethod = pms.find(p => p.name.toLowerCase().includes("efectivo") || p.id === 'a3a890a8-b677-4b7b-8ffb-d36c2e7b5ad3');
        if (cashMethod) setTxPaymentMethod(cashMethod.id);
        else if (pms.length > 0) setTxPaymentMethod(pms[0].id);
      }

      // 3. Obtener centros de costo
      const { data: ccs } = await supabase
        .from('cost_centers')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (ccs) {
        setCostCenters(ccs);
        // Pre-select 'LOG' or 'ADM' if found, otherwise first one
        const preSelected = ccs.find(c => c.code === 'LOG') || ccs.find(c => c.code === 'ADM') || ccs[0];
        if (preSelected) setTxCostCenterId(preSelected.id);
      }

      // 4. Obtener clientes y proveedores para conciliación
      const { data: cls } = await supabase
        .from('clients')
        .select('id, full_name, business_name')
        .order('full_name');
      if (cls) setClients(cls);

      const { data: sups } = await supabase
        .from('suppliers')
        .select('id, name')
        .order('name');
      if (sups) setSuppliers(sups);

      // 5. Buscar caja abierta activa
      const { data: registers } = await supabase
        .from('cash_registers')
        .select('*')
        .eq('status', 'Abierta')
        .order('opened_at', { ascending: false });

      if (registers && registers.length > 0) {
        const currentReg = registers[0];
        setActiveRegister(currentReg);
        
        // Cargar transacciones de la caja
        const { data: txs } = await supabase
          .from('cash_transactions')
          .select('*, cost_centers(*), payment_methods(name)')
          .eq('register_id', currentReg.id)
          .order('created_at', { ascending: false });
        
        if (txs && txs.length > 0) {
          const txIds = txs.map(t => t.id);

          const { data: cp } = await supabase
            .from('client_payments')
            .select('id, cash_transaction_id, client_id, order_id, clients(full_name, business_name), orders(customer_name, order_date, total_amount)')
            .in('cash_transaction_id', txIds);

          const { data: sp } = await supabase
            .from('supplier_payments')
            .select('id, cash_transaction_id, supplier_id, purchase_id, suppliers(name), supplier_purchases(invoice_number, total_amount)')
            .in('cash_transaction_id', txIds);

          const cpMap: Record<string, any> = {};
          if (cp) {
            cp.forEach(p => {
              if (p.cash_transaction_id) cpMap[p.cash_transaction_id] = p;
            });
          }

          const spMap: Record<string, any> = {};
          if (sp) {
            sp.forEach(p => {
              if (p.cash_transaction_id) spMap[p.cash_transaction_id] = p;
            });
          }

          setReconciliations({ clientPayments: cpMap, supplierPayments: spMap });
          setTransactions(txs as any);
        } else {
          setTransactions([]);
          setReconciliations({ clientPayments: {}, supplierPayments: {} });
        }
      } else {
        setActiveRegister(null);
        setTransactions([]);
        setReconciliations({ clientPayments: {}, supplierPayments: {} });
      }
    } catch (err) {
      console.error("Error al cargar datos de caja:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleOpenCaja(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    try {
      setLoading(true);
      const ars = Number(initArs) || 0;
      const usd = Number(initUsd) || 0;

      const { data, error } = await supabase
        .from('cash_registers')
        .insert({
          opened_by: userId,
          initial_balance_ars: ars,
          expected_balance_ars: ars,
          initial_balance_usd: usd,
          expected_balance_usd: usd,
          status: 'Abierta',
          notes: openingNotes || null
        })
        .select()
        .single();

      if (error) throw error;
      
      setIsOpeningModalOpen(false);
      setInitArs("0");
      setInitUsd("0");
      setOpeningNotes("");
      await loadData();
    } catch (err: any) {
      alert("Error al abrir la caja: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRegisterTransaction(e: React.FormEvent) {
    e.preventDefault();
    if (!activeRegister || !userId || !txAmount || !txPaymentMethod) return;
    
    // Validar centro de costo si es egreso
    if (txType === 'egreso' && !txCostCenterId) {
      alert("Debes seleccionar un Centro de Costo para registrar un Egreso.");
      return;
    }

    try {
      setSubmittingTx(true);
      const amount = Number(txAmount);
      if (isNaN(amount) || amount <= 0) {
        alert("Monto inválido");
        return;
      }

      // Insert transaction with custom columns
      const { error: txError } = await supabase
        .from('cash_transactions')
        .insert({
          register_id: activeRegister.id,
          type: txType,
          category: txCategory,
          amount: amount,
          currency: txCurrency,
          payment_method_id: txPaymentMethod,
          notes: txNotes || null,
          created_by: userId,
          concept: txConcept || null,
          cost_center_id: txCostCenterId || null,
          created_at: txCreatedAt ? new Date(txCreatedAt).toISOString() : new Date().toISOString()
        });

      if (txError) throw txError;

      // Update cash register expected balance
      const newExpectedArs = activeRegister.expected_balance_ars + (txCurrency === 'ARS' ? (txType === 'ingreso' ? amount : -amount) : 0);
      const newExpectedUsd = activeRegister.expected_balance_usd + (txCurrency === 'USD' ? (txType === 'ingreso' ? amount : -amount) : 0);

      const { error: regError } = await supabase
        .from('cash_registers')
        .update({
          expected_balance_ars: newExpectedArs,
          expected_balance_usd: newExpectedUsd
        })
        .eq('id', activeRegister.id);

      if (regError) throw regError;

      // Reset form
      setTxAmount("");
      setTxNotes("");
      setTxConcept("");
      // Recargar caja y transacciones
      await loadData();
    } catch (err: any) {
      alert("Error al registrar movimiento: " + err.message);
    } finally {
      setSubmittingTx(false);
    }
  }

  async function loadClientOrders(clientId: string) {
    if (!clientId) {
      setClientOrders([]);
      return;
    }
    const { data } = await supabase
      .from('orders')
      .select('id, customer_name, total_amount, order_date, status')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });
    if (data) setClientOrders(data);
  }

  async function loadSupplierPurchases(supplierId: string) {
    if (!supplierId) {
      setSupplierPurchases([]);
      return;
    }
    const { data } = await supabase
      .from('supplier_purchases')
      .select('id, invoice_number, total_amount, paid_amount, status, currency')
      .eq('supplier_id', supplierId)
      .order('purchase_date', { ascending: false });
    if (data) setSupplierPurchases(data);
  }

  async function handleReconcile(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTxForReconciliation || !userId) return;

    try {
      setSubmittingReconcile(true);
      const tx = selectedTxForReconciliation;

      if (tx.type === 'ingreso') {
        if (!reconcileClientId) {
          alert("Debes seleccionar un cliente");
          return;
        }

        const { error } = await supabase
          .from('client_payments')
          .insert({
            client_id: reconcileClientId,
            order_id: reconcileOrderId || null,
            amount: tx.amount,
            currency: tx.currency,
            payment_method_id: tx.payment_method_id,
            cash_transaction_id: tx.id,
            notes: `Conciliado desde Caja: ${tx.concept || tx.notes || ''}`.trim(),
            created_by: userId
          });

        if (error) throw error;
      } else {
        if (!reconcileSupplierId || !reconcilePurchaseId) {
          alert("Debes seleccionar un proveedor y una compra");
          return;
        }

        const purchase = supplierPurchases.find(p => p.id === reconcilePurchaseId);
        if (!purchase) {
          alert("Compra no encontrada");
          return;
        }

        if (purchase.currency !== tx.currency) {
          alert(`La divisa de la compra (${purchase.currency}) no coincide con la del egreso (${tx.currency})`);
          return;
        }

        const { error: payError } = await supabase
          .from('supplier_payments')
          .insert({
            supplier_id: reconcileSupplierId,
            purchase_id: reconcilePurchaseId,
            amount: tx.amount,
            currency: tx.currency,
            payment_method_id: tx.payment_method_id,
            cash_transaction_id: tx.id,
            notes: `Conciliado desde Caja: ${tx.concept || tx.notes || ''}`.trim(),
            created_by: userId
          });

        if (payError) throw payError;

        const newPaidAmount = Number(purchase.paid_amount || 0) + tx.amount;
        const newStatus = newPaidAmount >= purchase.total_amount ? 'Pagado' : 'Parcial';

        const { error: purchaseError } = await supabase
          .from('supplier_purchases')
          .update({
            paid_amount: newPaidAmount,
            status: newStatus
          })
          .eq('id', reconcilePurchaseId);

        if (purchaseError) throw purchaseError;
      }

      setIsReconcileModalOpen(false);
      setSelectedTxForReconciliation(null);
      setReconcileClientId("");
      setReconcileOrderId("");
      setReconcileSupplierId("");
      setReconcilePurchaseId("");
      await loadData();
      alert("Movimiento conciliado con éxito!");
    } catch (err: any) {
      console.error(err);
      alert("Error al conciliar: " + err.message);
    } finally {
      setSubmittingReconcile(false);
    }
  }

  async function handleUnreconcile(tx: CashTransaction) {
    if (!confirm("¿Estás seguro de que deseas desconciliar este movimiento? Se eliminará la imputación financiera en la cuenta del cliente/proveedor.")) return;

    try {
      setLoading(true);

      if (tx.type === 'ingreso') {
        const reconciliation = reconciliations.clientPayments[tx.id];
        if (!reconciliation) return;

        const { error } = await supabase
          .from('client_payments')
          .delete()
          .eq('id', reconciliation.id);

        if (error) throw error;
      } else {
        const reconciliation = reconciliations.supplierPayments[tx.id];
        if (!reconciliation) return;

        const { data: payData, error: payFetchError } = await supabase
          .from('supplier_payments')
          .select('*, supplier_purchases(id, paid_amount, total_amount)')
          .eq('id', reconciliation.id)
          .maybeSingle();

        if (payFetchError) throw payFetchError;

        const { error: delError } = await supabase
          .from('supplier_payments')
          .delete()
          .eq('id', reconciliation.id);

        if (delError) throw delError;

        if (payData && payData.supplier_purchases) {
          const purchase = payData.supplier_purchases as any;
          const newPaidAmount = Math.max(0, Number(purchase.paid_amount || 0) - payData.amount);
          const newStatus = newPaidAmount <= 0 ? 'Pendiente' : newPaidAmount >= purchase.total_amount ? 'Pagado' : 'Parcial';

          const { error: purchaseError } = await supabase
            .from('supplier_purchases')
            .update({
              paid_amount: newPaidAmount,
              status: newStatus
            })
            .eq('id', purchase.id);

          if (purchaseError) throw purchaseError;
        }
      }

      await loadData();
      alert("Movimiento desconciliado con éxito!");
    } catch (err: any) {
      console.error(err);
      alert("Error al desconciliar: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCloseCaja(e: React.FormEvent) {
    e.preventDefault();
    if (!activeRegister || !userId || !actualArs || !actualUsd) return;

    try {
      setSubmittingClosing(true);
      const arsActual = Number(actualArs);
      const usdActual = Number(actualUsd);

      const { error } = await supabase
        .from('cash_registers')
        .update({
          closed_by: userId,
          closed_at: new Date().toISOString(),
          actual_balance_ars: arsActual,
          actual_balance_usd: usdActual,
          status: 'Cerrada',
          notes: (activeRegister.notes ? activeRegister.notes + " | " : "") + "Notas Cierre: " + (closingNotes || "Sin observaciones")
        })
        .eq('id', activeRegister.id);

      if (error) throw error;

      setIsClosingModalOpen(false);
      setActualArs("");
      setActualUsd("");
      setClosingNotes("");
      await loadData();
    } catch (err: any) {
      alert("Error al cerrar caja: " + err.message);
    } finally {
      setSubmittingClosing(false);
    }
  }

  const filteredTransactions = transactions.filter(t => {
    const matchCurrency = filterCurrency === 'all' || t.currency === filterCurrency;
    const matchType = filterType === 'all' || t.type === filterType;
    return matchCurrency && matchType;
  });

  if (loading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 text-brand-600 animate-spin" />
        <p className="text-slate-500 font-medium">Cargando tesorería...</p>
      </div>
    );
  }

  const formatCurrency = (amount: number, currency: 'ARS' | 'USD') => {
    if (currency === 'USD') {
      return `US$ ${amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return formatPrice(amount);
  };

  return (
    <div className="space-y-4">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Wallet className="w-5 h-5 text-brand-500" /> Caja y Tesorería
          </h1>
          <p className="text-[11px] text-slate-400 font-semibold">Administra aperturas, arqueos, cierres diarios y flujo de efectivo.</p>
        </div>
        {!activeRegister && (
          <button
            onClick={() => setIsOpeningModalOpen(true)}
            className="px-4 py-2 bg-brand-600 text-white rounded-xl text-xs font-black hover:bg-brand-700 active:scale-95 shadow-md shadow-brand-600/25 flex items-center gap-1.5 transition-all"
          >
            <PlusCircle className="w-4 h-4" /> Abrir Turno de Caja
          </button>
        )}
      </div>

      {/* Estado de Turno Cerrado */}
      {!activeRegister ? (
        <div className="bg-white border border-slate-100 rounded-[2rem] p-12 text-center max-w-xl mx-auto my-12 shadow-sm">
          <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-slate-100 text-slate-400">
            <Wallet className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-black text-slate-800">No hay cajas abiertas</h2>
          <p className="text-slate-400 text-xs font-bold max-w-md mx-auto mt-2 mb-8">
            Para comenzar a registrar transacciones o cobrar pedidos, debés declarar los saldos iniciales del efectivo abriendo un turno.
          </p>
          <button
            onClick={() => setIsOpeningModalOpen(true)}
            className="px-6 py-3 bg-brand-600 hover:bg-brand-700 text-white font-black text-sm rounded-xl inline-flex items-center gap-2 active:scale-95 transition-all shadow-md shadow-brand-600/20"
          >
            <PlusCircle className="w-4 h-4" /> Abrir Caja Ahora
          </button>
        </div>
      ) : (
        /* Dashboard de Caja Activa */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          
          {/* Columna Izquierda: Tarjetas de Saldo y Cierre */}
          <div className="lg:col-span-1 space-y-4">
            
            {/* Información General de la Caja */}
            <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm space-y-3">
              <div className="flex justify-between items-center pb-2.5 border-b border-slate-100">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Información del Turno</span>
                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 font-bold rounded text-[9px] uppercase tracking-wide flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Abierta
                </span>
              </div>
              
              <div className="space-y-2 text-xs font-bold text-slate-700">
                <div className="flex justify-between">
                  <span className="text-slate-400 flex items-center gap-1"><User className="w-3.5 h-3.5 text-slate-400" /> Operador:</span>
                  <span className="text-slate-800">{userFullName || "Cajero"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-slate-400" /> Abierta el:</span>
                  <span className="text-slate-800">{new Date(activeRegister.opened_at).toLocaleString('es-AR')}</span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <button
                  onClick={() => {
                    setActualArs(activeRegister.expected_balance_ars.toString());
                    setActualUsd(activeRegister.expected_balance_usd.toString());
                    setIsClosingModalOpen(true);
                  }}
                  className="w-full py-2 bg-slate-900 text-white rounded-xl text-xs font-black hover:bg-slate-800 active:scale-95 shadow-md shadow-slate-900/10 flex items-center justify-center gap-1.5 transition-all"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Arqueo y Cerrar Caja
                </button>
              </div>
            </div>

            {/* Saldos Esperados (Pesos y Dólares) */}
            <div className="bg-brand-600 text-white border border-brand-700 rounded-2xl p-4 shadow-md space-y-4">
              <div className="pb-2.5 border-b border-brand-500/30">
                <span className="text-[10px] font-black uppercase tracking-wider text-brand-200">Saldos de Efectivo Esperados</span>
              </div>
              
              <div className="space-y-4">
                <div>
                  <span className="text-[9px] font-black uppercase text-brand-200 tracking-wider">Efectivo en Pesos (ARS)</span>
                  <div className="text-2xl font-black font-mono tracking-tight leading-none mt-1">
                    {formatCurrency(activeRegister.expected_balance_ars, 'ARS')}
                  </div>
                  <span className="text-[9px] text-brand-200/80 font-bold block mt-0.5">Inicial: {formatCurrency(activeRegister.initial_balance_ars, 'ARS')}</span>
                </div>

                <div>
                  <span className="text-[9px] font-black uppercase text-brand-200 tracking-wider">Efectivo en Dólares (USD)</span>
                  <div className="text-xl font-black font-mono tracking-tight leading-none mt-1 text-emerald-300">
                    {formatCurrency(activeRegister.expected_balance_usd, 'USD')}
                  </div>
                  <span className="text-[9px] text-brand-200/80 font-bold block mt-0.5">Inicial: {formatCurrency(activeRegister.initial_balance_usd, 'USD')}</span>
                </div>
              </div>
            </div>

            {/* Registrar Movimiento Rápido */}
            <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm space-y-3">
              <h3 className="text-xs font-black text-slate-800 flex items-center gap-1 border-b border-slate-100 pb-2">
                <PlusCircle className="w-4 h-4 text-brand-500" /> Carga Rápida de Caja (Gastos/Ingresos)
              </h3>
              
              <form onSubmit={handleRegisterTransaction} className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => { setTxType('egreso'); setTxCategory('gasto_general'); }}
                    className={`py-1.5 text-[10px] font-black rounded-lg border uppercase tracking-wider transition-all ${
                      txType === 'egreso' 
                        ? 'bg-rose-50 border-rose-200 text-rose-700' 
                        : 'border-slate-100 text-slate-400 hover:bg-slate-50'
                    }`}
                  >
                    Egreso (Pago)
                  </button>
                  <button
                    type="button"
                    onClick={() => { setTxType('ingreso'); setTxCategory('ingreso_capital'); }}
                    className={`py-1.5 text-[10px] font-black rounded-lg border uppercase tracking-wider transition-all ${
                      txType === 'ingreso' 
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
                        : 'border-slate-100 text-slate-400 hover:bg-slate-50'
                    }`}
                  >
                    Ingreso (Cobro)
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-slate-400">Fecha y Hora</label>
                    <input
                      type="datetime-local"
                      required
                      value={txCreatedAt}
                      onChange={(e) => setTxCreatedAt(e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-xs outline-none focus:border-brand-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-slate-400">Categoría</label>
                    <select
                      value={txCategory}
                      onChange={(e) => setTxCategory(e.target.value as any)}
                      className="w-full px-2 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-xs outline-none focus:border-brand-500"
                    >
                      {txType === 'egreso' ? (
                        <>
                          <option value="gasto_general">Gastos Generales</option>
                          <option value="pago_proveedor">Pago a Proveedor</option>
                          <option value="retiro_caja">Retiro de Caja</option>
                          <option value="devolucion_reembolso">Reembolso / Devolución</option>
                        </>
                      ) : (
                        <>
                          <option value="cobro_pedido">Cobro de Pedido</option>
                          <option value="ingreso_capital">Ingreso de Capital</option>
                          <option value="ajuste_arqueo">Ajuste de Arqueo Sobrante</option>
                        </>
                      )}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2 space-y-1">
                    <label className="text-[9px] font-black uppercase text-slate-400">Monto *</label>
                    <input
                      type="number"
                      required
                      min="0.01"
                      step="any"
                      placeholder="Monto"
                      value={txAmount}
                      onChange={(e) => setTxAmount(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-xs outline-none focus:border-brand-500"
                    />
                  </div>
                  <div className="col-span-1 space-y-1">
                    <label className="text-[9px] font-black uppercase text-slate-400">Divisa</label>
                    <select
                      value={txCurrency}
                      onChange={(e) => setTxCurrency(e.target.value as any)}
                      className="w-full px-2 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-xs outline-none focus:border-brand-500"
                    >
                      <option value="ARS">ARS ($)</option>
                      <option value="USD">USD (US$)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-slate-400">Medio de Pago *</label>
                    <select
                      value={txPaymentMethod}
                      onChange={(e) => setTxPaymentMethod(e.target.value)}
                      required
                      className="w-full px-2 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-xs outline-none focus:border-brand-500"
                    >
                      {paymentMethods.map(pm => (
                        <option key={pm.id} value={pm.id}>{pm.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-slate-400">Centro de Costo {txType === 'egreso' ? '*' : ''}</label>
                    <select
                      value={txCostCenterId}
                      onChange={(e) => setTxCostCenterId(e.target.value)}
                      required={txType === 'egreso'}
                      className="w-full px-2 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-xs outline-none focus:border-brand-500"
                    >
                      <option value="">-- Seleccionar --</option>
                      {costCenters.map(cc => (
                        <option key={cc.id} value={cc.id}>[{cc.code}] {cc.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400">Concepto *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Servicios de Luz, Flete de mercadería..."
                    value={txConcept}
                    onChange={(e) => setTxConcept(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-xs outline-none focus:border-brand-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400">Observaciones / Detalles</label>
                  <input
                    type="text"
                    placeholder="Notas o comentarios opcionales..."
                    value={txNotes}
                    onChange={(e) => setTxNotes(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-xs outline-none focus:border-brand-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submittingTx}
                  className="w-full py-2 bg-brand-600 text-white text-xs font-black rounded-lg hover:bg-brand-700 active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center gap-1.5"
                >
                  {submittingTx ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Grabar Movimiento"}
                </button>
              </form>
            </div>
          </div>

          {/* Columna Derecha: Listado de Transacciones de Caja (2/3 columnas) */}
          <div className="lg:col-span-2 space-y-4">
            
            {/* Libro Diario de Transacciones */}
            <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-slate-100">
                <div>
                  <h2 className="text-sm font-black text-slate-800 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-brand-500" /> Libro Diario de Transacciones
                  </h2>
                  <p className="text-[10px] text-slate-400 font-semibold">Movimientos de la caja actual.</p>
                </div>
                
                {/* Filtros rápidos */}
                <div className="flex flex-wrap gap-2">
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value as any)}
                    className="px-2 py-1 rounded-lg border border-slate-200 bg-white font-bold text-[10px] outline-none"
                  >
                    <option value="all">Tipo: Todos</option>
                    <option value="ingreso">Inflows (Ingresos)</option>
                    <option value="egreso">Outflows (Egresos)</option>
                  </select>
                  <select
                    value={filterCurrency}
                    onChange={(e) => setFilterCurrency(e.target.value as any)}
                    className="px-2 py-1 rounded-lg border border-slate-200 bg-white font-bold text-[10px] outline-none"
                  >
                    <option value="all">Divisa: Todas</option>
                    <option value="ARS">ARS ($)</option>
                    <option value="USD">USD (US$)</option>
                  </select>
                </div>
              </div>

              {/* Lista */}
              {filteredTransactions.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <Info className="w-8 h-8 text-slate-350 mx-auto mb-2" />
                  <p className="text-xs font-bold">No se registran movimientos para los filtros seleccionados.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-slate-100 text-[9px] font-black uppercase text-slate-400 tracking-wider">
                        <th className="py-2.5">Fecha/Hora</th>
                        <th className="py-2.5">Concepto / Categoría</th>
                        <th className="py-2.5 text-center">Tipo</th>
                        <th className="py-2.5 text-center">Centro Costos</th>
                        <th className="py-2.5 text-right">Monto</th>
                        <th className="py-2.5 text-center">Conciliación</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTransactions.map((tx) => {
                        const isIngreso = tx.type === 'ingreso';
                        const catLabels: any = {
                          cobro_pedido: 'Cobro de Pedido',
                          pago_proveedor: 'Pago a Proveedor',
                          retiro_caja: 'Retiro de Caja',
                          ingreso_capital: 'Ingreso Capital',
                          gasto_general: 'Gasto General',
                          ajuste_arqueo: 'Ajuste Arqueo',
                          devolucion_reembolso: 'Devolución/Reembolso'
                        };

                        const clientRec = reconciliations.clientPayments[tx.id];
                        const supplierRec = reconciliations.supplierPayments[tx.id];
                        const isReconciled = !!(clientRec || supplierRec);

                        return (
                          <tr key={tx.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors text-xs font-semibold">
                            <td className="py-3 text-slate-400 text-[10px]">
                              <span className="block">{new Date(tx.created_at || '').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}</span>
                              <span className="block text-[9px] text-slate-350">{new Date(tx.created_at || '').toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span>
                            </td>
                            <td className="py-3">
                              <span className="text-slate-800 block text-xs font-bold">{tx.concept || catLabels[tx.category] || tx.category}</span>
                              <span className="text-[10px] text-slate-400 font-medium block">
                                {catLabels[tx.category] || tx.category} {tx.notes ? `| ${tx.notes}` : ''}
                              </span>
                            </td>
                            <td className="py-3 text-center">
                              <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                                isIngreso 
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                                  : 'bg-rose-50 text-rose-700 border border-rose-100'
                              }`}>
                                {isIngreso ? <ArrowUpRight className="w-2.5 h-2.5 text-emerald-600" /> : <ArrowDownRight className="w-2.5 h-2.5 text-rose-600" />}
                                {tx.type}
                              </span>
                            </td>
                            <td className="py-3 text-center">
                              {tx.cost_centers ? (
                                <span className="px-1.5 py-0.5 bg-slate-50 text-slate-700 rounded font-mono text-[9px] font-black border border-slate-100 uppercase" title={tx.cost_centers.name}>
                                  {tx.cost_centers.code}
                                </span>
                              ) : (
                                <span className="text-slate-300">-</span>
                              )}
                            </td>
                            <td className={`py-3 text-right font-bold font-mono ${isIngreso ? 'text-emerald-600' : 'text-slate-700'}`}>
                              {isIngreso ? '+' : '-'}{formatCurrency(tx.amount, tx.currency)}
                            </td>
                            <td className="py-3 text-center">
                              {isReconciled ? (
                                <div className="inline-flex items-center gap-1 bg-blue-50 border border-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold">
                                  <UserCheck className="w-3.5 h-3.5 text-blue-500" />
                                  <span className="max-w-[120px] truncate" title={clientRec ? `Cliente: ${clientRec.clients?.business_name || clientRec.clients?.full_name}` : `Proveedor: ${supplierRec.suppliers?.name}`}>
                                    {clientRec 
                                      ? (clientRec.clients?.business_name || clientRec.clients?.full_name || 'Cliente') 
                                      : (supplierRec.suppliers?.name || 'Proveedor')}
                                  </span>
                                  <button
                                    onClick={() => handleUnreconcile(tx)}
                                    className="p-0.5 hover:bg-rose-150 hover:text-rose-700 text-slate-400 rounded transition-colors"
                                    title="Desconciliar movimiento"
                                  >
                                    <Link2Off className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => {
                                    setSelectedTxForReconciliation(tx);
                                    if (tx.type === 'ingreso') {
                                      setReconcileClientId("");
                                      setReconcileOrderId("");
                                    } else {
                                      setReconcileSupplierId("");
                                      setReconcilePurchaseId("");
                                    }
                                    setIsReconcileModalOpen(true);
                                  }}
                                  className="px-2 py-1 bg-slate-100 hover:bg-brand-50 hover:text-brand-700 text-slate-600 border border-slate-200 hover:border-brand-200 rounded text-[10px] font-black inline-flex items-center gap-1 active:scale-95 transition-all"
                                >
                                  <Link2 className="w-3 h-3" /> Conciliar
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Apertura de Caja */}
      {isOpeningModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-2xl max-w-md w-full animate-in fade-in zoom-in-95 duration-150">
            <h2 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-1.5 border-b border-slate-100 pb-3 mb-4">
              <Wallet className="w-5 h-5 text-brand-500" /> Apertura de Caja Diaria
            </h2>
            
            <form onSubmit={handleOpenCaja} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400">Fondo Inicial en Pesos (ARS) *</label>
                  <div className="relative">
                    <input
                      type="number"
                      required
                      min="0"
                      value={initArs}
                      onChange={(e) => setInitArs(e.target.value)}
                      className="w-full pl-7 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm outline-none focus:border-brand-500 focus:bg-white transition-all"
                    />
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs font-mono">$</span>
                  </div>
                </div>
                
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400">Fondo Inicial en Dólares (USD) *</label>
                  <div className="relative">
                    <input
                      type="number"
                      required
                      min="0"
                      value={initUsd}
                      onChange={(e) => setInitUsd(e.target.value)}
                      className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm outline-none focus:border-brand-500 focus:bg-white transition-all"
                    />
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs font-mono">US$</span>
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-400">Notas de Apertura / Observaciones</label>
                <textarea
                  placeholder="Ej. Billetes chicos de cambio, etc."
                  value={openingNotes}
                  onChange={(e) => setOpeningNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 font-bold text-xs outline-none focus:border-brand-500 focus:bg-white transition-all h-20 resize-none"
                />
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsOpeningModalOpen(false)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black rounded-xl text-xs transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-brand-600 hover:bg-brand-700 text-white font-black rounded-xl text-xs shadow-md shadow-brand-600/20 transition-all active:scale-95"
                >
                  Iniciar Turno
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Arqueo y Cierre de Caja */}
      {isClosingModalOpen && activeRegister && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-2xl max-w-md w-full animate-in fade-in zoom-in-95 duration-150">
            <h2 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-1.5 border-b border-slate-100 pb-3 mb-4">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" /> Arqueo y Cierre de Caja
            </h2>
            
            <form onSubmit={handleCloseCaja} className="space-y-4">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs font-bold text-slate-700 space-y-2">
                <div className="flex justify-between border-b border-slate-200/60 pb-1.5">
                  <span className="text-slate-400">Total Esperado ARS:</span>
                  <span className="font-mono">{formatCurrency(activeRegister.expected_balance_ars, 'ARS')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Total Esperado USD:</span>
                  <span className="font-mono text-emerald-600">{formatCurrency(activeRegister.expected_balance_usd, 'USD')}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400">Monto Contado ARS ($) *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    placeholder="Monto real ARS"
                    value={actualArs}
                    onChange={(e) => setActualArs(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm outline-none focus:border-brand-500 focus:bg-white transition-all"
                  />
                </div>
                
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400">Monto Contado USD (US$) *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    placeholder="Monto real USD"
                    value={actualUsd}
                    onChange={(e) => setActualUsd(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm outline-none focus:border-brand-500 focus:bg-white transition-all"
                  />
                </div>
              </div>

              {/* Cálculo en vivo de Diferencias */}
              {(() => {
                const diffArs = (Number(actualArs) || 0) - activeRegister.expected_balance_ars;
                const diffUsd = (Number(actualUsd) || 0) - activeRegister.expected_balance_usd;
                
                return (
                  <div className="grid grid-cols-2 gap-3 p-3 rounded-xl border text-xs font-black">
                    <div className={`p-2 rounded-lg ${diffArs === 0 ? 'bg-slate-50 text-slate-700' : diffArs > 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'}`}>
                      <span className="text-[8px] uppercase tracking-wider block text-slate-400">Diferencia Pesos</span>
                      <span className="font-mono">{diffArs > 0 ? "+" : ""}{formatCurrency(diffArs, 'ARS')}</span>
                      <span className="text-[8px] font-bold block">{diffArs === 0 ? "Sin diferencias" : diffArs > 0 ? "Sobrante" : "Faltante"}</span>
                    </div>

                    <div className={`p-2 rounded-lg ${diffUsd === 0 ? 'bg-slate-50 text-slate-700' : diffUsd > 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'}`}>
                      <span className="text-[8px] uppercase tracking-wider block text-slate-400">Diferencia Dólares</span>
                      <span className="font-mono">{diffUsd > 0 ? "+" : ""}{formatCurrency(diffUsd, 'USD')}</span>
                      <span className="text-[8px] font-bold block">{diffUsd === 0 ? "Sin diferencias" : diffUsd > 0 ? "Sobrante" : "Faltante"}</span>
                    </div>
                  </div>
                );
              })()}

              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-400">Observaciones del Cierre / Arqueo</label>
                <textarea
                  placeholder="Detallá si hubo diferencias..."
                  value={closingNotes}
                  onChange={(e) => setClosingNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 font-bold text-xs outline-none focus:border-brand-500 focus:bg-white transition-all h-20 resize-none"
                />
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsClosingModalOpen(false)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black rounded-xl text-xs transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingClosing}
                  className="flex-1 py-3 bg-slate-900 hover:bg-slate-800 text-white font-black rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 active:scale-95"
                >
                  {submittingClosing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Cerrar Caja"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Conciliación */}
      {isReconcileModalOpen && selectedTxForReconciliation && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-2xl max-w-md w-full animate-in fade-in zoom-in-95 duration-150">
            <h2 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-1.5 border-b border-slate-100 pb-3 mb-4">
              <Link2 className="w-5 h-5 text-brand-500" /> Conciliar Movimiento de Caja
            </h2>

            {/* Información del Movimiento */}
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs font-bold text-slate-700 space-y-2 mb-4">
              <div className="flex justify-between">
                <span className="text-slate-400">Concepto:</span>
                <span className="text-slate-800">{selectedTxForReconciliation.concept || 'Sin concepto'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Monto:</span>
                <span className={`font-mono ${selectedTxForReconciliation.type === 'ingreso' ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {selectedTxForReconciliation.type === 'ingreso' ? '+' : '-'}{formatCurrency(selectedTxForReconciliation.amount, selectedTxForReconciliation.currency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Tipo:</span>
                <span className="uppercase text-[10px] font-black">{selectedTxForReconciliation.type}</span>
              </div>
            </div>

            <form onSubmit={handleReconcile} className="space-y-4">
              {selectedTxForReconciliation.type === 'ingreso' ? (
                <>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-slate-400">Cliente *</label>
                    <select
                      value={reconcileClientId}
                      onChange={(e) => {
                        setReconcileClientId(e.target.value);
                        loadClientOrders(e.target.value);
                      }}
                      required
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 font-bold text-xs outline-none focus:border-brand-500"
                    >
                      <option value="">-- Seleccionar Cliente --</option>
                      {clients.map(c => (
                        <option key={c.id} value={c.id}>{c.business_name || c.full_name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-slate-400">Pedido Asociado (Opcional)</label>
                    <select
                      value={reconcileOrderId}
                      onChange={(e) => setReconcileOrderId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 font-bold text-xs outline-none focus:border-brand-500"
                    >
                      <option value="">-- Ninguno (A cuenta / Pago Libre) --</option>
                      {clientOrders.map(o => (
                        <option key={o.id} value={o.id}>
                          #{o.id.slice(0, 8)} - {new Date(o.order_date).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })} - {formatCurrency(o.total_amount, selectedTxForReconciliation.currency)}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-slate-400">Proveedor *</label>
                    <select
                      value={reconcileSupplierId}
                      onChange={(e) => {
                        setReconcileSupplierId(e.target.value);
                        loadSupplierPurchases(e.target.value);
                      }}
                      required
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 font-bold text-xs outline-none focus:border-brand-500"
                    >
                      <option value="">-- Seleccionar Proveedor --</option>
                      {suppliers.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-slate-400">Factura de Compra *</label>
                    <select
                      value={reconcilePurchaseId}
                      onChange={(e) => setReconcilePurchaseId(e.target.value)}
                      required
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 font-bold text-xs outline-none focus:border-brand-500"
                    >
                      <option value="">-- Seleccionar Factura --</option>
                      {supplierPurchases.map(p => (
                        <option key={p.id} value={p.id}>
                          FC {p.invoice_number} - Total: {formatCurrency(p.total_amount, p.currency)} (Pend: {formatCurrency(p.total_amount - p.paid_amount, p.currency)})
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsReconcileModalOpen(false);
                    setSelectedTxForReconciliation(null);
                  }}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black rounded-xl text-xs transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingReconcile}
                  className="flex-1 py-3 bg-brand-600 hover:bg-brand-700 text-white font-black rounded-xl text-xs shadow-md shadow-brand-600/20 transition-all active:scale-95 flex items-center justify-center gap-1.5"
                >
                  {submittingReconcile ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmar Conciliación"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
