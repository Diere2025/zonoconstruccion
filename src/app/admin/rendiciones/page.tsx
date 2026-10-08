"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle, Archive, ArrowLeft, Banknote, Calendar, Check, CheckCircle2, ChevronDown, ChevronRight, ChevronUp, CircleDollarSign,
  ClipboardCopy, CreditCard, FileSpreadsheet, Loader2, Plus, Receipt, RefreshCw, Save, Search, Trash2, Truck, Wallet, X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { createAuthenticatedRequester } from "@/lib/authenticatedRequest";
import { formatPrice } from "@/lib/utils";
import { isExcludedDeliveryStatus, isExcludedSettlementTicket, settlementElectronicTicketTotals, settlementOrderAmount, settlementOrdersTotal } from "@/lib/settlementOrders";
import {
  buildSettlementMessage, buildTreasuryMovementRows, CASH_DENOMINATIONS,
  getSettlementHealth, treasuryMovementRowsToTsv,
} from "@/lib/treasurySettlements";

const DEFAULT_CHANGE_FUND = 30000;
const deliveryStatusOptions = ["En recorrido", "No entregado", "Entregado", "Postergado", "Anulado", "Cancelado"];
const deliveryStatusChoice = (status: string) => {
  const normalized = status.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/_/g, " ").toLowerCase();
  if (normalized.includes("entregando") || normalized.includes("en recorrido")) return "En recorrido";
  if (normalized.includes("fallido")) return "No entregado";
  return deliveryStatusOptions.find(option => normalized.includes(option.toLowerCase())) || "Entregado";
};

type SettlementStatus = "draft" | "confirmed" | "archived";
interface SettlementRecord {
  id: string;
  code: string;
  status: SettlementStatus;
  movements_generated_at?: string | null;
  settlement_date: string;
  carrier_name: string;
  carrier_id?: string | null;
  route_detail?: string | null;
  source: "manual" | "spreadsheet" | "route";
  count_date?: string | null;
  change_fund: number;
  shortage_recovered: number;
  deliveries_total: number;
  electronic_total: number;
  tolls_total: number;
  extraordinary_total: number;
  expected_cash: number;
  counted_cash: number;
  difference: number;
  whatsapp_message?: string | null;
  notes?: string | null;
  confirmed_at?: string | null;
  archive_reason?: string | null;
  archived_at?: string | null;
  archived_by?: string | null;
}
interface Carrier {
  id: string;
  name: string;
  vehicle_description?: string | null;
}
interface ExpenseRow {
  localId: string;
  type: "toll" | "extraordinary";
  amount: number;
  reference: string;
  notes: string;
}
interface ElectronicTicketRow {
  localId: string;
  amount: number;
  reference: string;
  paymentType: string;
  orderId?: string | null;
  orderCode?: string | null;
  mpPaymentId?: string | null;
  notes?: string | null;
}
export interface LinkedPaymentInfo {
  id: string;
  amount: number;
  payerName: string;
  paymentType: string;
  receivedAt: string;
  linkedBy: string;
  accountName: string;
  isVerified?: boolean;
  notes?: string;
}
export interface RouteOrderDetail {
  deliveryId: string;
  orderId: string | null;
  orderCode: string;
  customerName: string;
  address: string;
  locality?: string;
  stopOrder: number;
  totalAmount: number;
  paymentStatus?: string;
  deliveryStatus?: string;
  isPreviouslyPaid?: boolean;
  previouslyPaidAmount?: number;
  toCollectAmount?: number;
  linkedPayments: LinkedPaymentInfo[];
  priorPaymentReceipts?: Array<{ id: string; amount: number; receiptUrl: string; reference: string }>;
  totalLinkedAmount: number;
}
interface DetailPayload {
  settlement: SettlementRecord;
  expenses: Array<{ id: string; expense_type: "toll" | "extraordinary"; amount: number; reference?: string | null; notes?: string | null }>;
  cashCounts: Array<{ money_kind: "bill" | "coin"; denomination: number; quantity: number }>;
  electronicTickets?: Array<{
    id: string;
    amount: number;
    reference?: string | null;
    payment_type?: string | null;
    order_id?: string | null;
    order_code?: string | null;
    mp_payment_id?: string | null;
    notes?: string | null;
    sort_order?: number;
  }>;
  routeOrders?: RouteOrderDetail[];
  financialAccounts?: Array<{ id: string; name: string; type: string; currency: string; is_active?: boolean }>;
  existingMovements?: Array<{ id: string; type: string; amount: number; concept: string; category?: string; created_at?: string; financial_account_id?: string }>;
}

interface EntregandoOrder {
  orderCode: string;
  stopOrder: number;
  totalAmount: number;
  toCollectAmount?: number;
  paidAmount?: number;
  paymentState?: string;
  deliveryStatus?: string;
  isPreviouslyPaid?: boolean;
  customerName: string;
  address: string;
  paymentType: string;
}

interface EntregandoPreviewItem {
  key: string;
  source?: "entregando" | "entregados";
  carrierName: string;
  deliveryDate: string;
  dateDisplay: string;
  runNumber: number;
  routeNumberStr: string;
  routeDetail: string;
  zone: string;
  vehicle: string;
  companion: string;
  driverHours: string;
  totalAmount: number;
  carrierId: string | null;
  matchedCarrierName: string;
  matchedVehicle: string;
  existingSettlementId: string | null;
  existingSettlementCode: string | null;
  existingStatus: string | null;
  existingRouteSheetId?: string | null;
  matchingIssue?: string | null;
  orders: EntregandoOrder[];
  changeFund?: number;
}

const emptyStats = { pending: 0, drafts: 0, differences: 0, confirmed: 0 };
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
const defaultDeliveredDate = () => {
  const date = new Date(`${today()}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() === 1 ? 2 : 1));
  return date.toISOString().slice(0, 10);
};
const defaultDeliveredDateHint = () => new Date(`${today()}T12:00:00Z`).getUTCDay() === 1 ? "Sábado" : "Ayer";
const inputNumber = (value: string) => {
  const parsed = Number(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};
const safeReceiptUrl = (value: string) => /^https?:\/\//i.test(value) || /^\/(?!\/)/.test(value) ? value : null;
const displayDate = (value?: string | null) => {
  const match = String(value || "").slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "-";
};
const dateHeading = (value: string) => {
  const match = value.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value || "Sin fecha";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
};
const parseDisplayDate = (value: string) => {
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (parsed.getUTCFullYear() !== Number(year) || parsed.getUTCMonth() !== Number(month) - 1 || parsed.getUTCDate() !== Number(day)) return null;
  return `${year}-${month}-${day}`;
};
const cashKey = (kind: string, denomination: number) => `${kind}-${denomination}`;
const isPending = (row: SettlementRecord) => row.status === "draft" && !row.movements_generated_at && !row.count_date && Number(row.counted_cash || 0) === 0;
const statusLabel = (row: SettlementRecord) => row.status === "archived" ? "Archivada" : row.movements_generated_at ? "Movimientos generados" : row.status === "confirmed" ? "Confirmada" : isPending(row) ? "Pendiente" : "En preparación";
const statusClasses = (row: SettlementRecord) => row.status === "archived" ? "bg-slate-100 text-slate-600 border-slate-300" : row.status === "confirmed"
  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
  : isPending(row) ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-blue-50 text-blue-700 border-blue-200";

export default function RendicionesPage() {
  return <React.Suspense fallback={<div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-blue-600" /></div>}><RendicionesContent /></React.Suspense>;
}

function RendicionesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const settlementIdFromPath = searchParams.get("rendicion");
  const [rows, setRows] = useState<SettlementRecord[]>([]);
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [stats, setStats] = useState(emptyStats);
  const [canImportMonth, setCanImportMonth] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [filter, setFilter] = useState<"pending" | "draft" | "confirmed" | "all" | "archived">("all");
  const [lifecycleAction, setLifecycleAction] = useState<"archive" | "delete-archived" | null>(null);
  const [lifecycleTarget, setLifecycleTarget] = useState<SettlementRecord | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [lifecycleError, setLifecycleError] = useState("");
  const [detail, setDetail] = useState<DetailPayload | null>(null);
  const [detailLoading, setDetailLoading] = useState(Boolean(settlementIdFromPath));
  const detailRequest = useRef(0);
  const [linkCopied, setLinkCopied] = useState(false);
  const [saving, setSaving] = useState<"save" | "confirm" | null>(null);
  const [importing, setImporting] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ code: "", settlementDate: today(), carrierId: "", routeDetail: "" });

  const [entregandoModalOpen, setEntregandoModalOpen] = useState(false);
  const [previewSource, setPreviewSource] = useState<"entregando" | "entregados">("entregando");
  const [deliveredDate, setDeliveredDate] = useState(defaultDeliveredDate);
  const [deliveredDateIsDefault, setDeliveredDateIsDefault] = useState(true);
  const [deliveredDateHint, setDeliveredDateHint] = useState(defaultDeliveredDateHint);
  const [entregandoLoading, setEntregandoLoading] = useState(false);
  const [entregandoConfirming, setEntregandoConfirming] = useState(false);
  const [entregandoPreview, setEntregandoPreview] = useState<EntregandoPreviewItem[]>([]);
  const [selectedEntregandoKeys, setSelectedEntregandoKeys] = useState<Record<string, boolean>>({});
  const [expandedEntregandoKey, setExpandedEntregandoKey] = useState<string | null>(null);
  const [updatingOrderStatus, setUpdatingOrderStatus] = useState<string | null>(null);

  const [settlementDate, setSettlementDate] = useState("");
  const [code, setCode] = useState("");
  const [carrierName, setCarrierName] = useState("");
  const [carrierId, setCarrierId] = useState("");
  const [routeDetail, setRouteDetail] = useState("");
  const [deliveriesTotal, setDeliveriesTotal] = useState(0);
  const [electronicTotal, setElectronicTotal] = useState(0);
  const [electronicTickets, setElectronicTickets] = useState<ElectronicTicketRow[]>([]);
  const [changeFund, setChangeFund] = useState(0);
  const [shortageRecovered, setShortageRecovered] = useState(0);
  const [countDate, setCountDate] = useState("");
  const [countedCashManual, setCountedCashManual] = useState(0);
  const [cashQuantities, setCashQuantities] = useState<Record<string, number>>({});
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [notes, setNotes] = useState("");
  const [copied, setCopied] = useState(false);
  const [movementCopied, setMovementCopied] = useState(false);
  const [modifiedDeliveryStatuses, setModifiedDeliveryStatuses] = useState<Record<string, string>>({});
  const [routeOrders, setRouteOrders] = useState<RouteOrderDetail[]>([]);

  const [cashModalOpen, setCashModalOpen] = useState(false);
  const [expensesModalOpen, setExpensesModalOpen] = useState(false);
  const [ticketsModalOpen, setTicketsModalOpen] = useState(false);
  const [viewingPayment, setViewingPayment] = useState<(LinkedPaymentInfo & { orderCode: string }) | null>(null);
  const [assignModalOrder, setAssignModalOrder] = useState<RouteOrderDetail | null>(null);
  const [assignForm, setAssignForm] = useState({
    amount: 0,
    paymentType: "POINT",
    reference: "",
    notes: "",
  });

  const [financialAccounts, setFinancialAccounts] = useState<Array<{ id: string; name: string; type: string; currency: string }>>([]);
  const [generationMode, setGenerationMode] = useState<"replace" | "duplicate" | "">("");
  const [existingMovements, setExistingMovements] = useState<Array<any>>([]);
  const [movementsModalOpen, setMovementsModalOpen] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [movementDateInput, setMovementDateInput] = useState("");
  const [customMovements, setCustomMovements] = useState<Array<{ detail: string; concept: string; type: "Ingreso" | "Gasto"; amount: number; category: string; sub_category: string }>>([]);
  const [generatingMovements, setGeneratingMovements] = useState(false);

  const authenticatedFetch = useMemo(() => createAuthenticatedRequester(supabase), []);
  const listScope = filter === "archived" ? "archived" : "active";

  const loadList = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await authenticatedFetch(`/api/admin/rendiciones?action=list${listScope === "archived" ? "&scope=archived" : ""}`);
      setRows(payload.rows || []);
      setStats(payload.stats || emptyStats);
      setCanImportMonth(payload.canImportMonth === true);
    } catch (requestError) {
      setCanImportMonth(false);
      setError(requestError instanceof Error ? requestError.message : "No se pudieron cargar las rendiciones.");
    } finally {
      setLoading(false);
    }
  }, [authenticatedFetch, listScope]);

  useEffect(() => { if (!settlementIdFromPath) void loadList(); }, [loadList, settlementIdFromPath]);

  const loadCarriers = useCallback(async () => {
    try {
      const payload = await authenticatedFetch("/api/admin/rendiciones?action=carriers");
      setCarriers(payload.carriers || []);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudieron cargar los transportistas.");
    }
  }, [authenticatedFetch]);

  useEffect(() => { void loadCarriers(); }, [loadCarriers]);

  const loadFinancialAccounts = useCallback(async () => {
    try {
      const payload = await authenticatedFetch("/api/admin/rendiciones?action=financial-accounts");
      const accs = payload.accounts || [];
      if (accs.length > 0) {
        setFinancialAccounts(accs);
        const defaultAcc = accs.find((a: any) =>
          a.name.toLowerCase().includes("efectivo pesos") || a.name.toLowerCase() === "caja efectivo pesos"
        ) || accs.find((a: any) => a.type === "efectivo") || accs[0];
        if (defaultAcc) {
          setSelectedAccountId(defaultAcc.id);
        }
      }
      return accs;
    } catch (requestError) {
      console.warn("No se pudieron cargar las cuentas financieras:", requestError);
      return [];
    }
  }, [authenticatedFetch]);

  // The detail payload includes accounts; load them separately only when needed.

  const hydrateDetail = useCallback((payload: DetailPayload) => {
    const settlement = payload.settlement;
    setDetail(payload);
    setSettlementDate(settlement.settlement_date || "");
    setCode(settlement.code || "");
    const currentCarrierName = settlement.carrier_name || "";
    let currentCarrierId = settlement.carrier_id || "";
    if (!currentCarrierId && currentCarrierName && carriers.length > 0) {
      const norm = currentCarrierName.toLowerCase().replace(/[^a-z0-9]/g, "");
      const match = carriers.find(c => {
        const cn = c.name.toLowerCase().replace(/[^a-z0-9]/g, "");
        return cn === norm || cn.includes(norm) || norm.includes(cn);
      });
      if (match) currentCarrierId = match.id;
    }
    setCarrierName(currentCarrierName);
    setCarrierId(currentCarrierId);
    setRouteDetail(settlement.route_detail || "");
    setDeliveriesTotal(Number(settlement.deliveries_total) || 0);
    setElectronicTotal(Number(settlement.electronic_total) || 0);
    setChangeFund(Number(settlement.change_fund) || 0);
    setShortageRecovered(Number(settlement.shortage_recovered) || 0);
    setCountDate(settlement.count_date || "");
    setCountedCashManual(Number(settlement.counted_cash) || 0);
    setNotes(settlement.notes || "");
    setExpenses(payload.expenses.map((expense, index) => ({
      localId: expense.id || `expense-${index}`,
      type: expense.expense_type,
      amount: Number(expense.amount) || 0,
      reference: expense.reference || "",
      notes: expense.notes || "",
    })));
    const loadedTickets = ((payload as any).electronicTickets || []).map((ticket: any, index: number) => ({
      localId: ticket.id || `ticket-${index}`,
      amount: Number(ticket.amount) || 0,
      reference: ticket.reference || "",
      paymentType: ticket.payment_type || "POINT",
      orderId: ticket.order_id || null,
      orderCode: ticket.order_code || null,
      mpPaymentId: ticket.mp_payment_id || null,
      notes: ticket.notes || "",
    }));
    setElectronicTickets(loadedTickets);
    const quantities: Record<string, number> = {};
    payload.cashCounts.forEach(count => { quantities[cashKey(count.money_kind, Number(count.denomination))] = Number(count.quantity) || 0; });
    setCashQuantities(quantities);
    setRouteOrders(payload.routeOrders || []);
    setModifiedDeliveryStatuses({});
    const accs = payload.financialAccounts || [];
    setFinancialAccounts(accs);
    setExistingMovements(payload.existingMovements || []);
    const defaultAcc = accs.find((a: any) =>
      a.name.toLowerCase().includes("efectivo pesos") || a.name.toLowerCase() === "caja efectivo pesos"
    ) || accs.find((a: any) => a.type === "efectivo") || accs[0];
    if (defaultAcc) {
      setSelectedAccountId(defaultAcc.id);
    }
    setCopied(false);
    setMovementCopied(false);
  }, [carriers]);

  const openSettlement = useCallback(async (settlementId: string) => {
    const requestId = ++detailRequest.current;
    setDetailLoading(true);
    setError("");
    setNotice("");
    try {
      const payload = await authenticatedFetch(`/api/admin/rendiciones?action=detail&settlementId=${encodeURIComponent(settlementId)}`);
      if (detailRequest.current === requestId) hydrateDetail(payload);
    } catch (requestError) {
      if (detailRequest.current === requestId) setError(requestError instanceof Error ? requestError.message : "No se pudo abrir la rendición.");
    } finally {
      if (detailRequest.current === requestId) setDetailLoading(false);
    }
  }, [authenticatedFetch, hydrateDetail]);

  useEffect(() => {
    if (settlementIdFromPath) {
      if (detail?.settlement.id !== settlementIdFromPath) void openSettlement(settlementIdFromPath);
    } else {
      detailRequest.current += 1;
      setDetail(null);
      setDetailLoading(false);
    }
  }, [settlementIdFromPath, detail?.settlement.id, openSettlement]);

  const availableDates = useMemo(() => Array.from(new Set(rows.map(row => row.settlement_date?.slice(0, 10)).filter(Boolean) as string[])).sort((a, b) => b.localeCompare(a)), [rows]);
  const filteredRows = useMemo(() => rows.filter(row => {
    const term = search.trim().toLowerCase();
    const matchesSearch = !term || [row.code, row.carrier_name, row.route_detail, displayDate(row.settlement_date)]
      .some(value => String(value || "").toLowerCase().includes(term));
    const matchesDate = !dateFilter || row.settlement_date?.slice(0, 10) === dateFilter;
    const matchesFilter = (filter === "archived" && row.status === "archived") || (filter === "all" && row.status !== "archived") || (filter === "confirmed" && row.status === "confirmed")
      || (filter === "pending" && isPending(row)) || (filter === "draft" && row.status === "draft" && !isPending(row));
    return matchesSearch && matchesDate && matchesFilter;
  }), [rows, search, dateFilter, filter]);
  const dateGroups = useMemo(() => {
    const grouped = new Map<string, SettlementRecord[]>();
    for (const row of filteredRows) {
      const date = row.settlement_date?.slice(0, 10) || "Sin fecha";
      grouped.set(date, [...(grouped.get(date) || []), row]);
    }
    return Array.from(grouped, ([date, settlements]) => ({ date, settlements }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredRows]);

  const submitLifecycleAction = async () => {
    if (!lifecycleTarget || !lifecycleAction) return;
    setLifecycleBusy(true);
    setLifecycleError("");
    try {
      const payload = await authenticatedFetch("/api/admin/rendiciones", {
        method: "POST",
        body: JSON.stringify({ action: lifecycleAction, settlementId: lifecycleTarget.id, archiveReason: archiveReason.trim() }),
      });
      setLifecycleAction(null);
      if (lifecycleAction === "delete-archived") {
        if (detail?.settlement.id === lifecycleTarget.id) {
          setDetail(null);
          router.push("/admin/rendiciones");
        }
        setNotice("La rendición archivada se eliminó definitivamente.");
      } else {
        if (detail?.settlement.id === lifecycleTarget.id) hydrateDetail({ ...detail, settlement: payload.settlement });
        setNotice("Rendición dada de baja y archivada. Podés generar una nueva leyendo las entregas.");
      }
      await loadList();
    } catch (requestError) {
      setLifecycleError(requestError instanceof Error ? requestError.message : "No se pudo completar la operación.");
    } finally {
      setLifecycleBusy(false);
    }
  };

  const openLifecycleAction = (row: SettlementRecord, action: "archive" | "delete-archived") => {
    setLifecycleTarget(row);
    setArchiveReason("");
    setLifecycleError("");
    setLifecycleAction(action);
  };

  const reopenSettlement = async () => {
    if (!detail || lifecycleBusy) return;
    setLifecycleBusy(true);
    setError("");
    try {
      await authenticatedFetch("/api/admin/rendiciones", {
        method: "POST",
        body: JSON.stringify({ action: "reopen", settlementId: detail.settlement.id }),
      });
      hydrateDetail(await authenticatedFetch(`/api/admin/rendiciones?action=detail&settlementId=${encodeURIComponent(detail.settlement.id)}`));
      setNotice("Rendición reabierta. Podés corregir sus datos, guardar y volver a confirmar.");
      await loadList();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo reabrir la rendición.");
    } finally {
      setLifecycleBusy(false);
    }
  };

  const importMonth = async () => {
    setImporting(true);
    setError("");
    setNotice("");
    try {
      const payload = await authenticatedFetch("/api/admin/rendiciones", {
        method: "POST",
        body: JSON.stringify({ action: "import-month" }),
      });
      setNotice(`Importación completada: ${payload.imported} rendiciones procesadas, ${payload.countsAssociated} conteos vinculados.`);
      await loadList();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo sincronizar la planilla.");
    } finally {
      setImporting(false);
    }
  };

  const createSettlement = async () => {
    if (!createForm.settlementDate || !createForm.carrierId) {
      setError("Completá la fecha y seleccioná un transportista para crear la rendición.");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const payload = await authenticatedFetch("/api/admin/rendiciones", {
        method: "POST",
        body: JSON.stringify({
          action: "create",
          code: createForm.code || null,
          settlementDate: createForm.settlementDate,
          carrierId: createForm.carrierId,
          routeDetail: createForm.routeDetail,
        }),
      });
      setCreateOpen(false);
      setCreateForm({ code: "", settlementDate: today(), carrierId: "", routeDetail: "" });
      await loadList();
      if (payload?.settlement?.id) {
        router.push(`/admin/rendiciones?rendicion=${encodeURIComponent(payload.settlement.id)}`);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo crear la rendición.");
    } finally {
      setCreating(false);
    }
  };

  const loadSheetPreview = async (source: "entregando" | "entregados", date = "") => {
    setEntregandoLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ action: "preview-entregando", source });
      if (source === "entregados") query.set("date", date);
      const payload = await authenticatedFetch(`/api/admin/rendiciones?${query}`);
      const preview: EntregandoPreviewItem[] = (payload.preview || []).map((item: EntregandoPreviewItem) => ({
        ...item,
        changeFund: item.changeFund || 0,
      }));
      setEntregandoPreview(preview);
      const initialSelected: Record<string, boolean> = {};
      preview.forEach(item => {
        initialSelected[item.key] = !item.matchingIssue && (item.existingStatus !== "confirmed" || (source === "entregados" && !item.existingRouteSheetId));
      });
      setSelectedEntregandoKeys(initialSelected);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo leer la hoja de logística.");
    } finally {
      setEntregandoLoading(false);
    }
  };

  const openEntregandoModal = (source: "entregando" | "entregados") => {
    setEntregandoModalOpen(true);
    setPreviewSource(source);
    if (source === "entregados") {
      setDeliveredDate(defaultDeliveredDate());
      setDeliveredDateIsDefault(true);
      setDeliveredDateHint(defaultDeliveredDateHint());
    }
    setEntregandoPreview([]);
    setSelectedEntregandoKeys({});
    setError("");
    if (source === "entregando") void loadSheetPreview(source);
  };

  const confirmEntregando = async () => {
    const selectedItems = entregandoPreview.filter(item => selectedEntregandoKeys[item.key]);
    if (selectedItems.length === 0) {
      setError("Seleccioná al menos un recorrido para crear o actualizar.");
      return;
    }
    setEntregandoConfirming(true);
    setError("");
    try {
      const payload = await authenticatedFetch("/api/admin/rendiciones", {
        method: "POST",
        body: JSON.stringify({
          action: "confirm-entregando",
          items: selectedItems.map(item => ({
            ...item,
            changeFund: item.changeFund || 0,
          })),
        }),
      });
      setNotice(`Se procesaron ${selectedItems.length} recorridos (${payload.created || 0} rendiciones creadas, ${payload.updated || 0} actualizadas, ${payload.linked || 0} confirmadas vinculadas a pedidos).`);
      setEntregandoModalOpen(false);
      await loadList();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudieron confirmar las rendiciones.");
    } finally {
      setEntregandoConfirming(false);
    }
  };

  const changeRouteOrderStatus = async (order: RouteOrderDetail, status: string) => {
    if (!detail) return;
    setUpdatingOrderStatus(order.deliveryId);
    setError("");
    try {
      const payload = await authenticatedFetch("/api/admin/rendiciones", {
        method: "POST",
        body: JSON.stringify({ action: "update-delivery-status", settlementId: detail.settlement.id, deliveryId: order.deliveryId, deliveryStatus: status }),
      });
      setModifiedDeliveryStatuses(current => ({ ...current, [order.deliveryId]: status }));
      setDeliveriesTotal(Number(payload.deliveriesTotal) || 0);
      setRouteOrders(current => current.map(item => item.deliveryId === order.deliveryId ? {
        ...item,
        deliveryStatus: status,
        toCollectAmount: isExcludedDeliveryStatus(status) ? 0 : Number(payload.orderAmount) || 0,
        isPreviouslyPaid: isExcludedDeliveryStatus(status) ? false : (Number(payload.orderAmount) || 0) === 0,
      } : item));
      setDetail(current => current ? { ...current, settlement: { ...current.settlement, deliveries_total: Number(payload.deliveriesTotal) || 0 } } : current);
      await loadList();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo actualizar el estado del pedido.");
    } finally {
      setUpdatingOrderStatus(null);
    }
  };

  const ticketTotals = useMemo(() => settlementElectronicTicketTotals(electronicTickets, routeOrders), [electronicTickets, routeOrders]);
  const effectiveElectronicTotal = detail?.settlement.status !== "draft" ? electronicTotal : electronicTickets.length > 0 ? ticketTotals.included : electronicTotal;

  const detailedCashTotal = useMemo(() => CASH_DENOMINATIONS.reduce((sum, item) => {
    return sum + item.denomination * (cashQuantities[cashKey(item.kind, item.denomination)] || 0);
  }, 0), [cashQuantities]);
  const detailedBillCount = useMemo(() => {
    return CASH_DENOMINATIONS.reduce((sum, item) => {
      return sum + (cashQuantities[cashKey(item.kind, item.denomination)] || 0);
    }, 0);
  }, [cashQuantities]);
  const hasDetailedCash = useMemo(() => Object.values(cashQuantities).some(quantity => quantity > 0), [cashQuantities]);
  const totals = useMemo(() => {
    const tollsTotal = expenses.filter(expense => expense.type === "toll").reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
    const extraordinaryTotal = expenses.filter(expense => expense.type === "extraordinary").reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
    const countedCash = hasDetailedCash ? detailedCashTotal : countedCashManual;
    const expectedCash = deliveriesTotal + changeFund - tollsTotal - extraordinaryTotal - effectiveElectronicTotal;
    return { tollsTotal, extraordinaryTotal, countedCash, expectedCash, difference: countedCash + shortageRecovered - expectedCash };
  }, [expenses, hasDetailedCash, detailedCashTotal, countedCashManual, deliveriesTotal, changeFund, effectiveElectronicTotal, shortageRecovered]);
  const health = getSettlementHealth(totals.difference);
  const message = detail?.settlement.status === "confirmed" && detail.settlement.whatsapp_message
    && Math.abs(Number(detail.settlement.difference || 0) - totals.difference) < 0.005
    ? detail.settlement.whatsapp_message
    : buildSettlementMessage({ routeDate: settlementDate, difference: totals.difference, changeFund, tollsTotal: totals.tollsTotal, extraordinaryTotal: totals.extraordinaryTotal });
  const movementRows = useMemo(() => buildTreasuryMovementRows({
    movementDate: displayDate(countDate || settlementDate),
    countedCash: totals.countedCash,
    expenses,
    shortageRecovered,
  }), [countDate, settlementDate, totals.countedCash, expenses, shortageRecovered]);

  const updateExpense = (localId: string, field: "amount" | "reference" | "notes", value: string) => {
    setExpenses(current => current.map(expense => expense.localId === localId
      ? { ...expense, [field]: field === "amount" ? Math.max(0, inputNumber(value)) : value }
      : expense));
  };
  const addExpense = (type: "toll" | "extraordinary") => setExpenses(current => [...current, {
    localId: `${type}-${Date.now()}-${current.length}`, type, amount: 0, reference: "", notes: "",
  }]);

  const updateElectronicTicket = (
    localId: string,
    field: "amount" | "reference" | "paymentType" | "notes" | "orderCode",
    value: string
  ) => {
    setElectronicTickets(current => current.map(ticket => {
      if (ticket.localId !== localId) return ticket;
      if (field === "amount") {
        return { ...ticket, amount: Math.max(0, inputNumber(value)) };
      }
      if (field === "orderCode") {
        const cleanCode = value.trim().toUpperCase();
        const matched = routeOrders.find(o => o.orderCode.trim().toUpperCase() === cleanCode);
        const autoRef = (!ticket.reference || ticket.reference.startsWith("Ticket ")) && matched
          ? `${matched.customerName} (${matched.orderCode})`
          : ticket.reference;
        return {
          ...ticket,
          orderCode: cleanCode || null,
          orderId: matched?.orderId || null,
          reference: autoRef,
        };
      }
      return { ...ticket, [field]: value };
    }));
  };
  const addElectronicTicket = () => setElectronicTickets(current => [...current, {
    localId: `ticket-${Date.now()}-${current.length}`,
    amount: 0,
    reference: `Ticket ${current.length + 1}`,
    paymentType: "POINT",
    notes: "",
  }]);
  const deleteElectronicTicket = (localId: string) => {
    setElectronicTickets(current => current.filter(t => t.localId !== localId));
  };

  const handleOpenAssignModal = (order: RouteOrderDetail, suggestedAmount: number) => {
    setAssignModalOrder(order);
    setAssignForm({
      amount: suggestedAmount > 0 ? suggestedAmount : 0,
      paymentType: "POINT",
      reference: `Cobro ${order.orderCode}`,
      notes: "",
    });
  };

  const handleConfirmAssignTicket = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!assignModalOrder) return;
    if (assignForm.amount <= 0) {
      setError("El monto del ticket debe ser mayor a 0.");
      return;
    }
    const cleanCode = (assignModalOrder.orderCode || "").trim().toUpperCase();
    const newTicket: ElectronicTicketRow = {
      localId: `ticket-direct-${Date.now()}-${electronicTickets.length}`,
      amount: assignForm.amount,
      reference: assignForm.reference.trim() || `Cobro ${cleanCode}`,
      paymentType: assignForm.paymentType || "POINT",
      orderId: assignModalOrder.orderId || null,
      orderCode: cleanCode || null,
      notes: assignForm.notes ? assignForm.notes.trim() : null,
    };
    setElectronicTickets(prev => [...prev, newTicket]);
    setNotice(`Ticket de ${formatPrice(newTicket.amount)} asignado al pedido ${cleanCode}.`);
    setAssignModalOrder(null);
  };

  const openMovementsModal = async () => {
    setGenerationMode("");
    if (movementRows.length === 0) {
      setError("No hay movimientos calculados en esta rendición para generar.");
      return;
    }

    let accs = financialAccounts;
    if (accs.length === 0) {
      accs = await loadFinancialAccounts();
    }

    const defaultAcc = accs.find((a: any) =>
      a.name.toLowerCase().includes("efectivo pesos") || a.name.toLowerCase() === "caja efectivo pesos"
    ) || accs.find((a: any) => a.type === "efectivo") || accs[0];

    if (defaultAcc) {
      setSelectedAccountId(defaultAcc.id);
    }

    const rawDate = countDate || settlementDate || today();
    setMovementDateInput(displayDate(rawDate));

    const rows = movementRows.map(r => {
      const isExpense = r.type === "Gasto";
      const isToll = r.detail.toLowerCase().includes("peaje");
      return {
        detail: r.detail,
        concept: `${r.detail} - ${carrierName} (${code})`,
        type: r.type,
        amount: r.amount,
        category: isExpense ? (isToll ? "Gasto Peajes" : "Gastos Operativos") : "Recaudación",
        sub_category: isExpense ? (isToll ? "Peajes" : "Extraordinario") : "Venta - Recorridos",
      };
    });
    setCustomMovements(rows);
    setMovementsModalOpen(true);
  };

  const handleConfirmGenerateMovements = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!detail) return;
    if (!selectedAccountId) {
      setError("Seleccioná la caja o cuenta donde ingresar los movimientos.");
      return;
    }
    if (customMovements.length === 0) {
      setError("No hay movimientos para generar.");
      return;
    }

    let formattedDate = movementDateInput.trim();
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(formattedDate)) {
      const [d, m, y] = formattedDate.split("/");
      formattedDate = `${y}-${m}-${d}`;
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(formattedDate)) {
      setError("La fecha debe tener formato dd/mm/aaaa (ej: 22/09/2026).");
      return;
    }

    if (existingMovements.length > 0 && !generationMode) {
      setError("Elegí reemplazar los movimientos actuales, generar un duplicado o cancelar.");
      return;
    }
    setGeneratingMovements(true);
    setError("");
    try {
      if (detail.settlement.status === "draft" && !await saveSettlement("save", false)) return;
      const response = await authenticatedFetch("/api/admin/rendiciones", {
        method: "POST",
        body: JSON.stringify({
          action: "generate-movements",
          settlementId: detail.settlement.id,
          code,
          carrierName,
          financialAccountId: selectedAccountId,
          movementDate: formattedDate,
          movements: customMovements,
          generationMode: generationMode || "initial",
          previousMovementIds: existingMovements.map(m => m.id),
        }),
      });

      setNotice(`Se generaron exitosamente ${response.count || customMovements.length} movimientos en ${response.accountName || "Caja"}.`);
      setMovementsModalOpen(false);

      const updatedPayload = await authenticatedFetch(`/api/admin/rendiciones?action=detail&settlementId=${encodeURIComponent(detail.settlement.id)}`);
      hydrateDetail(updatedPayload);
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron generar los movimientos.");
    } finally {
      setGeneratingMovements(false);
    }
  };

  const handleAddPaymentToTickets = (payment: LinkedPaymentInfo, orderCode: string, orderId?: string | null) => {
    const alreadyExists = electronicTickets.some(t => t.mpPaymentId === payment.id);
    if (alreadyExists) {
      setNotice(`El cobro de ${payment.payerName} (${formatPrice(payment.amount)}) ya está incluido en los tickets.`);
      return;
    }
    const newTicket: ElectronicTicketRow = {
      localId: `ticket-mp-${payment.id}`,
      amount: payment.amount,
      reference: payment.payerName ? `${payment.payerName} (${orderCode})` : `Cobro MP ${orderCode}`,
      paymentType: (payment.paymentType || "").toUpperCase().includes("TRANSF") ? "TRANSFERENCIA" : "POINT",
      orderId: orderId || null,
      orderCode: orderCode || null,
      mpPaymentId: payment.id,
      notes: `Vinculado en Chequeo de Pagos (${payment.linkedBy || 'Logística'})`,
    };
    setElectronicTickets(prev => [...prev, newTicket]);
    setNotice(`Ticket de ${formatPrice(payment.amount)} (${payment.payerName}) agregado a Cobros No Efectivo.`);
  };

  const handleSyncAllLinkedPayments = () => {
    const existingMpIds = new Set(electronicTickets.map(t => t.mpPaymentId).filter(Boolean));
    const toAdd: ElectronicTicketRow[] = [];

    routeOrders.forEach(order => {
      if (order.isPreviouslyPaid) return;
      (order.linkedPayments || []).forEach(p => {
        if (!existingMpIds.has(p.id)) {
          existingMpIds.add(p.id);
          toAdd.push({
            localId: `ticket-mp-${p.id}`,
            amount: p.amount,
            reference: p.payerName ? `${p.payerName} (${order.orderCode})` : `Cobro MP ${order.orderCode}`,
            paymentType: (p.paymentType || "").toUpperCase().includes("TRANSF") ? "TRANSFERENCIA" : "POINT",
            orderId: order.orderId || null,
            orderCode: order.orderCode || null,
            mpPaymentId: p.id,
            notes: `Vinculado en Chequeo de Pagos (${p.linkedBy || 'Logística'})`,
          });
        }
      });
    });

    if (toAdd.length === 0) {
      setNotice("Todos los cobros vinculados de Chequeo de Pagos ya se encuentran en los tickets.");
      return;
    }

    setElectronicTickets(prev => [...prev, ...toAdd]);
    setNotice(`Se sincronizaron ${toAdd.length} pago(s) de Chequeo de Pagos a Cobros No Efectivo.`);
  };

  const totalLinkedCount = useMemo(() => {
    return routeOrders.reduce((sum, o) => sum + (o.linkedPayments?.length || 0), 0);
  }, [routeOrders]);

  const unappliedLinkedCount = useMemo(() => {
    const existingMpIds = new Set(electronicTickets.map(t => t.mpPaymentId).filter(Boolean));
    let count = 0;
    routeOrders.forEach(o => {
      if (o.isPreviouslyPaid) return;
      (o.linkedPayments || []).forEach(p => {
        if (!existingMpIds.has(p.id)) count++;
      });
    });
    return count;
  }, [routeOrders, electronicTickets]);

  const saveSettlement = async (action: "save" | "confirm", refresh = true): Promise<boolean> => {
    if (!detail || saving || updatingOrderStatus) return false;
    setSaving(action);
    setError("");
    try {
      await authenticatedFetch("/api/admin/rendiciones", {
        method: "POST",
        body: JSON.stringify({
          action,
          settlementId: detail.settlement.id,
          code, settlementDate, carrierName, carrierId, routeDetail,
          deliveriesTotal, electronicTotal: effectiveElectronicTotal, changeFund, shortageRecovered,
          notes, whatsappMessage: message, countDate: countDate || null,
          countedCashOverride: hasDetailedCash ? null : countedCashManual,
          expenses: expenses.map(({ type, amount, reference, notes: expenseNotes }) => ({ type, amount, reference, notes: expenseNotes })),
          deliveryStatuses: Object.entries(modifiedDeliveryStatuses).map(([deliveryId, status]) => ({ deliveryId, status })),
          cashCounts: CASH_DENOMINATIONS.map(item => ({ ...item, quantity: cashQuantities[cashKey(item.kind, item.denomination)] || 0 })),
          electronicTickets: electronicTickets.map(ticket => ({
            amount: ticket.amount,
            reference: ticket.reference,
            payment_type: ticket.paymentType,
            order_id: ticket.orderId || null,
            order_code: ticket.orderCode || null,
            mp_payment_id: ticket.mpPaymentId || null,
            notes: ticket.notes || null,
          })),
        }),
      });
      if (refresh) {
        const payload = await authenticatedFetch(`/api/admin/rendiciones?action=detail&settlementId=${encodeURIComponent(detail.settlement.id)}`);
        hydrateDetail(payload);
        await loadList();
        setNotice(action === "confirm" ? "Rendición confirmada." : "Cambios guardados.");
      }
      return true;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo guardar la rendición.");
      return false;
    } finally {
      setSaving(null);
    }
  };

  const copyMessage = async () => { await navigator.clipboard.writeText(message); setCopied(true); window.setTimeout(() => setCopied(false), 1800); };
  const copyMovementRows = async () => { await navigator.clipboard.writeText(treasuryMovementRowsToTsv(movementRows)); setMovementCopied(true); window.setTimeout(() => setMovementCopied(false), 1800); };
  const copySettlementLink = async () => {
    if (!detail) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/admin/rendiciones?rendicion=${encodeURIComponent(detail.settlement.id)}`);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 1800);
    } catch {
      setError("No se pudo copiar el enlace. Podés copiarlo desde la barra de direcciones.");
    }
  };

  const lifecycleModal = lifecycleAction && lifecycleTarget && (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs">
      <form role="dialog" aria-modal="true" aria-labelledby="settlement-lifecycle-title" onSubmit={event => { event.preventDefault(); void submitLifecycleAction(); }} className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
        <h2 id="settlement-lifecycle-title" className="text-base font-black text-slate-900">{lifecycleAction === "archive" ? "Dar de baja rendición" : "Eliminar rendición archivada"} · {lifecycleTarget.code}</h2>
        <p className="mt-1 text-xs text-slate-500">{lifecycleTarget.carrier_name} · {displayDate(lifecycleTarget.settlement_date)}</p>
        {lifecycleAction === "archive" ? <>
          <p className="mt-2 text-xs text-slate-600">Quedará archivada para consulta. Al leer nuevamente las entregas, podrás crear una nueva rendición para este fletero y fecha.</p>
          <label htmlFor="settlement-archive-reason" className="mt-4 block text-xs font-bold text-slate-700">Motivo de baja *</label>
          <textarea id="settlement-archive-reason" autoFocus required maxLength={1000} value={archiveReason} disabled={lifecycleBusy} onChange={event => setArchiveReason(event.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm outline-none focus:border-amber-500" placeholder="Explicá por qué se da de baja esta rendición" />
        </> : <p className="mt-3 text-sm text-rose-700">Se eliminarán definitivamente esta rendición y sus conteos, gastos y tickets de rendición. Esta acción no se puede deshacer desde la aplicación.</p>}
        <p className="mt-2 text-xs text-slate-500">Los pedidos, cobros originales y movimientos de caja ya registrados se conservan.</p>
        {lifecycleError && <p role="alert" className="mt-3 text-xs font-bold text-rose-700">{lifecycleError}</p>}
        <div className="mt-4 flex justify-end gap-2"><button type="button" disabled={lifecycleBusy} onClick={() => setLifecycleAction(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600">Cancelar</button><button type="submit" disabled={lifecycleBusy || (lifecycleAction === "archive" && !archiveReason.trim())} className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{lifecycleBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{lifecycleAction === "archive" ? "Confirmar baja" : "Eliminar definitivamente"}</button></div>
      </form>
    </div>
  );

  if (detailLoading) return <main className="flex min-h-[70vh] items-center justify-center bg-slate-50"><Loader2 className="h-9 w-9 animate-spin text-blue-600" /></main>;

  if (settlementIdFromPath && !detail) return (
    <main className="min-h-screen bg-slate-50/60 p-5">
      <div className="mx-auto max-w-[1500px] space-y-3">
        <button type="button" onClick={() => router.push("/admin/rendiciones")} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">
          <ArrowLeft className="h-4 w-4" /> Volver a rendiciones
        </button>
        <Feedback error={error || "No se encontró esta rendición o no tenés permiso para verla."} notice="" />
      </div>
    </main>
  );

  if (detail) {
    const archived = detail.settlement.status === "archived";
    const readOnly = detail.settlement.status !== "draft";
    return (
      <main className="min-h-screen bg-slate-50/60 p-3 sm:p-5">
        <div className="mx-auto max-w-[1500px] space-y-3.5">
          {/* Compact Top Bar */}
          <header className="rounded-xl border border-slate-200/90 bg-white p-3 sm:p-3.5 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => router.push("/admin/rendiciones")}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Volver
                </button>
                <div className="h-5 w-px bg-slate-200" />
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-base font-black tracking-tight text-slate-900">{code}</h1>
                    <span className={`rounded-md border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${statusClasses(detail.settlement)}`}>
                      {statusLabel(detail.settlement)}
                    </span>
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                      {detail.settlement.source === "spreadsheet" ? "Planilla" : detail.settlement.source === "route" ? "Recorrido" : "Manual"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs font-medium text-slate-500">
                    {carrierName} · {displayDate(settlementDate)}{routeDetail.match(/\bR\d+\b/i)?.[0] ? ` · ${routeDetail.match(/\bR\d+\b/i)?.[0].toUpperCase()}` : ""}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {detail.settlement.status === "confirmed" && <button type="button" disabled={lifecycleBusy} onClick={() => void reopenSettlement()} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${lifecycleBusy ? "animate-spin" : ""}`} /> Reabrir para editar</button>}
                {!archived && <button type="button" disabled={Boolean(saving) || lifecycleBusy} onClick={() => openLifecycleAction(detail.settlement, "archive")} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800 disabled:opacity-50"><Archive className="h-3.5 w-3.5" /> Dar de baja</button>}
                {archived && canImportMonth && <button type="button" disabled={lifecycleBusy} onClick={() => openLifecycleAction(detail.settlement, "delete-archived")} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /> Eliminar definitivamente</button>}
                <button
                  type="button"
                  onClick={() => void copySettlementLink()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50"
                  title="Copiar enlace para compartir con alguien de Administración"
                >
                  {linkCopied ? <Check className="h-3.5 w-3.5" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
                  {linkCopied ? "Copiado" : "Copiar enlace"}
                </button>
                {!readOnly && <>
                  <button
                    type="button"
                    onClick={() => void saveSettlement("save")}
                    disabled={Boolean(saving)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-50"
                  >
                    {saving === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Guardar
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveSettlement("confirm")}
                    disabled={Boolean(saving)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {saving === "confirm" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Confirmar
                  </button>
                </>}
              </div>
            </div>
          </header>

          {(error || notice) && <Feedback error={error} notice={notice} />}
          {!readOnly && existingMovements.length > 0 && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">Esta rendición ya tiene movimientos en caja. Después de corregirla, revisalos en Movimientos o usá Generar en Caja → Reemplazar movimientos actuales para reflejar los cambios.</p>}
          {archived && <div className="rounded-xl border border-slate-300 bg-slate-100 p-3 text-xs text-slate-700"><p className="font-bold">Archivada el {displayDate(detail.settlement.archived_at)} · Motivo de baja</p><p className="mt-1 whitespace-pre-wrap">{detail.settlement.archive_reason}</p></div>}

          {lifecycleModal}

          <div className="space-y-3">
            <div className="space-y-3.5">
              {!readOnly && <section className="rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-2xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
                  <div>
                    <h2 className="text-xs font-black uppercase tracking-wider text-slate-800">Datos de la rendición</h2>
                    <p className="text-[10px] text-slate-400">Valores del recorrido y cobros a rendir.</p>
                  </div>
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                  <TextInput label="Código" value={code} disabled={readOnly} onChange={setCode} />
                  <DateInput label="Fecha de la rendición" value={settlementDate} disabled={readOnly} onChange={setSettlementDate} />
                  <CarrierSelect label="Transportista" value={carrierId} carrierName={carrierName} carriers={carriers} disabled={readOnly} onChange={nextCarrierId => {
                    setCarrierId(nextCarrierId);
                    setCarrierName(carriers.find(carrier => carrier.id === nextCarrierId)?.name || "");
                  }} />
                  <TextInput label="Detalle / recorrido" value={routeDetail} disabled={readOnly} onChange={setRouteDetail} placeholder="Ej.: R1 · Z. Korn" />
                  <MoneyInput label="Total de entregas" value={deliveriesTotal} disabled={readOnly} onChange={setDeliveriesTotal} />
                  <MoneyInput
                    label={electronicTickets.length > 0 ? `Transferencias / postnet (${electronicTickets.length})` : "Transferencias / postnet"}
                    value={effectiveElectronicTotal}
                    disabled={readOnly || electronicTickets.length > 0}
                    onChange={setElectronicTotal}
                  />
                  <MoneyInput label="Cambio entregado" value={changeFund} disabled={readOnly} onChange={setChangeFund} />
                  <MoneyInput label="Ajuste ingresado después" value={shortageRecovered} disabled={readOnly} onChange={setShortageRecovered} allowNegative />
                </div>
              </section>}

              {/* Módulos de liquidación compactos: acceso directo al detalle */}
              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  { key: "cash", icon: Banknote, title: "Efectivo contado", amount: totals.countedCash, tone: "text-emerald-600",
                    summary: `${hasDetailedCash ? `${detailedBillCount} piezas` : countedCashManual > 0 ? "Conteo manual" : "Sin arqueo"} · ${countDate ? displayDate(countDate) : "Sin fecha"}`,
                    action: readOnly ? "Ver conteo de billetes" : "Contar / Editar billetes", open: () => setCashModalOpen(true) },
                  { key: "expenses", icon: Receipt, title: "Peajes y gastos", amount: totals.tollsTotal + totals.extraordinaryTotal, tone: "text-amber-600",
                    summary: `${expenses.length} comp. · Peajes ${formatPrice(totals.tollsTotal)} · Extras ${formatPrice(totals.extraordinaryTotal)}`,
                    action: readOnly ? "Ver comprobantes" : "Gestionar peajes y gastos", open: () => setExpensesModalOpen(true) },
                  { key: "digital", icon: CreditCard, title: "Cobros no efectivo", amount: effectiveElectronicTotal, tone: "text-blue-600",
                    summary: `${electronicTickets.length} tickets${ticketTotals.excludedCount ? ` · ${ticketTotals.excludedCount} fuera de rendición (${formatPrice(ticketTotals.excluded)})` : ""}`,
                    action: readOnly ? "Ver tickets de cobro" : "Gestionar tickets", open: () => setTicketsModalOpen(true) },
                ].map(({ key, icon: Icon, title, amount, tone, summary, action, open }) => (
                  <button key={key} type="button" onClick={open} aria-label={action} title={`${action}: ${summary}`} className="flex min-w-0 items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left shadow-2xs transition-colors hover:bg-slate-50">
                    <Icon className={`h-4 w-4 shrink-0 ${tone}`} />
                    <span className="min-w-0 flex-1"><span className="block truncate text-[10px] font-black uppercase text-slate-800">{title}</span><span className={`block truncate text-[10px] ${key === "digital" && ticketTotals.excludedCount ? "font-semibold text-blue-700" : "text-slate-500"}`} title={summary}>{summary}</span></span>
                    <span className="shrink-0 whitespace-nowrap text-base font-black text-slate-900">{formatPrice(amount)}</span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  </button>
                ))}
              </div>

              {/* Pedidos del Recorrido & Chequeo de Pagos */}
              <details key={detail.settlement.id} className="group rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
                  <div>
                    <div className="flex items-center gap-2">
                      <Truck className="h-4 w-4 text-blue-600" />
                      <h2 className="text-xs font-black uppercase tracking-wider text-slate-800">
                        Pedidos del Recorrido {routeOrders.length > 0 ? `(${routeOrders.length})` : ""}
                      </h2>
                      {totalLinkedCount > 0 && (
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-black text-emerald-700">
                          <Check className="h-3 w-3" /> {totalLinkedCount} cobro(s) en Chequeo de Pagos
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-blue-600"><span className="group-open:hidden">Ver pedidos</span><span className="hidden group-open:inline">Contraer</span><ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" /></span>
                </summary>
                <div className="mt-3 border-t border-slate-100 pt-2">
                  {unappliedLinkedCount > 0 && !readOnly && (
                    <button
                      type="button"
                      onClick={handleSyncAllLinkedPayments}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-100 transition-colors shadow-2xs self-start sm:self-auto"
                    >
                      <Plus className="h-3.5 w-3.5" /> Sincronizar {unappliedLinkedCount} cobro(s) a tickets
                    </button>
                  )}
                {routeOrders.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center">
                    <p className="text-xs text-slate-400">
                      No hay pedidos vinculados a esta rendición u hoja de ruta aún.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto pb-1">
                    <table className="w-full whitespace-nowrap text-left text-xs min-w-[1100px]">
                      <thead>
                        <tr className="border-b border-slate-200/80 text-[10px] font-black uppercase tracking-wider text-slate-400">
                          <th className="py-1.5 px-2 w-10 text-center">#</th>
                          <th className="py-1.5 px-2 w-28">Pedido</th>
                          <th className="py-1.5 px-2 min-w-[130px]">Cliente</th>
                          <th className="py-1.5 px-2 min-w-[130px]">Estado pedido</th>
                          <th className="py-1.5 px-2 text-right w-24">Total Pedido</th>
                          <th className="py-1.5 px-2 text-right w-28">No Efectivo</th>
                          <th className="py-1.5 px-2 text-right w-28">Saldo Efectivo</th>
                          <th className="py-1.5 px-2 min-w-[280px]">Chequeo de Pagos / Tickets</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {routeOrders.map((order, idx) => {
                          const hasLinked = order.linkedPayments && order.linkedPayments.length > 0;
                          const cleanCode = (order.orderCode || "").trim().toUpperCase();
                          const linkedTickets = electronicTickets.filter(
                            t => t.orderCode && t.orderCode.trim().toUpperCase() === cleanCode
                          );
                          const directTickets = linkedTickets.filter(t => !t.mpPaymentId);
                          const priorReceipts = (order.priorPaymentReceipts || []).filter(receipt => safeReceiptUrl(receipt.receiptUrl));
                          const nonCashTotal = linkedTickets.reduce((sum, t) => sum + Number(t.amount || 0), 0);

                          const excluded = isExcludedDeliveryStatus(order.deliveryStatus || "");
                          const isPreviouslyPaid = !excluded && Boolean(
                            order.isPreviouslyPaid ||
                            (order.paymentStatus || "").toLowerCase().includes("abonad") ||
                            (order.toCollectAmount === 0 && order.totalAmount > 0)
                          );
                          const toCollectAmount = excluded || isPreviouslyPaid
                            ? 0
                            : (order.toCollectAmount !== undefined ? order.toCollectAmount : order.totalAmount);
                          const cashRemainder = Math.max(0, toCollectAmount - nonCashTotal);
                          const isMixed = !isPreviouslyPaid && nonCashTotal > 0 && cashRemainder > 0;
                          const isFullyDigital = !isPreviouslyPaid && nonCashTotal >= toCollectAmount && toCollectAmount > 0;
                          const missingPriorTicket = isPreviouslyPaid && !hasLinked && priorReceipts.length === 0 && linkedTickets.length === 0;
                          const orderStatus = deliveryStatusChoice(order.deliveryStatus || "");
                          const isPostponed = excluded && orderStatus === "Postergado";
                          const isCancelled = excluded && (orderStatus === "Anulado" || orderStatus === "Cancelado");
                          const excludedTone = isPostponed
                            ? "border-blue-200 bg-blue-50 text-blue-900"
                            : isCancelled ? "border-rose-300 bg-rose-50 text-rose-800" : "border-slate-300 bg-slate-100 text-slate-700";
                          const rowTone = isPostponed
                            ? "bg-blue-900 hover:bg-blue-800 text-white"
                            : isCancelled ? "bg-red-900 hover:bg-red-800 text-white"
                              : excluded ? "bg-slate-200/60 hover:bg-slate-200"
                                : missingPriorTicket ? "bg-amber-50/60 hover:bg-amber-100/60" : "hover:bg-slate-50/70";
                          const darkRow = isPostponed || isCancelled;
                          const rowAccent = isPostponed ? "border-l-blue-400" : isCancelled ? "border-l-red-400" : excluded ? "border-l-slate-500" : "border-l-transparent";

                          return (
                            <tr key={order.deliveryId || `order-${idx}`} className={`${rowTone} transition-colors`}>
                              <td className={`border-l-4 ${rowAccent} px-2 py-1.5 text-center font-bold ${darkRow ? "text-white/80" : "text-slate-400"}`}>{order.stopOrder || idx + 1}</td>
                              <td className="px-2 py-1.5"><span className="inline-flex rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-black text-blue-800">{order.orderCode}</span></td>
                              <td className="px-2 py-1.5"><p className={`max-w-[220px] truncate font-bold ${darkRow ? "text-white" : "text-slate-900"}`} title={order.customerName}>{order.customerName}</p></td>
                              <td className="px-2 py-1.5">
                                {readOnly ? <span className={excluded ? `inline-flex rounded border px-1.5 py-0.5 text-[10px] font-black uppercase ${excludedTone}` : "text-emerald-700"}>{order.deliveryStatus || "Entregado"}</span> : (
                                  <select value={orderStatus} disabled={updatingOrderStatus === order.deliveryId} onChange={event => void changeRouteOrderStatus(order, event.target.value === "En recorrido" ? "en_recorrido" : event.target.value.toLowerCase())} className={`rounded border px-1.5 py-0.5 text-[10px] font-bold disabled:opacity-50 ${excluded ? excludedTone : "border-slate-200 bg-white text-slate-700"}`}>
                                    {deliveryStatusOptions.map(option => <option key={option} value={option}>{option}</option>)}
                                  </select>
                                )}
                              </td>
                              <td className="px-2 py-1.5 text-right">
                                <div className="inline-flex items-center gap-1.5">
                                  <span className={`font-black ${darkRow ? "text-white" : "text-slate-900"}`}>{order.totalAmount > 0 ? formatPrice(order.totalAmount) : "-"}</span>
                                  {excluded ? <span className={`text-[9px] font-bold ${darkRow ? "text-white/90" : "text-slate-600"}`}>Sin cobro</span> : isPreviouslyPaid ? <span className={`rounded border px-1 text-[9px] font-bold ${missingPriorTicket ? "border-amber-300 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>Previo</span> : (order.previouslyPaidAmount || 0) > 0 ? <span className="text-[9px] font-bold text-amber-700" title={`Seña: ${formatPrice(order.previouslyPaidAmount || 0)}`}>Con seña</span> : null}
                                </div>
                              </td>
                              <td className="px-2 py-1.5 text-right">
                                {isPreviouslyPaid ? <span className={`text-[10px] font-bold ${missingPriorTicket ? "text-amber-800" : "text-emerald-700"}`}>{missingPriorTicket ? "Previo · revisar ticket" : "Pago previo"}</span> : nonCashTotal > 0 ? <span className={`font-black ${darkRow ? "text-white" : "text-blue-700"}`} title={excluded ? "Pago del pedido fuera de esta rendición" : undefined}>{formatPrice(nonCashTotal)} <span className="text-[9px] font-medium">({linkedTickets.length})</span></span> : <span className={darkRow ? "text-white/80" : "text-slate-400"}>$0</span>}
                              </td>
                              <td className="px-2 py-1.5 text-right">
                                {excluded ? <span className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-black ${excludedTone}`}>$0 · {orderStatus}</span> : isPreviouslyPaid ? <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">$0 · Previo</span> : isFullyDigital ? <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">$0 · Digital</span> : <span className={`font-black ${isMixed ? "text-amber-700" : "text-slate-800"}`}>{formatPrice(cashRemainder)}{isMixed && <span className="ml-1 text-[9px] font-bold">Mixto</span>}</span>}
                              </td>
                              <td className="px-2 py-1.5">
                                <div className="flex items-center gap-1.5">
                                  {order.linkedPayments.map(p => {
                                    const ticket = electronicTickets.find(t => t.mpPaymentId === p.id);
                                    return <div key={p.id} className="inline-flex shrink-0 items-center gap-1.5 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-900">
                                      <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                      <span className="font-black">{formatPrice(p.amount)}</span><span className="font-semibold">{p.paymentType}</span>
                                      {p.payerName && <span className="max-w-28 truncate" title={`${p.payerName}${p.accountName ? ` · ${p.accountName}` : ""}`}>{p.payerName}</span>}
                                      {ticket && <span className="font-bold" title={excluded || isPreviouslyPaid ? "Pago fuera de rendición" : "En tickets"}>✓</span>}
                                      <button type="button" onClick={() => setViewingPayment({ ...p, orderCode: order.orderCode })} className="font-bold underline underline-offset-2" aria-label={`Ver cobro de ${order.orderCode} por ${formatPrice(p.amount)}`}>Ver</button>
                                      {!ticket && !readOnly && !excluded && !isPreviouslyPaid && <button type="button" onClick={() => handleAddPaymentToTickets(p, order.orderCode, order.orderId)} className="font-bold text-blue-700" title="Pasar a tickets">+ Ticket</button>}
                                      {ticket && !readOnly && <button type="button" onClick={() => deleteElectronicTicket(ticket.localId)} title="Quitar de tickets" aria-label={`Quitar ticket de ${order.orderCode}`} className="text-slate-500 hover:text-rose-700"><Trash2 className="h-3 w-3" /></button>}
                                    </div>;
                                  })}
                                  {(isPreviouslyPaid ? linkedTickets.filter(t => !t.mpPaymentId || !order.linkedPayments.some(p => p.id === t.mpPaymentId)) : directTickets).map(ticket => (
                                    <div key={ticket.localId} className="inline-flex shrink-0 items-center gap-1.5 rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-900">
                                      <CreditCard className="h-3 w-3" /><span className="font-black">{formatPrice(ticket.amount)}</span><span>{ticket.paymentType}</span>
                                      <button type="button" onClick={() => setViewingPayment({ id: ticket.localId, amount: ticket.amount, paymentType: ticket.paymentType, payerName: ticket.reference || "", accountName: "Ticket de rendición", receivedAt: "", linkedBy: "", notes: ticket.notes || "", orderCode: order.orderCode })} className="font-bold underline underline-offset-2" aria-label={`Ver ticket de ${order.orderCode}`}>Ver</button>
                                      {!readOnly && <button type="button" onClick={() => deleteElectronicTicket(ticket.localId)} title="Quitar ticket" aria-label={`Quitar ticket de ${order.orderCode}`}><Trash2 className="h-3 w-3" /></button>}
                                    </div>
                                  ))}
                                  {isPreviouslyPaid && priorReceipts.map(receipt => <a key={receipt.id} href={safeReceiptUrl(receipt.receiptUrl)!} target="_blank" rel="noopener noreferrer" title={receipt.reference} className="inline-flex shrink-0 items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">{receipt.amount > 0 && formatPrice(receipt.amount)} Ver ticket ↗</a>)}
                                  {missingPriorTicket && <span className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-900"><AlertTriangle className="h-3 w-3" />Pago previo sin ticket · revisar</span>}
                                  {!isPreviouslyPaid && !hasLinked && directTickets.length === 0 && <span className="rounded border border-dashed border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600">{excluded ? "Sin cobro · fuera de rendición" : "Pendiente de cobro"}</span>}
                                  {!readOnly && !excluded && !isPreviouslyPaid && (cashRemainder > 0 || (!hasLinked && directTickets.length === 0)) && <button type="button" onClick={() => handleOpenAssignModal(order, cashRemainder)} className="inline-flex shrink-0 items-center gap-1 rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700"><Plus className="h-3 w-3" />Asignar ticket</button>}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                </div>
              </details>
            </div>

            <div className="space-y-3">
              <section className="rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-2xs">
                <h2 className="text-xs font-black uppercase tracking-wider text-slate-800 border-b border-slate-100 pb-2 mb-2.5">Resumen de liquidación</h2>
                <div className="grid grid-cols-1 gap-3 border-b border-slate-100 pb-3 text-xs sm:grid-cols-2 lg:grid-cols-3 [&>div]:min-w-0 [&>div]:gap-3 [&>div]:rounded-lg [&>div]:border [&>div]:border-slate-100 [&>div]:px-3 [&>div]:py-2 [&>div>span:last-child]:shrink-0 [&>div>span:last-child]:whitespace-nowrap">
                  <SummaryLine label="Total entregas" value={deliveriesTotal} />
                  <SummaryLine label="Cambio entregado" value={changeFund} positive />
                  <SummaryLine label="Peajes" value={totals.tollsTotal} negative />
                  <SummaryLine label="Gastos extraordinarios" value={totals.extraordinaryTotal} negative />
                  <SummaryLine label="Transferencias / postnet" value={effectiveElectronicTotal} negative />
                  <div className="flex items-center justify-between border-t border-slate-200/80 pt-2 font-bold">
                    <span className="text-slate-800">Efectivo a rendir</span>
                    <span className="text-sm font-black text-slate-950">{formatPrice(totals.expectedCash)}</span>
                  </div>
                  <SummaryLine label="Efectivo contado" value={totals.countedCash} />
                  {shortageRecovered > 0 && <SummaryLine label="Faltante ingresado" value={shortageRecovered} positive />}
                </div>
                <div className={`mt-3 rounded-lg border p-2.5 ${health === "ok" ? "border-emerald-200 bg-emerald-50/70" : health === "shortage" ? "border-rose-200 bg-rose-50/70" : "border-amber-200 bg-amber-50/70"}`}>
                  <p className="text-[9px] font-black uppercase tracking-wider text-slate-500">Diferencia final</p>
                  <p className={`mt-0.5 text-xl font-black ${health === "ok" ? "text-emerald-700" : health === "shortage" ? "text-rose-700" : "text-amber-700"}`}>{formatPrice(totals.difference)}</p>
                </div>
              </section>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <section className="min-w-0 rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-2xs">
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2 mb-2.5">
                  <div>
                    <h2 className="text-xs font-black uppercase tracking-wider text-slate-800">Reporte para Movimientos</h2>
                    <p className="text-[10px] text-slate-400">Listo para copiar o generar en caja.</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void copyMovementRows()}
                      disabled={movementRows.length === 0}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors shadow-2xs"
                      title="Copiar texto para planilla"
                    >
                      {movementCopied ? <Check className="h-3 w-3 text-emerald-600" /> : <ClipboardCopy className="h-3 w-3" />}
                      {movementCopied ? "Copiado" : "Copiar"}
                    </button>
                    <button
                      type="button"
                      onClick={openMovementsModal}
                      disabled={archived || movementRows.length === 0}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-40 transition-colors shadow-2xs"
                    >
                      <Wallet className="h-3 w-3" /> Generar en Caja
                    </button>
                  </div>
                </div>
                <div className="overflow-hidden rounded-lg border border-slate-200">
                  {movementRows.length === 0 ? (
                    <p className="px-3 py-4 text-center text-xs text-slate-400">Sin movimientos para copiar.</p>
                  ) : (
                    movementRows.map((row, index) => (
                      <div key={`${row.detail}-${index}`} className="grid grid-cols-[70px_1fr_50px_80px] gap-1.5 border-b border-slate-100 px-2.5 py-1.5 text-[10px] last:border-0">
                        <span>{row.date}</span>
                        <span className="truncate font-bold">{row.detail}</span>
                        <span className={row.type === "Ingreso" ? "text-emerald-700 font-bold" : "text-rose-700 font-bold"}>{row.type}</span>
                        <span className="text-right font-black">{formatPrice(row.amount)}</span>
                      </div>
                    ))
                  )}
                </div>
                {existingMovements && existingMovements.length > 0 && (
                  <div className="mt-2.5 rounded-lg border border-emerald-200 bg-emerald-50/70 p-2 text-[10px] text-emerald-800 flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      <span><strong>{existingMovements.length} movimientos</strong> registrados en el módulo de Movimientos.</span>
                    </div>
                    <button
                      type="button"
                      onClick={openMovementsModal}
                      disabled={archived}
                      className="text-[10px] font-bold text-emerald-700 underline hover:text-emerald-900 shrink-0"
                    >
                      Ver / Volver a generar
                    </button>
                  </div>
                )}
              </section>

              <section className="min-w-0 rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-2xs">
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2 mb-2.5">
                  <h2 className="text-xs font-black uppercase tracking-wider text-slate-800">Mensaje para el fletero</h2>
                  <button type="button" onClick={() => void copyMessage()} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50">
                    {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <ClipboardCopy className="h-3 w-3" />}{copied ? "Copiado" : "Copiar"}
                  </button>
                </div>
                <div className="whitespace-pre-line rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs leading-5 text-slate-700">{message}</div>
              </section>

              </div>
              <section className="rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-2xs">
                <label className="text-xs font-black uppercase tracking-wider text-slate-800 block mb-1.5">Observaciones</label>
                <textarea value={notes} disabled={readOnly} onChange={event => setNotes(event.target.value)} rows={3} className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50/60 p-2.5 text-xs text-slate-800 outline-none focus:border-blue-500 disabled:bg-slate-100" placeholder="Excepciones o aclaraciones" />
              </section>
            </div>
          </div>
        </div>

        {cashModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 sm:p-4 backdrop-blur-xs"
            onMouseDown={event => {
              if (event.target === event.currentTarget) setCashModalOpen(false);
            }}
          >
            <div className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200/60">
                    <Banknote className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-slate-950">Conteo de Billetes</h2>
                    <p className="text-[11px] text-slate-500">
                      Cargá la cantidad física de billetes o el total contado directo.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!!saving || !!updatingOrderStatus}
                    onClick={async () => { if (readOnly || await saveSettlement("save")) setCashModalOpen(false); }}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                  <div className="w-44">
                    <DateInput
                      label="Fecha de conteo"
                      value={countDate || settlementDate}
                      disabled={readOnly}
                      onChange={setCountDate}
                    />
                  </div>
                </div>

                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">
                    Detalle por denominación (máx. 2 columnas)
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {CASH_DENOMINATIONS.map((item, idx) => {
                      const key = cashKey(item.kind, item.denomination);
                      const quantity = cashQuantities[key] || 0;
                      return (
                        <div
                          key={key}
                          className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2"
                        >
                          <div className="min-w-0">
                            <span className="block text-[9px] font-black uppercase tracking-wider text-slate-400">
                              {item.kind === "bill" ? "Billete" : "Moneda"}
                            </span>
                            <span className="text-xs font-black text-slate-800">
                              {formatPrice(item.denomination)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <input
                              id={`cash-denom-input-${idx}`}
                              type="number"
                              min="0"
                              step="1"
                              value={quantity || ""}
                              disabled={readOnly}
                              autoFocus={idx === 0}
                              onFocus={event => event.target.select()}
                              onKeyDown={event => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  const nextInput = document.getElementById(
                                    `cash-denom-input-${idx + 1}`
                                  ) as HTMLInputElement | null;
                                  if (nextInput) {
                                    nextInput.focus();
                                    nextInput.select();
                                  }
                                }
                              }}
                              onChange={event =>
                                setCashQuantities(current => ({
                                  ...current,
                                  [key]: Math.max(0, Math.trunc(inputNumber(event.target.value))),
                                }))
                              }
                              placeholder="0"
                              className="h-[28px] w-16 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right text-xs font-black text-slate-900 outline-none focus:border-blue-500 disabled:bg-slate-100"
                            />
                            <span className="w-16 text-right text-[11px] font-bold text-slate-600 truncate">
                              {formatPrice(quantity * item.denomination)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {!hasDetailedCash && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1.5">
                      O ingreso de total contado manual (sin discriminar billetes)
                    </p>
                    <MoneyInput
                      label="Monto manual contado"
                      value={countedCashManual}
                      disabled={readOnly}
                      onChange={setCountedCashManual}
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-4 py-3">
                <div>
                  <span className="text-xs font-bold text-slate-600">
                    {hasDetailedCash ? `${detailedBillCount} piezas contadas` : "Conteo manual"}
                  </span>
                  <span className="mx-2 text-slate-300">·</span>
                  <span className="text-sm font-black text-emerald-700">
                    Total: {formatPrice(totals.countedCash)}
                    {error && <span role="alert" className="ml-2 text-rose-700">{error}</span>}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => {
                        setCashQuantities({});
                        setCountedCashManual(0);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-rose-700 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Limpiar conteo
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={!!saving || !!updatingOrderStatus}
                    onClick={async () => { if (readOnly || await saveSettlement("save")) setCashModalOpen(false); }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-emerald-700 transition-colors"
                  >
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} {saving ? "Guardando..." : "Listo"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {expensesModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 sm:p-4 backdrop-blur-xs"
            onMouseDown={event => {
              if (event.target === event.currentTarget) setExpensesModalOpen(false);
            }}
          >
            <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600 border border-amber-200/60">
                    <Receipt className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-slate-950">Peajes y Gastos del Recorrido</h2>
                    <p className="text-[11px] text-slate-500">
                      Cargá los tickets y comprobantes a descontar del efectivo a rendir.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!!saving || !!updatingOrderStatus}
                    onClick={async () => { if (readOnly || await saveSettlement("save")) setExpensesModalOpen(false); }}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <ExpenseEditor
                  title="Peajes"
                  subtitle="Cargá cada ticket individual de peaje."
                  type="toll"
                  expenses={expenses}
                  readOnly={readOnly}
                  onAdd={addExpense}
                  onUpdate={updateExpense}
                  onDelete={localId => setExpenses(current => current.filter(expense => expense.localId !== localId))}
                />
                <div className="border-t border-slate-100" />
                <ExpenseEditor
                  title="Gastos extraordinarios"
                  subtitle="Combustible, alimentos, insumos u otros gastos autorizados."
                  type="extraordinary"
                  expenses={expenses}
                  readOnly={readOnly}
                  onAdd={addExpense}
                  onUpdate={updateExpense}
                  onDelete={localId => setExpenses(current => current.filter(expense => expense.localId !== localId))}
                />
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-4 py-3">
                <div className="text-xs">
                  <span className="font-bold text-slate-600">
                    Peajes: {formatPrice(totals.tollsTotal)} · Extraord: {formatPrice(totals.extraordinaryTotal)}
                  </span>
                  <span className="mx-2 text-slate-300">·</span>
                  <span className="font-black text-amber-700">
                    Total gastos: {formatPrice(totals.tollsTotal + totals.extraordinaryTotal)}
                    {error && <span role="alert" className="ml-2 text-rose-700">{error}</span>}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={!!saving || !!updatingOrderStatus}
                    onClick={async () => { if (readOnly || await saveSettlement("save")) setExpensesModalOpen(false); }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-emerald-700"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} {saving ? "Guardando..." : "Listo"}
                </button>
              </div>
            </div>
          </div>
        )}

        {viewingPayment && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={event => { if (event.target === event.currentTarget) setViewingPayment(null); }}>
            <section role="dialog" aria-modal="true" aria-labelledby="linked-payment-title" onKeyDown={event => { if (event.key === "Escape") setViewingPayment(null); }} className="max-h-[85vh] w-full max-w-md overflow-auto rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-xl">
              <header className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div><h2 id="linked-payment-title" className="text-sm font-black">Detalle del cobro</h2><p className="text-xs text-slate-500">Pedido {viewingPayment.orderCode}</p></div>
                <button type="button" autoFocus aria-label="Cerrar detalle del cobro" onClick={() => setViewingPayment(null)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
              </header>
              <p className="mt-3 text-2xl font-black text-emerald-800">{formatPrice(viewingPayment.amount)}</p>
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
                <dt className="text-slate-500">Medio</dt><dd className="font-bold">{viewingPayment.paymentType || "Sin definir"}</dd>
                <dt className="text-slate-500">Titular</dt><dd className="break-words font-bold">{viewingPayment.payerName || "Sin informar"}</dd>
                <dt className="text-slate-500">Cuenta</dt><dd>{viewingPayment.accountName || "Sin informar"}</dd>
                <dt className="text-slate-500">Fecha</dt><dd>{displayDate(viewingPayment.receivedAt)}</dd>
                <dt className="text-slate-500">Verificación</dt><dd>{viewingPayment.isVerified ? "Verificado" : "Sin verificación registrada"}</dd>
              </dl>
              {viewingPayment.notes && <p className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-xs text-slate-600">{viewingPayment.notes}</p>}
              <div className="mt-4 flex justify-end"><button type="button" onClick={() => setViewingPayment(null)} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white">Cerrar</button></div>
            </section>
          </div>
        )}

        {ticketsModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 sm:p-4 backdrop-blur-xs"
            onMouseDown={event => {
              if (event.target === event.currentTarget) setTicketsModalOpen(false);
            }}
          >
            <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 border border-blue-200/60">
                    <CreditCard className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-slate-950">Tickets de Cobro No Efectivo</h2>
                    <p className="text-[11px] text-slate-500">
                      Cobros por Point o transferencia vinculados a los pedidos del recorrido.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!!saving || !!updatingOrderStatus}
                    onClick={async () => { if (readOnly || await saveSettlement("save")) setTicketsModalOpen(false); }}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
                <ElectronicTicketEditor
                  title="Tickets detallados"
                  subtitle="Los pagos de pedidos postergados o anulados quedan visibles, pero no se descuentan del efectivo de este recorrido."
                  tickets={electronicTickets}
                  routeOrders={routeOrders}
                  readOnly={readOnly}
                  onAdd={addElectronicTicket}
                  onUpdate={updateElectronicTicket}
                  onDelete={deleteElectronicTicket}
                />

                {electronicTickets.length === 0 && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1.5">
                      O ingresar total transferencias / postnet manual directo
                    </p>
                    <MoneyInput
                      label="Monto manual directo"
                      value={electronicTotal}
                      disabled={readOnly}
                      onChange={setElectronicTotal}
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-4 py-3">
                <div className="text-xs">
                  <span className="font-bold text-slate-600">
                    {electronicTickets.length} tickets
                  </span>
                  <span className="mx-2 text-slate-300">·</span>
                  <span className="font-black text-blue-700">
                    Total a descontar: {formatPrice(effectiveElectronicTotal)}
                    {error && <span role="alert" className="ml-2 text-rose-700">{error}</span>}
                  </span>
                  {ticketTotals.excludedCount > 0 && <span className="ml-2 font-bold text-violet-700">· Fuera de rendición: {formatPrice(ticketTotals.excluded)}</span>}
                </div>
                <button
                  type="button"
                  disabled={!!saving || !!updatingOrderStatus}
                    onClick={async () => { if (readOnly || await saveSettlement("save")) setTicketsModalOpen(false); }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-emerald-700"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} {saving ? "Guardando..." : "Listo"}
                </button>
              </div>
            </div>
          </div>
        )}

        {assignModalOrder && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 sm:p-4 backdrop-blur-xs"
            onMouseDown={event => {
              if (event.target === event.currentTarget) setAssignModalOrder(null);
            }}
          >
            <div className="flex w-full max-w-md flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 bg-slate-50/70">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 border border-blue-200/60">
                    <CreditCard className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-slate-950">Asignar Ticket de Cobro</h2>
                    <p className="text-[11px] text-slate-500 truncate max-w-[260px]">
                      Pedido <span className="font-bold text-blue-700">{assignModalOrder.orderCode}</span> · {assignModalOrder.customerName}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAssignModalOrder(null)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleConfirmAssignTicket} className="p-4 space-y-3.5">
                <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3 space-y-1.5 text-xs">
                  <div className="flex justify-between text-slate-500">
                    <span>Total del pedido:</span>
                    <span className="font-semibold text-slate-800">{formatPrice(assignModalOrder.totalAmount)}</span>
                  </div>
                  {assignModalOrder.previouslyPaidAmount && assignModalOrder.previouslyPaidAmount > 0 ? (
                    <div className="flex justify-between text-amber-600">
                      <span>Seña / Pago previo:</span>
                      <span className="font-semibold">- {formatPrice(assignModalOrder.previouslyPaidAmount)}</span>
                    </div>
                  ) : null}
                  <div className="flex justify-between text-slate-700 border-t border-slate-200/60 pt-1 font-bold">
                    <span>Saldo restante a cobrar:</span>
                    <span className="font-black text-blue-700">
                      {formatPrice(
                        Math.max(
                          0,
                          (assignModalOrder.toCollectAmount !== undefined ? assignModalOrder.toCollectAmount : assignModalOrder.totalAmount) -
                          electronicTickets
                            .filter(t => t.orderCode && t.orderCode.trim().toUpperCase() === (assignModalOrder.orderCode || "").trim().toUpperCase())
                            .reduce((sum, t) => sum + Number(t.amount || 0), 0)
                        )
                      )}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Monto a asignar ($)
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    value={assignForm.amount || ""}
                    onChange={e => setAssignForm(f => ({ ...f, amount: Number(e.target.value) || 0 }))}
                    autoFocus
                    onFocus={e => e.target.select()}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-base font-black text-slate-900 shadow-2xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                    placeholder="0"
                    required
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Podés ajustar el monto si es un pago mixto (parte tarjeta/transferencia y parte efectivo).
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Medio de cobro
                    </label>
                    <select
                      value={assignForm.paymentType}
                      onChange={e => setAssignForm(f => ({ ...f, paymentType: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-800 shadow-2xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                    >
                      <option value="POINT">Point / Tarjeta</option>
                      <option value="TRANSFERENCIA">Transferencia</option>
                      <option value="OTRO">Otro no efectivo</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Referencia
                    </label>
                    <input
                      type="text"
                      value={assignForm.reference}
                      onChange={e => setAssignForm(f => ({ ...f, reference: e.target.value }))}
                      placeholder="Ej: Op. 123456"
                      className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-800 shadow-2xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Notas adicionales (opcional)
                  </label>
                  <input
                    type="text"
                    value={assignForm.notes}
                    onChange={e => setAssignForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Ej: Cobrado en destino con QR..."
                    className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 shadow-2xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setAssignModalOrder(null)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-blue-700 transition-colors"
                  >
                    <Check className="h-3.5 w-3.5" /> Asignar Ticket
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {movementsModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 sm:p-4 backdrop-blur-xs"
            onMouseDown={event => {
              if (event.target === event.currentTarget) setMovementsModalOpen(false);
            }}
          >
            <div className="flex w-full max-w-xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 bg-slate-50/70">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200/60">
                    <Wallet className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-slate-950">Generar Movimientos en Módulo Financiero</h2>
                    <p className="text-[11px] text-slate-500 truncate max-w-[320px]">
                      Rendición <span className="font-bold text-slate-800">{code}</span> · {carrierName}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMovementsModalOpen(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleConfirmGenerateMovements} className="p-4 space-y-3.5 max-h-[80vh] overflow-y-auto">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Caja o Cuenta Destino *
                    </label>
                    <select
                      value={selectedAccountId}
                      onChange={e => setSelectedAccountId(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-800 shadow-2xs focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                      required
                    >
                      {financialAccounts.length === 0 ? (
                        <option value="">Cargando cuentas...</option>
                      ) : (
                        financialAccounts.map(acc => (
                          <option key={acc.id} value={acc.id}>
                            {acc.name} ({acc.currency})
                          </option>
                        ))
                      )}
                    </select>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Por defecto: <span className="font-semibold text-slate-600">Caja Efectivo Pesos</span>.
                    </p>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Fecha del movimiento (dd/mm/aaaa) *
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        value={movementDateInput}
                        onChange={e => setMovementDateInput(e.target.value)}
                        placeholder="dd/mm/aaaa"
                        className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-800 shadow-2xs focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                        required
                      />
                      <input
                        type="date"
                        tabIndex={-1}
                        value={parseDisplayDate(movementDateInput) || ""}
                        onChange={e => {
                          if (e.target.value) setMovementDateInput(displayDate(e.target.value));
                        }}
                        className="absolute right-2 opacity-0 w-6 h-6 cursor-pointer"
                        title="Elegir fecha"
                      />
                      <div className="pointer-events-none absolute right-2.5 text-slate-400">
                        <Calendar className="h-4 w-4" />
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Formato día/mes/año (ej: 22/09/2026).
                    </p>
                  </div>
                </div>

                {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">{error}</p>}
                {existingMovements && existingMovements.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-2.5 text-xs text-amber-900 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Ya existen {existingMovements.length} movimientos generados para esta rendición.</p>
                      <p className="text-[11px] text-amber-800 mt-0.5">
                        Elegí reemplazar los movimientos actuales o generar un duplicado.
                      </p>
                      <div className="my-2 space-y-1">
                        {existingMovements.map(m => <div key={m.id} className="rounded border border-amber-200 bg-white p-2"><strong>{m.type === "ingreso" ? "Ingreso" : "Egreso"} · {formatPrice(m.amount)}</strong> · {m.concept}<div>{m.created_at ? new Date(m.created_at).toLocaleString("es-AR") : ""} · {financialAccounts.find(a => a.id === m.financial_account_id)?.name || "Cuenta"}</div></div>)}
                      </div>
                      <label className="mr-3"><input type="radio" name="generationMode" checked={generationMode === "replace"} onChange={() => setGenerationMode("replace")} /> Reemplazar movimientos actuales</label>
                      <label><input type="radio" name="generationMode" checked={generationMode === "duplicate"} onChange={() => setGenerationMode("duplicate")} /> Generar duplicado</label>
                    </div>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-bold text-slate-700">
                      Movimientos a generar ({customMovements.length})
                    </label>
                    <span className="text-[10px] text-slate-400">
                      Podés revisar o ajustar los conceptos
                    </span>
                  </div>

                  <div className="space-y-2 border border-slate-200 rounded-xl p-2.5 bg-slate-50/50">
                    {customMovements.map((mov, idx) => {
                      const isIncome = mov.type === "Ingreso";
                      return (
                        <div key={idx} className="rounded-lg border border-slate-200/80 bg-white p-2.5 shadow-2xs space-y-1.5 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${isIncome ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                              {mov.type}
                            </span>
                            <span className="text-sm font-black text-slate-900">
                              {formatPrice(mov.amount)}
                            </span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                            <div className="sm:col-span-6">
                              <label className="block text-[9px] font-bold uppercase text-slate-400 mb-0.5">
                                Concepto / Detalle
                              </label>
                              <input
                                type="text"
                                value={mov.concept}
                                onChange={e => {
                                  const val = e.target.value;
                                  setCustomMovements(prev => prev.map((m, i) => i === idx ? { ...m, concept: val } : m));
                                }}
                                className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-800 focus:border-emerald-500 focus:outline-none"
                              />
                            </div>
                            <div className="sm:col-span-3">
                              <label className="block text-[9px] font-bold uppercase text-slate-400 mb-0.5">
                                Categoría
                              </label>
                              <input
                                type="text"
                                value={mov.category}
                                onChange={e => {
                                  const val = e.target.value;
                                  setCustomMovements(prev => prev.map((m, i) => i === idx ? { ...m, category: val } : m));
                                }}
                                className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-800 focus:border-emerald-500 focus:outline-none"
                              />
                            </div>
                            <div className="sm:col-span-3">
                              <label className="block text-[9px] font-bold uppercase text-slate-400 mb-0.5">
                                Subcategoría
                              </label>
                              <input
                                type="text"
                                value={mov.sub_category}
                                onChange={e => {
                                  const val = e.target.value;
                                  setCustomMovements(prev => prev.map((m, i) => i === idx ? { ...m, sub_category: val } : m));
                                }}
                                className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-800 focus:border-emerald-500 focus:outline-none"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-1 text-xs">
                  <div className="flex justify-between text-slate-500">
                    <span>Total Ingresos:</span>
                    <span className="font-bold text-emerald-700">
                      +{formatPrice(customMovements.filter(m => m.type === "Ingreso").reduce((sum, m) => sum + m.amount, 0))}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Total Gastos:</span>
                    <span className="font-bold text-rose-700">
                      -{formatPrice(customMovements.filter(m => m.type === "Gasto").reduce((sum, m) => sum + m.amount, 0))}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-slate-100 pt-1.5 font-bold text-slate-800">
                    <span>Impacto neto en la caja:</span>
                    <span className="font-black text-slate-950 text-sm">
                      {formatPrice(
                        customMovements.reduce((sum, m) => sum + (m.type === "Ingreso" ? m.amount : -m.amount), 0)
                      )}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setMovementsModalOpen(false)}
                    disabled={generatingMovements}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={generatingMovements || !!saving || !!updatingOrderStatus || customMovements.length === 0 || (existingMovements.length > 0 && !generationMode)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                  >
                    {generatingMovements ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Registrando...
                      </>
                    ) : (
                      <>
                        <Check className="h-3.5 w-3.5" /> Confirmar y Generar Movimientos
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50/60 p-3 sm:p-5">
      <div className="mx-auto max-w-[1500px] space-y-3.5">
        <header className="rounded-xl border border-slate-200/90 bg-white p-3 sm:p-3.5 shadow-2xs">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200/60">
                <CircleDollarSign className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-base font-black tracking-tight text-slate-900">Rendiciones de tesorería</h1>
                <p className="text-xs text-slate-500">Liquidación y control de efectivo por recorrido o planilla.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => openEntregandoModal("entregando")}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-blue-500 transition-colors"
              >
                <Truck className="h-3.5 w-3.5" /> Leer hoja Entregando
              </button>
              <button
                type="button"
                onClick={() => openEntregandoModal("entregados")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 transition-colors"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Leer hoja Entregados
              </button>
              {canImportMonth && <button
                type="button"
                onClick={() => void importMonth()}
                disabled={importing}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-50"
              >
                {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />} Importar mes actual
              </button>}
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-emerald-700"
              >
                <Plus className="h-3.5 w-3.5" /> Nueva rendición
              </button>
              <button
                type="button"
                onClick={() => void loadList()}
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-50"
                title="Actualizar lista"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <StatCard label="Pendientes de conteo" value={stats.pending} icon={<Truck className="h-4 w-4" />} color="amber" />
          <StatCard label="En preparación" value={stats.drafts} icon={<Save className="h-4 w-4" />} color="blue" />
          <StatCard label="Con diferencia" value={stats.differences} icon={<AlertTriangle className="h-4 w-4" />} color="rose" />
          <StatCard label="Confirmadas" value={stats.confirmed} icon={<CheckCircle2 className="h-4 w-4" />} color="emerald" />
        </section>

        <section className="rounded-xl border border-slate-200/90 bg-white p-2.5 shadow-2xs">
          <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1 sm:w-80">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="Buscar por fletero, fecha o código..."
                  className="h-[32px] w-full rounded-lg border border-slate-200 bg-slate-50/60 py-1 pl-8 pr-3 text-xs outline-none focus:border-blue-500 focus:bg-white"
                />
              </div>
              <label className="relative shrink-0">
                <Calendar className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-blue-500" />
                <select value={dateFilter} onChange={event => setDateFilter(event.target.value)} aria-label="Filtrar rendiciones por fecha" className="h-[32px] w-full appearance-none rounded-lg border border-slate-200 bg-white py-1 pl-8 pr-8 text-xs font-semibold text-slate-700 outline-none focus:border-blue-500 sm:w-44">
                  <option value="">Todas las fechas</option>
                  {availableDates.map(date => <option key={date} value={date}>{displayDate(date)}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              </label>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {([['pending','Pendientes'],['draft','En preparación'],['confirmed','Confirmadas'],['all','Todas'],['archived','Archivadas']] as const).map(([value,label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors ${filter === value ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200/70"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {(error || notice) && <Feedback error={error} notice={notice} />}

        <section className="space-y-3">
          {loading ? (
            <div className="flex min-h-52 items-center justify-center rounded-xl border border-slate-200 bg-white"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>
          ) : filteredRows.length === 0 ? (
            <div className="flex min-h-52 flex-col items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-center">
              <CheckCircle2 className="mb-2 h-8 w-8 text-emerald-500" />
              <h2 className="text-sm font-black text-slate-900">No hay rendiciones en esta vista</h2>
              <p className="mt-0.5 text-xs text-slate-500">{dateFilter ? "Probá con otra fecha o elegí Todas las fechas." : "Creá una rendición manual o leé las entregas vigentes."}</p>
            </div>
          ) : (
            dateGroups.map(({ date, settlements }) => (
              <div key={date} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-100/80 px-3.5 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-blue-200 bg-white text-blue-600"><Calendar className="h-4 w-4" /></span>
                    <div>
                      <h2 className="text-sm font-black capitalize text-slate-900">{dateHeading(date)}</h2>
                      <p className="text-[11px] font-semibold text-slate-500">{displayDate(date)} · {settlements.length} {settlements.length === 1 ? "rendición" : "rendiciones"}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-[10px] font-bold">
                    {settlements.some(isPending) && <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700">{settlements.filter(isPending).length} pendientes</span>}
                    {settlements.some(row => row.status === "confirmed") && <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700">{settlements.filter(row => row.status === "confirmed").length} confirmadas</span>}
                  </div>
                </div>
                <div className="divide-y divide-slate-100">
                  {settlements.map(row => (
                    <div key={row.id} className="flex items-center gap-2 pr-3.5">
                    <button
                      type="button"
                      disabled={lifecycleBusy}
                      onClick={() => router.push(`/admin/rendiciones?rendicion=${encodeURIComponent(row.id)}`)}
                      className="grid min-w-0 flex-1 items-center gap-x-3 px-3.5 py-2 text-left text-xs transition-colors hover:bg-blue-50/40 disabled:opacity-50"
                      style={{ gridTemplateColumns: "minmax(0, 1fr) auto 110px 16px" }}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-black text-slate-900">{row.carrier_name}</p>
                        <p className="truncate text-[11px] text-slate-500">{row.code}{row.route_detail ? ` · ${row.route_detail}` : ""} · {row.source === "spreadsheet" ? "Planilla" : row.source === "route" ? "Recorrido" : "Manual"}</p>
                      </div>
                      <span className={`w-fit rounded-md border px-2 py-0.5 text-[10px] font-bold ${statusClasses(row)}`}>{statusLabel(row)}</span>
                      <div className="sm:text-right">
                        <p className={`font-black ${Math.abs(Number(row.difference)) <= 300 ? "text-emerald-700" : Number(row.difference) < 0 ? "text-rose-700" : "text-amber-700"}`}>{formatPrice(Number(row.difference) || 0)}</p>
                        <p className="text-[9px] text-slate-400">Diferencia</p>
                      </div>
                      <ChevronRight className="h-4 w-4 justify-self-end text-slate-300" />
                    </button>
                    <div className="flex w-24 shrink-0 justify-end">
                      {row.status !== "archived" ? <button type="button" disabled={lifecycleBusy} onClick={() => openLifecycleAction(row, "archive")} aria-label={`Dar de baja ${row.code}`} className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[10px] font-bold text-amber-800 hover:bg-amber-100 disabled:opacity-50"><Archive className="h-3.5 w-3.5" /> Dar de baja</button>
                        : canImportMonth && <button type="button" disabled={lifecycleBusy} onClick={() => openLifecycleAction(row, "delete-archived")} aria-label={`Eliminar definitivamente ${row.code}`} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-[10px] font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /> Eliminar</button>}
                    </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </section>
      </div>

      {lifecycleModal}

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-xs" onMouseDown={event => { if (event.target === event.currentTarget) setCreateOpen(false); }}>
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl border border-slate-200">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2.5">
              <div>
                <h2 className="text-sm font-black text-slate-900">Nueva rendición</h2>
                <p className="text-[11px] text-slate-500">Carga manual no vinculada a recorrido LOG.</p>
              </div>
              <button type="button" onClick={() => setCreateOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
              <TextInput label="Código (opcional)" value={createForm.code} onChange={value => setCreateForm(current => ({ ...current, code: value }))} placeholder="Auto-generado" />
              <DateInput label="Fecha" value={createForm.settlementDate} onChange={value => setCreateForm(current => ({ ...current, settlementDate: value }))} />
              <div className="sm:col-span-2">
                <CarrierSelect label="Transportista" value={createForm.carrierId} carriers={carriers} onChange={value => setCreateForm(current => ({ ...current, carrierId: value }))} />
              </div>
              <div className="sm:col-span-2">
                <TextInput label="Detalle / recorrido (opcional)" value={createForm.routeDetail} onChange={value => setCreateForm(current => ({ ...current, routeDetail: value }))} placeholder="Ej.: R1 · Z. Korn" />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button type="button" onClick={() => setCreateOpen(false)} className="rounded-lg px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100">Cancelar</button>
              <button type="button" onClick={() => void createSettlement()} disabled={creating} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white disabled:opacity-50">
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Crear rendición
              </button>
            </div>
          </div>
        </div>
      )}

      {entregandoModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 sm:p-4 backdrop-blur-xs"
          onMouseDown={event => {
            if (event.target === event.currentTarget && !entregandoConfirming) setEntregandoModalOpen(false);
          }}
        >
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 border border-blue-200/60">
                  <Truck className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-slate-950">Lectura de hoja &quot;{previewSource === "entregados" ? "🔴 Entregados" : "Entregando"}&quot;</h2>
                  <p className="text-[11px] text-slate-500">
                    Validá los recorridos, fleteros y montos a rendir detectados antes de generarlos.
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={entregandoConfirming}
                onClick={() => setEntregandoModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-3.5 sm:p-4">
              {error && <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</div>}
              {previewSource === "entregados" && (
                <div className="mb-3 flex flex-wrap items-end gap-2 rounded-lg border border-blue-100 bg-blue-50/50 p-3">
                  <div className="w-44"><DateInput label="Fecha de entregas" value={deliveredDate} onChange={value => { setDeliveredDate(value); setDeliveredDateIsDefault(false); setEntregandoPreview([]); }} /></div>
                  {deliveredDateIsDefault && <span className="mb-1 rounded-md border border-blue-200 bg-white px-2 py-1 text-[11px] font-bold text-blue-700">{deliveredDateHint}</span>}
                  <button type="button" disabled={entregandoLoading || !deliveredDate} onClick={() => void loadSheetPreview("entregados", deliveredDate)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">Buscar entregas</button>
                </div>
              )}
              {entregandoLoading ? (
                <div className="flex min-h-52 flex-col items-center justify-center gap-2 text-slate-500">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                  <p className="text-xs font-semibold">Leyendo hoja de logística en Google Sheets...</p>
                </div>
              ) : entregandoPreview.length === 0 ? (
                <div className="flex min-h-52 flex-col items-center justify-center text-center">
                  <p className="text-xs font-bold text-slate-700">No se encontraron entregas con fecha válida en la hoja.</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">{previewSource === "entregados" ? "Elegí una fecha y buscá los pedidos de la hoja Entregados." : "Verificá que la pestaña Entregando tenga pedidos con fecha en la columna B."}</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {/* Selection controls header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-slate-500 px-0.5">
                    <span>{entregandoPreview.length} recorridos encontrados</span>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2 border-r border-slate-200 pr-3">
                        <button
                          type="button"
                          onClick={() => {
                            const all: Record<string, boolean> = {};
                            entregandoPreview.forEach(item => { all[item.key] = true; });
                            setSelectedEntregandoKeys(all);
                          }}
                          className="text-blue-600 hover:underline"
                        >
                          Seleccionar todos
                        </button>
                        <span className="text-slate-300">·</span>
                        <button
                          type="button"
                          onClick={() => setSelectedEntregandoKeys({})}
                          className="text-slate-500 hover:underline"
                        >
                          Deseleccionar todos
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEntregandoPreview(prev => prev.map(p => selectedEntregandoKeys[p.key] ? { ...p, changeFund: DEFAULT_CHANGE_FUND } : p));
                          }}
                          className="text-emerald-700 hover:underline font-semibold"
                        >
                          Poner $30.000 a seleccionados
                        </button>
                        <span className="text-slate-300">·</span>
                        <button
                          type="button"
                          onClick={() => {
                            setEntregandoPreview(prev => prev.map(p => selectedEntregandoKeys[p.key] ? { ...p, changeFund: 0 } : p));
                          }}
                          className="text-slate-500 hover:underline"
                        >
                          Poner $0
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Table / List */}
                  <div className="overflow-hidden rounded-xl border border-slate-200">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-slate-100 bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500">
                        <tr>
                          <th className="py-2 pl-3 pr-1 w-8"></th>
                          <th className="py-2 px-2.5">Fletero</th>
                          <th className="py-2 px-2.5">Fecha</th>
                          <th className="py-2 px-2.5">Recorrido / Zona</th>
                          <th className="py-2 px-2 text-center">Pedidos</th>
                          <th className="py-2 px-2.5">Cambio ($)</th>
                          <th className="py-2 px-2.5 text-right">Monto a rendir</th>
                          <th className="py-2 px-2.5">Estado</th>
                          <th className="py-2 pr-3 pl-1 w-8"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {entregandoPreview.map(item => {
                          const isSelected = Boolean(selectedEntregandoKeys[item.key]);
                          const isExpanded = expandedEntregandoKey === item.key;
                          return (
                            <React.Fragment key={item.key}>
                              <tr className={`transition-colors hover:bg-slate-50/80 ${isSelected ? "bg-blue-50/30" : ""}`}>
                                <td className="py-2 pl-3 pr-1">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    disabled={Boolean(item.matchingIssue) || (item.existingStatus === "confirmed" && (previewSource !== "entregados" || Boolean(item.existingRouteSheetId)))}
                                    onChange={e => {
                                      const checked = e.target.checked;
                                      setSelectedEntregandoKeys(prev => ({ ...prev, [item.key]: checked }));
                                    }}
                                    className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                  />
                                </td>
                                <td className="py-2 px-2.5">
                                  <div className="font-black text-slate-900">{item.carrierName}</div>
                                  {item.vehicle && (
                                    <span className="inline-block rounded bg-slate-100 px-1.5 py-0.2 text-[9px] font-semibold text-slate-600">
                                      {item.vehicle}
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 px-2.5 font-medium text-slate-700">
                                  {displayDate(item.deliveryDate)}
                                </td>
                                <td className="py-2 px-2.5">
                                  <span className="font-semibold text-slate-800">{item.routeDetail || item.zone || "-"}</span>
                                  {item.companion && (
                                    <span className="block text-[10px] text-slate-400">Acomp: {item.companion}</span>
                                  )}
                                </td>
                                <td className="py-2 px-2 text-center">
                                  <span className="inline-flex rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-700">
                                    {item.orders.length}
                                  </span>
                                </td>
                                <td className="py-2 px-2.5">
                                  <div className="flex items-center gap-1">
                                    <div className="relative w-20">
                                      <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[9px] font-black text-slate-400">$</span>
                                      <input
                                        type="number"
                                        min="0"
                                        step="1000"
                                        value={item.changeFund || ""}
                                        disabled={item.existingStatus === "confirmed"}
                                        onChange={e => {
                                          const val = Math.max(0, inputNumber(e.target.value));
                                          setEntregandoPreview(prev => prev.map(p => p.key === item.key ? { ...p, changeFund: val } : p));
                                        }}
                                        placeholder="0"
                                        className="h-[26px] w-full rounded border border-slate-200 bg-white py-0.5 pl-4 pr-1 text-right text-xs font-bold text-slate-800 outline-none focus:border-blue-500"
                                      />
                                    </div>
                                    <button
                                      type="button"
                                      disabled={item.existingStatus === "confirmed"}
                                      onClick={() => {
                                        const nextVal = item.changeFund === DEFAULT_CHANGE_FUND ? 0 : DEFAULT_CHANGE_FUND;
                                        setEntregandoPreview(prev => prev.map(p => p.key === item.key ? { ...p, changeFund: nextVal } : p));
                                      }}
                                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold border transition-colors ${
                                        item.changeFund === DEFAULT_CHANGE_FUND
                                          ? "bg-blue-600 text-white border-blue-600"
                                          : "bg-slate-100 text-slate-600 hover:bg-slate-200 border-slate-200"
                                      }`}
                                      title={`Asignar o quitar cambio por defecto ($${DEFAULT_CHANGE_FUND.toLocaleString("es-AR")})`}
                                    >
                                      $30k
                                    </button>
                                  </div>
                                </td>
                                <td className="py-2 px-2.5 text-right font-black text-emerald-700">
                                  {formatPrice(item.totalAmount)}
                                </td>
                                <td className="py-2 px-2.5">
                                  {item.matchingIssue ? (
                                    <span className="inline-flex max-w-48 items-center rounded-md border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-700" title={item.matchingIssue}>
                                      Revisar duplicadas
                                    </span>
                                  ) : item.existingStatus === "confirmed" && !item.existingRouteSheetId && previewSource === "entregados" ? (
                                    <span className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">
                                      Vincular pedidos a {item.existingSettlementCode}
                                    </span>
                                  ) : item.existingStatus === "confirmed" ? (
                                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                                      Confirmada ({item.existingSettlementCode})
                                    </span>
                                  ) : item.existingStatus === "draft" ? (
                                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200">
                                      Actualizará {item.existingSettlementCode}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-200">
                                      Nuevo
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 pr-3 pl-1 text-right">
                                  <button
                                    type="button"
                                    onClick={() => setExpandedEntregandoKey(isExpanded ? null : item.key)}
                                    className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                                    title="Ver detalle de pedidos"
                                  >
                                    {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                  </button>
                                </td>
                              </tr>
                              {isExpanded && (
                                <tr>
                                  <td colSpan={9} className="bg-slate-50/70 px-4 py-2 border-t border-slate-100">
                                    <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1.5">
                                      Detalle de {item.orders.length} pedidos a rendir
                                    </div>
                                    <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                                       <table className="w-full text-left text-xs">
                                         <thead className="border-b border-slate-100 bg-slate-50 text-[9px] font-bold text-slate-500">
                                           <tr>
                                             <th className="py-1 px-2.5">Parada</th>
                                             <th className="py-1 px-2.5">Pedido</th>
                                             <th className="py-1 px-2.5">Cliente</th>
                                             <th className="py-1 px-2.5">Medio de Pago</th>
                                             <th className="py-1 px-2.5">Estado pedido</th>
                                             <th className="py-1 px-2.5">Estado pago</th>
                                             <th className="py-1 px-2.5 text-right">A Cobrar</th>
                                           </tr>
                                         </thead>
                                         <tbody className="divide-y divide-slate-100 text-[11px]">
                                           {item.orders.map((ord, oIdx) => (
                                             <tr key={oIdx} className="hover:bg-slate-50">
                                               <td className="py-1 px-2.5 font-semibold text-slate-600">{ord.stopOrder || "-"}</td>
                                               <td className="py-1 px-2.5 font-bold text-slate-800">{ord.orderCode}</td>
                                               <td className="py-1 px-2.5 text-slate-700 truncate max-w-[180px]">{ord.customerName}</td>
                                               <td className="py-1 px-2.5 text-slate-600">{ord.paymentType || "Efectivo"}</td>
                                               <td className="py-1 px-2.5">
                                                 <select value={deliveryStatusChoice(ord.deliveryStatus || "")} disabled={item.existingStatus === "confirmed"} onChange={event => {
                                                   const nextStatus = event.target.value;
                                                   setEntregandoPreview(prev => prev.map(p => {
                                                     if (p.key !== item.key) return p;
                                                     const orders = p.orders.map(o => o.orderCode === ord.orderCode ? { ...o, deliveryStatus: nextStatus } : o);
                                                     return { ...p, orders, totalAmount: settlementOrdersTotal(orders) };
                                                   }));
                                                 }} className="max-w-28 rounded border border-slate-200 bg-white px-1 py-0.5 text-[10px] font-semibold" title={ord.deliveryStatus || "Sin estado"}>
                                                   {deliveryStatusOptions.map(option => <option key={option} value={option}>{option}</option>)}
                                                 </select>
                                               </td>
                                               <td className="py-1 px-2.5">
                                                 {isExcludedDeliveryStatus(ord.deliveryStatus || "") ? <span className="text-rose-600">Sin cobro</span> : ord.isPreviouslyPaid ? (
                                                   <span className="inline-block rounded bg-emerald-50 border border-emerald-200 px-1 py-0.2 text-[9px] font-bold text-emerald-700">
                                                     Abonado previo
                                                   </span>
                                                 ) : (
                                                   <span className="text-slate-500 text-[10px]">
                                                     {ord.paymentState || "Pendiente"}
                                                   </span>
                                                 )}
                                               </td>
                                               <td className="py-1 px-2.5 text-right font-black">
                                                 {ord.isPreviouslyPaid ? (
                                                   <div>
                                                     <span className="text-emerald-700 font-bold">$ 0</span>
                                                     <span className="block text-[8px] font-normal text-slate-400">Total: {formatPrice(ord.totalAmount)}</span>
                                                   </div>
                                                 ) : (
                                                   <span className="text-slate-900">
                                                     {formatPrice(settlementOrderAmount(ord))}
                                                   </span>
                                                 )}
                                               </td>
                                             </tr>
                                           ))}
                                         </tbody>
                                       </table>
                                     </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex flex-col gap-2.5 border-t border-slate-100 bg-slate-50 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs">
                <span className="font-bold text-slate-700">
                  {entregandoPreview.filter(item => selectedEntregandoKeys[item.key]).length} de {entregandoPreview.length} seleccionados
                </span>
                <span className="mx-2 text-slate-300">·</span>
                <span className="font-black text-emerald-700">
                  Total: {formatPrice(entregandoPreview.filter(item => selectedEntregandoKeys[item.key]).reduce((sum, item) => sum + item.totalAmount, 0))}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={entregandoConfirming}
                  onClick={() => setEntregandoModalOpen(false)}
                  className="rounded-lg px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200/70 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={entregandoConfirming || entregandoPreview.filter(item => selectedEntregandoKeys[item.key]).length === 0}
                  onClick={() => void confirmEntregando()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-emerald-700 disabled:opacity-50"
                >
                  {entregandoConfirming ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  {previewSource === "entregados" ? "Vincular / generar" : "Confirmar y generar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Feedback({ error, notice }: { error: string; notice: string }) {
  if (error) return <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs font-medium text-rose-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}</div>;
  return <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-xs font-medium text-emerald-700"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {notice}</div>;
}
function StatCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: "amber" | "blue" | "rose" | "emerald" }) {
  const colors = { amber: "bg-amber-50 text-amber-700 border-amber-200", blue: "bg-blue-50 text-blue-700 border-blue-200", rose: "bg-rose-50 text-rose-700 border-rose-200", emerald: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  return (
    <div className="rounded-xl border border-slate-200/90 bg-white p-2.5 shadow-2xs">
      <div className={`mb-1.5 flex h-7 w-7 items-center justify-center rounded-lg border ${colors[color]}`}>{icon}</div>
      <p className="text-xl font-black text-slate-950 leading-tight">{value}</p>
      <p className="text-[11px] font-semibold text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}
function TextInput({ label, value, disabled = false, onChange, placeholder }: { label: string; value: string; disabled?: boolean; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label>
      <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</span>
      <input
        type="text"
        value={value}
        disabled={disabled}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-[32px] w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-900 outline-none focus:border-blue-500 disabled:bg-slate-100/80 disabled:text-slate-500"
      />
    </label>
  );
}
function CarrierSelect({
  label,
  value,
  carrierName,
  carriers,
  disabled = false,
  onChange,
}: {
  label: string;
  value: string;
  carrierName?: string;
  carriers: Carrier[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const hasSelectedInList = Boolean(value && carriers.some(carrier => carrier.id === value));

  return (
    <label>
      <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={event => onChange(event.target.value)}
        className="h-[32px] w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-900 outline-none focus:border-blue-500 disabled:bg-slate-100/80 disabled:text-slate-500"
      >
        <option value="">Seleccionar transportista</option>
        {value && !hasSelectedInList && (
          <option value={value}>
            {carrierName || "Transportista asignado"}
          </option>
        )}
        {carriers.map(carrier => (
          <option key={carrier.id} value={carrier.id}>
            {carrier.name}{carrier.vehicle_description ? ` · ${carrier.vehicle_description}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
function DateInput({ label, value, disabled = false, onChange }: { label: string; value: string; disabled?: boolean; onChange: (value: string) => void }) {
  const [text, setText] = useState(value ? displayDate(value) : "");

  useEffect(() => {
    setText(value ? displayDate(value) : "");
  }, [value]);

  return (
    <label>
      <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</span>
      <input
        type="text"
        inputMode="numeric"
        maxLength={10}
        value={text}
        disabled={disabled}
        placeholder="dd/mm/aaaa"
        onChange={event => {
          const next = event.target.value;
          setText(next);
          if (!next) onChange("");
          const parsed = parseDisplayDate(next);
          if (parsed) onChange(parsed);
        }}
        onBlur={() => setText(value ? displayDate(value) : "")}
        className="h-[32px] w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-900 outline-none focus:border-blue-500 disabled:bg-slate-100/80 disabled:text-slate-500"
      />
    </label>
  );
}
function MoneyInput({ label, value, disabled = false, onChange, allowNegative = false }: { label: string; value: number; disabled?: boolean; onChange: (value: number) => void; allowNegative?: boolean }) {
  return (
    <label>
      <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</span>
      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">$</span>
        <input
          type="number"
          min={allowNegative ? undefined : 0}
          step="1"
          value={value || ""}
          disabled={disabled}
          onChange={event => {
            const next = inputNumber(event.target.value);
            onChange(allowNegative ? next : Math.max(0, next));
          }}
          placeholder="0"
          className="h-[32px] w-full rounded-lg border border-slate-200 bg-white py-1 pl-6 pr-2.5 text-right text-xs font-black text-slate-900 outline-none focus:border-blue-500 disabled:bg-slate-100/80 disabled:text-slate-500"
        />
      </div>
    </label>
  );
}
function SummaryLine({ label, value, positive, negative }: { label: string; value: number; positive?: boolean; negative?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 text-slate-600">
      <span>{label}</span>
      <span className="font-bold text-slate-800">{positive ? "+ " : negative ? "− " : ""}{formatPrice(value)}</span>
    </div>
  );
}
function ExpenseEditor({ title, subtitle, type, expenses, readOnly, onAdd, onUpdate, onDelete }: {
  title: string; subtitle: string; type: "toll" | "extraordinary"; expenses: ExpenseRow[]; readOnly: boolean;
  onAdd: (type: "toll" | "extraordinary") => void;
  onUpdate: (localId: string, field: "amount" | "reference" | "notes", value: string) => void;
  onDelete: (localId: string) => void;
}) {
  const rows = expenses.filter(expense => expense.type === type);
  const total = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-800">{title}</h2>
          <p className="text-[10px] text-slate-400">{subtitle}</p>
        </div>
        <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-black text-slate-700">
          {formatPrice(total)}
        </span>
      </div>
      <div className="mt-2.5 space-y-1.5">
        {rows.map((expense, index) => (
          <div key={expense.localId} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/50 p-1.5">
            <input
              type="text"
              value={expense.reference || ""}
              disabled={readOnly}
              onChange={event => onUpdate(expense.localId, "reference", event.target.value)}
              placeholder={type === "toll" ? `Ticket ${index + 1}` : "Concepto"}
              className="h-[28px] min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold outline-none focus:border-blue-500 disabled:bg-slate-100"
            />
            <input
              type="number"
              min="0"
              value={expense.amount || ""}
              disabled={readOnly}
              onChange={event => onUpdate(expense.localId, "amount", event.target.value)}
              placeholder="$ 0"
              className="h-[28px] w-24 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-right text-xs font-black outline-none focus:border-blue-500 disabled:bg-slate-100"
            />
            {!readOnly && (
              <button
                type="button"
                onClick={() => onDelete(expense.localId)}
                className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                title="Eliminar"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
        {rows.length === 0 && (
          <p className="rounded-lg border border-dashed border-slate-200 px-3 py-3 text-center text-[11px] text-slate-400">
            Sin gastos cargados.
          </p>
        )}
      </div>
      {!readOnly && (
        <button
          type="button"
          onClick={() => onAdd(type)}
          className="mt-2 inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-200/80"
        >
          <Plus className="h-3.5 w-3.5" /> Agregar
        </button>
      )}
    </div>
  );
}

function ElectronicTicketEditor({
  title,
  subtitle,
  tickets,
  routeOrders = [],
  readOnly,
  onAdd,
  onUpdate,
  onDelete,
}: {
  title: string;
  subtitle: string;
  tickets: ElectronicTicketRow[];
  routeOrders?: RouteOrderDetail[];
  readOnly: boolean;
  onAdd: () => void;
  onUpdate: (localId: string, field: "amount" | "reference" | "paymentType" | "notes" | "orderCode", value: string) => void;
  onDelete: (localId: string) => void;
}) {
  const totals = settlementElectronicTicketTotals(tickets, routeOrders);
  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-800">{title}</h2>
            {tickets.length > 0 && (
              <span className="rounded-md bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                {tickets.length} {tickets.length === 1 ? "ticket" : "tickets"}
              </span>
            )}
          </div>
          <p className="text-[10px] text-slate-400">{subtitle}</p>
        </div>
        <span className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-black text-blue-800">
          {formatPrice(totals.included)} a descontar
        </span>
      </div>

      <div className="mt-2.5 space-y-2">
        {tickets.map((ticket, index) => {
          const excludedFromSettlement = isExcludedSettlementTicket(ticket, routeOrders);
          const cleanCode = (ticket.orderCode || "").trim().toUpperCase();
          const matchedOrder = routeOrders.find(o => o.orderCode.trim().toUpperCase() === cleanCode);
          const allTicketsForThisOrder = cleanCode ? tickets.filter(t => (t.orderCode || "").trim().toUpperCase() === cleanCode) : [];
          const totalDigitalForOrder = allTicketsForThisOrder.reduce((sum, t) => sum + Number(t.amount || 0), 0);
          const orderTotalAmount = matchedOrder ? matchedOrder.totalAmount : 0;
          const isPreviouslyPaid = Boolean(
            matchedOrder?.isPreviouslyPaid ||
            (matchedOrder?.paymentStatus || "").toLowerCase().includes("abonad") ||
            (matchedOrder?.toCollectAmount === 0 && orderTotalAmount > 0)
          );
          const targetToCollect = isPreviouslyPaid
            ? 0
            : (matchedOrder?.toCollectAmount !== undefined ? matchedOrder.toCollectAmount : orderTotalAmount);
          const otherTicketsAmount = allTicketsForThisOrder
            .filter(t => t.localId !== ticket.localId)
            .reduce((sum, t) => sum + Number(t.amount || 0), 0);
          const remainingCashForThis = Math.max(0, targetToCollect - otherTicketsAmount);

          return (
            <div key={ticket.localId} className={`rounded-xl border p-2.5 space-y-2 shadow-2xs ${excludedFromSettlement ? "border-violet-300 bg-violet-50/80" : "border-slate-200 bg-slate-50/70"}`}>
              {excludedFromSettlement && <p className="text-[10px] font-bold text-violet-800">{matchedOrder?.isPreviouslyPaid ? "Pago previo" : "Pedido no entregado"}: este pago queda vinculado al pedido, fuera de la rendición del fletero.</p>}
              {/* Fila 1: Selección de Pedido del recorrido + Tipo de cobro + Monto + Eliminar */}
              <div className="grid grid-cols-[1fr_120px_105px_auto] items-center gap-1.5">
                <div>
                  <label className="mb-0.5 block text-[9px] font-black uppercase tracking-wider text-slate-500">
                    Pedido asignado *
                  </label>
                  <select
                    value={ticket.orderCode || ""}
                    disabled={readOnly}
                    onChange={event => onUpdate(ticket.localId, "orderCode", event.target.value)}
                    className={`h-[30px] w-full rounded-md border bg-white px-2 py-0.5 text-xs font-bold outline-none focus:border-blue-500 disabled:bg-slate-100 ${
                      ticket.orderCode ? "border-blue-300 text-blue-900" : "border-amber-300 text-amber-900 bg-amber-50/30"
                    }`}
                  >
                    <option value="">-- Seleccionar pedido del recorrido --</option>
                    {ticket.orderCode && !routeOrders.some(o => o.orderCode.trim().toUpperCase() === cleanCode) && (
                      <option value={ticket.orderCode}>
                        {ticket.orderCode} (Externo o manual)
                      </option>
                    )}
                    {routeOrders.map(ord => {
                      const isPrev = Boolean(
                        ord.isPreviouslyPaid ||
                        (ord.paymentStatus || "").toLowerCase().includes("abonad") ||
                        (ord.toCollectAmount === 0 && ord.totalAmount > 0)
                      );
                      return (
                        <option key={ord.deliveryId || ord.orderCode} value={ord.orderCode}>
                          #{ord.stopOrder || 1} · {ord.orderCode} · {ord.customerName} ({formatPrice(ord.totalAmount)}) {isPrev ? "[Abonado previo]" : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="mb-0.5 block text-[9px] font-black uppercase tracking-wider text-slate-500">
                    Medio
                  </label>
                  <select
                    value={ticket.paymentType || "POINT"}
                    disabled={readOnly}
                    onChange={event => onUpdate(ticket.localId, "paymentType", event.target.value)}
                    className="h-[30px] w-full rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] font-bold text-slate-800 outline-none focus:border-blue-500 disabled:bg-slate-100"
                  >
                    <option value="POINT">Point</option>
                    <option value="TRANSFERENCIA">Transferencia</option>
                    <option value="OTRO">Otro medio</option>
                  </select>
                </div>

                <div>
                  <label className="mb-0.5 block text-[9px] font-black uppercase tracking-wider text-slate-500 text-right">
                    Monto
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={ticket.amount || ""}
                    disabled={readOnly}
                    onChange={event => onUpdate(ticket.localId, "amount", event.target.value)}
                    placeholder="$ 0"
                    className="h-[30px] w-full rounded-md border border-slate-300 bg-white px-2 py-0.5 text-right text-xs font-black text-slate-900 outline-none focus:border-blue-500 disabled:bg-slate-100"
                  />
                </div>

                <div className="pt-3.5">
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => onDelete(ticket.localId)}
                      className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                      title="Eliminar ticket"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Fila 2: Referencia y Botón de saldo */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={ticket.reference || ""}
                  disabled={readOnly}
                  onChange={event => onUpdate(ticket.localId, "reference", event.target.value)}
                  placeholder={`Referencia o titular (ej. ${ticket.orderCode ? 'Pago cliente / Point' : `Ticket ${index + 1}`})`}
                  className="h-[26px] flex-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 outline-none focus:border-blue-500 disabled:bg-slate-100 placeholder:text-slate-400"
                />
                {cleanCode && matchedOrder && !isPreviouslyPaid && targetToCollect > 0 && Number(ticket.amount || 0) === 0 && remainingCashForThis > 0 && !readOnly && (
                  <button
                    type="button"
                    onClick={() => onUpdate(ticket.localId, "amount", String(remainingCashForThis))}
                    className="h-[26px] whitespace-nowrap rounded-md bg-blue-50 border border-blue-200 px-2 text-[10px] font-bold text-blue-700 hover:bg-blue-100 transition-colors"
                    title="Cargar saldo total restante del pedido en este ticket"
                  >
                    Cargar saldo: {formatPrice(remainingCashForThis)}
                  </button>
                )}
              </div>

              {/* Fila 3: Indicador de Pago Mixto / Control de saldo */}
              {cleanCode ? (
                <div className="flex flex-wrap items-center justify-between gap-1.5 rounded-lg border border-slate-200/80 bg-white px-2.5 py-1 text-[10px]">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-slate-800">
                      Pedido {cleanCode}:
                    </span>
                    {isPreviouslyPaid ? (
                      <span className="font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.2">
                        ✓ Abonado previamente ({formatPrice(orderTotalAmount)}) · Sin cobro en recorrido
                      </span>
                    ) : orderTotalAmount > 0 ? (
                      <>
                        <span className="text-slate-500">Total a cobrar: {formatPrice(targetToCollect)}</span>
                        <span className="text-slate-300">·</span>
                        <span className="font-bold text-blue-700">Digital: {formatPrice(totalDigitalForOrder)}</span>
                        <span className="text-slate-300">·</span>
                        {totalDigitalForOrder < targetToCollect ? (
                          <span className="font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.2">
                            Pago mixto: Restan {formatPrice(targetToCollect - totalDigitalForOrder)} en efectivo
                          </span>
                        ) : totalDigitalForOrder === targetToCollect ? (
                          <span className="font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.2">
                            ✓ 100% digital (sin saldo en efectivo)
                          </span>
                        ) : (
                          <span className="font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded px-1.5 py-0.2">
                            Excede total por {formatPrice(totalDigitalForOrder - targetToCollect)}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-slate-400">Total no registrado en sistema</span>
                    )}
                  </div>
                  {ticket.notes && (
                    <span className="text-slate-400 truncate max-w-xs">{ticket.notes}</span>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-[10px] text-amber-700 bg-amber-50/80 border border-amber-200 rounded px-2 py-0.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                  <span>Sin vincular a pedido. Seleccioná el pedido al que corresponde para controlar pagos mixtos.</span>
                </div>
              )}
            </div>
          );
        })}
        {tickets.length === 0 && (
          <p className="rounded-lg border border-dashed border-slate-200 px-3 py-3 text-center text-[11px] text-slate-400">
            Sin tickets detallados. Podés cargarlos aquí uno por uno o usar el monto manual arriba.
          </p>
        )}
      </div>

      {!readOnly && (
        <button
          type="button"
          onClick={onAdd}
          className="mt-2 inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 hover:bg-blue-100"
        >
          <Plus className="h-3.5 w-3.5" /> Agregar ticket de cobro
        </button>
      )}
    </div>
  );
}
