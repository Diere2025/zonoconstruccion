"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClipboardCopy,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Truck,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatDateDDMMYYYY, formatPrice } from "@/lib/utils";
import {
  BanknoteCountInput,
  buildSettlementMessage,
  buildTreasuryMovementRows,
  calculateSettlementTotals,
  CASH_DENOMINATIONS,
  formatArgentinaDate,
  getSettlementHealth,
  isElectronicPaymentMethod,
  SettlementExpenseInput,
  SettlementPaymentKind,
  treasuryMovementRowsToTsv,
} from "@/lib/treasurySettlements";

type SettlementStatus = "draft" | "confirmed";

interface SettlementRecord {
  id: string;
  code: string;
  status: SettlementStatus;
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

interface RouteListRow {
  id: string;
  code?: string | null;
  delivery_date: string;
  run_number: number;
  carriers?: { id: string; name: string } | null;
  delivery_count: number;
  route_payments_total: number;
  settlement?: SettlementRecord | null;
}

interface DeliveryRecord {
  id: string;
  order_id?: string | null;
  status: string;
  delivery_order: number;
  orders?: {
    id: string;
    legacy_code?: string | null;
    customer_name: string;
    total_amount: number;
    payment_status: string;
  } | null;
}

interface PaymentRecord {
  id: string;
  order_id?: string | null;
  amount: number;
  currency: string;
  status?: string | null;
  route_sheet_id?: string | null;
  receipt_url?: string | null;
  notes?: string | null;
  created_at?: string | null;
  belongs_to_route: boolean;
  payment_methods?: { id: string; name: string } | null;
  orders?: { id: string; legacy_code?: string | null; customer_name: string } | null;
}

interface DetailPayload {
  route: {
    id: string;
    code?: string | null;
    delivery_date: string;
    run_number: number;
    status: string;
    carriers?: { id: string; name: string; phone?: string | null } | null;
  };
  deliveries: DeliveryRecord[];
  payments: PaymentRecord[];
  settlement: SettlementRecord | null;
  links: Array<{ client_payment_id: string; payment_kind: SettlementPaymentKind; amount: number }>;
  expenses: Array<{
    id: string;
    expense_type: "toll" | "extraordinary";
    amount: number;
    reference?: string | null;
    notes?: string | null;
  }>;
  cashCounts: Array<{ money_kind: "bill" | "coin"; denomination: number; quantity: number }>;
}

interface ExpenseRow extends SettlementExpenseInput {
  localId: string;
}

const emptyStats = { pending: 0, drafts: 0, differences: 0, confirmed: 0 };

function inputNumber(value: string): number {
  const number = Number(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function routeLabel(route: { code?: string | null; run_number: number }): string {
  return route.code || `Recorrido ${route.run_number}`;
}

function statusLabel(settlement?: SettlementRecord | null): string {
  if (!settlement) return "Pendiente";
  return settlement.status === "confirmed" ? "Confirmada" : "En preparación";
}

function statusClasses(settlement?: SettlementRecord | null): string {
  if (!settlement) return "bg-amber-50 text-amber-700 border-amber-200";
  if (settlement.status === "confirmed") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  return "bg-blue-50 text-blue-700 border-blue-200";
}

export default function RendicionesPage() {
  const [rows, setRows] = useState<RouteListRow[]>([]);
  const [stats, setStats] = useState(emptyStats);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"pending" | "draft" | "confirmed" | "all">("pending");
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailPayload | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState<"save" | "confirm" | null>(null);

  const [paymentKinds, setPaymentKinds] = useState<Record<string, SettlementPaymentKind | null>>({});
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [cashQuantities, setCashQuantities] = useState<Record<string, number>>({});
  const [changeFund, setChangeFund] = useState(0);
  const [shortageRecovered, setShortageRecovered] = useState(0);
  const [notes, setNotes] = useState("");
  const [copied, setCopied] = useState(false);
  const [movementCopied, setMovementCopied] = useState(false);

  const authenticatedFetch = useCallback(async (url: string, options?: RequestInit) => {
    const requestWithToken = (accessToken: string) => fetch(url, {
      ...options,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...(options?.headers || {}),
      },
    });

    let { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("La sesión venció. Volvé a ingresar.");

    let response = await requestWithToken(session.access_token);
    if (response.status === 401 || response.status === 403) {
      const { data: { session: refreshedSession } } = await supabase.auth.refreshSession();
      if (refreshedSession?.access_token) {
        session = refreshedSession;
        response = await requestWithToken(session.access_token);
      }
    }

    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "No se pudo completar la operación.");
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

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const hydrateDetail = useCallback((payload: DetailPayload) => {
    setDetail(payload);
    setChangeFund(Number(payload.settlement?.change_fund) || 0);
    setShortageRecovered(Number(payload.settlement?.shortage_recovered) || 0);
    setNotes(payload.settlement?.notes || "");

    const savedLinks = new Map(payload.links.map(link => [link.client_payment_id, link.payment_kind]));
    const initialKinds: Record<string, SettlementPaymentKind | null> = {};
    payload.payments.forEach(payment => {
      const savedKind = savedLinks.get(payment.id);
      initialKinds[payment.id] = savedKind || (
        payload.settlement ? null : payment.belongs_to_route
          ? (isElectronicPaymentMethod(payment.payment_methods?.name) ? "electronic" : "cash")
          : null
      );
    });
    setPaymentKinds(initialKinds);

    setExpenses(payload.expenses.map(expense => ({
      localId: expense.id,
      id: expense.id,
      type: expense.expense_type,
      amount: Number(expense.amount) || 0,
      reference: expense.reference || "",
      notes: expense.notes || "",
    })));

    const initialCounts: Record<string, number> = {};
    payload.cashCounts.forEach(count => {
      initialCounts[`${count.money_kind}-${count.denomination}`] = Number(count.quantity) || 0;
    });
    setCashQuantities(initialCounts);
    setCopied(false);
    setMovementCopied(false);
  }, []);

  const openRoute = useCallback(async (routeId: string) => {
    setSelectedRouteId(routeId);
    setDetailLoading(true);
    setError("");
    try {
      const payload = await authenticatedFetch(`/api/admin/rendiciones?action=detail&routeSheetId=${encodeURIComponent(routeId)}`);
      hydrateDetail(payload);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo abrir la rendición.");
      setSelectedRouteId(null);
    } finally {
      setDetailLoading(false);
    }
  }, [authenticatedFetch, hydrateDetail]);

  const linkedPayments = useMemo(() => {
    if (!detail) return [];
    return detail.payments
      .filter(payment => paymentKinds[payment.id])
      .map(payment => ({
        clientPaymentId: payment.id,
        amount: Number(payment.amount) || 0,
        kind: paymentKinds[payment.id] as SettlementPaymentKind,
      }));
  }, [detail, paymentKinds]);

  const cashCounts = useMemo<BanknoteCountInput[]>(() => CASH_DENOMINATIONS.map(item => ({
    ...item,
    quantity: cashQuantities[`${item.kind}-${item.denomination}`] || 0,
  })), [cashQuantities]);

  const totals = useMemo(() => calculateSettlementTotals({
    payments: linkedPayments,
    expenses,
    cashCounts,
    changeFund,
    shortageRecovered,
  }), [cashCounts, changeFund, expenses, linkedPayments, shortageRecovered]);

  const health = getSettlementHealth(totals.difference);
  const message = detail ? buildSettlementMessage({
    routeDate: detail.route.delivery_date,
    difference: totals.difference,
    changeFund,
    tollsTotal: totals.tollsTotal,
    extraordinaryTotal: totals.extraordinaryTotal,
  }) : "";
  const movementDate = formatArgentinaDate(detail?.settlement?.confirmed_at || new Date());
  const movementRows = buildTreasuryMovementRows({
    movementDate,
    countedCash: totals.countedCash,
    expenses,
    shortageRecovered,
  });
  const readOnly = detail?.settlement?.status === "confirmed";

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter(row => {
      const matchesFilter = filter === "all"
        || (filter === "pending" && !row.settlement)
        || (filter === "draft" && row.settlement?.status === "draft")
        || (filter === "confirmed" && row.settlement?.status === "confirmed");
      if (!matchesFilter) return false;
      if (!term) return true;
      return [row.code, row.carriers?.name, row.settlement?.code, formatDateDDMMYYYY(row.delivery_date)]
        .some(value => String(value || "").toLowerCase().includes(term));
    });
  }, [filter, rows, search]);

  const addExpense = (type: "toll" | "extraordinary") => {
    setExpenses(current => [...current, {
      localId: `${type}-${Date.now()}-${current.length}`,
      type,
      amount: 0,
      reference: "",
      notes: "",
    }]);
  };

  const updateExpense = (localId: string, field: "amount" | "reference" | "notes", value: string) => {
    setExpenses(current => current.map(expense => expense.localId === localId
      ? { ...expense, [field]: field === "amount" ? inputNumber(value) : value }
      : expense));
  };

  const saveSettlement = async (action: "save" | "confirm") => {
    if (!detail || readOnly) return;
    if (action === "confirm" && Math.abs(totals.difference) > 300 && !notes.trim()) {
      setError("Agregá una observación antes de confirmar una rendición con diferencia mayor a $300.");
      return;
    }
    if (action === "confirm" && detail.deliveries.length > 0 && linkedPayments.length === 0 && !notes.trim()) {
      setError("No hay pagos vinculados. Indicá el motivo en Observaciones antes de confirmar.");
      return;
    }

    setSaving(action);
    setError("");
    try {
      await authenticatedFetch("/api/admin/rendiciones", {
        method: "POST",
        body: JSON.stringify({
          action,
          routeSheetId: detail.route.id,
          changeFund,
          shortageRecovered,
          notes,
          whatsappMessage: message,
          payments: linkedPayments,
          expenses,
          cashCounts,
        }),
      });
      const refreshed = await authenticatedFetch(`/api/admin/rendiciones?action=detail&routeSheetId=${encodeURIComponent(detail.route.id)}`);
      hydrateDetail(refreshed);
      await loadList();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo guardar la rendición.");
    } finally {
      setSaving(null);
    }
  };

  const copyMessage = async () => {
    await navigator.clipboard.writeText(message);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const copyMovementRows = async () => {
    await navigator.clipboard.writeText(treasuryMovementRowsToTsv(movementRows));
    setMovementCopied(true);
    window.setTimeout(() => setMovementCopied(false), 1800);
  };

  if (selectedRouteId) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1500px]">
          <button
            type="button"
            onClick={() => { setSelectedRouteId(null); setDetail(null); setError(""); }}
            className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-950"
          >
            <ArrowLeft className="h-4 w-4" /> Volver a rendiciones
          </button>

          {detailLoading || !detail ? (
            <div className="flex min-h-[55vh] items-center justify-center rounded-3xl border border-slate-200 bg-white">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : (
            <div className="space-y-5">
              <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-3 py-1 text-xs font-bold ${statusClasses(detail.settlement)}`}>
                        {statusLabel(detail.settlement)}
                      </span>
                      {detail.settlement?.code && <span className="text-xs font-bold text-slate-400">{detail.settlement.code}</span>}
                    </div>
                    <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Rendición de {detail.route.carriers?.name || "transportista"}</h1>
                    <p className="mt-2 text-sm text-slate-500">
                      {formatDateDDMMYYYY(detail.route.delivery_date)} · {routeLabel(detail.route)} · {detail.deliveries.length} paradas
                    </p>
                  </div>
                  {!readOnly && (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <button
                        type="button"
                        onClick={() => void saveSettlement("save")}
                        disabled={saving !== null}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {saving === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar borrador
                      </button>
                      <button
                        type="button"
                        onClick={() => void saveSettlement("confirm")}
                        disabled={saving !== null}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {saving === "confirm" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Confirmar rendición
                      </button>
                    </div>
                  )}
                </div>
              </header>

              {error && (
                <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-700">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /> {error}
                </div>
              )}

              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(360px,0.75fr)]">
                <div className="space-y-5">
                  <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <h2 className="font-black text-slate-950">Pagos del recorrido</h2>
                        <p className="mt-1 text-xs text-slate-500">Seleccioná los pagos que forman parte de esta rendición y clasificá cómo ingresaron.</p>
                      </div>
                      <span className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-black text-slate-700">{formatPrice(totals.deliveriesTotal)}</span>
                    </div>

                    {detail.payments.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-5 text-sm text-amber-800">
                        No hay pagos registrados para los pedidos de este recorrido. Podés guardar el borrador y documentar el caso en Observaciones.
                      </div>
                    ) : (
                      <div className="overflow-hidden rounded-2xl border border-slate-200">
                        <div className="hidden grid-cols-[42px_minmax(150px,1fr)_150px_160px] gap-3 bg-slate-50 px-4 py-3 text-[11px] font-black uppercase tracking-wider text-slate-500 md:grid">
                          <span /> <span>Pedido y cliente</span><span>Medio</span><span className="text-right">Importe</span>
                        </div>
                        <div className="divide-y divide-slate-100">
                          {detail.payments.map(payment => {
                            const selected = paymentKinds[payment.id] !== null && paymentKinds[payment.id] !== undefined;
                            return (
                              <div key={payment.id} className={`grid gap-3 px-4 py-3 md:grid-cols-[42px_minmax(150px,1fr)_150px_160px] md:items-center ${selected ? "bg-blue-50/40" : "bg-white"}`}>
                                <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
                                  <input
                                    type="checkbox"
                                    checked={selected}
                                    disabled={readOnly}
                                    onChange={event => setPaymentKinds(current => ({
                                      ...current,
                                      [payment.id]: event.target.checked
                                        ? (isElectronicPaymentMethod(payment.payment_methods?.name) ? "electronic" : "cash")
                                        : null,
                                    }))}
                                    className="h-4 w-4 rounded border-slate-300 text-blue-600"
                                  />
                                  <span className="md:hidden">Incluir</span>
                                </label>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-black text-slate-900">{payment.orders?.legacy_code || payment.orders?.id?.slice(0, 8) || "Pago sin pedido"}</p>
                                  <p className="truncate text-xs text-slate-500">{payment.orders?.customer_name || payment.notes || "Sin detalle"}</p>
                                  {!payment.belongs_to_route && <p className="mt-1 text-[10px] font-bold text-amber-700">Pago del pedido sin recorrido asignado</p>}
                                </div>
                                <select
                                  value={paymentKinds[payment.id] || "cash"}
                                  disabled={!selected || readOnly}
                                  onChange={event => setPaymentKinds(current => ({ ...current, [payment.id]: event.target.value as SettlementPaymentKind }))}
                                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:bg-slate-100 disabled:text-slate-400"
                                >
                                  <option value="cash">Efectivo</option>
                                  <option value="electronic">Transferencia / postnet</option>
                                </select>
                                <div className="text-left md:text-right">
                                  <p className="text-sm font-black text-slate-950">{formatPrice(Number(payment.amount) || 0)}</p>
                                  <p className="text-[10px] text-slate-400">{payment.payment_methods?.name || "Sin medio"} · {payment.status || "Sin estado"}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </section>

                  <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="grid gap-5 lg:grid-cols-2">
                      <ExpenseEditor
                        title="Peajes"
                        subtitle="Reemplaza los tickets fijos de la planilla. Podés cargar todos los necesarios."
                        type="toll"
                        expenses={expenses}
                        readOnly={readOnly}
                        onAdd={addExpense}
                        onUpdate={updateExpense}
                        onDelete={localId => setExpenses(current => current.filter(item => item.localId !== localId))}
                      />
                      <ExpenseEditor
                        title="Gastos extraordinarios"
                        subtitle="Combustible, alimento, reparaciones u otros gastos autorizados."
                        type="extraordinary"
                        expenses={expenses}
                        readOnly={readOnly}
                        onAdd={addExpense}
                        onUpdate={updateExpense}
                        onDelete={localId => setExpenses(current => current.filter(item => item.localId !== localId))}
                      />
                    </div>
                  </section>

                  <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="mb-5 flex items-center justify-between gap-4">
                      <div>
                        <h2 className="font-black text-slate-950">Cuenta de dinero</h2>
                        <p className="mt-1 text-xs text-slate-500">Ingresá la cantidad física de billetes y monedas recibidos.</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Efectivo contado</p>
                        <p className="text-xl font-black text-slate-950">{formatPrice(totals.countedCash)}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                      {CASH_DENOMINATIONS.map(item => {
                        const key = `${item.kind}-${item.denomination}`;
                        const quantity = cashQuantities[key] || 0;
                        return (
                          <label key={key} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                            <span className="block text-[10px] font-black uppercase tracking-wider text-slate-400">{item.kind === "bill" ? "Billete" : "Moneda"}</span>
                            <span className="mt-0.5 block text-sm font-black text-slate-800">{formatPrice(item.denomination)}</span>
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={quantity || ""}
                              disabled={readOnly}
                              onChange={event => setCashQuantities(current => ({ ...current, [key]: Math.max(0, inputNumber(event.target.value)) }))}
                              placeholder="0"
                              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-right text-sm font-bold text-slate-900 outline-none focus:border-blue-500 disabled:bg-slate-100"
                            />
                            <span className="mt-1 block text-right text-[10px] font-semibold text-slate-400">{formatPrice(quantity * item.denomination)}</span>
                          </label>
                        );
                      })}
                    </div>
                  </section>
                </div>

                <aside className="space-y-5 xl:sticky xl:top-5 xl:self-start">
                  <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h2 className="font-black text-slate-950">Cierre de rendición</h2>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                      <MoneyInput label="Cambio entregado al salir" value={changeFund} disabled={readOnly} onChange={setChangeFund} />
                      <MoneyInput label="Faltante ingresado después" value={shortageRecovered} disabled={readOnly} onChange={setShortageRecovered} />
                    </div>

                    <div className="my-5 space-y-2 border-y border-slate-100 py-5 text-sm">
                      <SummaryLine label="Pagos del recorrido" value={totals.deliveriesTotal} />
                      <SummaryLine label="Cambio entregado" value={changeFund} positive />
                      <SummaryLine label="Peajes" value={totals.tollsTotal} negative />
                      <SummaryLine label="Gastos extraordinarios" value={totals.extraordinaryTotal} negative />
                      <SummaryLine label="Transferencias / postnet" value={totals.electronicTotal} negative />
                      <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3">
                        <span className="font-black text-slate-900">Efectivo a rendir</span>
                        <span className="text-lg font-black text-slate-950">{formatPrice(totals.expectedCash)}</span>
                      </div>
                      <SummaryLine label="Efectivo contado" value={totals.countedCash} />
                      {shortageRecovered > 0 && <SummaryLine label="Faltante ingresado" value={shortageRecovered} positive />}
                    </div>

                    <div className={`rounded-2xl border p-4 ${
                      health === "ok" ? "border-emerald-200 bg-emerald-50" : health === "shortage" ? "border-rose-200 bg-rose-50" : "border-amber-200 bg-amber-50"
                    }`}>
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Diferencia final</p>
                      <p className={`mt-1 text-3xl font-black ${health === "ok" ? "text-emerald-700" : health === "shortage" ? "text-rose-700" : "text-amber-700"}`}>
                        {formatPrice(totals.difference)}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-slate-600">
                        {health === "ok" ? "Dentro de la tolerancia de $300." : health === "shortage" ? "Hay un faltante para revisar." : "Hay un sobrante para revisar."}
                      </p>
                    </div>
                  </section>

                  <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="font-black text-slate-950">Reporte para Movimientos</h2>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          {readOnly ? "Reporte final listo para pegar en la planilla de Tesorería." : "Vista previa. La fecha se fija al confirmar la rendición."}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void copyMovementRows()}
                        disabled={movementRows.length === 0}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {movementCopied ? <Check className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />}
                        {movementCopied ? "Copiado" : "Copiar filas"}
                      </button>
                    </div>
                    <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                      <div className="grid grid-cols-[92px_minmax(150px,1fr)_70px_110px] gap-2 bg-slate-50 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-slate-400">
                        <span>Fecha</span><span>Detalle</span><span>Tipo</span><span className="text-right">Importe</span>
                      </div>
                      {movementRows.length === 0 ? (
                        <p className="px-3 py-5 text-center text-xs text-slate-400">El reporte aparecerá al contabilizar efectivo o gastos.</p>
                      ) : (
                        <div className="divide-y divide-slate-100">
                          {movementRows.map((row, index) => (
                            <div key={`${row.detail}-${row.type}-${index}`} className="grid grid-cols-[92px_minmax(150px,1fr)_70px_110px] gap-2 px-3 py-2.5 text-[11px]">
                              <span className="font-semibold text-slate-500">{row.date}</span>
                              <span className="truncate font-bold text-slate-800" title={row.detail}>{row.detail}</span>
                              <span className={`font-bold ${row.type === "Ingreso" ? "text-emerald-700" : "text-rose-700"}`}>{row.type}</span>
                              <span className="text-right font-black text-slate-900">{formatPrice(row.amount)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <p className="mt-3 text-[10px] leading-4 text-slate-400">Se copian cuatro columnas sin encabezado: Fecha, Detalle, Tipo e Importe.</p>
                  </section>

                  <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="font-black text-slate-950">Mensaje para el fletero</h2>
                      <button
                        type="button"
                        onClick={() => void copyMessage()}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200"
                      >
                        {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <ClipboardCopy className="h-4 w-4" />}
                        {copied ? "Copiado" : "Copiar"}
                      </button>
                    </div>
                    <div className="mt-3 whitespace-pre-line rounded-2xl bg-slate-950 p-4 text-sm leading-6 text-slate-100">{message}</div>
                  </section>

                  <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <label className="text-sm font-black text-slate-950" htmlFor="settlement-notes">Observaciones</label>
                    <p className="mt-1 text-xs text-slate-500">Dejá asentada cualquier excepción o explicación de una diferencia.</p>
                    <textarea
                      id="settlement-notes"
                      value={notes}
                      disabled={readOnly}
                      onChange={event => setNotes(event.target.value)}
                      rows={4}
                      className="mt-3 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none focus:border-blue-500 disabled:bg-slate-100"
                      placeholder="Ej.: el fletero completará el faltante mañana."
                    />
                  </section>
                </aside>
              </div>
            </div>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <header className="rounded-3xl bg-slate-950 p-6 text-white shadow-xl sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-300">
                <CircleDollarSign className="h-6 w-6" />
              </div>
              <h1 className="text-3xl font-black tracking-tight">Rendiciones de recorridos</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">Vinculá los pagos cobrados en calle, registrá gastos, contá el efectivo y cerrá cada recorrido con trazabilidad.</p>
            </div>
            <button
              type="button"
              onClick={() => void loadList()}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/15 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualizar
            </button>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Pendientes" value={stats.pending} icon={<Truck className="h-5 w-5" />} color="amber" />
          <StatCard label="En preparación" value={stats.drafts} icon={<Save className="h-5 w-5" />} color="blue" />
          <StatCard label="Con diferencia" value={stats.differences} icon={<AlertTriangle className="h-5 w-5" />} color="rose" />
          <StatCard label="Confirmadas" value={stats.confirmed} icon={<CheckCircle2 className="h-5 w-5" />} color="emerald" />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative flex-1 lg:max-w-md">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Buscar por fletero, fecha o código"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {([
                ["pending", "Pendientes"],
                ["draft", "En preparación"],
                ["confirmed", "Confirmadas"],
                ["all", "Todas"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  className={`rounded-xl px-3 py-2 text-xs font-bold ${filter === value ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {error && (
          <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-700">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /> {error}
          </div>
        )}

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <div className="flex min-h-72 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>
          ) : filteredRows.length === 0 ? (
            <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
              <CheckCircle2 className="mb-3 h-10 w-10 text-emerald-500" />
              <h2 className="font-black text-slate-900">No hay rendiciones en esta vista</h2>
              <p className="mt-1 text-sm text-slate-500">Probá con otro filtro o actualizá la lista cuando finalice un recorrido.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredRows.map(row => {
                const difference = Number(row.settlement?.difference) || 0;
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => void openRoute(row.id)}
                    className="grid w-full gap-3 px-5 py-4 text-left transition-colors hover:bg-slate-50 md:grid-cols-[minmax(180px,1.3fr)_150px_120px_150px_42px] md:items-center"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-950">{row.carriers?.name || "Sin transportista"}</p>
                      <p className="mt-1 text-xs text-slate-500">{routeLabel(row)} · {row.delivery_count} paradas</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 md:hidden">Fecha</p>
                      <p className="text-sm font-bold text-slate-700">{formatDateDDMMYYYY(row.delivery_date)}</p>
                    </div>
                    <div>
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${statusClasses(row.settlement)}`}>{statusLabel(row.settlement)}</span>
                    </div>
                    <div className="md:text-right">
                      {row.settlement ? (
                        <>
                          <p className={`text-sm font-black ${Math.abs(difference) <= 300 ? "text-emerald-700" : difference < 0 ? "text-rose-700" : "text-amber-700"}`}>{formatPrice(difference)}</p>
                          <p className="text-[10px] text-slate-400">Diferencia</p>
                        </>
                      ) : (
                        <>
                          <p className="text-sm font-black text-slate-800">{formatPrice(row.route_payments_total)}</p>
                          <p className="text-[10px] text-slate-400">Pagos registrados</p>
                        </>
                      )}
                    </div>
                    <ChevronRight className="hidden h-5 w-5 justify-self-end text-slate-300 md:block" />
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: "amber" | "blue" | "rose" | "emerald" }) {
  const colors = {
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    rose: "bg-rose-50 text-rose-700 border-rose-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl border ${colors[color]}`}>{icon}</div>
      <p className="text-2xl font-black text-slate-950">{value}</p>
      <p className="text-xs font-semibold text-slate-500">{label}</p>
    </div>
  );
}

function MoneyInput({ label, value, disabled, onChange }: { label: string; value: number; disabled: boolean; onChange: (value: number) => void }) {
  return (
    <label>
      <span className="mb-1.5 block text-xs font-bold text-slate-600">{label}</span>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400">$</span>
        <input
          type="number"
          min="0"
          step="1"
          value={value || ""}
          disabled={disabled}
          onChange={event => onChange(Math.max(0, inputNumber(event.target.value)))}
          placeholder="0"
          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-8 pr-3 text-right text-sm font-black text-slate-900 outline-none focus:border-blue-500 disabled:bg-slate-100"
        />
      </div>
    </label>
  );
}

function SummaryLine({ label, value, positive, negative }: { label: string; value: number; positive?: boolean; negative?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 text-slate-600">
      <span>{label}</span>
      <span className="font-bold text-slate-800">{positive ? "+ " : negative ? "− " : ""}{formatPrice(value)}</span>
    </div>
  );
}

function ExpenseEditor({
  title,
  subtitle,
  type,
  expenses,
  readOnly,
  onAdd,
  onUpdate,
  onDelete,
}: {
  title: string;
  subtitle: string;
  type: "toll" | "extraordinary";
  expenses: ExpenseRow[];
  readOnly: boolean;
  onAdd: (type: "toll" | "extraordinary") => void;
  onUpdate: (localId: string, field: "amount" | "reference" | "notes", value: string) => void;
  onDelete: (localId: string) => void;
}) {
  const rows = expenses.filter(expense => expense.type === type);
  const total = rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-black text-slate-950">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p>
        </div>
        <span className="whitespace-nowrap rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700">{formatPrice(total)}</span>
      </div>
      <div className="mt-4 space-y-3">
        {rows.map((expense, index) => (
          <div key={expense.localId} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="grid grid-cols-[1fr_120px_auto] gap-2">
              <input
                type="text"
                value={expense.reference || ""}
                disabled={readOnly}
                onChange={event => onUpdate(expense.localId, "reference", event.target.value)}
                placeholder={type === "toll" ? `Ticket ${index + 1}` : "Concepto del gasto"}
                className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none focus:border-blue-500 disabled:bg-slate-100"
              />
              <input
                type="number"
                min="0"
                value={expense.amount || ""}
                disabled={readOnly}
                onChange={event => onUpdate(expense.localId, "amount", event.target.value)}
                placeholder="$ 0"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-right text-xs font-black outline-none focus:border-blue-500 disabled:bg-slate-100"
              />
              {!readOnly && (
                <button type="button" onClick={() => onDelete(expense.localId)} className="rounded-xl p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Eliminar gasto">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
            {type === "extraordinary" && (
              <input
                type="text"
                value={expense.notes || ""}
                disabled={readOnly}
                onChange={event => onUpdate(expense.localId, "notes", event.target.value)}
                placeholder="Detalle u observación"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-500 disabled:bg-slate-100"
              />
            )}
          </div>
        ))}
        {rows.length === 0 && <p className="rounded-2xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">Sin gastos cargados.</p>}
        {!readOnly && (
          <button type="button" onClick={() => onAdd(type)} className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50">
            <Plus className="h-4 w-4" /> Agregar {type === "toll" ? "peaje" : "gasto"}
          </button>
        )}
      </div>
    </div>
  );
}
