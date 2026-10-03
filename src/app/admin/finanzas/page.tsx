"use client";
import AdaptiveSelect from "@/components/ui/AdaptiveSelect";

import React, { useState, useEffect, useMemo, useRef, Suspense } from "react";
import { treasuryDateTime, treasuryToday } from "@/lib/treasuryTransactionTime";
import { supabase } from "@/lib/supabase";
import OperationEditor from '@/components/finanzas/operations/OperationEditor';
import OperationChooser from '@/components/finanzas/operations/OperationChooser';
import { createAuthenticatedRequester } from '@/lib/authenticatedRequest';
import { inferOperationType, isInactiveFinancialMovement, operationLabels, type OperationType, type OperationSummary } from '@/lib/financialOperations/types';
const financialRequest = createAuthenticatedRequester(supabase);
const localOperationRead = (url:string,options?:RequestInit) => {
  if(options && (options.method || 'GET')!=='GET')throw new Error('La revisión local solo permite consultar.');
  return financialRequest(url==='/api/admin/financial-operations'?`${url}?preview=real`:url,options);
};
const financeFetch = async (url: string, fresh = false) => { const payload = await financialRequest(url, fresh ? {} : undefined); return {ok:true,json:async()=>payload}; };
import { 
  Wallet, 
  ArrowUpRight, 
  ArrowDownRight, 
  PlusCircle, 
  Loader2, 
  Search, 
  Coins, 
  ArrowRightLeft, 
  ChevronLeft, 
  ChevronRight, 
  ChevronDown,
  Trash2, 
  X,
  Lock,
  Edit2,
  Copy,
  FileText,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  MoreHorizontal
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatPrice, formatDateDDMMYYYY } from "@/lib/utils";
import { useSearchParams, useRouter } from "next/navigation";
import FinanceToolbar, { type QuickMovement, type OptionalFinanceColumn } from "@/components/finanzas/FinanceToolbar";
import SupplierAccounts from "@/components/finanzas/SupplierAccounts";
import FinancialConceptManager from "@/components/finanzas/FinancialConceptManager";
import BankSheetImportModal from "@/components/finanzas/BankSheetImportModal";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { financialAccountLabel } from "@/lib/financialAccountLabels";
import type { FinancialConcept } from "@/lib/financialConcepts";


const normalizeConceptSearch = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("es")
  .trim();

// Historical transfer review (2026-09-28): MP2 → MP1 is the most frequent pair.
function defaultTransferAccounts(accounts: FinancialAccount[], sourceId?: string) {
  const active = accounts.filter(account => account.is_active);
  const source = sourceId ? active.find(account => account.id === sourceId)
    : active.find(account => account.name.trim().toLowerCase() === "cuenta mp2")
      || active.find(account => account.currency === "ARS") || active[0];
  const destinations = active.filter(account => account.id !== source?.id && account.currency === source?.currency);
  const destination = destinations.find(account => account.name.trim().toLowerCase() === "cuenta mp1") || destinations[0];
  return { sourceId: source?.id || "", destinationId: destination?.id || "" };
}

const DEFAULT_FINANCIAL_CATEGORIES = [
  "Gastos Operativos", "Recaudación", "Impuestos", "Insumo de Producto", "IIGG",
  "Deuda bancaria", "Publicidad", "Servicio de Flete", "Servicio de Limpieza",
  "Peajes", "Proveedores", "Sueldos", "Comisiones Bancarias", "Otro"
];

const COMMON_SUBCATEGORIES_BY_CATEGORY: Record<string, string[]> = {
  "Recaudación": [
    "Venta - Recorridos",
    "Cambio Entregas",
    "Venta Aquafort",
    "Venta - Alias",
    "Venta - Depósito",
    "Cobro Venta Directa"
  ],
  "Gastos Operativos": [
    "Servicio de Limpieza",
    "Alimentos",
    "Gastos Financieros",
    "Gasto en Transporte",
    "Mantenimiento Maquinaria",
    "Insumos de Librería",
    "Servicios de Marketing y Publicidad",
    "Art. Limpieza",
    "Gastos de Recorridos",
    "Mantenimiento Instalaciones",
    "Indumentaria Personal",
    "Gastos de Suministros",
    "Combustible",
    "Peajes"
  ],
  "Servicio de Flete": [
    "Servicio de Flete",
    "Flete",
    "Gastos de Recorridos",
    "Combustible",
    "Peajes"
  ],
  "Peajes": ["Peajes"],
  "Servicio de Limpieza": ["Servicio de Limpieza", "Art. Limpieza"],
  "Sueldos": [
    "Sueldos y Jornales",
    "Liquidación Sueldo",
    "Sueldos Eventuales",
    "Adelanto de Sueldo",
    "Acuerdos Legales",
    "Extracciones Carolina"
  ],
  "Proveedores": [
    "Proveedores",
    "Proveedores (Deuda)",
    "Pago Factura",
    "Insumo de Producto"
  ],
  "Insumo de Producto": [
    "Insumo de Producto",
    "Materia Prima",
    "Fábrica"
  ],
  "Publicidad": [
    "Publicidad",
    "Meta Ads",
    "Servicios de Marketing y Publicidad"
  ],
  "Impuestos": [
    "Impuestos",
    "IIGG",
    "IVA",
    "Ingresos Brutos",
    "Tasas Municipales"
  ],
  "Deuda bancaria": [
    "Deuda bancaria",
    "Préstamo",
    "Intereses"
  ],
  "Comisiones Bancarias": [
    "Comisiones Bancarias",
    "Gastos de Mantenimiento",
    "Impuesto al Débito/Crédito"
  ],
  "Otro": [
    "Extracciones",
    "Extracciones Diego",
    "Tarjetas - Diego",
    "Gastos Fijos - Diego",
    "Rendir/Rendido",
    "Saldo Inicial",
    "Movimiento de cuentas"
  ]
};

interface FinancialAccount {
  id: string;
  name: string;
  type: 'efectivo' | 'banco' | 'virtual' | 'tarjeta';
  currency: 'ARS' | 'USD';
  is_active: boolean;
  created_at?: string;
  balance?: number;
  total_income?: number;
  total_expense?: number;
  is_custody?: boolean;
  custodian?: string;
}

interface CostCenter {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
}
interface Employee {
  id: string;
  full_name: string;
  cuit: string | null;
  role: string | null;
  base_salary: number;
  is_active: boolean;
}

interface Supplier {
  id: string;
  name: string;
}

interface PendingPurchase {
  id: string;
  supplier_id: string;
  invoice_number: string;
  total_amount: number;
  paid_amount: number;
  status: string;
  currency?: 'ARS' | 'USD';
  supplier?: {
    name: string;
  } | null;
}

interface PendingOrder {
  id: string;
  legacy_code: string | null;
  customer_name: string;
  total_amount: number;
  payment_status: string;
  payment_approved: boolean;
  order_date: string;
  client_id?: string | null;
  payment_method_id?: string | null;
  totals?: {
    subtotal?: number;
    freight?: number;
    tax?: number;
    payment_surcharges?: number;
    total?: number;
    has_deposit?: boolean;
    deposit_amount?: number;
    deposit_receipt_url?: string;
    pending_balance?: number;
  } | null;
  clients?: {
    business_name: string;
  } | null;
  payment_methods?: {
    name: string;
  } | null;
}

interface CashTransactionWithRelations {
  treasury_settlement_id?:string|null;
  financial_operations?:OperationSummary|null;
  reversal_of_transaction_id?:string|null;
  payment_planning_realizations?:Array<{id:string;item_id:string;reversed_at:string|null}>;
  id: string;
  register_id: string | null;
  type: 'ingreso' | 'egreso';
  category: string;
  sub_category: string | null;
  efe_category?: string | null;
  financial_concept_id?: string | null;
  business_unit: string | null;
  amount: number;
  currency: 'ARS' | 'USD';
  exchange_rate: number;
  payment_method_id: string;
  financial_account_id: string | null;
  reference_id: string | null;
  notes: string | null;
  concept: string | null;
  cost_center_id: string | null;
  created_by: string;
  created_at: string;
  employee_id?: string | null;
  financial_accounts: {
    name: string;
    type: string;
  } | null;
  cost_centers: {
    name: string;
    code: string;
  } | null;
  is_imported?: boolean;
  route_sheet_id?: string | null;
  route_sheets?: {
    id: string;
    code: string | null;
    delivery_date: string;
    run_number: number;
    carriers: {
      name: string;
    } | null;
  } | null;
  running_balance?: number;
  employees?: {
    full_name: string;
  } | null;
  client_payments?: Array<{
    id: string;
    order_id: string | null;
    amount: number;
    orders: {
      id: string;
      legacy_code: string | null;
      customer_name: string;
    } | null;
  }>;
  supplier_payments?: Array<{
    id: string;
    purchase_id: string | null;
    amount: number;
    supplier_purchases: {
      id: string;
      invoice_number: string;
    } | null;
    suppliers: {
      id: string;
      name: string;
    } | null;
  }>;
}

interface ClientBalanceItem {
  id: string;
  full_name: string;
  business_name: string | null;
  total_orders_ars: number;
  total_payments_ars: number;
  balance_ars: number;
  total_orders_usd: number;
  total_payments_usd: number;
  balance_usd: number;
}

export interface AccountReconciliation {
  id: string;
  accountName: string;
  currency: string;
  initialBalance: number;
  calculatedBalance: number;
  sheetDeclaredBalance: number;
  difference: number;
  isExact: boolean;
  txCount: number;
  totalIncome: number;
  totalExpense: number;
  appNet: number;
}

function DateInput({
  label,
  value,
  onChange,
  required,
  className
}: {
  label?: string;
  value: string;
  onChange: (val: string) => void;
  required?: boolean;
  className?: string;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const inputId = React.useId();

  const displayValue = React.useMemo(() => {
    if (!value) return "DD/MM/AAAA";
    const parts = value.split("-");
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return value;
  }, [value]);

  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-semibold text-slate-500">
          {label}
        </label>
      )}
      <div 
        onClick={() => {
          if (inputRef.current) {
            try {
              if (typeof inputRef.current.showPicker === 'function') {
                inputRef.current.showPicker();
              } else {
                inputRef.current.focus();
              }
            } catch {
              inputRef.current.focus();
            }
          }
        }}
        className={`relative flex items-center justify-between ${className || "px-3 py-1.5 rounded-xl border border-slate-200 font-bold text-xs bg-slate-50 text-slate-700 cursor-pointer hover:bg-white hover:border-slate-300 transition-colors"}`}
      >
        <span className="tabular-nums select-none">{displayValue}</span>
        <Calendar className="w-3.5 h-3.5 text-slate-400 ml-2 pointer-events-none shrink-0" />
        <input
          ref={inputRef}
          id={inputId}
          type="date"
          aria-label={label || 'Fecha'}
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
        />
      </div>
    </div>
  );
}

export default function AdminFinanzasPage() {
  return <Suspense fallback={<div className="p-4 text-sm text-slate-500">Cargando finanzas…</div>}><FinanceWorkspace /></Suspense>;
}

function FinanceWorkspace() {
  const approvalAttempt = useRef<{signature:string;key:string}|null>(null);
  const [operationEditor, setOperationEditor] = useState<{kind:OperationType;payrollKind?:string;transactionId?:string;sourceAccountId?:string;duplicate?:boolean}|null>(null);
  const [choosingOperation,setChoosingOperation]=useState(false);
  const operationSaved = async () => { await Promise.all([loadTransactions(false, true), loadFinancialAccounts(), initData(), loadValidationOrders()]); };
  const transactionLoadVersion = useRef(0);
  const cancellationInFlight = useRef(false);
  const [cancellingTransactionId, setCancellingTransactionId] = useState<string | null>(null);
  const [showCancelled, setShowCancelled] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  const tab = searchParams.get("tab");
  const activeTab = tab === "accounts" || tab === "cc" || tab === "validations" ? tab : "flow";
  useEffect(() => { if (tab === "eerr") router.replace("/admin/finanzas/eerr"); }, [tab, router]);
  const [showSummary, setShowSummary] = useState(false);
  const [optionalColumns, setOptionalColumns] = useState<Record<OptionalFinanceColumn, boolean>>({ subcategory: false, efe: false, notes: false });
  const [expandedTransactions, setExpandedTransactions] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      setShowSummary(localStorage.getItem("zono_finanzas_summary") === "true");
      const saved = JSON.parse(localStorage.getItem("zono_finanzas_columns") || "{}");
      setOptionalColumns({ subcategory: saved.subcategory === true, efe: saved.efe === true, notes: saved.notes === true });
    } catch { /* Preferences are optional when storage is unavailable. */ }
  }, []);
  const toggleSummary = () => setShowSummary(value => {
    try { localStorage.setItem("zono_finanzas_summary", String(!value)); } catch {}
    return !value;
  });
  const toggleColumn = (column: OptionalFinanceColumn) => setOptionalColumns(value => {
    const next = { ...value, [column]: !value[column] };
    try { localStorage.setItem("zono_finanzas_columns", JSON.stringify(next)); } catch {}
    return next;
  });
  const columnCount = 8 + Object.values(optionalColumns).filter(Boolean).length;
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [isBankImportOpen, setIsBankImportOpen] = useState(false);
  const [transactionNotice, setTransactionNotice] = useState<string | null>(null);

  // Lists from DB
  const [financialAccounts, setFinancialAccounts] = useState<FinancialAccount[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [transactions, setTransactions] = useState<CashTransactionWithRelations[]>([]);
  const [transactionsError, setTransactionsError] = useState("");
  const [operationsAvailable,setOperationsAvailable]=useState<boolean|null>(null);
  const localInspection=process.env.NODE_ENV==='development' && operationsAvailable===false;
  const [initDataError, setInitDataError] = useState("");
  const [financialConcepts, setFinancialConcepts] = useState<FinancialConcept[]>([]);
  const [conceptCatalogError, setConceptCatalogError] = useState("");
  const [isConceptManagerOpen, setIsConceptManagerOpen] = useState(false);
  const [clientsBalances, setClientsBalances] = useState<ClientBalanceItem[]>([]);
  const [reconciliationReport] = useState<AccountReconciliation[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('zono_finanzas_reconciliation');
      if (saved) {
        try { return JSON.parse(saved); } catch {}
      }
    }
    return [];
  });
  const [isReconciliationModalOpen, setIsReconciliationModalOpen] = useState(false);

  // Modales
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [submittingTx, setSubmittingTx] = useState(false);
  const [submittingTransfer, setSubmittingTransfer] = useState(false);
  const [submittingAccount, setSubmittingAccount] = useState(false);

  // Form de nueva caja / cuenta financiera
  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] = useState<FinancialAccount['type']>('efectivo');
  const [accountCurrency, setAccountCurrency] = useState<FinancialAccount['currency']>('ARS');

  // Form de Transacción Manual
  const [txType, setTxType] = useState<'ingreso' | 'egreso'>('egreso');
  const [txAccountId, setTxAccountId] = useState("");
  const [txCategory, setTxCategory] = useState("Gastos Operativos");
  const [txSubCategory, setTxSubCategory] = useState("");
  const [txEfeCategory, setTxEfeCategory] = useState("");
  const [txAmount, setTxAmount] = useState("");
  const [txConcept, setTxConcept] = useState("");
  const [conceptSearch, setConceptSearch] = useState("");
  const [isConceptSearchOpen, setIsConceptSearchOpen] = useState(false);
  const [selectedConcept, setSelectedConcept] = useState<FinancialConcept | null>(null);
  const [txFinancialConceptId, setTxFinancialConceptId] = useState<string | null>(null);
  const [financialTypeNeedsReview, setFinancialTypeNeedsReview] = useState(false);
  const [txCostCenterId, setTxCostCenterId] = useState("");
  const [txNotes, setTxNotes] = useState("");
  const [txCreatedAt, setTxCreatedAt] = useState("");
  const [collapsedDates, setCollapsedDates] = useState<Record<string, boolean>>({});

  const toggleDateCollapse = (dateStr: string) => {
    setCollapsedDates(prev => ({
      ...prev,
      [dateStr]: !prev[dateStr]
    }));
  };

  // Form de Transferencia Interna
  const [tfSourceId, setTfSourceId] = useState("");
  const [tfDestId, setTfDestId] = useState("");
  const [tfAmount, setTfAmount] = useState("");
  const [tfConcept, setTfConcept] = useState("");
  const [tfNotes, setTfNotes] = useState("");
  const [tfDate, setTfDate] = useState(treasuryToday);

  // Filtros del Flujo de Caja
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [presetRange, setPresetRange] = useState("30dias");
  const [filterAccountId, setFilterAccountId] = useState("all");
  const [filterType, setFilterType] = useState<'all' | 'ingreso' | 'egreso'>('all');
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterCostCenterId, setFilterCostCenterId] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  // Nuevos estados para Vinculaciones y Nómina
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [pendingPurchases, setPendingPurchases] = useState<PendingPurchase[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);

  // Form states for linking inside register modal
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [selectedPurchaseId, setSelectedPurchaseId] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<PendingOrder | null>(null);
  const [orderSearchQuery, setOrderSearchQuery] = useState("");
  const [orderSearchResults, setOrderSearchResults] = useState<PendingOrder[]>([]);
  const [isSearchingOrders, setIsSearchingOrders] = useState(false);
  const [linkToOrder, setLinkToOrder] = useState(false);
  const [linkToPurchase, setLinkToPurchase] = useState(false);

  // Vincular Modal (para movimientos ya registrados y no asociados)
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [reconcilingTx, setReconcilingTx] = useState<CashTransactionWithRelations | null>(null);
  const [linkSupplierId, setLinkSupplierId] = useState("");
  const [linkPurchaseId, setLinkPurchaseId] = useState("");
  const [linkOrderId, setLinkOrderId] = useState("");
  const [linkSelectedOrder, setLinkSelectedOrder] = useState<PendingOrder | null>(null);
  const [linkOrderSearchQuery, setLinkOrderSearchQuery] = useState("");
  const [linkOrderSearchResults, setLinkOrderSearchResults] = useState<PendingOrder[]>([]);
  const [isSearchingLinkOrders, setIsSearchingLinkOrders] = useState(false);
  const [linkEmployeeId, setLinkEmployeeId] = useState("");
  const [linkAmount, setLinkAmount] = useState("");
  const [submittingLink, setSubmittingLink] = useState(false);

  // States for editing transactions and route sheets costing
  const [editingTx, setEditingTx] = useState<CashTransactionWithRelations | null>(null);
  const [duplicatingTx, setDuplicatingTx] = useState(false);
  const [routeSheets, setRouteSheets] = useState<any[]>([]);
  const [txRouteSheetId, setTxRouteSheetId] = useState("");
  const [linkRouteSheetId, setLinkRouteSheetId] = useState("");

  // Validación de Comprobantes
  const [validationOrders, setValidationOrders] = useState<PendingOrder[]>([]);
  const [selectedValidationOrder, setSelectedValidationOrder] = useState<PendingOrder | null>(null);
  const [isValidationModalOpen, setIsValidationModalOpen] = useState(false);
  const [valAccountId, setValAccountId] = useState("");
  const [valAmount, setValAmount] = useState("");
  const [valConcept, setValConcept] = useState("");
  const [submittingValidation, setSubmittingValidation] = useState(false);

  const loadHelperLists = async () => {};
  const loadFinancialAccounts = async () => {
    try {
      const res = await financeFetch("/api/admin/finanzas-data?action=accounts");
      if (!res.ok) return;
      const payload = await res.json();
      if (payload.financialAccounts) {
        const accountsWithBalances = (payload.financialAccounts as unknown as FinancialAccount[]).map((acc) => ({
          ...acc,
          balance: Number(acc.balance) || 0,
          total_income: Number(acc.total_income) || 0,
          total_expense: Number(acc.total_expense) || 0
        }));
        setFinancialAccounts(accountsWithBalances);
      }
    } catch (err) {
      console.error("Error reloading financial accounts:", err);
    }
  };
  const loadCostCenters = async () => {};

  const loadFinancialConcepts = async () => {
    const pageSize = 1000;
    const all: FinancialConcept[] = [];
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase.from('financial_concepts')
        .select('id,concept,category,sub_category,movement_type,efe_category,is_active,source_row')
        .order('concept')
        .order('id')
        .range(from, from + pageSize - 1);
      if (error) {
        setConceptCatalogError('No se pudo cargar la base de conceptos.');
        return;
      }
      all.push(...(data || []) as FinancialConcept[]);
      if (!data || data.length < pageSize) break;
    }
    setFinancialConcepts(all);
    setConceptCatalogError("");
  };

  const loadValidationOrders = async () => {
    try {
      const res = await financeFetch("/api/admin/finanzas-data?action=validations");
      if (!res.ok) throw new Error("Error loading validation orders from API");
      const payload = await res.json();
      if (payload.validationOrders) setValidationOrders(payload.validationOrders);
    } catch (err) {
      console.error("Error loading validation orders:", err);
    }
  };

  const initData = async () => {
    try {
      const res = await financeFetch("/api/admin/finanzas-data?action=init");
      if (!res.ok) throw new Error("No se pudo cargar la configuración de Finanzas.");
      const payload = await res.json();
      setInitDataError("");
      
      if (payload.employees) setEmployees(payload.employees);
      if (payload.suppliers) setSuppliers(payload.suppliers);
      if (payload.pendingPurchases) setPendingPurchases(payload.pendingPurchases);
      if (payload.pendingOrders) setPendingOrders(payload.pendingOrders);
      if (payload.routeSheets) setRouteSheets(payload.routeSheets);
      if (payload.costCenters) {
        setCostCenters(payload.costCenters);
        if (payload.costCenters.length > 0) setTxCostCenterId(payload.costCenters[0].id);
      }
      if (payload.validationOrders) setValidationOrders(payload.validationOrders);
      
      if (payload.financialAccounts) {
        const accountsWithBalances = (payload.financialAccounts as unknown as FinancialAccount[]).map((acc) => ({
          ...acc,
          balance: Number(acc.balance) || 0,
          total_income: Number(acc.total_income) || 0,
          total_expense: Number(acc.total_expense) || 0
        }));

        setFinancialAccounts(accountsWithBalances);
        
        if (accountsWithBalances.length > 0) {
          const defaultAcc = accountsWithBalances.find(a => a.name.toLowerCase().includes("efectivo pesos") || a.name.toLowerCase() === "caja efectivo pesos") || accountsWithBalances[0];
          setTxAccountId(defaultAcc.id);
          const transferDefaults = defaultTransferAccounts(accountsWithBalances);
          setTfSourceId(transferDefaults.sourceId);
          setTfDestId(transferDefaults.destinationId);
        }
      }
    } catch (err) {
      setInitDataError(err instanceof Error ? err.message : "No se pudo cargar la configuración de Finanzas.");
    }
  };

  // Cargar datos al montar
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserId(user.id);
      if (user) await loadFinancialConcepts();
      
      const now = new Date();
      const tzOffset = now.getTimezoneOffset() * 60000;
      setTxCreatedAt(new Date(now.getTime() - tzOffset).toISOString().slice(0, 10));
    }
    init();
    initData();
  }, []);

  useEffect(() => {
    if (activeTab === 'flow') {
      loadTransactions();
    } else if (activeTab === 'cc') {
      loadCheckingAccounts();
    } else if (activeTab === 'validations') {
      loadValidationOrders();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, startDate, endDate]);

  useEffect(() => {
    if (!transactionNotice) return;
    const timer = window.setTimeout(() => setTransactionNotice(null), 3500);
    return () => window.clearTimeout(timer);
  }, [transactionNotice]);

  const financialCategories = useMemo(() => Array.from(new Set([
    ...DEFAULT_FINANCIAL_CATEGORIES,
    ...financialConcepts.filter(item => item.is_active).map(item => item.category).filter(Boolean)
  ])), [financialConcepts]);

  // Lista de subcategorías disponibles según la categoría seleccionada y el histórico
  const availableSubCategories = useMemo(() => {
    const defaults = COMMON_SUBCATEGORIES_BY_CATEGORY[txCategory] || [];
    const fromConcepts = financialConcepts
      .filter(item => item.is_active && item.category === txCategory)
      .map(item => item.sub_category)
      .filter(Boolean);
    const fromTxs = transactions
      .filter(t => !txCategory || t.category === txCategory)
      .map(t => t.sub_category)
      .filter((s): s is string => Boolean(s && s.trim()));
    return Array.from(new Set([...defaults, ...fromConcepts, ...fromTxs])).sort();
  }, [txCategory, transactions, financialConcepts]);

  const matchingConcepts = useMemo(() => {
    const query = normalizeConceptSearch(conceptSearch);
    const activeConcepts = financialConcepts.filter(item => item.is_active);
    if (!query) return activeConcepts.slice(0, 12);
    return activeConcepts
      .filter(item => normalizeConceptSearch(item.concept).includes(query))
      .slice(0, 30);
  }, [conceptSearch, financialConcepts]);

  const selectFinancialConcept = (item: FinancialConcept) => {
    setSelectedConcept(item);
    setTxFinancialConceptId(item.id);
    setConceptSearch(item.concept);
    setTxConcept(item.concept);
    setTxCategory(item.category);
    setTxSubCategory(item.sub_category);
    setTxEfeCategory(item.efe_category);
    if (item.movement_type === "Ingreso") setTxType("ingreso");
    if (item.movement_type === "Egreso") setTxType("egreso");
    setFinancialTypeNeedsReview(item.movement_type === "Mov. Financiero");
    if (item.category !== "Recaudación") {
      setLinkToOrder(false);
      setSelectedOrderId("");
      setSelectedOrder(null);
      setOrderSearchQuery("");
      setOrderSearchResults([]);
    }
    setIsConceptSearchOpen(false);
  };

  // Búsqueda dinámica de ventas pendientes para registrar movimiento (min 3 caracteres)
  useEffect(() => {
    if (!linkToOrder) return;
    const q = orderSearchQuery.trim();
    if (q.length < 3) {
      setOrderSearchResults([]);
      setIsSearchingOrders(false);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearchingOrders(true);
      try {
        const res = await financeFetch(`/api/admin/finanzas-data?action=search-pending-orders&q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setOrderSearchResults((data.pendingOrders || []) as PendingOrder[]);
      } catch (err) {
        console.error("Error buscando ventas pendientes:", err);
        setOrderSearchResults([]);
      } finally {
        setIsSearchingOrders(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [orderSearchQuery, linkToOrder]);

  // Búsqueda dinámica de ventas pendientes para modal de conciliación/vinculación
  useEffect(() => {
    if (!isLinkModalOpen || !reconcilingTx || reconcilingTx.type !== 'ingreso') return;
    const q = linkOrderSearchQuery.trim();
    if (q.length < 3) {
      setLinkOrderSearchResults([]);
      setIsSearchingLinkOrders(false);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearchingLinkOrders(true);
      try {
        const res = await financeFetch(`/api/admin/finanzas-data?action=search-pending-orders&q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setLinkOrderSearchResults((data.pendingOrders || []) as PendingOrder[]);
      } catch (err) {
        console.error("Error buscando ventas pendientes:", err);
        setLinkOrderSearchResults([]);
      } finally {
        setIsSearchingLinkOrders(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [linkOrderSearchQuery, isLinkModalOpen, reconcilingTx]);

  const loadTransactions = async (showLoading = true, fresh = false) => {
    const version = ++transactionLoadVersion.current;
    if (showLoading) setLoading(true);
    try {
      const res = await financeFetch(`/api/admin/finanzas-data?action=transactions&startDate=${startDate}&endDate=${endDate}`, fresh);
      if (!res.ok) {
        throw new Error("No se pudieron cargar los movimientos. La base de datos no responde.");
      }
      const payload = await res.json();
      if (version !== transactionLoadVersion.current) return;
      if (payload.transactions) {
        setTransactions(payload.transactions);
      }
      setOperationsAvailable(payload.features?.financialOperations ?? true);
      setTransactionsError("");
    } catch (err) {
      if (version !== transactionLoadVersion.current) return;
      setTransactions([]);
      setTransactionsError(err instanceof Error ? err.message : "No se pudieron cargar los movimientos.");
    } finally {
      if (version === transactionLoadVersion.current) setLoading(false);
    }
  };

  const loadCheckingAccounts = async () => {
    setLoading(true);
    try {
      const res = await financeFetch("/api/admin/finanzas-data?action=balances");
      if (!res.ok) throw new Error("Error loading checking accounts balances");
      const payload = await res.json();
      if (payload.clientsBalances) setClientsBalances(payload.clientsBalances);
    } catch (err) {
      console.error("Error al cargar cuentas corrientes:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncFromSheets = () => setIsBankImportOpen(true);

  // =========================================================================
  // MANEJO DE ACCIONES Y ENVIOS
  // =========================================================================

  const handlePresetChange = (preset: string) => {
    setPresetRange(preset);
    if (preset === "personalizado") return;

    const d = new Date();
    let start = d.toISOString().split('T')[0];
    let end = d.toISOString().split('T')[0];

    switch (preset) {
      case "hoy":
        break;
      case "ayer":
        d.setDate(d.getDate() - 1);
        start = d.toISOString().split('T')[0];
        end = d.toISOString().split('T')[0];
        break;
      case "7dias":
        d.setDate(d.getDate() - 7);
        start = d.toISOString().split('T')[0];
        end = new Date().toISOString().split('T')[0];
        break;
      case "30dias":
        d.setDate(d.getDate() - 30);
        start = d.toISOString().split('T')[0];
        end = new Date().toISOString().split('T')[0];
        break;
      case "mes":
        start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
        end = new Date().toISOString().split('T')[0];
        break;
      case "año":
        start = `${d.getFullYear()}-01-01`;
        end = new Date().toISOString().split('T')[0];
        break;
    }

    setStartDate(start);
    setEndDate(end);
    setCurrentPage(1);
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();

    const normalizedName = accountName.trim();
    if (!normalizedName) {
      alert("Ingresá un nombre para la nueva caja.");
      return;
    }

    const alreadyExists = financialAccounts.some(
      account => account.name.trim().toLocaleLowerCase('es-AR') === normalizedName.toLocaleLowerCase('es-AR')
    );
    if (alreadyExists) {
      alert("Ya existe una caja o cuenta con ese nombre.");
      return;
    }

    setSubmittingAccount(true);
    try {
      const { data: newAccount, error } = await supabase
        .from('financial_accounts')
        .insert({
          name: normalizedName,
          type: accountType,
          currency: accountCurrency,
          is_active: true
        })
        .select('id, name, type, currency, is_active, created_at')
        .single();

      if (error) throw error;

      setIsAccountModalOpen(false);
      setAccountName("");
      setAccountType('efectivo');
      setAccountCurrency('ARS');

      await loadFinancialAccounts();
      if (newAccount?.id) {
        setTxAccountId(newAccount.id);
      }
      alert("¡Caja creada correctamente!");
    } catch (err) {
      console.error(err);
      alert("Error al crear la caja: " + (err as Error).message);
    } finally {
      setSubmittingAccount(false);
    }
  };

  const handleDuplicateTx = (transaction: CashTransactionWithRelations) => {
    if(operationsAvailable===false)return;
    setOperationEditor({kind:inferOperationType(transaction),transactionId:transaction.id,duplicate:true});
  };

  const handleApproveValidation = async (e: React.FormEvent) => {
    e.preventDefault();
    if(operationsAvailable===false){alert('Falta activar la migración 136 para registrar operaciones reales. Los formularios se pueden revisar en la vista previa local.');return;}
    if (!selectedValidationOrder || !valAccountId || !valAmount) {
      alert("Por favor completá todos los campos.");
      return;
    }

    const amount = Number(valAmount);
    if (isNaN(amount) || amount <= 0) {
      alert("Monto inválido.");
      return;
    }
    
    setSubmittingValidation(true);
    try {
      const selectedAcc = financialAccounts.find(a => a.id === valAccountId);
      const currency = selectedAcc?.currency || 'ARS';

      const { data: pms } = await supabase
        .from('payment_methods')
        .select('id, name');

      let defaultPmId = selectedValidationOrder.payment_method_id;
      if (pms && pms.length > 0) {
        const accType = selectedAcc?.type || 'efectivo';
        let matchedPm = null;
        if (accType === 'efectivo') {
          matchedPm = pms.find(p => /efectivo|^contado$/i.test(p.name || ""));
        } else {
          matchedPm = pms.find(p => p.name.toLowerCase().includes("transferencia") || p.name.toLowerCase().includes("mercado"));
        }
        if (matchedPm) defaultPmId = matchedPm.id;
      }

      const approvalPayload = {operation_type:'customer_collection',direction:'ingreso',
        effective_date:treasuryToday(),account_id:valAccountId,amount:String(amount),payment_method_id:defaultPmId,
        category:'Recaudación',sub_category:'Cobro Venta Directa',concept:valConcept.trim() || `Cobro validado ${selectedValidationOrder.legacy_code || selectedValidationOrder.id.slice(0,8)}`,
        order_id:selectedValidationOrder.id,allocations:[],detail:{},voucher_ids:[]};
      const signature=JSON.stringify(approvalPayload);
      if(!approvalAttempt.current || approvalAttempt.current.signature!==signature)approvalAttempt.current={signature,key:crypto.randomUUID()};
      await financialRequest('/api/admin/financial-operations', {method:'POST',body:JSON.stringify({action:'save',key:approvalAttempt.current.key,payload:approvalPayload})});
      approvalAttempt.current=null;

      setIsValidationModalOpen(false);
      setSelectedValidationOrder(null);

      await Promise.all([
        loadTransactions(),
        loadFinancialAccounts(),
        loadHelperLists(),
        loadValidationOrders()
      ]);

      alert("¡Comprobante de pago validado y aprobado exitosamente!");
    } catch (err) {
      console.error(err);
      alert("Error al aprobar comprobante: " + (err as Error).message);
    } finally {
      setSubmittingValidation(false);
    }
  };

  // Eliminar Transacción (Solo Admin)
  const handleDeleteTx = async (txId: string, concept: string | null) => {
    if(operationsAvailable===false || cancellationInFlight.current || transactions.some(t => t.id === txId && isInactiveFinancialMovement(t)))return;
    const reason = prompt(`Motivo de anulación de "${concept || 'Sin concepto'}". Se conservará el historial y se compensará el importe:`);
    if (!reason?.trim()) return;
    cancellationInFlight.current = true;
    setCancellingTransactionId(txId);
    try {
      const snapshot = await financialRequest(`/api/admin/financial-operations?transaction_id=${txId}`);
      if (snapshot.operation?.status === 'cancelled' || snapshot.transaction.reversal_of_transaction_id) { await loadTransactions(false, true); return; }
      await financialRequest('/api/admin/financial-operations',{method:'POST',body:JSON.stringify({action:'cancel',key:crypto.randomUUID(),reason:reason.trim(),
        target:{transaction_id:snapshot.transaction.id,operation_id:snapshot.operation?.id,expected_version:snapshot.operation?.version,expected_transaction:snapshot.transaction}})});
      await operationSaved();
    } catch(error) { alert(error instanceof Error?error.message:'No se pudo anular.'); }
    finally { cancellationInFlight.current = false; setCancellingTransactionId(null); }
  };

  // =========================================================================
  // CALCULOS Y MEMOS
  // =========================================================================

  // Categorías únicas dinámicas
  const categoriesList = useMemo(() => {
    const catsSet = new Set<string>();
    transactions.forEach(t => {
      if (t.category) catsSet.add(t.category);
    });
    return Array.from(catsSet).sort();
  }, [transactions]);

  // Transacciones Filtradas
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      if (!showCancelled && isInactiveFinancialMovement(t)) return false;
      // 0. Rango de Fechas (Filtro en cliente para Fecha Inicio)
      const txDate = treasuryToday(new Date(t.created_at));
      if (txDate < startDate) {
        return false;
      }

      // 1. Cuenta
      if (filterAccountId !== "all" && t.financial_account_id !== filterAccountId) {
        return false;
      }

      // 2. Tipo
      if (filterType !== "all" && t.type !== filterType) {
        return false;
      }

      // 3. Categoría
      if (filterCategory !== "all" && t.category !== filterCategory) {
        return false;
      }

      // 4. Centro de costo / Unidad Negocio
      if (filterCostCenterId !== "all" && t.cost_center_id !== filterCostCenterId) {
        return false;
      }

      // 5. Buscador
      if (searchTerm.trim() !== "") {
        const search = searchTerm.toLowerCase();
        const acc = t.financial_accounts?.name?.toLowerCase() || "";
        const cat = t.category.toLowerCase();
        const sub = t.sub_category?.toLowerCase() || "";
        const concept = t.concept?.toLowerCase() || "";
        const note = t.notes?.toLowerCase() || "";
        const unit = t.business_unit?.toLowerCase() || "";

        if (!acc.includes(search) &&
            !cat.includes(search) &&
            !sub.includes(search) &&
            !concept.includes(search) &&
            !note.includes(search) &&
            !unit.includes(search)) {
          return false;
        }
      }

      return true;
    });
  }, [transactions, showCancelled, filterAccountId, filterType, filterCategory, filterCostCenterId, searchTerm, startDate]);

  // KPIs Financieros Consolidados (Pesos y Dólares por separado)
  const financialKPIs = useMemo(() => {
    let incomeArs = 0;
    let expenseArs = 0;
    let incomeUsd = 0;
    let expenseUsd = 0;

    filteredTransactions.forEach(t => {
      if (isInactiveFinancialMovement(t)) return;
      const amt = Number(t.amount) || 0;
      if (t.currency === 'USD') {
        if (t.type === 'ingreso') incomeUsd += amt;
        else expenseUsd += amt;
      } else {
        if (t.type === 'ingreso') incomeArs += amt;
        else expenseArs += amt;
      }
    });

    return {
      ars: {
        income: incomeArs,
        expense: expenseArs,
        net: incomeArs - expenseArs
      },
      usd: {
        income: incomeUsd,
        expense: expenseUsd,
        net: incomeUsd - expenseUsd
      }
    };
  }, [filteredTransactions]);

  // Transacciones Paginadas
  const paginatedTransactions = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredTransactions.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredTransactions, currentPage, itemsPerPage]);

  const financialAccountGroups = useMemo(() => {
    const groups: Array<{
      type: FinancialAccount['type'];
      label: string;
      accounts: FinancialAccount[];
    }> = [
      { type: 'efectivo', label: 'Efectivo', accounts: [] },
      { type: 'banco', label: 'Bancos', accounts: [] },
      { type: 'virtual', label: 'Cuentas virtuales', accounts: [] },
      { type: 'tarjeta', label: 'Tarjetas', accounts: [] },
    ];

    financialAccounts.forEach(account => {
      groups.find(group => group.type === account.type)?.accounts.push(account);
    });

    return groups.filter(group => group.accounts.length > 0);
  }, [financialAccounts]);

  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
  useEffect(() => {
    setCurrentPage(page => Math.min(page, Math.max(1, totalPages)));
  }, [totalPages]);

  // Exportar a CSV
  const handleExportCSV = () => {
    if (filteredTransactions.length === 0) {
      alert("No hay registros para exportar.");
      return;
    }

    const escapeCSV = (val: string | number | null | undefined) => {
      if (val === null || val === undefined) return '""';
      let str = String(val);
      str = str.replace(/"/g, '""');
      if (str.includes(',') || str.includes('\n') || str.includes('\r') || str.includes('"')) {
        return `"${str}"`;
      }
      return str;
    };

    let csvContent = "\ufeff"; // BOM UTF-8
    csvContent += "Fecha,Cuenta,Tipo,Categoria,Subcategoria,EFE,Unidad Negocio,Monto,Divisa,Concepto,Notas\n";

    filteredTransactions.forEach(t => {
      const date = formatDateDDMMYYYY(t.created_at);
      const account = t.financial_accounts?.name || "Caja Efectivo Turno";
      const type = t.type === 'ingreso' ? 'Ingreso' : 'Egreso';
      const cat = t.category;
      const sub = t.sub_category || "";
      const efe = t.efe_category || "";
      const unit = t.business_unit || "";
      const amount = t.amount;
      const currency = t.currency;
      const concept = t.concept || "";
      const notes = t.notes || "";

      csvContent += `${escapeCSV(date)},${escapeCSV(account)},${escapeCSV(type)},${escapeCSV(cat)},${escapeCSV(sub)},${escapeCSV(efe)},${escapeCSV(unit)},${amount},${currency},${escapeCSV(concept)},${escapeCSV(notes)}\n`;
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `flujo_caja_finanzas_${startDate}_a_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const openQuickMovement = (kind: QuickMovement) => {
    if(operationsAvailable===false && !localInspection)return;
    if(kind==='general'){setChoosingOperation(true);return;}
    const kinds:Record<QuickMovement,OperationType>={general:'general',eventuales:'payroll_payment',proveedor:'supplier_payment',gasto:'operating_expense',adelanto:'payroll_payment',cobro:'customer_collection',sueldo:'payroll_payment',impuesto:'tax_payment'};
    setOperationEditor({kind:kinds[kind],payrollKind:kind==='eventuales'?'temporary':kind==='adelanto'?'advance':undefined});
  };
  const openQuickTransfer = (sourceId?: string) => {if(operationsAvailable!==false || localInspection)setOperationEditor({kind:'internal_transfer',sourceAccountId:sourceId});};

  return (
    <div className="space-y-3 w-full pb-6">
      {transactionNotice && (
        <div className="fixed right-5 top-20 z-[70] flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-black text-emerald-800 shadow-lg pointer-events-none animate-in fade-in slide-in-from-top-2 duration-200">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          {transactionNotice}
        </div>
      )}

      <div className="flex items-center gap-2 py-1">
        <Coins className="h-4 w-4 text-brand-600" />
        <h1 className="text-lg font-bold tracking-tight text-slate-900">{activeTab === "flow" ? "Movimientos" : activeTab === "accounts" ? "Cuentas y saldos" : activeTab === "cc" ? "Cuentas corrientes" : "Comprobantes a validar"}</h1>
      </div>

      {/* =========================================================================
          TAB 1: FLUJO DE CAJA (MOVIMIENTOS GENERALES)
          ========================================================================= */}
      {activeTab === 'flow' && (
        <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
          {operationsAvailable===false && <div role="status" className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">Los movimientos existentes están disponibles para consulta. Los nuevos formularios requieren activar la migración 136 para guardar cambios.{process.env.NODE_ENV==='development' && <a href="/vista-previa-movimientos" className="ml-2 font-semibold underline">Ver formularios con datos reales</a>}</div>}
          {(initDataError || transactionsError) && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-900">
              <span>{transactionsError ? `${transactionsError} Los importes no están disponibles hasta que se restablezca la conexión.` : `${initDataError} Algunas opciones pueden faltar hasta que se restablezca la conexión.`}</span>
              <button type="button" onClick={() => { void initData(); void loadTransactions(); }} className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-black hover:bg-amber-100">Reintentar</button>
            </div>
          )}
          
          <FinanceToolbar
            search={searchTerm} onSearch={value => { setSearchTerm(value); setCurrentPage(1); }}
            period={presetRange} onPeriod={value => { if (value === "personalizado") setPresetRange(value); else handlePresetChange(value); setCurrentPage(1); }}
            startDate={startDate} endDate={endDate}
            onStartDate={value => { setStartDate(value); setCurrentPage(1); }} onEndDate={value => { setEndDate(value); setCurrentPage(1); }}
            account={filterAccountId} onAccount={value => { setFilterAccountId(value); setCurrentPage(1); }} accounts={financialAccounts}
            type={filterType} onType={value => { setFilterType(value); setCurrentPage(1); }}
            category={filterCategory} onCategory={value => { setFilterCategory(value); setCurrentPage(1); }} categories={categoriesList}
            unit={filterCostCenterId} onUnit={value => { setFilterCostCenterId(value); setCurrentPage(1); }} units={costCenters}
            showCancelled={showCancelled} onShowCancelled={value => { setShowCancelled(value); setCurrentPage(1); }}
            onClear={() => { setShowCancelled(false); setSearchTerm(""); setFilterAccountId("all"); setFilterType("all"); setFilterCategory("all"); setFilterCostCenterId("all"); handlePresetChange("30dias"); setCurrentPage(1); }}
            onRefresh={() => { void loadTransactions(); }} onNew={openQuickMovement} onTransfer={() => openQuickTransfer()}
            onConcepts={() => setIsConceptManagerOpen(true)} onExport={handleExportCSV} onSync={handleSyncFromSheets}
            syncing={false} disabled={(operationsAvailable===false && !localInspection) || Boolean(initDataError && financialAccounts.length === 0)}
            showSummary={showSummary} onSummary={toggleSummary} columns={optionalColumns} onColumn={toggleColumn}
          />

          {/* Tarjetas KPI Financieros */}
          {showSummary && <div className="rounded-xl border border-slate-200/70 bg-white p-3 shadow-sm">
            <p className="mb-2 text-xs font-semibold text-slate-500">Resumen de movimientos filtrados · {formatDateDDMMYYYY(startDate)} al {formatDateDDMMYYYY(endDate)}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Caja Pesos (ARS) */}
            <div className="space-y-2">
              <div className="flex justify-between items-center pb-1.5 border-b border-slate-100">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Totalizadores Pesos (ARS)</span>
                <span className="bg-brand-50 text-brand-700 px-2 py-0.5 rounded text-[8px] font-black uppercase">ARS $</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Ingresos</span>
                  <div className="text-sm font-black text-emerald-600 tracking-tight leading-none mt-1">
                    {transactionsError ? '—' : formatPrice(financialKPIs.ars.income)}
                  </div>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Egresos</span>
                  <div className="text-sm font-black text-rose-600 tracking-tight leading-none mt-1">
                    {transactionsError ? '—' : `-${formatPrice(financialKPIs.ars.expense)}`}
                  </div>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Flujo Neto</span>
                  <div className={`text-base font-black tracking-tight leading-none mt-0.5 ${financialKPIs.ars.net >= 0 ? 'text-slate-800' : 'text-rose-600'}`}>
                    {transactionsError ? '—' : `${financialKPIs.ars.net < 0 ? '-' : ''}${formatPrice(Math.abs(financialKPIs.ars.net))}`}
                  </div>
                </div>
              </div>
            </div>

            {/* Caja Dólares (USD) */}
            <div className="space-y-2">
              <div className="flex justify-between items-center pb-1.5 border-b border-slate-100">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Totalizadores Dólares (USD)</span>
                <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded text-[8px] font-black uppercase">USD US$</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Ingresos</span>
                  <div className="text-sm font-black text-emerald-600 tracking-tight leading-none mt-1">
                    {transactionsError ? '—' : `US$ ${financialKPIs.usd.income.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`}
                  </div>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Egresos</span>
                  <div className="text-sm font-black text-rose-600 tracking-tight leading-none mt-1">
                    {transactionsError ? '—' : `-US$ ${financialKPIs.usd.expense.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`}
                  </div>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Flujo Neto</span>
                  <div className={`text-base font-black tracking-tight leading-none mt-0.5 ${financialKPIs.usd.net >= 0 ? 'text-slate-800' : 'text-rose-600'}`}>
                    {transactionsError ? '—' : `${financialKPIs.usd.net < 0 ? '-' : ''}US$ ${Math.abs(financialKPIs.usd.net).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`}
                  </div>
                </div>
              </div>
            </div>
            </div>
          </div>}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3 bg-white border border-slate-200/60 shadow-sm rounded-2xl">
              <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
              <span className="text-xs font-black uppercase tracking-wider">Cargando Flujo de Caja...</span>
            </div>
          ) : transactionsError ? null : filteredTransactions.length === 0 ? (
            <div className="bg-white p-12 text-center text-slate-400 font-bold text-xs rounded-2xl border border-slate-200/60 shadow-sm">
              No se encontraron movimientos financieros para los filtros y fechas seleccionados.
            </div>
          ) : (
            <div className="bg-white p-2 rounded-xl border border-slate-200/60 shadow-sm space-y-2">
              <div className="max-h-[calc(100dvh-260px)] min-h-48 overflow-auto pb-20 lg:pb-16">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 z-10 bg-white shadow-sm">
                    <tr className="border-b border-slate-200 text-slate-400 font-black uppercase tracking-wider text-[9px]">
                      <th className="py-2 px-2">Fecha</th>
                      <th className="py-2 px-2 text-center">Tipo</th>
                      <th className="py-2 px-2">Concepto</th>
                      <th className="py-2 px-2">Categoría</th>
                      <th className="py-2 px-2">Cuenta</th>
                      <th className="py-2 px-2 text-right">Monto</th>
                      <th className="py-2 px-2 text-right">Saldo</th>
                      {optionalColumns.subcategory && (<th className="py-2 px-2">Subcategoría</th>)}
                      {optionalColumns.efe && (<th className="py-2 px-2">EFE</th>)}
                      {optionalColumns.notes && (<th className="py-2 px-2">Observaciones</th>)}
                      <th className="py-2 px-2 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(() => {
                      let lastDate = "";
                      return paginatedTransactions.map(t => {
                        const isIngreso = t.type === 'ingreso';
                        const inactive = isInactiveFinancialMovement(t);
                        const currentDate = formatDateDDMMYYYY(t.created_at);
                        const showDateDivider = currentDate !== lastDate;
                        lastDate = currentDate;

                        return (
                          <React.Fragment key={t.id}>
                            {showDateDivider && (
                              <tr 
                                onClick={() => toggleDateCollapse(currentDate)}
                                className="bg-slate-100/90 hover:bg-slate-200/60 border-y border-slate-200/60 text-slate-800 font-extrabold text-[11px] uppercase tracking-wider cursor-pointer select-none transition-colors"
                              >
                                <td colSpan={columnCount} className="py-1.5 px-3">
                                  <div className="flex items-center gap-2">
                                    {collapsedDates[currentDate] ? (
                                      <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                                    ) : (
                                      <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                                    )}
                                    <span>{currentDate}</span>
                                    <span className="text-[9px] bg-slate-200 text-slate-650 px-1.5 py-0.2 rounded-full font-bold">
                                      {filteredTransactions.filter(tx => formatDateDDMMYYYY(tx.created_at) === currentDate).length}
                                    </span>
                                  </div>
                                </td>
                              </tr>
                            )}
                            {!collapsedDates[currentDate] && (
                              <React.Fragment>
                              <tr className="hover:bg-slate-50/70 transition-colors font-semibold text-slate-700">
                                <td className="py-1.5 px-2 text-slate-400">{currentDate}</td>
                                <td className="py-1.5 px-2 text-center">
                                  {isIngreso ? (
                                    <span className="inline-flex items-center gap-0.5 text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded text-[9px] font-black uppercase">
                                      <ArrowUpRight className="w-2.5 h-2.5 text-emerald-600" /> Ingreso
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-0.5 text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded text-[9px] font-black uppercase">
                                      <ArrowDownRight className="w-2.5 h-2.5 text-rose-600" /> Egreso
                                    </span>
                                  )}
                                </td>
                                <td className="py-1.5 px-2 text-slate-900 font-semibold max-w-[200px]">
                                  <div className="flex min-w-0 items-center gap-1">
                                    <div className="flex min-w-0 items-center gap-1.5">
                                      <button type="button" aria-label={`Ver detalle de ${t.concept || "movimiento"}`} aria-expanded={Boolean(expandedTransactions[t.id])} onClick={() => setExpandedTransactions(value => ({ ...value, [t.id]: !value[t.id] }))} className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-brand-600"><ChevronRight className={`h-3 w-3 transition-transform ${expandedTransactions[t.id] ? "rotate-90" : ""}`} /></button>
                                      <span className="truncate font-bold" title={t.concept || ""}>{t.concept || "-"}</span>
                                      {inactive && <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-800">{t.reversal_of_transaction_id ? 'Compensación' : 'Anulado'}</span>}
                                      {t.is_imported && (
                                        <span className="inline-flex items-center gap-0.5 text-blue-700 bg-blue-50 px-1 py-0.2 rounded text-[7px] font-black uppercase tracking-wider scale-90 select-none shrink-0" title="Importado desde planilla de cálculo">
                                          Planilla
                                        </span>
                                      )}
                                    </div>

                                  </div>
                                </td>
                                <td className="py-1.5 px-2">
                                  <span title={t.category} className="inline-block max-w-48 truncate align-middle bg-slate-100 border px-2 py-0.5 rounded text-[10px] text-slate-600 font-bold uppercase tracking-wide">
                                    {t.category}
                                  </span>
                                </td>
                                <td className="py-1.5 px-2 whitespace-nowrap text-slate-900 font-bold">
                                  {financialAccountLabel(t.financial_accounts?.name || "Efectivo Diario")}
                                </td>
                                <td className={`py-1.5 px-2 whitespace-nowrap text-right font-black tabular-nums ${isIngreso ? 'text-emerald-600' : 'text-rose-600'}`}>
                                  {t.currency === 'USD' ? `US$ ${t.amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : formatPrice(t.amount)}
                                </td>
                                <td className="py-1.5 px-2 whitespace-nowrap text-right font-bold text-slate-700 tabular-nums">
                                  {t.running_balance !== undefined ? (t.currency === 'USD' ? `US$ ${t.running_balance.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : formatPrice(t.running_balance)) : '-'}
                                </td>
                                {optionalColumns.subcategory && (<td className="py-1.5 px-2 text-slate-500">{t.sub_category || "-"}</td>)}
                                {optionalColumns.efe && (<td className="py-1.5 px-2 text-slate-500">{t.efe_category || "-"}</td>)}
                                {optionalColumns.notes && (<td className="py-1.5 px-2 text-slate-400 max-w-[150px] truncate" title={t.notes || ""}>
                                  {t.notes || "-"}
                                </td>)}
                                <td className="py-1.5 px-2 text-right">
                                  <div className="flex justify-end gap-1">
                                    <button
                                      type="button" disabled={operationsAvailable===false || inactive || Boolean(cancellingTransactionId)}
                                      onClick={() => setOperationEditor({kind:inferOperationType(t),transactionId:t.id})}
                                      className="p-1 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors"
                                      title="Editar movimiento"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <details className="relative" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) e.currentTarget.open = false; }}>
                                      <summary aria-label="Más acciones del movimiento" className="cursor-pointer list-none rounded p-1 text-slate-400 hover:bg-slate-100"><MoreHorizontal className="h-3.5 w-3.5" /></summary>
                                      <div className="absolute right-0 top-full z-20 min-w-32 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                                    <button
                                      type="button" disabled={operationsAvailable===false || inactive || Boolean(cancellingTransactionId)}
                                      onClick={() => handleDuplicateTx(t)}
                                      className="flex w-full items-center gap-2 rounded px-2 py-2 text-xs text-slate-700 hover:bg-slate-50"
                                      title="Duplicar movimiento"
                                    >
                                      <Copy className="w-3.5 h-3.5" /> Duplicar
                                    </button>
                                    <button
                                      type="button" disabled={operationsAvailable===false || inactive || Boolean(cancellingTransactionId)}
                                      onClick={() => handleDeleteTx(t.id, t.concept)}
                                      className="flex w-full items-center gap-2 rounded px-2 py-2 text-xs text-red-600 hover:bg-red-50"
                                      title="Anular movimiento"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" /> {cancellingTransactionId === t.id ? 'Anulando…' : 'Anular'}
                                    </button>
                                      </div>
                                    </details>
                                  </div>
                                </td>
                              </tr>
                              {expandedTransactions[t.id] && <tr className="bg-slate-50/80"><td colSpan={columnCount} className="px-4 py-3">
                                <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-600">
                                  <span><b>Subcategoría:</b> {t.sub_category || "—"}</span>
                                  <span><b>EFE:</b> {t.efe_category || "—"}</span>
                                  <span className="whitespace-pre-wrap break-words"><b>Observaciones:</b> {t.notes || "—"}</span>
                                  <span><b>Concepto:</b> {t.concept || "—"}</span>
                                  {t.financial_operations && <span><b>Operación:</b> {operationLabels[t.financial_operations.operation_type]} · {t.financial_operations.status==='cancelled'?'Anulada':'Registrada'} · versión {t.financial_operations.version}{t.financial_operations.detail.period?` · período ${t.financial_operations.detail.period}`:''}</span>}
                                  {t.reversal_of_transaction_id && <span className="font-semibold text-amber-700">Compensación de anulación</span>}
                                  {t.treasury_settlement_id && <a href="/admin/rendiciones" className="font-semibold text-brand-700 underline">Origen: Rendiciones</a>}
                                  {t.payment_planning_realizations?.some(r=>!r.reversed_at) && <a href="/admin/finanzas/planificacion" className="font-semibold text-brand-700 underline">Origen: Planificación</a>}
                                </div>
                                                                    <div className="flex flex-wrap gap-1 items-center">
                                      {t.category === 'Sueldos' && (
                                        t.employees?.full_name ? (
                                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black bg-emerald-50 border border-emerald-100 text-emerald-700 uppercase">
                                            👤 {t.employees.full_name}
                                          </span>
                                        ) : (
                                          <div className="flex items-center gap-1">
                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black bg-rose-50 border border-rose-100 text-rose-700 uppercase">
                                              ⚠️ Empleado no asociado
                                            </span>
                                            <button
                                              type="button" disabled={inactive || Boolean(cancellingTransactionId)}
                                              onClick={() => {
                                                if(operationsAvailable===false || inactive)return;
                                                setReconcilingTx(t);
                                                setLinkEmployeeId("");
                                                setLinkAmount(t.amount.toString());
                                                setIsLinkModalOpen(true);
                                              }}
                                              className="text-[8px] font-black uppercase text-brand-650 hover:underline cursor-pointer"
                                            >
                                              [Vincular]
                                            </button>
                                          </div>
                                        )
                                      )}

                                      {t.category === 'Proveedores' && (
                                        t.supplier_payments && t.supplier_payments.length > 0 ? (
                                          t.supplier_payments.map(p => (
                                            <span key={p.id} className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black bg-blue-50 border border-blue-100 text-blue-700 uppercase">
                                              🚚 Fac: {p.supplier_purchases?.invoice_number || 'S/D'} ({p.suppliers?.name || 'S/D'})
                                            </span>
                                          ))
                                        ) : (
                                          <div className="flex items-center gap-1">
                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black bg-rose-50 border border-rose-100 text-rose-700 uppercase">
                                              ⚠️ Compra no asociada
                                            </span>
                                            <button
                                              type="button" disabled={inactive || Boolean(cancellingTransactionId)}
                                              onClick={() => {
                                                if(operationsAvailable===false || inactive)return;
                                                setReconcilingTx(t);
                                                setLinkSupplierId("");
                                                setLinkPurchaseId("");
                                                setLinkAmount(t.amount.toString());
                                                setIsLinkModalOpen(true);
                                              }}
                                              className="text-[8px] font-black uppercase text-brand-650 hover:underline cursor-pointer"
                                            >
                                              [Vincular]
                                            </button>
                                          </div>
                                        )
                                      )}

                                      {t.category === 'Recaudación' && t.type === 'ingreso' && (
                                        t.client_payments && t.client_payments.length > 0 ? (
                                          t.client_payments.map(p => (
                                            <span key={p.id} className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black bg-purple-50 border border-purple-100 text-purple-700 uppercase">
                                              🛍️ {p.orders?.legacy_code || 'S/D'} ({p.orders?.customer_name || 'S/D'})
                                            </span>
                                          ))
                                        ) : (
                                          <div className="flex items-center gap-1">
                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black bg-rose-50 border border-rose-100 text-rose-700 uppercase">
                                              ⚠️ Venta no asociada
                                            </span>
                                            <button
                                              type="button" disabled={inactive || Boolean(cancellingTransactionId)}
                                              onClick={() => {
                                                if(operationsAvailable===false || inactive)return;
                                                setReconcilingTx(t);
                                                setLinkOrderId("");
                                                setLinkSelectedOrder(null);
                                                setLinkOrderSearchQuery("");
                                                setLinkOrderSearchResults([]);
                                                setLinkAmount(t.amount.toString());
                                                setIsLinkModalOpen(true);
                                              }}
                                              className="text-[8px] font-black uppercase text-brand-650 hover:underline cursor-pointer"
                                            >
                                              [Vincular]
                                            </button>
                                          </div>
                                        )
                                      )}

                                      {(t.category === 'Peajes' || t.category === 'Servicio de Flete') && (
                                        t.route_sheets ? (
                                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black bg-orange-50 border border-orange-100 text-orange-700 uppercase">
                                            🚚 HR: {t.route_sheets.code || `#${t.route_sheets.run_number}`} ({t.route_sheets.carriers?.name || 'S/D'})
                                          </span>
                                        ) : (
                                          <div className="flex items-center gap-1">
                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black bg-rose-50 border border-rose-100 text-rose-700 uppercase">
                                              ⚠️ HR no asociada
                                            </span>
                                            <button
                                              type="button" disabled={inactive || Boolean(cancellingTransactionId)}
                                              onClick={() => {
                                                if(operationsAvailable===false || inactive)return;
                                                setReconcilingTx(t);
                                                setLinkRouteSheetId("");
                                                setIsLinkModalOpen(true);
                                              }}
                                              className="text-[8px] font-black uppercase text-brand-650 hover:underline cursor-pointer"
                                            >
                                              [Vincular]
                                            </button>
                                          </div>
                                        )
                                      )}
                                    </div>
                              </td></tr>}
                              </React.Fragment>
                            )}
                          </React.Fragment>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>

              {/* Paginador */}
              {filteredTransactions.length > 0 && (
                <div className="flex flex-wrap gap-2 justify-between items-center pt-2 border-t border-slate-100 text-xs font-semibold text-slate-500">
                  <div>
                    <label className="mr-3 inline-flex items-center gap-1">Filas <AdaptiveSelect aria-label="Movimientos por página" value={itemsPerPage} onChange={e => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }} className="rounded border border-slate-200 bg-white px-1 py-1"><option value={20}>20</option><option value={50}>50</option><option value={100}>100</option></AdaptiveSelect></label>
                    Mostrando {Math.min(filteredTransactions.length, (currentPage - 1) * itemsPerPage + 1)} a {Math.min(filteredTransactions.length, currentPage * itemsPerPage)} de {filteredTransactions.length} registros
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className="p-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="flex items-center px-3 border border-slate-200 rounded-lg bg-slate-50">
                      Página {currentPage} de {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                      className="p-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {/* =========================================================================
          TAB 2: CUENTAS Y SALDOS (TARJETAS DE CONTROL)
          ========================================================================= */}
      {activeTab === 'accounts' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-200">
          
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider">Arqueo y Cajas</h2>
              <p className="text-slate-400 text-xs font-semibold">Control de saldos en tiempo real y conciliación con planillas externas.</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                onClick={() => setIsAccountModalOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-sm transition-all"
              >
                <PlusCircle className="w-4 h-4" /> Nueva Caja
              </Button>
              <Button
                onClick={() => setIsReconciliationModalOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2 border border-brand-200 bg-brand-50 hover:bg-brand-100 text-brand-700 font-black text-xs uppercase tracking-wider rounded-xl shadow-sm transition-all"
              >
                <ShieldCheck className="w-4 h-4 text-brand-600" /> Auditoría y Conciliación
              </Button>
              <Button
                onClick={() => openQuickTransfer()}
                className="flex items-center gap-1.5 px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 font-black text-xs uppercase tracking-wider rounded-xl shadow-sm transition-all"
              >
                <ArrowRightLeft className="w-4 h-4 text-slate-400" /> Transferencia entre Cuentas
              </Button>
            </div>
          </div>

          {/* Panel Superior: Arqueo Total del Sistema */}
          {(() => {
            const totals = { ars: 0, usd: 0, custodyArs:0, custodyUsd:0 };
            financialAccounts.forEach(acc => {
              const bal = acc.balance || 0;
              if(acc.is_custody){if(acc.currency==='USD')totals.custodyUsd+=bal;else totals.custodyArs+=bal;return;}
              if (acc.currency === 'USD') {
                totals.usd += bal;
              } else {
                totals.ars += bal;
              }
            });

            return (
              <div className="bg-white border border-slate-200/60 shadow-sm rounded-2xl p-6 flex items-center gap-4">
                <div className="p-3 bg-emerald-50 rounded-2xl text-emerald-600">
                  <Wallet className="w-8 h-8" />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none block">Disponible en cuentas</span>
                  <div className="flex flex-col md:flex-row md:items-center gap-x-6 gap-y-1 mt-1">
                    <div className="text-2xl font-black text-emerald-600 font-mono tracking-tight">
                      {formatPrice(totals.ars)}
                    </div>
                    <div className="text-2xl font-black text-emerald-500 font-mono tracking-tight">
                      US$ {totals.usd.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  {(totals.custodyArs!==0||totals.custodyUsd!==0)&&<p className="text-xs text-slate-500">Bajo custodia: {formatPrice(totals.custodyArs)} · US$ {totals.custodyUsd.toLocaleString('es-AR',{minimumFractionDigits:2})}</p>}
                </div>
              </div>
            );
          })()}

          {/* Tabla de Cajas y Arqueos */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 font-black uppercase tracking-wider text-[9px]">
                    <th className="py-3 px-3">Nombre</th>
                    <th className="py-3 px-3">Tipo</th>
                    <th className="py-3 px-3 text-right">Saldo ERP (Arqueo)</th>
                    <th className="py-3 px-3 text-right">Saldo en Planilla</th>
                    <th className="py-3 px-3 text-center">Auditoría / Conciliación</th>
                    <th className="py-3 px-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                  {financialAccountGroups.map(group => (
                    <React.Fragment key={group.type}>
                      <tr className="bg-slate-50/90 border-y border-slate-200">
                        <td colSpan={6} className="px-3 py-2">
                          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-500">
                            <span>{group.label}</span>
                            <span className="rounded-full bg-white border border-slate-200 px-2 py-0.5 text-[9px] text-slate-400">
                              {group.accounts.length}
                            </span>
                          </div>
                        </td>
                      </tr>
                      {group.accounts.map(acc => {
                    const idx = financialAccounts.findIndex(account => account.id === acc.id);
                    const balance = acc.balance || 0;
                    const rec = reconciliationReport.find(r => r.id === acc.id || r.accountName === acc.name);
                    const typeLabel = 
                      acc.type === 'efectivo' ? 'Efectivo' :
                      acc.type === 'banco' ? 'Banco' :
                      acc.type === 'virtual' ? 'Virtual' : 'Tarjeta';
                    
                    const colors = [
                      'bg-emerald-500', 
                      'bg-orange-500', 
                      'bg-blue-500', 
                      'bg-indigo-500', 
                      'bg-rose-500', 
                      'bg-purple-500', 
                      'bg-teal-500', 
                      'bg-amber-500'
                    ];
                    const dotColor = colors[idx % colors.length];

                    return (
                      <tr key={acc.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3.5 px-3">
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${dotColor}`} />
                            <span className="text-slate-900 font-bold">{financialAccountLabel(acc.name)}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-3">
                          <div className="flex items-center gap-1.5 text-[9px] font-black uppercase">
                            <span className={`px-2 py-0.5 rounded border ${
                              acc.type === 'efectivo' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                              acc.type === 'banco' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                              acc.type === 'virtual' ? 'bg-indigo-50 text-indigo-700 border-indigo-100' :
                              'bg-slate-50 text-slate-700 border-slate-200'
                            }`}>
                              {typeLabel}
                            </span>
                            <span className={`px-2 py-0.5 rounded border ${
                              acc.currency === 'USD' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-100 text-slate-700 border-slate-200'
                            }`}>
                              {acc.currency}
                            </span>
                          </div>
                        </td>
                        <td className={`py-3.5 px-3 text-right font-black font-mono text-sm ${balance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {acc.currency === 'USD' ? `US$ ${balance.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : formatPrice(balance)}
                        </td>
                        <td className="py-3.5 px-3 text-right font-black font-mono text-slate-600 text-xs">
                          {rec ? (
                            acc.currency === 'USD' 
                              ? `US$ ${rec.sheetDeclaredBalance.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` 
                              : formatPrice(rec.sheetDeclaredBalance)
                          ) : (
                            <span className="text-slate-300 font-normal">-</span>
                          )}
                        </td>
                        <td className="py-3.5 px-3 text-center">
                          {rec ? (
                            rec.isExact ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Conciliado ($0)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-200" title={`Saldo inicial o diferencia de ${formatPrice(rec.difference)}`}>
                                <AlertTriangle className="w-3 h-3 text-amber-500" /> Delta {formatPrice(rec.difference)}
                              </span>
                            )
                          ) : (
                            <span className="text-slate-300 text-[10px] font-normal">Sin sincronizar</span>
                          )}
                        </td>
                        <td className="py-3.5 px-3 text-right">
                          <div className="flex justify-end items-center gap-2">
                            <button
                              onClick={() => {
                                setFilterAccountId(acc.id);
                                setCurrentPage(1);
                                router.push('/admin/finanzas');
                              }}
                              className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 border border-slate-200 rounded-lg transition-colors"
                              title="Ver Movimientos (Libro Diario)"
                            >
                              <FileText className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                openQuickTransfer(acc.id);
                              }}
                              className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 border border-slate-200 rounded-lg transition-colors"
                              title="Transferir desde esta cuenta"
                            >
                              <ArrowRightLeft className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                      })}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}


      {/* =========================================================================
          TAB 3: CUENTAS CORRIENTES (SALDOS DE SOCIOS COMERCIALES)
          ========================================================================= */}
      {activeTab === 'cc' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Cuentas Corrientes Clientes */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm space-y-4">
              <div className="pb-2.5 border-b border-slate-100">
                <h3 className="font-black text-slate-800 text-xs uppercase tracking-wider">Saldos de Clientes</h3>
                <p className="text-[10px] text-slate-400 font-bold">Resumen de deuda comercial y saldos a favor (Pedidos vs Cobranzas).</p>
              </div>

              {loading ? (
                <div className="py-12 text-center text-slate-400 text-xs font-bold">Cargando balances de clientes...</div>
              ) : clientsBalances.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs font-bold">No se encontraron clientes con historial comercial.</div>
              ) : (
                <div className="overflow-y-auto max-h-[400px] divide-y divide-slate-100 pr-2">
                  {clientsBalances.map(c => {
                    const hasArs = c.balance_ars !== 0;
                    const hasUsd = c.balance_usd !== 0;
                    return (
                      <div key={c.id} className="py-3 flex justify-between items-center text-xs">
                        <div className="space-y-0.5">
                          <div className="font-bold text-slate-900">{c.full_name}</div>
                          {c.business_name && <div className="text-[10px] text-slate-400 font-bold">{c.business_name}</div>}
                        </div>
                        <div className="text-right space-y-1 font-mono">
                          {hasArs && (
                            <div className={c.balance_ars > 0 ? 'text-rose-600 font-black' : 'text-emerald-600 font-black'}>
                              {c.balance_ars > 0 ? 'Debe: ' : 'Saldo favor: '}{formatPrice(Math.abs(c.balance_ars))}
                            </div>
                          )}
                          {hasUsd && (
                            <div className={c.balance_usd > 0 ? 'text-rose-600 font-black' : 'text-emerald-600 font-black'}>
                              {c.balance_usd > 0 ? 'Debe: ' : 'Saldo favor: '}US$ {Math.abs(c.balance_usd).toLocaleString('es-AR')}
                            </div>
                          )}
                          {!hasArs && !hasUsd && <div className="text-slate-400 font-black">Al día ✓</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <SupplierAccounts />

          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: CREAR CAJA / CUENTA FINANCIERA
          ========================================================================= */}
      {isAccountModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-[2rem] border border-slate-100 p-6 shadow-2xl w-full max-w-md space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center pb-2.5 border-b border-slate-100">
              <div>
                <h3 className="font-black text-slate-900 text-sm uppercase tracking-wider flex items-center gap-1.5">
                  <Wallet className="w-4 h-4 text-brand-600" /> Crear nueva caja
                </h3>
                <p className="text-[10px] text-slate-400 font-bold mt-1">La caja se crea con saldo inicial cero.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsAccountModalOpen(false)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400"
                title="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateAccount} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-400">Nombre *</label>
                <input
                  type="text"
                  required
                  autoFocus
                  maxLength={100}
                  placeholder="Ej. Caja Depósito"
                  value={accountName}
                  onChange={e => setAccountName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-bold text-xs outline-none focus:border-brand-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400">Tipo *</label>
                  <AdaptiveSelect
                    value={accountType}
                    onChange={e => setAccountType(e.target.value as FinancialAccount['type'])}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-bold text-xs outline-none focus:border-brand-500"
                  >
                    <option value="efectivo">Efectivo</option>
                    <option value="banco">Banco</option>
                    <option value="virtual">Virtual</option>
                    <option value="tarjeta">Tarjeta</option>
                  </AdaptiveSelect>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400">Moneda *</label>
                  <AdaptiveSelect
                    value={accountCurrency}
                    onChange={e => setAccountCurrency(e.target.value as FinancialAccount['currency'])}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-bold text-xs outline-none focus:border-brand-500"
                  >
                    <option value="ARS">Pesos (ARS)</option>
                    <option value="USD">Dólares (USD)</option>
                  </AdaptiveSelect>
                </div>
              </div>

              <Button
                type="submit"
                disabled={submittingAccount}
                className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md flex items-center justify-center gap-1.5"
              >
                {submittingAccount ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlusCircle className="w-4 h-4" />}
                {submittingAccount ? "Creando..." : "Crear Caja"}
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 1: REGISTRAR MOVIMIENTO MANUAL
          ========================================================================= */}
      {choosingOperation && <OperationChooser onClose={()=>setChoosingOperation(false)} onChoose={kind=>{setChoosingOperation(false);setOperationEditor({kind});}}/>}
      {operationEditor && <OperationEditor {...operationEditor} readOnly={localInspection} requestOverride={localInspection?localOperationRead:undefined} onClose={()=>setOperationEditor(null)} onSaved={operationSaved}/>}
      {isLinkModalOpen && reconcilingTx && <OperationEditor kind={inferOperationType(reconcilingTx)} transactionId={reconcilingTx.id} mode="link" onClose={()=>{setIsLinkModalOpen(false);setReconcilingTx(null);}} onSaved={operationSaved}/>}

      {isValidationModalOpen && selectedValidationOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-[2rem] border border-slate-100 p-6 shadow-2xl w-full max-w-md space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center pb-2.5 border-b border-slate-100">
              <h3 className="font-black text-slate-900 text-sm uppercase tracking-wider flex items-center gap-1.5">
                <PlusCircle className="w-4 h-4 text-emerald-600" /> Aprobar Comprobante de Pago
              </h3>
              <button onClick={() => { setIsValidationModalOpen(false); setSelectedValidationOrder(null); }} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold uppercase text-[9px]">Pedido:</span>
                <span className="font-black text-slate-800">{selectedValidationOrder.legacy_code || selectedValidationOrder.id.substring(0,8)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold uppercase text-[9px]">Cliente:</span>
                <span className="font-black text-slate-800">{selectedValidationOrder.customer_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold uppercase text-[9px]">Total Pedido:</span>
                <span className="font-black text-slate-800">{formatPrice(selectedValidationOrder.total_amount)}</span>
              </div>
            </div>

            <form onSubmit={handleApproveValidation} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-400">Cuenta de Destino *</label>
                <AdaptiveSelect
                  value={valAccountId}
                  onChange={e => setValAccountId(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-bold text-xs outline-none focus:border-brand-500"
                >
                  {financialAccounts.map(a => (
                    <option key={a.id} value={a.id}>{financialAccountLabel(a.name)} ({a.currency})</option>
                  ))}
                </AdaptiveSelect>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-400">Monto Acreditado *</label>
                <input
                  type="number"
                  required
                  min="0.01"
                  step="any"
                  value={valAmount}
                  onChange={e => setValAmount(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-bold text-xs outline-none focus:border-brand-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-400">Concepto / Referencia *</label>
                <input
                  type="text"
                  required
                  value={valConcept}
                  onChange={e => setValConcept(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-bold text-xs outline-none focus:border-brand-500"
                />
              </div>

              <Button
                type="submit"
                disabled={submittingValidation}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md flex items-center justify-center gap-1.5"
              >
                {submittingValidation ? <Loader2 className="w-4 h-4 animate-spin" /> : "Aprobar y Registrar Cobro"}
              </Button>
            </form>
          </div>
        </div>
      )}
      
      {isBankImportOpen && <BankSheetImportModal onClose={() => setIsBankImportOpen(false)} onImported={async () => { await Promise.all([loadTransactions(), loadFinancialAccounts()]); }}/>}

      {/* Modal de Auditoría y Conciliación de Cajas y Bancos */}
      {isReconciliationModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-4xl w-full shadow-2xl space-y-5 border border-slate-100 max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-brand-50 rounded-xl text-brand-600">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <h3 className="font-black text-base text-slate-800 uppercase tracking-wide">
                    Auditoría y Conciliación de Cajas y Bancos
                  </h3>
                </div>
                <p className="text-slate-500 text-xs font-semibold">
                  Comparación matemática entre los movimientos registrados en el ERP y los saldos declarados en las planillas.
                </p>
              </div>
              <button 
                onClick={() => setIsReconciliationModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 border border-slate-100 rounded-2xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 sticky top-0 border-b border-slate-200">
                  <tr className="text-slate-500 font-black uppercase tracking-wider text-[9px]">
                    <th className="py-3 px-3">Cuenta</th>
                    <th className="py-3 px-3 text-right">Saldo Inicial (01/01/26)</th>
                    <th className="py-3 px-3 text-right">Movs 2026</th>
                    <th className="py-3 px-3 text-right">Ingresos</th>
                    <th className="py-3 px-3 text-right">Egresos</th>
                    <th className="py-3 px-3 text-right">Saldo Planilla</th>
                    <th className="py-3 px-3 text-right">Saldo ERP</th>
                    <th className="py-3 px-3 text-center">Estado Auditoría</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                  {reconciliationReport.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400 font-bold">
                        Aún no se ha ejecutado una sincronización de planillas en esta sesión.
                      </td>
                    </tr>
                  ) : (
                    reconciliationReport.map((rec) => {
                      const isExact = rec.isExact;
                      return (
                        <tr key={rec.id || rec.accountName} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-3 px-3 font-bold text-slate-900">
                            {financialAccountLabel(rec.accountName)}
                          </td>
                          <td className="py-3 px-3 text-right text-slate-700 font-mono text-[11px] font-bold">
                            {rec.currency === 'USD' ? `US$ ${(rec.initialBalance || 0).toLocaleString('es-AR')}` : formatPrice(rec.initialBalance || 0)}
                          </td>
                          <td className="py-3 px-3 text-right text-slate-500 font-mono text-[11px]">
                            {rec.txCount} movs
                          </td>
                          <td className="py-3 px-3 text-right text-emerald-600 font-mono text-[11px]">
                            +{formatPrice(rec.totalIncome)}
                          </td>
                          <td className="py-3 px-3 text-right text-rose-600 font-mono text-[11px]">
                            -{formatPrice(rec.totalExpense)}
                          </td>
                          <td className="py-3 px-3 text-right font-black font-mono text-slate-700">
                            {rec.currency === 'USD' ? `US$ ${rec.sheetDeclaredBalance.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : formatPrice(rec.sheetDeclaredBalance)}
                          </td>
                          <td className="py-3 px-3 text-right font-black font-mono text-slate-900">
                            {rec.currency === 'USD' ? `US$ ${rec.calculatedBalance.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : formatPrice(rec.calculatedBalance)}
                          </td>
                          <td className="py-3 px-3 text-center">
                            {isExact ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Conciliado ($0)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-200" title={`Diferencia detectada de ${formatPrice(rec.difference)}`}>
                                <AlertTriangle className="w-3 h-3 text-amber-500" /> Delta {formatPrice(rec.difference)}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4 text-[11px] text-slate-600 font-medium space-y-1">
              <div className="font-bold text-slate-800 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" /> Criterio de Auditoría ERP:
              </div>
              <p>
                El sistema suma cada uno de los movimientos reales de la planilla de Finanzas y comprueba que al sumar el Saldo Inicial al 01/01/2026 + los ingresos y egresos, coincida centavo a centavo con el Saldo Declarado en tu planilla de Bancos.
              </p>
            </div>

            <div className="flex justify-end">
              <Button
                onClick={() => setIsReconciliationModalOpen(false)}
                className="px-6 py-2 bg-slate-900 hover:bg-slate-800 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md"
              >
                Cerrar Reporte
              </Button>
            </div>
          </div>
        </div>
      )}
      {isConceptManagerOpen && (
        <FinancialConceptManager
          concepts={financialConcepts}
          onClose={() => setIsConceptManagerOpen(false)}
          onChanged={loadFinancialConcepts}
        />
      )}
    </div>
  );
}
