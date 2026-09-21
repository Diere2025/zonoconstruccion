"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowLeft, Check, CheckCircle2, ChevronRight, CircleDollarSign,
  ClipboardCopy, FileSpreadsheet, Loader2, Plus, RefreshCw, Save, Search, Trash2, Truck, X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatDateDDMMYYYY, formatPrice } from "@/lib/utils";
import {
  buildSettlementMessage, buildTreasuryMovementRows, CASH_DENOMINATIONS,
  getSettlementHealth, treasuryMovementRowsToTsv,
} from "@/lib/treasurySettlements";

type SettlementStatus = "draft" | "confirmed";
interface SettlementRecord {
  id: string;
  code: string;
  status: SettlementStatus;
  settlement_date: string;
  carrier_name: string;
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
}
interface ExpenseRow {
  localId: string;
  type: "toll" | "extraordinary";
  amount: number;
  reference?: string;
  notes?: string;
}
interface DetailPayload {
  settlement: SettlementRecord;
  expenses: Array<{ id: string; expense_type: "toll" | "extraordinary"; amount: number; reference?: string | null; notes?: string | null }>;
  cashCounts: Array<{ money_kind: "bill" | "coin"; denomination: number; quantity: number }>;
}

const emptyStats = { pending: 0, drafts: 0, differences: 0, confirmed: 0 };
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
const inputNumber = (value: string) => {
  const parsed = Number(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};
const cashKey = (kind: string, denomination: number) => `${kind}-${denomination}`;
const isPending = (row: SettlementRecord) => row.status === "draft" && !row.count_date && Number(row.counted_cash || 0) === 0;
const statusLabel = (row: SettlementRecord) => row.status === "confirmed" ? "Confirmada" : isPending(row) ? "Pendiente" : "En preparación";
const statusClasses = (row: SettlementRecord) => row.status === "confirmed"
  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
  : isPending(row) ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-blue-50 text-blue-700 border-blue-200";

export default function RendicionesPage() {
  const [rows, setRows] = useState<SettlementRecord[]>([]);
  const [stats, setStats] = useState(emptyStats);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"pending" | "draft" | "confirmed" | "all">("all");
  const [detail, setDetail] = useState<DetailPayload | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState<"save" | "confirm" | null>(null);
  const [importing, setImporting] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ code: "", settlementDate: today(), carrierName: "", routeDetail: "" });

  const [settlementDate, setSettlementDate] = useState("");
  const [code, setCode] = useState("");
  const [carrierName, setCarrierName] = useState("");
  const [routeDetail, setRouteDetail] = useState("");
  const [deliveriesTotal, setDeliveriesTotal] = useState(0);
  const [electronicTotal, setElectronicTotal] = useState(0);
  const [changeFund, setChangeFund] = useState(0);
  const [shortageRecovered, setShortageRecovered] = useState(0);
  const [countDate, setCountDate] = useState("");
  const [countedCashManual, setCountedCashManual] = useState(0);
  const [cashQuantities, setCashQuantities] = useState<Record<string, number>>({});
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [notes, setNotes] = useState("");
  const [copied, setCopied] = useState(false);
  const [movementCopied, setMovementCopied] = useState(false);

  const authenticatedFetch = useCallback(async (url: string, options?: RequestInit) => {
    const requestWithToken = (accessToken: string) => fetch(url, {
      ...options,
      cache: "no-store",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}`, ...(options?.headers || {}) },
    });
    let { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("La sesión venció. Volvé a ingresar.");
    let response = await requestWithToken(session.access_token);
    if (response.status === 401 || response.status === 403) {
      const { data: { session: refreshedSession } } = await supabase.auth.refreshSession();
      if (refreshedSession?.access_token) response = await requestWithToken(refreshedSession.access_token);
    }
    const payload = await response.json();
    if (!response.ok) {
      const apiError = payload?.error;
      throw new Error(typeof apiError === "string" ? apiError : apiError?.message || apiError?.details || "No se pudo completar la operación.");
    }
    return payload;
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await authenticatedFetch("/api/admin/rendiciones?action=list");
      setRows(payload.rows || []);
      setStats(payload.stats || emptyStats);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudieron cargar las rendiciones.");
    } finally {
      setLoading(false);
    }
  }, [authenticatedFetch]);

  useEffect(() => { void loadList(); }, [loadList]);

  const hydrateDetail = useCallback((payload: DetailPayload) => {
    const settlement = payload.settlement;
    setDetail(payload);
    setSettlementDate(settlement.settlement_date || "");
    setCode(settlement.code || "");
    setCarrierName(settlement.carrier_name || "");
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
    const quantities: Record<string, number> = {};
    payload.cashCounts.forEach(count => { quantities[cashKey(count.money_kind, Number(count.denomination))] = Number(count.quantity) || 0; });
    setCashQuantities(quantities);
    setCopied(false);
    setMovementCopied(false);
  }, []);

  const openSettlement = useCallback(async (id: string) => {
    setDetailLoading(true);
    setError("");
    try {
      const payload = await authenticatedFetch(`/api/admin/rendiciones?action=detail&settlementId=${encodeURIComponent(id)}`);
      hydrateDetail(payload);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo abrir la rendición.");
    } finally {
      setDetailLoading(false);
    }
  }, [authenticatedFetch, hydrateDetail]);

  const filteredRows = useMemo(() => rows.filter(row => {
    const term = search.trim().toLowerCase();
    const matchesSearch = !term || [row.code, row.carrier_name, row.route_detail, formatDateDDMMYYYY(row.settlement_date)]
      .some(value => String(value || "").toLowerCase().includes(term));
    const matchesFilter = filter === "all" || (filter === "confirmed" && row.status === "confirmed")
      || (filter === "pending" && isPending(row)) || (filter === "draft" && row.status === "draft" && !isPending(row));
    return matchesSearch && matchesFilter;
  }), [rows, search, filter]);

  const importMonth = async () => {
    setImporting(true);
    setError("");
    setNotice("");
    try {
      const payload = await authenticatedFetch("/api/admin/rendiciones", { method: "POST", body: JSON.stringify({ action: "import-month" }) });
      setNotice(`Se importaron ${payload.imported} rendiciones de ${payload.month} y se asociaron ${payload.countsAssociated} conteos detallados.`);
      await loadList();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo importar la planilla.");
    } finally {
      setImporting(false);
    }
  };

  const createSettlement = async () => {
    if (!createForm.settlementDate || !createForm.carrierName.trim()) {
      setError("Completá la fecha y el fletero.");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const payload = await authenticatedFetch("/api/admin/rendiciones", {
        method: "POST",
        body: JSON.stringify({ action: "create", ...createForm, expenses: [], cashCounts: [] }),
      });
      setCreateOpen(false);
      setCreateForm({ code: "", settlementDate: today(), carrierName: "", routeDetail: "" });
      await loadList();
      await openSettlement(payload.settlement.id);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo crear la rendición.");
    } finally {
      setCreating(false);
    }
  };

  const detailedCashTotal = useMemo(() => CASH_DENOMINATIONS.reduce((sum, item) => {
    return sum + item.denomination * (cashQuantities[cashKey(item.kind, item.denomination)] || 0);
  }, 0), [cashQuantities]);
  const hasDetailedCash = useMemo(() => Object.values(cashQuantities).some(quantity => quantity > 0), [cashQuantities]);
  const totals = useMemo(() => {
    const tollsTotal = expenses.filter(expense => expense.type === "toll").reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
    const extraordinaryTotal = expenses.filter(expense => expense.type === "extraordinary").reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
    const countedCash = hasDetailedCash ? detailedCashTotal : countedCashManual;
    const expectedCash = deliveriesTotal + changeFund - tollsTotal - extraordinaryTotal - electronicTotal;
    return { tollsTotal, extraordinaryTotal, countedCash, expectedCash, difference: countedCash + shortageRecovered - expectedCash };
  }, [expenses, hasDetailedCash, detailedCashTotal, countedCashManual, deliveriesTotal, changeFund, electronicTotal, shortageRecovered]);
  const health = getSettlementHealth(totals.difference);
  const message = detail?.settlement.status === "confirmed" && detail.settlement.whatsapp_message
    ? detail.settlement.whatsapp_message
    : buildSettlementMessage({ routeDate: settlementDate, difference: totals.difference, changeFund, tollsTotal: totals.tollsTotal, extraordinaryTotal: totals.extraordinaryTotal });
  const movementRows = useMemo(() => buildTreasuryMovementRows({
    movementDate: formatDateDDMMYYYY(countDate || settlementDate),
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

  const saveSettlement = async (action: "save" | "confirm") => {
    if (!detail) return;
    setSaving(action);
    setError("");
    try {
      await authenticatedFetch("/api/admin/rendiciones", {
        method: "POST",
        body: JSON.stringify({
          action,
          settlementId: detail.settlement.id,
          code, settlementDate, carrierName, routeDetail,
          deliveriesTotal, electronicTotal, changeFund, shortageRecovered,
          notes, whatsappMessage: message, countDate: countDate || null,
          countedCashOverride: hasDetailedCash ? null : countedCashManual,
          expenses: expenses.map(({ type, amount, reference, notes: expenseNotes }) => ({ type, amount, reference, notes: expenseNotes })),
          cashCounts: CASH_DENOMINATIONS.map(item => ({ ...item, quantity: cashQuantities[cashKey(item.kind, item.denomination)] || 0 })),
        }),
      });
      const payload = await authenticatedFetch(`/api/admin/rendiciones?action=detail&settlementId=${encodeURIComponent(detail.settlement.id)}`);
      hydrateDetail(payload);
      await loadList();
      setNotice(action === "confirm" ? "Rendición confirmada." : "Cambios guardados.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo guardar la rendición.");
    } finally {
      setSaving(null);
    }
  };

  const copyMessage = async () => { await navigator.clipboard.writeText(message); setCopied(true); window.setTimeout(() => setCopied(false), 1800); };
  const copyMovementRows = async () => { await navigator.clipboard.writeText(treasuryMovementRowsToTsv(movementRows)); setMovementCopied(true); window.setTimeout(() => setMovementCopied(false), 1800); };

  if (detailLoading) return <main className="flex min-h-[70vh] items-center justify-center bg-slate-50"><Loader2 className="h-9 w-9 animate-spin text-blue-600" /></main>;

  if (detail) {
    const readOnly = detail.settlement.status === "confirmed";
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1500px] space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button type="button" onClick={() => { setDetail(null); setError(""); }} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">
              <ArrowLeft className="h-4 w-4" /> Volver a rendiciones
            </button>
            {!readOnly && <div className="flex gap-2">
              <button type="button" onClick={() => void saveSettlement("save")} disabled={Boolean(saving)} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm ring-1 ring-slate-200 disabled:opacity-50">
                {saving === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar
              </button>
              <button type="button" onClick={() => void saveSettlement("confirm")} disabled={Boolean(saving)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50">
                {saving === "confirm" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Confirmar
              </button>
            </div>}
          </div>

          {(error || notice) && <Feedback error={error} notice={notice} />}
          <header className="rounded-3xl bg-slate-950 p-6 text-white shadow-xl sm:p-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">{detail.settlement.source === "spreadsheet" ? "Importada desde planilla" : "Carga manual"}</p>
                <h1 className="mt-2 text-3xl font-black tracking-tight">{code}</h1>
                <p className="mt-2 text-sm text-slate-300">{carrierName} · {formatDateDDMMYYYY(settlementDate)}{routeDetail ? ` · ${routeDetail}` : ""}</p>
              </div>
              <span className={`w-fit rounded-full border px-3 py-1.5 text-xs font-black ${statusClasses(detail.settlement)}`}>{statusLabel(detail.settlement)}</span>
            </div>
          </header>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.75fr)]">
            <div className="space-y-5">
              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="font-black text-slate-950">Datos de la rendición</h2>
                <p className="mt-1 text-xs text-slate-500">Carga independiente de recorridos. No se vincula a códigos LOG.</p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <TextInput label="Código" value={code} disabled={readOnly} onChange={setCode} />
                  <DateInput label="Fecha de la rendición" value={settlementDate} disabled={readOnly} onChange={setSettlementDate} />
                  <TextInput label="Fletero" value={carrierName} disabled={readOnly} onChange={setCarrierName} />
                  <TextInput label="Detalle / recorrido" value={routeDetail} disabled={readOnly} onChange={setRouteDetail} placeholder="Ej.: R2" />
                  <MoneyInput label="Total de entregas" value={deliveriesTotal} disabled={readOnly} onChange={setDeliveriesTotal} />
                  <MoneyInput label="Transferencias / postnet" value={electronicTotal} disabled={readOnly} onChange={setElectronicTotal} />
                  <MoneyInput label="Cambio entregado al salir" value={changeFund} disabled={readOnly} onChange={setChangeFund} />
                  <MoneyInput label="Ajuste ingresado después" value={shortageRecovered} disabled={readOnly} onChange={setShortageRecovered} allowNegative />
                </div>
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <ExpenseEditor title="Peajes" subtitle="Cargá cada ticket o un total sin detalle." type="toll" expenses={expenses} readOnly={readOnly} onAdd={addExpense} onUpdate={updateExpense} onDelete={localId => setExpenses(current => current.filter(expense => expense.localId !== localId))} />
                <div className="my-6 border-t border-slate-100" />
                <ExpenseEditor title="Gastos extraordinarios" subtitle="Alimentos, combustible, insumos u otros gastos del recorrido." type="extraordinary" expenses={expenses} readOnly={readOnly} onAdd={addExpense} onUpdate={updateExpense} onDelete={localId => setExpenses(current => current.filter(expense => expense.localId !== localId))} />
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div><h2 className="font-black text-slate-950">Cuenta de dinero</h2><p className="mt-1 text-xs text-slate-500">El detalle de billetes reemplaza al total manual cuando se carga.</p></div>
                  <DateInput label="Fecha de conteo" value={countDate} disabled={readOnly} onChange={setCountDate} />
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {CASH_DENOMINATIONS.map(item => {
                    const key = cashKey(item.kind, item.denomination);
                    const quantity = cashQuantities[key] || 0;
                    return <label key={key} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      <span className="block text-[10px] font-black uppercase tracking-wider text-slate-400">{item.kind === "bill" ? "Billete" : "Moneda"}</span>
                      <span className="mt-0.5 block text-sm font-black text-slate-800">{formatPrice(item.denomination)}</span>
                      <input type="number" min="0" step="1" value={quantity || ""} disabled={readOnly} onChange={event => setCashQuantities(current => ({ ...current, [key]: Math.max(0, Math.trunc(inputNumber(event.target.value))) }))} placeholder="0" className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-right text-sm font-bold text-slate-900 outline-none focus:border-blue-500 disabled:bg-slate-100" />
                      <span className="mt-1 block text-right text-[10px] font-semibold text-slate-400">{formatPrice(quantity * item.denomination)}</span>
                    </label>;
                  })}
                </div>
                {!hasDetailedCash && <div className="mt-4 max-w-sm"><MoneyInput label="Total contado (sin detalle de billetes)" value={countedCashManual} disabled={readOnly} onChange={setCountedCashManual} /></div>}
              </section>
            </div>

            <aside className="space-y-5 xl:sticky xl:top-5 xl:self-start">
              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="font-black text-slate-950">Resumen</h2>
                <div className="mt-4 space-y-2 border-y border-slate-100 py-4 text-sm">
                  <SummaryLine label="Total entregas" value={deliveriesTotal} />
                  <SummaryLine label="Cambio entregado" value={changeFund} positive />
                  <SummaryLine label="Peajes" value={totals.tollsTotal} negative />
                  <SummaryLine label="Gastos extraordinarios" value={totals.extraordinaryTotal} negative />
                  <SummaryLine label="Transferencias / postnet" value={electronicTotal} negative />
                  <div className="flex items-center justify-between border-t border-slate-200 pt-3"><span className="font-black text-slate-900">Efectivo a rendir</span><span className="text-lg font-black text-slate-950">{formatPrice(totals.expectedCash)}</span></div>
                  <SummaryLine label="Efectivo contado" value={totals.countedCash} />
                  {shortageRecovered > 0 && <SummaryLine label="Faltante ingresado" value={shortageRecovered} positive />}
                </div>
                <div className={`mt-4 rounded-2xl border p-4 ${health === "ok" ? "border-emerald-200 bg-emerald-50" : health === "shortage" ? "border-rose-200 bg-rose-50" : "border-amber-200 bg-amber-50"}`}>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Diferencia final</p>
                  <p className={`mt-1 text-3xl font-black ${health === "ok" ? "text-emerald-700" : health === "shortage" ? "text-rose-700" : "text-amber-700"}`}>{formatPrice(totals.difference)}</p>
                </div>
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3"><div><h2 className="font-black text-slate-950">Reporte para Movimientos</h2><p className="mt-1 text-xs text-slate-500">Cuatro columnas listas para pegar.</p></div>
                  <button type="button" onClick={() => void copyMovementRows()} disabled={movementRows.length === 0} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">{movementCopied ? <Check className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />}{movementCopied ? "Copiado" : "Copiar"}</button>
                </div>
                <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                  {movementRows.length === 0 ? <p className="px-3 py-5 text-center text-xs text-slate-400">Sin movimientos para copiar.</p> : movementRows.map((row, index) => <div key={`${row.detail}-${index}`} className="grid grid-cols-[80px_1fr_58px_92px] gap-2 border-b border-slate-100 px-3 py-2.5 text-[10px] last:border-0"><span>{row.date}</span><span className="truncate font-bold">{row.detail}</span><span className={row.type === "Ingreso" ? "text-emerald-700" : "text-rose-700"}>{row.type}</span><span className="text-right font-black">{formatPrice(row.amount)}</span></div>)}
                </div>
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3"><h2 className="font-black text-slate-950">Mensaje para el fletero</h2><button type="button" onClick={() => void copyMessage()} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700">{copied ? <Check className="h-4 w-4 text-emerald-600" /> : <ClipboardCopy className="h-4 w-4" />}{copied ? "Copiado" : "Copiar"}</button></div>
                <div className="mt-3 whitespace-pre-line rounded-2xl bg-slate-950 p-4 text-sm leading-6 text-slate-100">{message}</div>
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <label className="text-sm font-black text-slate-950">Observaciones</label>
                <textarea value={notes} disabled={readOnly} onChange={event => setNotes(event.target.value)} rows={4} className="mt-3 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none focus:border-blue-500 disabled:bg-slate-100" placeholder="Excepciones o aclaraciones" />
              </section>
            </aside>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <header className="rounded-3xl bg-slate-950 p-6 text-white shadow-xl sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div><div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-300"><CircleDollarSign className="h-6 w-6" /></div><h1 className="text-3xl font-black tracking-tight">Rendiciones de tesorería</h1><p className="mt-2 max-w-2xl text-sm text-slate-300">Creá rendiciones manuales, importá la planilla vigente, registrá gastos y asociá el conteo de efectivo por código.</p></div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void importMonth()} disabled={importing} className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/15 disabled:opacity-50">{importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />} Importar mes actual</button>
              <button type="button" onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-emerald-400"><Plus className="h-4 w-4" /> Nueva rendición</button>
              <button type="button" onClick={() => void loadList()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/15 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualizar</button>
            </div>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Pendientes de conteo" value={stats.pending} icon={<Truck className="h-5 w-5" />} color="amber" />
          <StatCard label="En preparación" value={stats.drafts} icon={<Save className="h-5 w-5" />} color="blue" />
          <StatCard label="Con diferencia" value={stats.differences} icon={<AlertTriangle className="h-5 w-5" />} color="rose" />
          <StatCard label="Confirmadas" value={stats.confirmed} icon={<CheckCircle2 className="h-5 w-5" />} color="emerald" />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative flex-1 lg:max-w-md"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por fletero, fecha o código" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-blue-500" /></div>
            <div className="flex flex-wrap gap-2">{([['pending','Pendientes'],['draft','En preparación'],['confirmed','Confirmadas'],['all','Todas']] as const).map(([value,label]) => <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-xl px-3 py-2 text-xs font-bold ${filter === value ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{label}</button>)}</div>
          </div>
        </section>

        {(error || notice) && <Feedback error={error} notice={notice} />}
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          {loading ? <div className="flex min-h-72 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>
            : filteredRows.length === 0 ? <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center"><CheckCircle2 className="mb-3 h-10 w-10 text-emerald-500" /><h2 className="font-black text-slate-900">No hay rendiciones en esta vista</h2><p className="mt-1 text-sm text-slate-500">Creá una rendición manual o importá las del mes actual.</p></div>
              : <div className="divide-y divide-slate-100">{filteredRows.map(row => <button key={row.id} type="button" onClick={() => void openSettlement(row.id)} className="grid w-full gap-3 px-5 py-4 text-left transition-colors hover:bg-slate-50 md:grid-cols-[minmax(220px,1.4fr)_150px_130px_150px_42px] md:items-center">
                <div className="min-w-0"><p className="truncate text-sm font-black text-slate-950">{row.carrier_name}</p><p className="mt-1 truncate text-xs text-slate-500">{row.code}{row.route_detail ? ` · ${row.route_detail}` : ""} · {row.source === "spreadsheet" ? "Planilla" : "Manual"}</p></div>
                <div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 md:hidden">Fecha</p><p className="text-sm font-bold text-slate-700">{formatDateDDMMYYYY(row.settlement_date)}</p></div>
                <div><span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${statusClasses(row)}`}>{statusLabel(row)}</span></div>
                <div className="md:text-right"><p className={`text-sm font-black ${Math.abs(Number(row.difference)) <= 300 ? "text-emerald-700" : Number(row.difference) < 0 ? "text-rose-700" : "text-amber-700"}`}>{formatPrice(Number(row.difference) || 0)}</p><p className="text-[10px] text-slate-400">Diferencia</p></div>
                <ChevronRight className="hidden h-5 w-5 justify-self-end text-slate-300 md:block" />
              </button>)}</div>}
        </section>
      </div>

      {createOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget) setCreateOpen(false); }}>
        <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
          <div className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-black text-slate-950">Nueva rendición</h2><p className="mt-1 text-sm text-slate-500">Se crea sin asociarla a un recorrido LOG.</p></div><button type="button" onClick={() => setCreateOpen(false)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <TextInput label="Código (opcional)" value={createForm.code} onChange={value => setCreateForm(current => ({ ...current, code: value }))} placeholder="Se genera automáticamente" />
            <DateInput label="Fecha" value={createForm.settlementDate} onChange={value => setCreateForm(current => ({ ...current, settlementDate: value }))} />
            <div className="sm:col-span-2"><TextInput label="Fletero" value={createForm.carrierName} onChange={value => setCreateForm(current => ({ ...current, carrierName: value }))} placeholder="Nombre del fletero" /></div>
            <div className="sm:col-span-2"><TextInput label="Detalle / recorrido (opcional)" value={createForm.routeDetail} onChange={value => setCreateForm(current => ({ ...current, routeDetail: value }))} placeholder="Ej.: R2" /></div>
          </div>
          <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setCreateOpen(false)} className="rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100">Cancelar</button><button type="button" onClick={() => void createSettlement()} disabled={creating} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Crear rendición</button></div>
        </div>
      </div>}
    </main>
  );
}

function Feedback({ error, notice }: { error: string; notice: string }) {
  if (error) return <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-700"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /> {error}</div>;
  return <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-700"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /> {notice}</div>;
}
function StatCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: "amber" | "blue" | "rose" | "emerald" }) {
  const colors = { amber: "bg-amber-50 text-amber-700 border-amber-200", blue: "bg-blue-50 text-blue-700 border-blue-200", rose: "bg-rose-50 text-rose-700 border-rose-200", emerald: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl border ${colors[color]}`}>{icon}</div><p className="text-2xl font-black text-slate-950">{value}</p><p className="text-xs font-semibold text-slate-500">{label}</p></div>;
}
function TextInput({ label, value, disabled = false, onChange, placeholder }: { label: string; value: string; disabled?: boolean; onChange: (value: string) => void; placeholder?: string }) {
  return <label><span className="mb-1.5 block text-xs font-bold text-slate-600">{label}</span><input type="text" value={value} disabled={disabled} onChange={event => onChange(event.target.value)} placeholder={placeholder} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-blue-500 disabled:bg-slate-100" /></label>;
}
function DateInput({ label, value, disabled = false, onChange }: { label: string; value: string; disabled?: boolean; onChange: (value: string) => void }) {
  return <label><span className="mb-1.5 block text-xs font-bold text-slate-600">{label}</span><input type="date" value={value} disabled={disabled} onChange={event => onChange(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-blue-500 disabled:bg-slate-100" /></label>;
}
function MoneyInput({ label, value, disabled = false, onChange, allowNegative = false }: { label: string; value: number; disabled?: boolean; onChange: (value: number) => void; allowNegative?: boolean }) {
  return <label><span className="mb-1.5 block text-xs font-bold text-slate-600">{label}</span><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400">$</span><input type="number" min={allowNegative ? undefined : 0} step="1" value={value || ""} disabled={disabled} onChange={event => { const next = inputNumber(event.target.value); onChange(allowNegative ? next : Math.max(0, next)); }} placeholder="0" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-8 pr-3 text-right text-sm font-black text-slate-900 outline-none focus:border-blue-500 disabled:bg-slate-100" /></div></label>;
}
function SummaryLine({ label, value, positive, negative }: { label: string; value: number; positive?: boolean; negative?: boolean }) {
  return <div className="flex items-center justify-between gap-3 text-slate-600"><span>{label}</span><span className="font-bold text-slate-800">{positive ? "+ " : negative ? "− " : ""}{formatPrice(value)}</span></div>;
}
function ExpenseEditor({ title, subtitle, type, expenses, readOnly, onAdd, onUpdate, onDelete }: {
  title: string; subtitle: string; type: "toll" | "extraordinary"; expenses: ExpenseRow[]; readOnly: boolean;
  onAdd: (type: "toll" | "extraordinary") => void;
  onUpdate: (localId: string, field: "amount" | "reference" | "notes", value: string) => void;
  onDelete: (localId: string) => void;
}) {
  const rows = expenses.filter(expense => expense.type === type);
  const total = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  return <div><div className="flex items-start justify-between gap-3"><div><h2 className="font-black text-slate-950">{title}</h2><p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p></div><span className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700">{formatPrice(total)}</span></div>
    <div className="mt-4 space-y-3">{rows.map((expense, index) => <div key={expense.localId} className="rounded-2xl border border-slate-200 bg-slate-50 p-3"><div className="grid grid-cols-[1fr_120px_auto] gap-2"><input type="text" value={expense.reference || ""} disabled={readOnly} onChange={event => onUpdate(expense.localId, "reference", event.target.value)} placeholder={type === "toll" ? `Ticket ${index + 1}` : "Concepto"} className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold outline-none disabled:bg-slate-100" /><input type="number" min="0" value={expense.amount || ""} disabled={readOnly} onChange={event => onUpdate(expense.localId, "amount", event.target.value)} placeholder="$ 0" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-right text-sm font-black outline-none disabled:bg-slate-100" />{!readOnly && <button type="button" onClick={() => onDelete(expense.localId)} className="rounded-xl p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>}</div></div>)}
      {rows.length === 0 && <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-center text-xs text-slate-400">Sin gastos cargados.</p>}
    </div>{!readOnly && <button type="button" onClick={() => onAdd(type)} className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200"><Plus className="h-4 w-4" /> Agregar</button>}</div>;
}
