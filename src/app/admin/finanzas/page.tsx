"use client";

import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { 
  Wallet, 
  ArrowUpRight, 
  ArrowDownRight, 
  PlusCircle, 
  Loader2, 
  RefreshCw, 
  Search, 
  Download, 
  Coins, 
  ArrowRightLeft, 
  ChevronLeft, 
  ChevronRight, 
  ChevronDown,
  TrendingUp, 
  Trash2, 
  X,
  Lock,
  Edit2,
  FileText
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatPrice, formatDateDDMMYYYY } from "@/lib/utils";

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
  id: string;
  register_id: string | null;
  type: 'ingreso' | 'egreso';
  category: string;
  sub_category: string | null;
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

const finanzasSpreadsheetId = '1cTl_aRmR1Hk9YOuzxl8CU0fMxJnaE6wACv7gqa_6GV0';
const movimientosSpreadsheetId = '12OEQtYGyjFLTgnr0I4b8oXnH2qymv6rrQuby9_-ssRY';
const bancosSpreadsheetId = '1a9K_QfRzFNlbcmMdyPgPQE7ExG-6nBtNvRx-K6JSnMg';

function parseCSV(content: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < content.length && content[i + 1] === '"') {
          currentField += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField);
        currentField = '';
      } else if (char === '\n' || char === '\r') {
        if (char === '\r' && i + 1 < content.length && content[i + 1] === '\n') {
          i++;
        }
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }
  }
  if (currentRow.length > 0 || currentField !== '') {
    currentRow.push(currentField);
    rows.push(currentRow);
  }
  return rows;
}

function parseSpanishFloat(val: string): number {
  if (!val) return 0;
  const cleaned = val.replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parseSpanishDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  const parts = dateStr.split('/');
  if (parts.length !== 3) return new Date();
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
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

interface SupplierBalanceItem {
  id: string;
  name: string;
  total_purchases_ars: number;
  total_payments_ars: number;
  balance_ars: number;
  total_purchases_usd: number;
  total_payments_usd: number;
  balance_usd: number;
}

export default function AdminFinanzasPage() {
  const [activeTab, setActiveTab] = useState<'flow' | 'accounts' | 'cc' | 'validations'>('flow');
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState("");

  // Lists from DB
  const [financialAccounts, setFinancialAccounts] = useState<FinancialAccount[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [transactions, setTransactions] = useState<CashTransactionWithRelations[]>([]);
  const [clientsBalances, setClientsBalances] = useState<ClientBalanceItem[]>([]);
  const [suppliersBalances, setSuppliersBalances] = useState<SupplierBalanceItem[]>([]);

  // Modales
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [submittingTx, setSubmittingTx] = useState(false);
  const [submittingTransfer, setSubmittingTransfer] = useState(false);

  // Form de Transacción Manual
  const [txType, setTxType] = useState<'ingreso' | 'egreso'>('egreso');
  const [txAccountId, setTxAccountId] = useState("");
  const [txCategory, setTxCategory] = useState("Gastos Operativos");
  const [txSubCategory, setTxSubCategory] = useState("");
  const [txAmount, setTxAmount] = useState("");
  const [txConcept, setTxConcept] = useState("");
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
  const itemsPerPage = 20;

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
  const [linkToOrder, setLinkToOrder] = useState(false);
  const [linkToPurchase, setLinkToPurchase] = useState(false);

  // Vincular Modal (para movimientos ya registrados y no asociados)
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [reconcilingTx, setReconcilingTx] = useState<CashTransactionWithRelations | null>(null);
  const [linkSupplierId, setLinkSupplierId] = useState("");
  const [linkPurchaseId, setLinkPurchaseId] = useState("");
  const [linkOrderId, setLinkOrderId] = useState("");
  const [linkEmployeeId, setLinkEmployeeId] = useState("");
  const [linkAmount, setLinkAmount] = useState("");
  const [submittingLink, setSubmittingLink] = useState(false);

  // States for editing transactions and route sheets costing
  const [editingTx, setEditingTx] = useState<CashTransactionWithRelations | null>(null);
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
  const loadFinancialAccounts = async () => {};
  const loadCostCenters = async () => {};

  const loadValidationOrders = async () => {
    try {
      const res = await fetch("/api/admin/finanzas-data?action=validations");
      if (!res.ok) throw new Error("Error loading validation orders from API");
      const payload = await res.json();
      if (payload.validationOrders) setValidationOrders(payload.validationOrders);
    } catch (err) {
      console.error("Error loading validation orders:", err);
    }
  };

  const initData = async () => {
    try {
      const res = await fetch("/api/admin/finanzas-data?action=init");
      if (!res.ok) throw new Error("Error initializing finanzas data");
      const payload = await res.json();
      
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
          setTfSourceId(defaultAcc.id);
          const other = accountsWithBalances.find((a) => a.id !== defaultAcc.id) || accountsWithBalances[0];
          setTfDestId(other.id);
        }
      }
    } catch (err) {
      console.error("Error loading financial lists:", err);
    }
  };

  // Cargar datos al montar
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserId(user.id);
      
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

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/finanzas-data?action=transactions&startDate=${startDate}&endDate=${endDate}`);
      if (!res.ok) throw new Error("Error loading transactions");
      const payload = await res.json();
      if (payload.transactions) {
        setTransactions(payload.transactions);
      }
    } catch (err) {
      console.error("Error al cargar transacciones generales:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadCheckingAccounts = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/finanzas-data?action=balances");
      if (!res.ok) throw new Error("Error loading checking accounts balances");
      const payload = await res.json();
      if (payload.clientsBalances) setClientsBalances(payload.clientsBalances);
      if (payload.suppliersBalances) setSuppliersBalances(payload.suppliersBalances);
    } catch (err) {
      console.error("Error al cargar cuentas corrientes:", err);
    } finally {
      setLoading(false);
    }
  };

  interface SpreadsheetTransaction {
    type: 'ingreso' | 'egreso';
    category: string;
    sub_category: string | null;
    business_unit: string;
    amount: number;
    currency: 'ARS' | 'USD';
    exchange_rate: number;
    concept: string;
    notes?: string | null;
    created_at: string;
    payment_method_id: string;
    financial_account_id?: string;
  }

  const handleSyncFromSheets = async () => {
    const confirmSync = window.confirm(
      "¿Deseas sincronizar el flujo de caja con las planillas de Google Sheets?\n\n" +
      "• Se eliminarán los movimientos importados previamente.\n" +
      "• Se mantendrán intactos los movimientos que hayas cargado manualmente desde esta aplicación.\n" +
      "• Se recalcularán los saldos iniciales automáticamente para coincidir con el saldo real de cada cuenta."
    );
    if (!confirmSync) return;

    setIsSyncing(true);
    setSyncProgress("Iniciando conexión con Google Sheets...");
    
    try {
      // 1. Fetch payment methods and accounts from DB dynamically
      const [pmsRes, faRes] = await Promise.all([
        supabase.from('payment_methods').select('id, name'),
        supabase.from('financial_accounts').select('id, name, currency')
      ]);

      if (pmsRes.error) throw pmsRes.error;
      if (faRes.error) throw faRes.error;

      const pms = pmsRes.data || [];
      const dbAccs = faRes.data || [];

      const pmEfectivoId = pms.find(p => p.name.toLowerCase().includes("efectivo"))?.id;
      const pmTransferenciaId = pms.find(p => p.name.toLowerCase().includes("transferencia") || p.name.toLowerCase().includes("mercado"))?.id;

      const adminUserId = '381df0d1-183f-4ccb-aaf2-8147c76159a9';

      if (!pmEfectivoId || !pmTransferenciaId) {
        throw new Error("No se encontraron los medios de pago ('Efectivo' o 'Transferencia') configurados en la base de datos.");
      }

      const dbAccountsMap: Record<string, { id: string; currency: string }> = {};
      dbAccs.forEach(r => {
        dbAccountsMap[r.name] = { id: r.id, currency: r.currency };
      });

      // Account name mappings from sheet values to DB values
      const sheetToDbMapping: Record<string, { dbName: string; currency: string; isCash: boolean }> = {
        'Caja.EfectivoPesos': { dbName: 'Caja Efectivo Pesos', currency: 'ARS', isCash: true },
        'Cuenta.MP1': { dbName: 'Cuenta MP1', currency: 'ARS', isCash: false },
        'Cuenta.MP2': { dbName: 'Cuenta MP2', currency: 'ARS', isCash: false },
        'Cuenta.MP3': { dbName: 'Cuenta MP 3 y 4', currency: 'ARS', isCash: false },
        'Cuenta.MP4': { dbName: 'Cuenta MP 3 y 4', currency: 'ARS', isCash: false },
        'Cuenta.MPCaro': { dbName: 'Cuenta MP 3 y 4', currency: 'ARS', isCash: false },
        'Cuenta.Galicia': { dbName: 'Cuenta Galicia', currency: 'ARS', isCash: false },
        'Cuenta.GaliciaMas': { dbName: 'Galicia.Mas', currency: 'ARS', isCash: false },
        'Cuenta.VisaGalicia': { dbName: 'Visa.Galicia', currency: 'ARS', isCash: false },
        'Cuenta.Santander': { dbName: 'Cuenta Santander', currency: 'ARS', isCash: false },
        'Cuenta.ICBC': { dbName: 'Cuenta ICBC', currency: 'ARS', isCash: false },
        'Inversiones': { dbName: 'Inversiones', currency: 'ARS', isCash: false },
        'Caja.USD': { dbName: 'Caja Efectivo Dólares', currency: 'USD', isCash: true }
      };

      const balanceTargets = [
        { id: movimientosSpreadsheetId, sheet: 'Caja', name: 'Caja.EfectivoPesos', colName: 'Saldo' },
        { id: movimientosSpreadsheetId, sheet: 'Caja USD', name: 'Caja.USD', colName: 'Saldo' },
        { id: bancosSpreadsheetId, sheet: 'MercadoPago1', name: 'Cuenta.MP1', colName: 'Saldo' },
        { id: bancosSpreadsheetId, sheet: 'MercadoPago2', name: 'Cuenta.MP2', colName: 'Saldo' },
        { id: bancosSpreadsheetId, sheet: 'MercadoPago 3 Y 4', name: 'Cuenta.MP3', colName: 'Saldo' },
        { id: bancosSpreadsheetId, sheet: 'Galicia', name: 'Cuenta.Galicia', colName: 'Saldo' },
        { id: bancosSpreadsheetId, sheet: 'Galicia.Mas', name: 'Cuenta.GaliciaMas', colName: 'Saldo' },
        { id: bancosSpreadsheetId, sheet: 'Visa.Galicia', name: 'Cuenta.VisaGalicia', colName: 'Saldo' },
        { id: bancosSpreadsheetId, sheet: 'Santander', name: 'Cuenta.Santander', colName: 'Saldo' },
        { id: bancosSpreadsheetId, sheet: 'ICBC', name: 'Cuenta.ICBC', colName: 'Saldo' },
        { id: bancosSpreadsheetId, sheet: 'Inversiones', name: 'Inversiones', colName: 'Saldo' }
      ];

      // 2. Fetch expected balances
      setSyncProgress("Obteniendo saldos finales esperados desde las cuentas...");
      const expectedBalances: Record<string, number> = {};
      
      for (const t of balanceTargets) {
        const url = `https://docs.google.com/spreadsheets/d/${t.id}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(t.sheet)}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Error al conectar con la planilla [${t.sheet}]`);
        const csvText = await response.text();
        const rows = parseCSV(csvText);
        
        let headerIdx = -1;
        for (let i = 0; i < Math.min(10, rows.length); i++) {
          if (rows[i].includes(t.colName)) {
            headerIdx = i;
            break;
          }
        }
        if (headerIdx === -1) continue;
        
        const headers = rows[headerIdx];
        const saldoIdx = headers.indexOf(t.colName);
        
        let lastBalance = 0;
        for (let i = rows.length - 1; i > headerIdx; i--) {
          const row = rows[i];
          if (row.length > saldoIdx && row[saldoIdx]) {
            const val = parseSpanishFloat(row[saldoIdx]);
            if (val !== 0) {
              lastBalance = val;
              break;
            }
          }
        }
        expectedBalances[t.name] = lastBalance;
      }

      const expectedDbBalances: Record<string, number> = {
        'Caja Efectivo Pesos': expectedBalances['Caja.EfectivoPesos'] || 0,
        'Caja Efectivo Dólares': expectedBalances['Caja.USD'] || 0,
        'Cuenta MP1': expectedBalances['Cuenta.MP1'] || 0,
        'Cuenta MP2': expectedBalances['Cuenta.MP2'] || 0,
        'Cuenta MP 3 y 4': expectedBalances['Cuenta.MP3'] || 0,
        'Cuenta Galicia': expectedBalances['Cuenta.Galicia'] || 0,
        'Galicia.Mas': expectedBalances['Cuenta.GaliciaMas'] || 0,
        'Visa.Galicia': expectedBalances['Cuenta.VisaGalicia'] || 0,
        'Cuenta Santander': expectedBalances['Cuenta.Santander'] || 0,
        'Cuenta ICBC': expectedBalances['Cuenta.ICBC'] || 0,
        'Inversiones': expectedBalances['Inversiones'] || 0
      };

      // 3. Clear previous imported transactions
      setSyncProgress("Limpiando transacciones importadas anteriormente...");
      const { error: deleteErr } = await supabase
        .from('cash_transactions')
        .delete()
        .eq('is_imported', true);
      if (deleteErr) throw deleteErr;

      // 4. Query net sum of app-entered transactions (is_imported = false)
      setSyncProgress("Analizando movimientos manuales cargados en la App...");
      const { data: appTxs, error: appTxsErr } = await supabase
        .from('cash_transactions')
        .select('financial_account_id, type, amount')
        .eq('is_imported', false);
      if (appTxsErr) throw appTxsErr;

      const appNets: Record<string, number> = {};
      (appTxs || []).forEach(tx => {
        const accId = tx.financial_account_id;
        if (!accId) return;
        if (!appNets[accId]) appNets[accId] = 0;
        const amount = Number(tx.amount) || 0;
        if (tx.type === 'ingreso') {
          appNets[accId] += amount;
        } else {
          appNets[accId] -= amount;
        }
      });

      // 5. Download and Parse Finanzas tab (ARS Transactions)
      setSyncProgress("Descargando movimientos en Pesos (ARS)...");
      const finanzasUrl = `https://docs.google.com/spreadsheets/d/${finanzasSpreadsheetId}/gviz/tq?tqx=out:csv&sheet=Finanzas`;
      const finanzasResponse = await fetch(finanzasUrl);
      if (!finanzasResponse.ok) throw new Error("No se pudo descargar la pestaña de Finanzas ARS.");
      const finanzasCSV = await finanzasResponse.text();
      const finanzasRows = parseCSV(finanzasCSV);

      // Group ARS transactions by DB Account Name
      const arsTransactionsGrouped: Record<string, SpreadsheetTransaction[]> = {};
      Object.keys(dbAccountsMap).forEach(name => {
        arsTransactionsGrouped[name] = [];
      });

      for (let i = 1; i < finanzasRows.length; i++) {
        const row = finanzasRows[i];
        if (row.length < 8) continue;
        
        const subCat = row[0];
        const dateStr = row[1];
        const concept = row[2];
        const cat = row[3];
        const businessUnit = row[4] || 'ZONO';
        const typeStr = row[5];
        const amountStr = row[6];
        const sheetAccount = row[7];

        if (!sheetAccount) continue;
        const mapping = sheetToDbMapping[sheetAccount];
        if (!mapping) continue;

        const dbAccName = mapping.dbName;
        const amount = parseSpanishFloat(amountStr);
        if (amount <= 0) continue;

        arsTransactionsGrouped[dbAccName].push({
          type: typeStr === 'Ingreso' ? 'ingreso' : 'egreso',
          category: cat || 'Otro',
          sub_category: subCat || null,
          business_unit: businessUnit,
          amount: amount,
          currency: 'ARS',
          exchange_rate: 1.0,
          concept: concept || 'Movimiento sin concepto',
          created_at: parseSpanishDate(dateStr).toISOString(),
          payment_method_id: mapping.isCash ? pmEfectivoId : pmTransferenciaId
        });
      }

      // 6. Calculate and insert Initial Balances for ARS Accounts
      setSyncProgress("Calculando saldos iniciales de cada cuenta...");
      const allInsertions: SpreadsheetTransaction[] = [];

      for (const [dbAccName, accInfo] of Object.entries(dbAccountsMap)) {
        if (accInfo.currency !== 'ARS') continue;

        let txSum = 0;
        arsTransactionsGrouped[dbAccName].forEach(tx => {
          if (tx.type === 'ingreso') {
            txSum += tx.amount;
          } else {
            txSum -= tx.amount;
          }
        });

        const appNet = appNets[accInfo.id] || 0;
        const expectedFinal = expectedDbBalances[dbAccName];
        const initialBalance = expectedFinal - txSum - appNet;

        if (Math.abs(initialBalance) > 0.01) {
          const isCash = dbAccName === 'Caja Efectivo Pesos';
          allInsertions.push({
            financial_account_id: accInfo.id,
            type: initialBalance >= 0 ? 'ingreso' : 'egreso',
            category: 'ingreso_capital',
            sub_category: 'Saldo Inicial',
            business_unit: 'ZONO',
            amount: Math.abs(initialBalance),
            currency: 'ARS',
            exchange_rate: 1.0,
            concept: 'Saldo Inicial al 01/01/2026',
            created_at: '2026-01-01T12:00:00.000Z',
            payment_method_id: isCash ? pmEfectivoId : pmTransferenciaId
          });
        }

        arsTransactionsGrouped[dbAccName].forEach(tx => {
          allInsertions.push({
            ...tx,
            financial_account_id: accInfo.id
          });
        });
      }

      // 7. Download and Parse Caja USD
      setSyncProgress("Descargando movimientos en Dólares (USD)...");
      const usdUrl = `https://docs.google.com/spreadsheets/d/${movimientosSpreadsheetId}/gviz/tq?tqx=out:csv&sheet=Caja%20USD`;
      const usdResponse = await fetch(usdUrl);
      if (!usdResponse.ok) throw new Error("No se pudo descargar la pestaña de Caja USD.");
      const usdCSV = await usdResponse.text();
      const usdRows = parseCSV(usdCSV);

      const usdAccountId = dbAccountsMap['Caja Efectivo Dólares']?.id;
      if (usdAccountId) {
        for (let i = 1; i < usdRows.length; i++) {
          const row = usdRows[i];
          if (row.length < 8) continue;

          const concept = row[1];
          const dateStr = row[2];
          const detail = row[3];
          const cat = row[4];
          const subCat = row[5];
          const typeStr = row[6];
          const amountStr = row[7];
          const obs = row[13];
          const cotizacionStr = row[17];

          const amount = parseSpanishFloat(amountStr);
          if (amount <= 0) continue;

          const exchangeRate = parseSpanishFloat(cotizacionStr) || 1.0;
          const notes = [detail, obs].filter(Boolean).join(' - ');

          allInsertions.push({
            financial_account_id: usdAccountId,
            type: typeStr === 'Ingreso' ? 'ingreso' : 'egreso',
            category: cat || 'Otro',
            sub_category: subCat || null,
            business_unit: 'ZONO',
            amount: amount,
            currency: 'USD',
            exchange_rate: exchangeRate,
            concept: concept || 'Movimiento sin concepto',
            notes: notes || null,
            created_at: parseSpanishDate(dateStr).toISOString(),
            payment_method_id: pmEfectivoId
          });
        }
      }

      // 8. Bulk Insert into DB in chunks of 500
      const chunkSize = 500;
      const totalChunks = Math.ceil(allInsertions.length / chunkSize);
      for (let i = 0; i < allInsertions.length; i += chunkSize) {
        const chunk = allInsertions.slice(i, i + chunkSize);
        setSyncProgress(`Insertando movimientos en base de datos (Lote ${Math.floor(i / chunkSize) + 1} de ${totalChunks})...`);
        
        const preparedChunk = chunk.map(item => ({
          ...item,
          created_by: userId || adminUserId,
          is_imported: true
        }));

        const { error: insertErr } = await supabase
          .from('cash_transactions')
          .insert(preparedChunk);

        if (insertErr) throw insertErr;
      }

      setSyncProgress("Refrescando paneles y vistas...");
      await Promise.all([
        loadTransactions(),
        loadFinancialAccounts()
      ]);

      alert("¡Sincronización completada con éxito!\nTodos los saldos históricos y movimientos han sido actualizados y reconciliados.");

    } catch (err) {
      console.error(err);
      alert("Error al sincronizar con planillas: " + (err as Error).message);
    } finally {
      setIsSyncing(false);
      setSyncProgress("");
    }
  };

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

  const reverseAndCleanLinks = async (txId: string) => {
    try {
      // 1. Fetch and reverse client payments
      const { data: clientPays, error: cpErr } = await supabase
        .from('client_payments')
        .select('*, orders(*)')
        .eq('cash_transaction_id', txId);
      
      if (cpErr) throw cpErr;
      
      if (clientPays && clientPays.length > 0) {
        for (const cp of clientPays) {
          const ord = cp.orders;
          if (ord) {
            const oldPending = Number(ord.totals?.pending_balance) || Number(ord.total_amount);
            const newPending = oldPending + cp.amount;
            const newTotals = {
              ...(ord.totals || {}),
              pending_balance: newPending
            };
            const newPayStatus = newPending >= Number(ord.total_amount) ? 'Pendiente' : 'Seniado';
            
            await supabase
              .from('orders')
              .update({
                payment_status: newPayStatus,
                totals: newTotals
              })
              .eq('id', ord.id);
          }
        }
        await supabase.from('client_payments').delete().eq('cash_transaction_id', txId);
      }

      // 2. Fetch and reverse supplier payments
      const { data: supplierPays, error: spErr } = await supabase
        .from('supplier_payments')
        .select('*, supplier_purchases(*)')
        .eq('cash_transaction_id', txId);
        
      if (spErr) throw spErr;
      
      if (supplierPays && supplierPays.length > 0) {
        for (const sp of supplierPays) {
          const pur = sp.supplier_purchases;
          if (pur) {
            const newPaid = Math.max(0, Number(pur.paid_amount) - sp.amount);
            const newStatus = newPaid <= 0 ? 'Pendiente' : newPaid >= Number(pur.total_amount) ? 'Pagado' : 'Parcial';
            
            await supabase
              .from('supplier_purchases')
              .update({
                paid_amount: newPaid,
                status: newStatus
              })
              .eq('id', pur.id);
          }
        }
        await supabase.from('supplier_payments').delete().eq('cash_transaction_id', txId);
      }
    } catch (err) {
      console.error("Error in reverseAndCleanLinks:", err);
    }
  };

  // Registrar Transacción Manual
  const handleRegisterTx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !txAccountId || !txAmount || !txConcept) {
      alert("Por favor completá los campos obligatorios.");
      return;
    }

    const amount = Number(txAmount);
    if (isNaN(amount) || amount <= 0) {
      alert("Monto inválido.");
      return;
    }

    // Obtener medio de pago por defecto
    const { data: pms } = await supabase
      .from('payment_methods')
      .select('id, name');
    
    let defaultPmId = "";
    if (pms && pms.length > 0) {
      const selectedAcc = financialAccounts.find(a => a.id === txAccountId);
      const accType = selectedAcc?.type || 'efectivo';
      
      let matchedPm = null;
      if (accType === 'efectivo') {
        matchedPm = pms.find(p => p.name.toLowerCase().includes("efectivo"));
      } else {
        matchedPm = pms.find(p => p.name.toLowerCase().includes("transferencia") || p.name.toLowerCase().includes("mercado"));
      }
      
      defaultPmId = matchedPm?.id || pms[0].id;
    }

    if (!defaultPmId) {
      alert("No se encontró un medio de pago configurado en el sistema.");
      return;
    }

    setSubmittingTx(true);
    try {
      const selectedAcc = financialAccounts.find(a => a.id === txAccountId);
      const currency = selectedAcc?.currency || 'ARS';

      let targetTxId = "";
      if (editingTx) {
        // Clean and reverse old links
        await reverseAndCleanLinks(editingTx.id);

        const { error: updateError } = await supabase
          .from('cash_transactions')
          .update({
            type: txType,
            category: txCategory,
            sub_category: txSubCategory.trim() || null,
            business_unit: costCenters.find(c => c.id === txCostCenterId)?.code || 'ZONO',
            amount,
            currency,
            financial_account_id: txAccountId,
            concept: txConcept.trim(),
            cost_center_id: txCostCenterId || null,
            notes: txNotes.trim() || null,
            created_at: txCreatedAt ? new Date(txCreatedAt + 'T12:00:00').toISOString() : new Date().toISOString(),
            employee_id: txCategory === "Sueldos" && selectedEmployeeId ? selectedEmployeeId : null,
            route_sheet_id: txRouteSheetId || null
          })
          .eq('id', editingTx.id);

        if (updateError) throw updateError;
        targetTxId = editingTx.id;
      } else {
        const { data: txData, error: txError } = await supabase
          .from('cash_transactions')
          .insert({
            type: txType,
            category: txCategory,
            sub_category: txSubCategory.trim() || null,
            business_unit: costCenters.find(c => c.id === txCostCenterId)?.code || 'ZONO',
            amount,
            currency,
            payment_method_id: defaultPmId,
            financial_account_id: txAccountId,
            concept: txConcept.trim(),
            cost_center_id: txCostCenterId || null,
            notes: txNotes.trim() || null,
            created_by: userId,
            created_at: txCreatedAt ? new Date(txCreatedAt + 'T12:00:00').toISOString() : new Date().toISOString(),
            employee_id: txCategory === "Sueldos" && selectedEmployeeId ? selectedEmployeeId : null,
            route_sheet_id: txRouteSheetId || null
          })
          .select('id')
          .single();

        if (txError) throw txError;
        targetTxId = txData.id;
      }

      // Vincular Proveedores si corresponde
      if (txCategory === "Proveedores" && linkToPurchase && selectedPurchaseId) {
        const { error: payErr } = await supabase
          .from('supplier_payments')
          .insert({
            supplier_id: selectedSupplierId,
            purchase_id: selectedPurchaseId,
            amount: amount,
            currency: currency,
            payment_method_id: defaultPmId,
            cash_transaction_id: targetTxId,
            financial_account_id: txAccountId,
            notes: txConcept.trim()
          });
        if (payErr) throw payErr;

        const pur = pendingPurchases.find(p => p.id === selectedPurchaseId);
        if (pur) {
          const newPaid = Number(pur.paid_amount) + amount;
          const newStatus = newPaid >= Number(pur.total_amount) ? 'Pagado' : 'Parcial';
          const { error: purErr } = await supabase
            .from('supplier_purchases')
            .update({
              paid_amount: newPaid,
              status: newStatus
            })
            .eq('id', selectedPurchaseId);
          if (purErr) throw purErr;
        }
      }

      // Vincular Cobro/Ventas si corresponde
      if (txCategory === "Recaudación" && linkToOrder && selectedOrderId) {
        const ord = pendingOrders.find(o => o.id === selectedOrderId);
        const { error: payErr } = await supabase
          .from('client_payments')
          .insert({
            client_id: ord?.client_id || null,
            order_id: selectedOrderId,
            amount: amount,
            currency: currency,
            payment_method_id: defaultPmId,
            cash_transaction_id: targetTxId,
            financial_account_id: txAccountId,
            status: 'Aprobado',
            notes: txConcept.trim()
          });
        if (payErr) throw payErr;

        if (ord) {
          const oldPending = Number(ord.totals?.pending_balance) || Number(ord.total_amount);
          const newPending = Math.max(0, oldPending - amount);
          const newTotals = {
            ...(ord.totals || {}),
            pending_balance: newPending
          };
          const newPayStatus = newPending <= 0 ? 'Abonado' : 'Seniado';
          const { error: ordErr } = await supabase
            .from('orders')
            .update({
              payment_approved: true,
              payment_status: newPayStatus,
              totals: newTotals
            })
            .eq('id', selectedOrderId);
          if (ordErr) throw ordErr;
        }
      }

      setIsTxModalOpen(false);
      setEditingTx(null);
      setTxAmount("");
      setTxConcept("");
      setTxSubCategory("");
      setTxNotes("");
      setTxRouteSheetId("");
      setSelectedEmployeeId("");
      setSelectedSupplierId("");
      setSelectedPurchaseId("");
      setSelectedOrderId("");
      setLinkToOrder(false);
      setLinkToPurchase(false);
      
      await Promise.all([
        loadTransactions(),
        loadFinancialAccounts(),
        loadHelperLists(),
        loadValidationOrders()
      ]);
      alert(editingTx ? "Movimiento actualizado con éxito!" : "Movimiento registrado con éxito!");
    } catch (err) {
      console.error(err);
      alert("Error al guardar movimiento: " + (err as Error).message);
    } finally {
      setSubmittingTx(false);
    }
  };

  // Registrar Transferencia Interna
  const handleRegisterTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !tfSourceId || !tfDestId || !tfAmount || !tfConcept) {
      alert("Por favor completá los campos obligatorios.");
      return;
    }

    if (tfSourceId === tfDestId) {
      alert("La cuenta de origen y destino no pueden ser la misma.");
      return;
    }

    const amount = Number(tfAmount);
    if (isNaN(amount) || amount <= 0) {
      alert("Monto inválido.");
      return;
    }

    const srcAcc = financialAccounts.find(a => a.id === tfSourceId);
    const destAcc = financialAccounts.find(a => a.id === tfDestId);

    if (!srcAcc || !destAcc) {
      alert("Cuenta de origen o destino no encontrada.");
      return;
    }

    if (srcAcc.currency !== destAcc.currency) {
      alert("Por el momento sólo se permiten transferencias entre cuentas de la misma divisa.");
      return;
    }

    // Obtener medio de pago para transferencias
    const { data: pms } = await supabase
      .from('payment_methods')
      .select('id, name');
    
    const transferPm = pms?.find(p => p.name.toLowerCase().includes("transferencia")) || pms?.[0];
    if (!transferPm) {
      alert("No se encontró un medio de pago configurado en el sistema.");
      return;
    }

    setSubmittingTransfer(true);
    try {
      const currency = srcAcc.currency;
      const transferGroupId = crypto.randomUUID(); // Unir ambos registros visualmente en notas

      // 1. Registrar el Egreso (Salida) de la cuenta origen
      const { error: srcErr } = await supabase
        .from('cash_transactions')
        .insert({
          type: 'egreso',
          category: 'retiro_caja', // Mapeado a transferencia
          sub_category: 'Movimiento de cuentas',
          business_unit: 'ZONO',
          amount,
          currency,
          payment_method_id: transferPm.id,
          financial_account_id: tfSourceId,
          concept: `Transferencia: ${tfConcept.trim()} (Hacia ${destAcc.name})`,
          notes: `TRF-GROUP: ${transferGroupId} | ${tfNotes.trim()}`.trim(),
          created_by: userId
        });

      if (srcErr) throw srcErr;

      // 2. Registrar el Ingreso (Entrada) en la cuenta destino
      const { error: destErr } = await supabase
        .from('cash_transactions')
        .insert({
          type: 'ingreso',
          category: 'ingreso_capital', // Mapeado a transferencia
          sub_category: 'Movimiento de cuentas',
          business_unit: 'ZONO',
          amount,
          currency,
          payment_method_id: transferPm.id,
          financial_account_id: tfDestId,
          concept: `Transferencia: ${tfConcept.trim()} (Desde ${srcAcc.name})`,
          notes: `TRF-GROUP: ${transferGroupId} | ${tfNotes.trim()}`.trim(),
          created_by: userId
        });

      if (destErr) throw destErr;

      setIsTransferModalOpen(false);
      setTfAmount("");
      setTfConcept("");
      setTfNotes("");

      await Promise.all([
        loadTransactions(),
        loadFinancialAccounts()
      ]);
      alert("¡Transferencia registrada exitosamente!");
    } catch (err) {
      console.error(err);
      alert("Error al realizar la transferencia: " + (err as Error).message);
    } finally {
      setSubmittingTransfer(false);
    }
  };

  const handleSaveLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reconcilingTx) return;
    
    const amount = Number(linkAmount) || reconcilingTx.amount;
    
    setSubmittingLink(true);
    try {
      // Clean and reverse old links first
      await reverseAndCleanLinks(reconcilingTx.id);

      if (reconcilingTx.type === 'ingreso') {
        if (!linkOrderId) {
          alert("Por favor seleccione una venta.");
          return;
        }
        const ord = pendingOrders.find(o => o.id === linkOrderId);
        
        const { error: payErr } = await supabase
          .from('client_payments')
          .insert({
            client_id: ord?.client_id || null,
            order_id: linkOrderId,
            amount: amount,
            currency: reconcilingTx.currency,
            payment_method_id: reconcilingTx.payment_method_id,
            cash_transaction_id: reconcilingTx.id,
            financial_account_id: reconcilingTx.financial_account_id,
            status: 'Aprobado',
            notes: reconcilingTx.concept
          });
        if (payErr) throw payErr;
        
        if (ord) {
          const oldPending = Number(ord.totals?.pending_balance) || Number(ord.total_amount);
          const newPending = Math.max(0, oldPending - amount);
          const newTotals = {
            ...(ord.totals || {}),
            pending_balance: newPending
          };
          const newPayStatus = newPending <= 0 ? 'Abonado' : 'Seniado';
          
          await supabase
            .from('orders')
            .update({
              payment_status: newPayStatus,
              payment_approved: true,
              totals: newTotals
            })
            .eq('id', linkOrderId);
        }
      } else {
        if (reconcilingTx.category === 'Proveedores') {
          if (!linkPurchaseId) {
            alert("Por favor seleccione una compra.");
            return;
          }
          const pur = pendingPurchases.find(p => p.id === linkPurchaseId);
          
          const { error: payErr } = await supabase
            .from('supplier_payments')
            .insert({
              supplier_id: linkSupplierId,
              purchase_id: linkPurchaseId,
              amount: amount,
              currency: reconcilingTx.currency,
              payment_method_id: reconcilingTx.payment_method_id,
              cash_transaction_id: reconcilingTx.id,
              financial_account_id: reconcilingTx.financial_account_id,
              notes: reconcilingTx.concept
            });
          if (payErr) throw payErr;
          
          if (pur) {
            const newPaid = Number(pur.paid_amount) + amount;
            const newStatus = newPaid >= Number(pur.total_amount) ? 'Pagado' : 'Parcial';
            await supabase
              .from('supplier_purchases')
              .update({
                paid_amount: newPaid,
                status: newStatus
              })
              .eq('id', linkPurchaseId);
          }
        } else if (reconcilingTx.category === 'Sueldos') {
          if (!linkEmployeeId) {
            alert("Por favor seleccione un empleado.");
            return;
          }
          
          const { error: txErr } = await supabase
            .from('cash_transactions')
            .update({ employee_id: linkEmployeeId })
            .eq('id', reconcilingTx.id);
          if (txErr) throw txErr;
        } else if (reconcilingTx.category === 'Peajes' || reconcilingTx.category === 'Servicio de Flete') {
          if (!linkRouteSheetId) {
            alert("Por favor seleccione una hoja de ruta.");
            return;
          }
          const { error: txErr } = await supabase
            .from('cash_transactions')
            .update({ route_sheet_id: linkRouteSheetId })
            .eq('id', reconcilingTx.id);
          if (txErr) throw txErr;
        }
      }
      
      setIsLinkModalOpen(false);
      setReconcilingTx(null);
      setLinkRouteSheetId("");
      await Promise.all([
        loadTransactions(),
        loadFinancialAccounts(),
        loadHelperLists(),
        loadValidationOrders()
      ]);
      alert("¡Vinculación realizada con éxito!");
    } catch (err) {
      console.error(err);
      alert("Error al vincular movimiento: " + (err as Error).message);
    } finally {
      setSubmittingLink(false);
    }
  };

  const handleApproveValidation = async (e: React.FormEvent) => {
    e.preventDefault();
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
          matchedPm = pms.find(p => p.name.toLowerCase().includes("efectivo"));
        } else {
          matchedPm = pms.find(p => p.name.toLowerCase().includes("transferencia") || p.name.toLowerCase().includes("mercado"));
        }
        if (matchedPm) defaultPmId = matchedPm.id;
      }
      
      const { data: tx, error: txError } = await supabase
        .from('cash_transactions')
        .insert({
          type: 'ingreso',
          category: 'Recaudación',
          sub_category: 'Cobro Venta Directa',
          business_unit: 'ZONO',
          amount: amount,
          currency: currency,
          payment_method_id: defaultPmId,
          financial_account_id: valAccountId,
          concept: valConcept.trim() || `Cobro Validado - Venta ${selectedValidationOrder.legacy_code || selectedValidationOrder.id.substring(0, 8)}`,
          created_by: userId || '381df0d1-183f-4ccb-aaf2-8147c76159a9'
        })
        .select('id')
        .single();
        
      if (txError) throw txError;
      
      const { error: clientPayErr } = await supabase
        .from('client_payments')
        .insert({
          client_id: selectedValidationOrder.client_id || null,
          order_id: selectedValidationOrder.id,
          amount: amount,
          currency: currency,
          payment_method_id: defaultPmId,
          cash_transaction_id: tx.id,
          financial_account_id: valAccountId,
          status: 'Aprobado',
          notes: valConcept.trim()
        });
      if (clientPayErr) throw clientPayErr;
      
      const oldPending = Number(selectedValidationOrder.totals?.pending_balance) || Number(selectedValidationOrder.total_amount);
      const newPending = Math.max(0, oldPending - amount);
      const newTotals = {
        ...(selectedValidationOrder.totals || {}),
        pending_balance: newPending
      };
      const newPayStatus = newPending <= 0 ? 'Abonado' : 'Seniado';
      
      const { error: orderError } = await supabase
        .from('orders')
        .update({
          payment_approved: true,
          payment_status: newPayStatus,
          totals: newTotals
        })
        .eq('id', selectedValidationOrder.id);
        
      if (orderError) throw orderError;
      
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
    if (!confirm(`¿Estás seguro de que deseas eliminar el movimiento "${concept || 'Sin concepto'}"?`)) return;

    try {
      setLoading(true);
      
      // Revert and clean links first
      await reverseAndCleanLinks(txId);

      const { error } = await supabase
        .from('cash_transactions')
        .delete()
        .eq('id', txId);

      if (error) throw error;
      
      await Promise.all([
        loadTransactions(),
        loadFinancialAccounts()
      ]);
      alert("Movimiento eliminado correctamente.");
    } catch (err) {
      console.error(err);
      alert("Error al eliminar movimiento: " + (err as Error).message);
    } finally {
      setLoading(false);
    }
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
      // 0. Rango de Fechas (Filtro en cliente para Fecha Inicio)
      const txDate = t.created_at.split('T')[0];
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
  }, [transactions, filterAccountId, filterType, filterCategory, filterCostCenterId, searchTerm, startDate]);

  // KPIs Financieros Consolidados (Pesos y Dólares por separado)
  const financialKPIs = useMemo(() => {
    let incomeArs = 0;
    let expenseArs = 0;
    let incomeUsd = 0;
    let expenseUsd = 0;

    filteredTransactions.forEach(t => {
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
  }, [filteredTransactions, currentPage]);

  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);

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
    csvContent += "Fecha,Cuenta,Tipo,Categoria,Subcategoria,Unidad Negocio,Monto,Divisa,Concepto,Notas\n";

    filteredTransactions.forEach(t => {
      const date = formatDateDDMMYYYY(t.created_at);
      const account = t.financial_accounts?.name || "Caja Efectivo Turno";
      const type = t.type === 'ingreso' ? 'Ingreso' : 'Egreso';
      const cat = t.category;
      const sub = t.sub_category || "";
      const unit = t.business_unit || "";
      const amount = t.amount;
      const currency = t.currency;
      const concept = t.concept || "";
      const notes = t.notes || "";

      csvContent += `${escapeCSV(date)},${escapeCSV(account)},${escapeCSV(type)},${escapeCSV(cat)},${escapeCSV(sub)},${escapeCSV(unit)},${amount},${currency},${escapeCSV(concept)},${escapeCSV(notes)}\n`;
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

  return (
    <div className="space-y-6 w-full pb-12">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2 uppercase">
            <Coins className="w-5 h-5 text-brand-600 animate-pulse" /> Administración y Finanzas (Flujo Caja)
          </h1>
          <p className="text-xs text-slate-500 font-bold mt-1">
            Visualizá el flujo consolidado de fondos, conciliá cuentas corrientes y controlá los saldos de la empresa.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0">
          <button
            onClick={() => setActiveTab('flow')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
              activeTab === 'flow'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" /> Flujo General
          </button>
          <button
            onClick={() => setActiveTab('accounts')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
              activeTab === 'accounts'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Wallet className="w-3.5 h-3.5" /> Cuentas y Saldos
          </button>
          <button
            onClick={() => setActiveTab('cc')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
              activeTab === 'cc'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <ArrowRightLeft className="w-3.5 h-3.5" /> Cuentas Corrientes
          </button>
          <button
            onClick={() => setActiveTab('validations')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all relative ${
              activeTab === 'validations'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileText className="w-3.5 h-3.5" /> Comprobantes a Validar
            {validationOrders.length > 0 && (
              <span className="ml-1 bg-rose-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[9px] font-black animate-pulse">
                {validationOrders.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* =========================================================================
          TAB 1: FLUJO DE CAJA (MOVIMIENTOS GENERALES)
          ========================================================================= */}
      {activeTab === 'flow' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-200">
          
          {/* Tarjetas KPI Financieros */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Caja Pesos (ARS) */}
            <div className="bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex justify-between items-center pb-2.5 border-b border-slate-100">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Totalizadores Pesos (ARS)</span>
                <span className="bg-brand-50 text-brand-700 px-2 py-0.5 rounded text-[8px] font-black uppercase">ARS $</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Ingresos</span>
                  <div className="text-sm font-black text-emerald-600 tracking-tight leading-none mt-1">
                    {formatPrice(financialKPIs.ars.income)}
                  </div>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Egresos</span>
                  <div className="text-sm font-black text-rose-600 tracking-tight leading-none mt-1">
                    -{formatPrice(financialKPIs.ars.expense)}
                  </div>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Flujo Neto</span>
                  <div className={`text-base font-black tracking-tight leading-none mt-0.5 ${financialKPIs.ars.net >= 0 ? 'text-slate-800' : 'text-rose-600'}`}>
                    {financialKPIs.ars.net < 0 ? "-" : ""}{formatPrice(Math.abs(financialKPIs.ars.net))}
                  </div>
                </div>
              </div>
            </div>

            {/* Caja Dólares (USD) */}
            <div className="bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex justify-between items-center pb-2.5 border-b border-slate-100">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Totalizadores Dólares (USD)</span>
                <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded text-[8px] font-black uppercase">USD US$</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Ingresos</span>
                  <div className="text-sm font-black text-emerald-600 tracking-tight leading-none mt-1">
                    US$ {financialKPIs.usd.income.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Egresos</span>
                  <div className="text-sm font-black text-rose-600 tracking-tight leading-none mt-1">
                    -US$ {financialKPIs.usd.expense.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Flujo Neto</span>
                  <div className={`text-base font-black tracking-tight leading-none mt-0.5 ${financialKPIs.usd.net >= 0 ? 'text-slate-800' : 'text-rose-600'}`}>
                    {financialKPIs.usd.net < 0 ? "-" : ""}US$ {Math.abs(financialKPIs.usd.net).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Filtros */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/60 shadow-sm space-y-4">
            <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-end justify-between">
              
              <div className="flex flex-wrap items-end gap-3 flex-1">
                <div className="space-y-1">
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Período</label>
                  <div className="flex bg-slate-50 rounded-xl border border-slate-200 p-0.5">
                    {[
                      { id: 'hoy', label: 'Hoy' },
                      { id: '7dias', label: '7D' },
                      { id: '30dias', label: '30D' },
                      { id: 'mes', label: 'Este Mes' },
                      { id: 'año', label: 'Este Año' }
                    ].map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handlePresetChange(p.id)}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                          presetRange === p.id 
                            ? 'bg-white text-slate-900 border border-slate-200 shadow-sm' 
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Desde</label>
                  <input 
                    type="date"
                    value={startDate}
                    onChange={e => { setStartDate(e.target.value); setPresetRange("personalizado"); setCurrentPage(1); }}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 font-bold text-xs bg-slate-50 text-slate-700 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Hasta</label>
                  <input 
                    type="date"
                    value={endDate}
                    onChange={e => { setEndDate(e.target.value); setPresetRange("personalizado"); setCurrentPage(1); }}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 font-bold text-xs bg-slate-50 text-slate-700 focus:outline-none"
                  />
                </div>

                <button
                  onClick={loadTransactions}
                  className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-400 hover:text-slate-600 transition-colors shrink-0"
                  title="Recargar datos"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>

              {/* Botonera de Inserción */}
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    setEditingTx(null);
                    setTxAmount("");
                    setTxConcept("");
                    setTxSubCategory("");
                    setTxNotes("");
                    setTxRouteSheetId("");
                    setSelectedEmployeeId("");
                    setSelectedSupplierId("");
                    setSelectedPurchaseId("");
                    setSelectedOrderId("");
                    setLinkToOrder(false);
                    setLinkToPurchase(false);
                    setIsTxModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md shadow-brand-600/20"
                >
                  <PlusCircle className="w-4 h-4" /> Cargar Movimiento
                </Button>
                <Button
                  onClick={handleExportCSV}
                  className="flex items-center gap-1.5 px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 font-black text-xs uppercase tracking-wider rounded-xl shadow-sm"
                >
                  <Download className="w-4 h-4 text-slate-400" /> Exportar CSV
                </Button>
                <Button
                  onClick={handleSyncFromSheets}
                  disabled={isSyncing}
                  className="flex items-center gap-1.5 px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 font-black text-xs uppercase tracking-wider rounded-xl shadow-sm disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 text-brand-500 ${isSyncing ? 'animate-spin' : ''}`} /> Sincronizar Planillas
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-4 pt-3 border-t border-slate-100">
              {/* Buscador */}
              <div className="space-y-1 md:col-span-2">
                <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none">Buscar movimiento</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Concepto, subcategoría, notas..."
                    value={searchTerm}
                    onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                    className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 font-bold text-xs bg-slate-50 text-slate-700 focus:outline-none placeholder-slate-400"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                </div>
              </div>

              {/* Tipo */}
              <div className="space-y-1">
                <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none">Tipo de Movimiento</label>
                <select
                  value={filterType}
                  onChange={e => { setFilterType(e.target.value as 'all' | 'ingreso' | 'egreso'); setCurrentPage(1); }}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-200 font-bold text-xs bg-slate-50 text-slate-700 focus:outline-none cursor-pointer"
                >
                  <option value="all">Todos</option>
                  <option value="ingreso">Ingresos</option>
                  <option value="egreso">Egresos</option>
                </select>
              </div>

              {/* Cuenta */}
              <div className="space-y-1">
                <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none">Cuenta Financiera</label>
                <select
                  value={filterAccountId}
                  onChange={e => { setFilterAccountId(e.target.value); setCurrentPage(1); }}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-200 font-bold text-xs bg-slate-50 text-slate-700 focus:outline-none cursor-pointer"
                >
                  <option value="all">Todas las Cuentas</option>
                  {financialAccounts.map(a => (
                    <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
                  ))}
                </select>
              </div>

              {/* Categoría */}
              <div className="space-y-1">
                <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none">Categoría</label>
                <select
                  value={filterCategory}
                  onChange={e => { setFilterCategory(e.target.value); setCurrentPage(1); }}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-200 font-bold text-xs bg-slate-50 text-slate-700 focus:outline-none cursor-pointer"
                >
                  <option value="all">Todas las Categorías</option>
                  {categoriesList.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* U. Negocio / Centro Costo */}
              <div className="space-y-1">
                <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none">Unidad de Negocio</label>
                <select
                  value={filterCostCenterId}
                  onChange={e => { setFilterCostCenterId(e.target.value); setCurrentPage(1); }}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-200 font-bold text-xs bg-slate-50 text-slate-700 focus:outline-none cursor-pointer"
                >
                  <option value="all">Todas</option>
                  {costCenters.map(cc => (
                    <option key={cc.id} value={cc.id}>[{cc.code}] {cc.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3 bg-white border border-slate-200/60 shadow-sm rounded-2xl">
              <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
              <span className="text-xs font-black uppercase tracking-wider">Cargando Flujo de Caja...</span>
            </div>
          ) : filteredTransactions.length === 0 ? (
            <div className="bg-white p-12 text-center text-slate-400 font-bold text-xs rounded-2xl border border-slate-200/60 shadow-sm">
              No se encontraron movimientos financieros para los filtros y fechas seleccionados.
            </div>
          ) : (
            <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-400 font-black uppercase tracking-wider text-[9px]">
                      <th className="py-2 px-2">Fecha</th>
                      <th className="py-2 px-2 text-center">Tipo</th>
                      <th className="py-2 px-2">Categoría</th>
                      <th className="py-2 px-2">Subcategoría</th>
                      <th className="py-2 px-2">Concepto</th>
                      <th className="py-2 px-2 text-right">Monto</th>
                      <th className="py-2 px-2 text-right">Saldo</th>
                      <th className="py-2 px-2">Observaciones</th>
                      <th className="py-2 px-2">Caja / Cuenta</th>
                      <th className="py-2 px-2 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(() => {
                      let lastDate = "";
                      return paginatedTransactions.map(t => {
                        const isIngreso = t.type === 'ingreso';
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
                                <td colSpan={10} className="py-2.5 px-3">
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
                              <tr className="hover:bg-slate-50/50 transition-colors font-semibold text-slate-700">
                                <td className="py-2.5 px-2 text-slate-400">{currentDate}</td>
                                <td className="py-2.5 px-2 text-center">
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
                                <td className="py-2.5 px-2">
                                  <span className="bg-slate-100 border px-2 py-0.5 rounded text-[10px] text-slate-600 font-bold uppercase tracking-wide">
                                    {t.category}
                                  </span>
                                </td>
                                <td className="py-2.5 px-2 text-slate-500">{t.sub_category || "-"}</td>
                                <td className="py-2.5 px-2 text-slate-900 font-semibold max-w-[200px]">
                                  <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-1.5">
                                      <span className="truncate font-bold" title={t.concept || ""}>{t.concept || "-"}</span>
                                      {t.is_imported && (
                                        <span className="inline-flex items-center gap-0.5 text-blue-700 bg-blue-50 px-1 py-0.2 rounded text-[7px] font-black uppercase tracking-wider scale-90 select-none shrink-0" title="Importado desde planilla de cálculo">
                                          Planilla
                                        </span>
                                      )}
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
                                              type="button"
                                              onClick={() => {
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
                                              type="button"
                                              onClick={() => {
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
                                              type="button"
                                              onClick={() => {
                                                setReconcilingTx(t);
                                                setLinkOrderId("");
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
                                              type="button"
                                              onClick={() => {
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
                                  </div>
                                </td>
                                <td className={`py-2.5 px-2 text-right font-black ${isIngreso ? 'text-emerald-600' : 'text-rose-600'}`}>
                                  {t.currency === 'USD' ? `US$ ${t.amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : formatPrice(t.amount)}
                                </td>
                                <td className="py-2.5 px-2 text-right font-bold text-slate-700 font-mono">
                                  {t.running_balance !== undefined ? (t.currency === 'USD' ? `US$ ${t.running_balance.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : formatPrice(t.running_balance)) : '-'}
                                </td>
                                <td className="py-2.5 px-2 text-slate-400 max-w-[150px] truncate" title={t.notes || ""}>
                                  {t.notes || "-"}
                                </td>
                                <td className="py-2.5 px-2 text-slate-900 font-bold">
                                  {t.financial_accounts?.name || "Efectivo Caja Diaria"}
                                </td>
                                <td className="py-2.5 px-2 text-right">
                                  <div className="flex justify-end gap-1">
                                    <button
                                      onClick={() => {
                                        setEditingTx(t);
                                        setTxType(t.type);
                                        setTxAccountId(t.financial_account_id || "");
                                        setTxCategory(t.category);
                                        setTxSubCategory(t.sub_category || "");
                                        setTxAmount(t.amount.toString());
                                        setTxConcept(t.concept || "");
                                        setTxCostCenterId(t.cost_center_id || "");
                                        setTxNotes(t.notes || "");
                                        if (t.created_at) {
                                          setTxCreatedAt(t.created_at.split('T')[0]);
                                        } else {
                                          setTxCreatedAt("");
                                        }
                                        setTxRouteSheetId(t.route_sheet_id || "");
                                        setSelectedEmployeeId(t.employee_id || "");
                                        
                                        // Initialize link variables from existing client/supplier payments if editing
                                        if (t.category === 'Recaudación' && t.client_payments && t.client_payments.length > 0) {
                                          setLinkToOrder(true);
                                          setSelectedOrderId(t.client_payments[0].order_id || "");
                                        } else {
                                          setLinkToOrder(false);
                                          setSelectedOrderId("");
                                        }
                                        if (t.category === 'Proveedores' && t.supplier_payments && t.supplier_payments.length > 0) {
                                          setLinkToPurchase(true);
                                          setSelectedSupplierId(t.supplier_payments[0].suppliers?.id || "");
                                          setSelectedPurchaseId(t.supplier_payments[0].purchase_id || "");
                                        } else {
                                          setLinkToPurchase(false);
                                          setSelectedSupplierId("");
                                          setSelectedPurchaseId("");
                                        }

                                        setIsTxModalOpen(true);
                                      }}
                                      className="p-1 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors"
                                      title="Editar movimiento"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteTx(t.id, t.concept)}
                                      className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                      title="Eliminar movimiento"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>

              {/* Paginador */}
              {totalPages > 1 && (
                <div className="flex justify-between items-center pt-4 border-t border-slate-100 text-xs font-bold text-slate-500">
                  <div>
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
          
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider">Arqueo y Cajas</h2>
            <Button
              onClick={() => setIsTransferModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 font-black text-xs uppercase tracking-wider rounded-xl shadow-sm"
            >
              <ArrowRightLeft className="w-4 h-4 text-slate-400" /> Transferencia entre Cuentas
            </Button>
          </div>

          {/* Panel Superior: Arqueo Total del Sistema */}
          {(() => {
            const totals = { ars: 0, usd: 0 };
            financialAccounts.forEach(acc => {
              const bal = acc.balance || 0;
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
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none block">Arqueo Total del Sistema</span>
                  <div className="flex flex-col md:flex-row md:items-center gap-x-6 gap-y-1 mt-1">
                    <div className="text-2xl font-black text-emerald-600 font-mono tracking-tight">
                      {formatPrice(totals.ars)}
                    </div>
                    <div className="text-2xl font-black text-emerald-500 font-mono tracking-tight">
                      US$ {totals.usd.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
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
                    <th className="py-3 px-3 text-right">Arqueo Actual</th>
                    <th className="py-3 px-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                  {financialAccounts.map((acc, idx) => {
                    const balance = acc.balance || 0;
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
                            <span className="text-slate-900 font-bold">{acc.name}</span>
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
                        <td className="py-3.5 px-3 text-right">
                          <div className="flex justify-end items-center gap-2">
                            <button
                              onClick={() => {
                                setFilterAccountId(acc.id);
                                setActiveTab('flow');
                              }}
                              className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 border border-slate-200 rounded-lg transition-colors"
                              title="Ver Movimientos (Libro Diario)"
                            >
                              <FileText className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                setTfSourceId(acc.id);
                                setIsTransferModalOpen(true);
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

            {/* Cuentas Corrientes Proveedores */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm space-y-4">
              <div className="pb-2.5 border-b border-slate-100">
                <h3 className="font-black text-slate-800 text-xs uppercase tracking-wider">Saldos de Proveedores</h3>
                <p className="text-[10px] text-slate-400 font-bold">Resumen de deudas comerciales por compras a proveedores de insumos.</p>
              </div>

              {loading ? (
                <div className="py-12 text-center text-slate-400 text-xs font-bold">Cargando balances de proveedores...</div>
              ) : suppliersBalances.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs font-bold">No se encontraron proveedores con historial comercial.</div>
              ) : (
                <div className="overflow-y-auto max-h-[400px] divide-y divide-slate-100 pr-2">
                  {suppliersBalances.map(s => {
                    const hasArs = s.balance_ars !== 0;
                    const hasUsd = s.balance_usd !== 0;
                    return (
                      <div key={s.id} className="py-3 flex justify-between items-center text-xs">
                        <div className="font-bold text-slate-900">{s.name}</div>
                        <div className="text-right space-y-1 font-mono">
                          {hasArs && (
                            <div className={s.balance_ars > 0 ? 'text-rose-600 font-black' : 'text-emerald-600 font-black'}>
                              {s.balance_ars > 0 ? 'Debemos: ' : 'A favor: '}{formatPrice(Math.abs(s.balance_ars))}
                            </div>
                          )}
                          {hasUsd && (
                            <div className={s.balance_usd > 0 ? 'text-rose-600 font-black' : 'text-emerald-600 font-black'}>
                              {s.balance_usd > 0 ? 'Debemos: ' : 'A favor: '}US$ {Math.abs(s.balance_usd).toLocaleString('es-AR')}
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

          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 1: REGISTRAR MOVIMIENTO MANUAL
          ========================================================================= */}
      {isTxModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-[2rem] border border-slate-100 p-6 shadow-2xl w-full max-w-xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center pb-2.5 border-b border-slate-100">
              <h3 className="font-black text-slate-900 text-sm uppercase tracking-wider flex items-center gap-1.5">
                <PlusCircle className="w-4 h-4 text-brand-600" /> {editingTx ? "Editar Movimiento Manual" : "Registrar Movimiento Manual"}
              </h3>
              <button onClick={() => { setIsTxModalOpen(false); setEditingTx(null); }} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRegisterTx} className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTxType('egreso')}
                  className={`py-2 text-[10px] font-black rounded-xl border uppercase tracking-wider transition-all ${
                    txType === 'egreso' 
                      ? 'bg-rose-50 border-rose-200 text-rose-700 shadow-sm' 
                      : 'border-slate-100 text-slate-400 hover:bg-slate-50'
                  }`}
                >
                  Egreso (Salida)
                </button>
                <button
                  type="button"
                  onClick={() => setTxType('ingreso')}
                  className={`py-2 text-[10px] font-black rounded-xl border uppercase tracking-wider transition-all ${
                    txType === 'ingreso' 
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700 shadow-sm' 
                      : 'border-slate-100 text-slate-400 hover:bg-slate-50'
                  }`}
                >
                  Ingreso (Entrada)
                </button>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-400">Cuenta de Fondos *</label>
                <select
                  value={txAccountId}
                  onChange={e => setTxAccountId(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-bold text-xs outline-none focus:border-brand-500"
                >
                  {financialAccounts.map(a => (
                    <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400">Categoría *</label>
                  <select
                    value={txCategory}
                    onChange={e => setTxCategory(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-bold text-xs outline-none focus:border-brand-500"
                  >
                    <option value="Gastos Operativos">Gastos Operativos</option>
                    <option value="Recaudación">Recaudación</option>
                    <option value="Impuestos">Impuestos</option>
                    <option value="Insumo de Producto">Insumo de Producto</option>
                    <option value="IIGG">IIGG</option>
                    <option value="Deuda bancaria">Deuda bancaria</option>
                    <option value="Publicidad">Publicidad</option>
                    <option value="Servicio de Flete">Servicio de Flete</option>
                    <option value="Servicio de Limpieza">Servicio de Limpieza</option>
                    <option value="Peajes">Peajes</option>
                    <option value="Proveedores">Proveedores</option>
                    <option value="Sueldos">Sueldos</option>
                    <option value="Comisiones Bancarias">Comisiones Bancarias</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400">Hoja de Ruta (Opcional)</label>
                  <select
                    value={txRouteSheetId}
                    onChange={e => {
                      setTxRouteSheetId(e.target.value);
                      const sheet = routeSheets.find(s => s.id === e.target.value);
                      if (sheet) {
                        const carrierName = sheet.carriers?.name || "Chofer";
                        const dateStr = formatDateDDMMYYYY(sheet.delivery_date);
                        if (!txConcept || txConcept === "Gastos Operativos" || txConcept === "Flete") {
                          setTxConcept(`Flete HR ${sheet.code || sheet.run_number} - ${carrierName} (${dateStr})`);
                        }
                      }
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-bold text-xs outline-none focus:border-brand-500"
                  >
                    <option value="">-- Sin Hoja de Ruta --</option>
                    {routeSheets.map(s => {
                      const dateStr = formatDateDDMMYYYY(s.delivery_date);
                      return (
                        <option key={s.id} value={s.id}>
                          {s.code || `HR #${s.run_number}`} - {s.carriers?.name || 'S/D'} ({dateStr})
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              {/* Campos condicionales para vinculación de Proveedores / Sueldos / Ventas */}
              {txCategory === "Proveedores" && (
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-3.5 animate-in fade-in duration-200">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-slate-400">Proveedor *</label>
                    <select
                      value={selectedSupplierId}
                      onChange={e => {
                        setSelectedSupplierId(e.target.value);
                        setSelectedPurchaseId("");
                      }}
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-bold text-xs outline-none focus:border-brand-500"
                    >
                      <option value="">-- Seleccionar Proveedor --</option>
                      {suppliers.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  {selectedSupplierId && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="linkToPurchase"
                          checked={linkToPurchase}
                          onChange={e => setLinkToPurchase(e.target.checked)}
                          className="w-4 h-4 text-brand-600 rounded border-slate-300 focus:ring-brand-500/10 cursor-pointer"
                        />
                        <label htmlFor="linkToPurchase" className="text-[10px] font-black uppercase text-slate-500 cursor-pointer select-none">
                          Vincular a Compra por Pagar
                        </label>
                      </div>
                      {linkToPurchase && (
                        <div className="space-y-1 animate-in slide-in-from-top-1 duration-150">
                          <label className="text-[9px] font-black uppercase text-slate-400">Compra Pendiente *</label>
                          <select
                            value={selectedPurchaseId}
                            onChange={e => {
                              setSelectedPurchaseId(e.target.value);
                              const pur = pendingPurchases.find(p => p.id === e.target.value);
                              if (pur) {
                                const pendingAmt = Number(pur.total_amount) - Number(pur.paid_amount);
                                setTxAmount(pendingAmt.toString());
                                setTxConcept(`Pago Compra Fac ${pur.invoice_number}`);
                              }
                            }}
                            required={linkToPurchase}
                            className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-bold text-xs outline-none focus:border-brand-500"
                          >
                            <option value="">-- Seleccionar Compra --</option>
                            {pendingPurchases
                              .filter(p => p.supplier_id === selectedSupplierId)
                              .map(p => {
                                const pendingAmt = Number(p.total_amount) - Number(p.paid_amount);
                                return (
                                  <option key={p.id} value={p.id}>
                                    Factura {p.invoice_number} (Total: {formatPrice(p.total_amount)} - Resta: {formatPrice(pendingAmt)})
                                  </option>
                                );
                              })}
                          </select>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {txCategory === "Sueldos" && (
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-1 animate-in fade-in duration-200">
                  <label className="text-[9px] font-black uppercase text-slate-400">Empleado *</label>
                  <select
                    value={selectedEmployeeId}
                    onChange={e => {
                      setSelectedEmployeeId(e.target.value);
                      const emp = employees.find(x => x.id === e.target.value);
                      if (emp) {
                        setTxAmount(emp.base_salary.toString());
                        setTxConcept(`Liquidación de Sueldo - ${emp.full_name}`);
                      }
                    }}
                    required={txCategory === "Sueldos"}
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-bold text-xs outline-none focus:border-brand-500"
                  >
                    <option value="">-- Seleccionar Empleado --</option>
                    {employees.map(e => (
                      <option key={e.id} value={e.id}>{e.full_name} ({e.role || 'Sin Rol'})</option>
                    ))}
                  </select>
                </div>
              )}

              {txCategory === "Recaudación" && txType === "ingreso" && (
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-2.5 animate-in fade-in duration-200">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="linkToOrder"
                      checked={linkToOrder}
                      onChange={e => setLinkToOrder(e.target.checked)}
                      className="w-4 h-4 text-brand-600 rounded border-slate-300 focus:ring-brand-500/10 cursor-pointer"
                    />
                    <label htmlFor="linkToOrder" className="text-[10px] font-black uppercase text-slate-500 cursor-pointer select-none">
                      Vincular a Venta por Cobrar
                    </label>
                  </div>
                  {linkToOrder && (
                    <div className="space-y-1 animate-in slide-in-from-top-1 duration-150">
                      <label className="text-[9px] font-black uppercase text-slate-400">Venta Pendiente *</label>
                      <select
                        value={selectedOrderId}
                        onChange={e => {
                          setSelectedOrderId(e.target.value);
                          const ord = pendingOrders.find(o => o.id === e.target.value);
                          if (ord) {
                            const pendingAmt = Number(ord.totals?.pending_balance) || Number(ord.total_amount);
                            setTxAmount(pendingAmt.toString());
                            setTxConcept(`Cobro Venta ${ord.legacy_code || ord.id.substring(0, 8)} - ${ord.customer_name}`);
                          }
                        }}
                        required={linkToOrder}
                        className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-bold text-xs outline-none focus:border-brand-500"
                      >
                        <option value="">-- Seleccionar Venta --</option>
                        {pendingOrders.map(o => {
                          const pendingAmt = Number(o.totals?.pending_balance) || Number(o.total_amount);
                          return (
                            <option key={o.id} value={o.id}>
                              {o.legacy_code || o.id.substring(0, 8)} - {o.customer_name} (Total: {formatPrice(o.total_amount)} - Resta: {formatPrice(pendingAmt)})
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400">Monto *</label>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="any"
                    placeholder="0.00"
                    value={txAmount}
                    onChange={e => setTxAmount(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-bold text-xs outline-none focus:border-brand-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400">Unidad de Negocio *</label>
                  <select
                    value={txCostCenterId}
                    onChange={e => setTxCostCenterId(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-bold text-xs outline-none focus:border-brand-500"
                  >
                    {costCenters.map(cc => (
                      <option key={cc.id} value={cc.id}>[{cc.code}] {cc.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-400">Concepto / Detalle *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Pago de impuestos sobre débitos y créditos"
                  value={txConcept}
                  onChange={e => setTxConcept(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-bold text-xs outline-none focus:border-brand-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-400">Fecha del Movimiento *</label>
                <input
                  type="date"
                  required
                  value={txCreatedAt}
                  onChange={e => setTxCreatedAt(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-bold text-xs outline-none focus:border-brand-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-400">Observaciones</label>
                <textarea
                  placeholder="Comentarios adicionales..."
                  rows={2}
                  value={txNotes}
                  onChange={e => setTxNotes(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-bold text-xs outline-none focus:border-brand-500 resize-none"
                />
              </div>

              <Button
                type="submit"
                disabled={submittingTx}
                className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md flex items-center justify-center gap-1.5"
              >
                {submittingTx ? <Loader2 className="w-4 h-4 animate-spin" /> : (editingTx ? "Guardar Cambios" : "Registrar Movimiento")}
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2: TRANSFERENCIA ENTRE CUENTAS
          ========================================================================= */}
      {isTransferModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-[2rem] border border-slate-100 p-6 shadow-2xl w-full max-w-xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center pb-2.5 border-b border-slate-100">
              <h3 className="font-black text-slate-900 text-sm uppercase tracking-wider flex items-center gap-1.5">
                <ArrowRightLeft className="w-4 h-4 text-brand-600" /> Registrar Transferencia Interna
              </h3>
              <button onClick={() => setIsTransferModalOpen(false)} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRegisterTransfer} className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400">Cuenta de Origen (Sale) *</label>
                  <select
                    value={tfSourceId}
                    onChange={e => setTfSourceId(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-bold text-xs outline-none focus:border-brand-500"
                  >
                    {financialAccounts.map(a => (
                      <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400">Cuenta de Destino (Entra) *</label>
                  <select
                    value={tfDestId}
                    onChange={e => setTfDestId(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-bold text-xs outline-none focus:border-brand-500"
                  >
                    {financialAccounts.map(a => (
                      <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-400">Monto a Transferir *</label>
                <input
                  type="number"
                  required
                  min="0.01"
                  step="any"
                  placeholder="0.00"
                  value={tfAmount}
                  onChange={e => setTfAmount(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-bold text-xs outline-none focus:border-brand-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-400">Concepto de Transferencia *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Fondeo de cuenta de MercadoPago para publicidad"
                  value={tfConcept}
                  onChange={e => setTfConcept(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-bold text-xs outline-none focus:border-brand-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-400">Observaciones</label>
                <textarea
                  placeholder="Comentarios adicionales..."
                  rows={2}
                  value={tfNotes}
                  onChange={e => setTfNotes(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-bold text-xs outline-none focus:border-brand-500 resize-none"
                />
              </div>

              <Button
                type="submit"
                disabled={submittingTransfer}
                className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md flex items-center justify-center gap-1.5"
              >
                {submittingTransfer ? <Loader2 className="w-4 h-4 animate-spin" /> : "Ejecutar Transferencia"}
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 4: COMPROBANTES A VALIDAR
          ========================================================================= */}
      {activeTab === 'validations' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="bg-white rounded-[2rem] border border-slate-100 p-6 shadow-xl space-y-4">
            <div>
              <h3 className="text-base font-black text-slate-800 uppercase tracking-wider">
                Comprobantes de Pago Pendientes de Validación
              </h3>
              <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                Aquí se listan los pedidos que fueron cargados con comprobantes de transferencia o pago electrónico. Corrobore la acreditación de los fondos en sus cuentas y valide el cobro.
              </p>
            </div>

            {validationOrders.length === 0 ? (
              <div className="text-center py-12 border border-dashed rounded-3xl text-slate-400 text-xs font-black">
                No hay comprobantes pendientes de validación ✓
              </div>
            ) : (
              <div className="border border-slate-100 rounded-3xl overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-[9px] font-black uppercase tracking-wider text-slate-400">
                      <th className="py-3 px-4">Fecha</th>
                      <th className="py-3 px-4">Pedido</th>
                      <th className="py-3 px-4">Cliente</th>
                      <th className="py-3 px-4">Medio de Pago</th>
                      <th className="py-3 px-4 text-right">Total Pedido</th>
                      <th className="py-3 px-4 text-right">Monto Declarado</th>
                      <th className="py-3 px-4 text-center">Comprobante</th>
                      <th className="py-3 px-4 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
                    {validationOrders.map(o => {
                      const depositAmount = o.totals?.deposit_amount || o.total_amount;
                      const receiptUrl = o.totals?.deposit_receipt_url;
                      return (
                        <tr key={o.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-3 px-4 text-slate-400">{formatDateDDMMYYYY(o.order_date)}</td>
                          <td className="py-3 px-4 font-mono text-slate-900">{o.legacy_code || o.id.substring(0, 8)}</td>
                          <td className="py-3 px-4 text-slate-900">{o.customer_name}</td>
                          <td className="py-3 px-4">
                            <span className="bg-slate-100 px-2 py-0.5 rounded text-[10px] text-slate-600 font-bold uppercase tracking-wide">
                              {o.payment_methods?.name || 'S/D'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">{formatPrice(o.total_amount)}</td>
                          <td className="py-3 px-4 text-right text-brand-600 font-extrabold">{formatPrice(depositAmount)}</td>
                          <td className="py-3 px-4 text-center">
                            {receiptUrl ? (
                              <a
                                href={receiptUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-brand-50 border border-brand-100 text-brand-700 hover:bg-brand-100 rounded-lg text-[10px] font-black transition-colors"
                              >
                                <FileText className="w-3 h-3" /> Ver Adjunto
                              </a>
                            ) : (
                              <span className="text-slate-400 font-medium text-[10px]">Sin archivo</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <Button
                              onClick={() => {
                                setSelectedValidationOrder(o);
                                setValAmount(depositAmount.toString());
                                setValConcept(`Validación Cobro - Pedido ${o.legacy_code || o.id.substring(0, 8)}`);
                                if (financialAccounts.length > 0) {
                                  const digitalAcc = financialAccounts.find(a => a.type !== 'efectivo' && a.currency === 'ARS') || financialAccounts[0];
                                  setValAccountId(digitalAcc.id);
                                }
                                setIsValidationModalOpen(true);
                              }}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] uppercase tracking-wider rounded-xl shadow-sm"
                            >
                              Aprobar
                            </Button>
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
      )}

      {/* =========================================================================
          MODAL 3: VINCULAR TRANSACCIÓN (Cobro/Pago/Sueldo no asociado)
          ========================================================================= */}
      {isLinkModalOpen && reconcilingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-[2rem] border border-slate-100 p-6 shadow-2xl w-full max-w-md space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center pb-2.5 border-b border-slate-100">
              <h3 className="font-black text-slate-900 text-sm uppercase tracking-wider flex items-center gap-1.5">
                <Coins className="w-4 h-4 text-brand-600" /> Vincular Movimiento Financiero
              </h3>
              <button onClick={() => { setIsLinkModalOpen(false); setReconcilingTx(null); }} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold uppercase text-[9px]">Concepto:</span>
                <span className="font-black text-slate-800 truncate max-w-[200px]">{reconcilingTx.concept}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold uppercase text-[9px]">Monto:</span>
                <span className="font-black text-slate-800">
                  {reconcilingTx.currency === 'USD' ? `US$ ${reconcilingTx.amount}` : formatPrice(reconcilingTx.amount)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold uppercase text-[9px]">Categoría:</span>
                <span className="font-black text-slate-800">{reconcilingTx.category}</span>
              </div>
            </div>

            <form onSubmit={handleSaveLink} className="space-y-4">
              {reconcilingTx.type === 'ingreso' ? (
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400">Venta Pendiente *</label>
                  <select
                    value={linkOrderId}
                    onChange={e => {
                      setLinkOrderId(e.target.value);
                      const ord = pendingOrders.find(o => o.id === e.target.value);
                      if (ord) {
                        const pendingAmt = Number(ord.totals?.pending_balance) || Number(ord.total_amount);
                        setLinkAmount(Math.min(pendingAmt, reconcilingTx.amount).toString());
                      }
                    }}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-bold text-xs outline-none focus:border-brand-500"
                  >
                    <option value="">-- Seleccionar Venta --</option>
                    {pendingOrders.map(o => {
                      const pendingAmt = Number(o.totals?.pending_balance) || Number(o.total_amount);
                      return (
                        <option key={o.id} value={o.id}>
                          {o.legacy_code || o.id.substring(0, 8)} - {o.customer_name} (Resta: {formatPrice(pendingAmt)})
                        </option>
                      );
                    })}
                  </select>
                </div>
              ) : reconcilingTx.category === 'Proveedores' ? (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-slate-400">Proveedor *</label>
                    <select
                      value={linkSupplierId}
                      onChange={e => {
                        setLinkSupplierId(e.target.value);
                        setLinkPurchaseId("");
                      }}
                      required
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-bold text-xs outline-none focus:border-brand-500"
                    >
                      <option value="">-- Seleccionar Proveedor --</option>
                      {suppliers.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  {linkSupplierId && (
                    <div className="space-y-1 animate-in fade-in duration-200">
                      <label className="text-[9px] font-black uppercase text-slate-400">Compra Pendiente *</label>
                      <select
                        value={linkPurchaseId}
                        onChange={e => {
                          setLinkPurchaseId(e.target.value);
                          const pur = pendingPurchases.find(p => p.id === e.target.value);
                          if (pur) {
                            const pendingAmt = Number(pur.total_amount) - Number(pur.paid_amount);
                            setLinkAmount(Math.min(pendingAmt, reconcilingTx.amount).toString());
                          }
                        }}
                        required
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-bold text-xs outline-none focus:border-brand-500"
                      >
                        <option value="">-- Seleccionar Compra --</option>
                        {pendingPurchases
                          .filter(p => p.supplier_id === linkSupplierId)
                          .map(p => {
                            const pendingAmt = Number(p.total_amount) - Number(p.paid_amount);
                            return (
                              <option key={p.id} value={p.id}>
                                Factura {p.invoice_number} (Resta: {formatPrice(pendingAmt)})
                              </option>
                            );
                          })}
                      </select>
                    </div>
                  )}
                </div>
              ) : reconcilingTx.category === 'Sueldos' ? (
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400">Empleado *</label>
                  <select
                    value={linkEmployeeId}
                    onChange={e => setLinkEmployeeId(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-bold text-xs outline-none focus:border-brand-500"
                  >
                    <option value="">-- Seleccionar Empleado --</option>
                    {employees.map(e => (
                      <option key={e.id} value={e.id}>{e.full_name}</option>
                    ))}
                  </select>
                </div>
              ) : reconcilingTx.category === 'Peajes' || reconcilingTx.category === 'Servicio de Flete' ? (
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400">Hoja de Ruta *</label>
                  <select
                    value={linkRouteSheetId}
                    onChange={e => setLinkRouteSheetId(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-bold text-xs outline-none focus:border-brand-500"
                  >
                    <option value="">-- Seleccionar Hoja de Ruta --</option>
                    {routeSheets.map(s => {
                      const dateStr = formatDateDDMMYYYY(s.delivery_date);
                      return (
                        <option key={s.id} value={s.id}>
                          {s.code || `HR #${s.run_number}`} - {s.carriers?.name || 'S/D'} ({dateStr})
                        </option>
                      );
                    })}
                  </select>
                </div>
              ) : null}

              {(reconcilingTx.type === 'ingreso' || reconcilingTx.category === 'Proveedores') && (
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400">Monto a Asignar *</label>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="any"
                    max={reconcilingTx.amount}
                    value={linkAmount}
                    onChange={e => setLinkAmount(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-bold text-xs outline-none focus:border-brand-500"
                  />
                </div>
              )}

              <Button
                type="submit"
                disabled={submittingLink}
                className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md flex items-center justify-center gap-1.5"
              >
                {submittingLink ? <Loader2 className="w-4 h-4 animate-spin" /> : "Vincular Movimiento"}
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 4: APROBACIÓN DE COMPROBANTE (VALIDACIÓN)
          ========================================================================= */}
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
                <select
                  value={valAccountId}
                  onChange={e => setValAccountId(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-bold text-xs outline-none focus:border-brand-500"
                >
                  {financialAccounts.map(a => (
                    <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
                  ))}
                </select>
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
      
      {isSyncing && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl flex flex-col items-center text-center space-y-4 border border-slate-100">
            <div className="w-16 h-16 rounded-2xl bg-brand-50 flex items-center justify-center text-brand-600 animate-bounce">
              <RefreshCw className="w-8 h-8 animate-spin" />
            </div>
            <h3 className="font-black text-lg text-slate-800 uppercase tracking-wide">Sincronizando</h3>
            <p className="text-slate-500 text-xs font-semibold leading-relaxed">
              Estamos conectando con las planillas de Google Sheets y actualizando la base de datos de forma segura.
            </p>
            <div className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-2.5 w-full">
              <span className="text-brand-600 font-bold text-xs animate-pulse">
                {syncProgress}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
