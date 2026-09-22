export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchSpreadsheetValueRanges } from "@/lib/googleSheets";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const SOURCE_SPREADSHEET_ID = "1NEXHZbDJhXCHpsZEyKq3k3rq_O_foLDtct-hvsFeifI";
const DENOMINATIONS = [
  { denomination: 20000, kind: "bill" }, { denomination: 10000, kind: "bill" },
  { denomination: 2000, kind: "bill" }, { denomination: 1000, kind: "bill" },
  { denomination: 500, kind: "bill" }, { denomination: 200, kind: "bill" },
  { denomination: 100, kind: "bill" }, { denomination: 50, kind: "bill" },
  { denomination: 20, kind: "bill" }, { denomination: 10, kind: "bill" },
  { denomination: 10, kind: "coin" }, { denomination: 5, kind: "coin" },
  { denomination: 2, kind: "coin" }, { denomination: 1, kind: "coin" },
] as const;

type AuthorizedUser = { id: string; name: string; roles: string[] };
type AuthorizationResult = { actor: AuthorizedUser; reason: null } | {
  actor: null;
  reason: "missing_token" | "server_config" | "invalid_session" | "inactive" | "forbidden";
};
type ExpensePayload = { type?: string; amount?: number; reference?: string; notes?: string };
type CashCountPayload = { kind?: string; denomination?: number; quantity?: number };
type SavePayload = {
  action?: "create" | "save" | "confirm" | "import-month";
  settlementId?: string;
  code?: string;
  settlementDate?: string;
  carrierName?: string;
  carrierId?: string;
  routeDetail?: string;
  deliveriesTotal?: number;
  electronicTotal?: number;
  changeFund?: number;
  shortageRecovered?: number;
  notes?: string;
  whatsappMessage?: string;
  countDate?: string | null;
  countedCashOverride?: number | null;
  expenses?: ExpensePayload[];
  cashCounts?: CashCountPayload[];
};

async function authorize(request: Request): Promise<AuthorizationResult> {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { actor: null, reason: "missing_token" };
  if (!supabaseUrl || !serviceRoleKey) return { actor: null, reason: "server_config" };
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return { actor: null, reason: "invalid_session" };
  let { data: seller } = await supabaseAdmin.from("sellers")
    .select("id, full_name, email, role, roles, is_active").eq("id", user.id).maybeSingle();
  if (!seller && user.email) {
    const response = await supabaseAdmin.from("sellers")
      .select("id, full_name, email, role, roles, is_active").ilike("email", user.email).maybeSingle();
    seller = response.data;
  }
  const roles = Array.from(new Set([
    seller?.role,
    ...(Array.isArray(seller?.roles) ? seller.roles : []),
    user.user_metadata?.role,
    ...(Array.isArray(user.user_metadata?.roles) ? user.user_metadata.roles : []),
  ].filter(Boolean).map(value => String(value).toLowerCase())));
  const isKnownAdmin = ["diego.boveda@gmail.com", "caroibarra.93@gmail.com"].includes((user.email || "").toLowerCase());
  if (seller?.is_active === false) return { actor: null, reason: "inactive" };
  if (!roles.includes("admin") && !roles.includes("administracion") && !isKnownAdmin) return { actor: null, reason: "forbidden" };
  return { actor: { id: user.id, name: seller?.full_name || user.user_metadata?.full_name || user.email || "Usuario", roles }, reason: null };
}

function unauthorized(reason: AuthorizationResult["reason"]) {
  const messages = {
    missing_token: "La sesión venció. Volvé a ingresar.",
    server_config: "El servidor no pudo validar la sesión. Revisá la configuración de acceso.",
    invalid_session: "La sesión no pudo validarse. Actualizá la página o volvé a ingresar.",
    inactive: "Tu usuario está inactivo.",
    forbidden: "No tenés permisos para acceder a rendiciones.",
  };
  const response = NextResponse.json({ error: messages[reason || "forbidden"] }, { status: 403 });
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

function asNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = String(value ?? "").trim().replace(/\s/g, "").replace(/\$/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseSheetDate(value: unknown): string | null {
  const match = String(value ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function argentinaMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  return {
    year: Number(parts.find(part => part.type === "year")?.value),
    month: Number(parts.find(part => part.type === "month")?.value),
  };
}

function carrierTokens(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .match(/[a-z0-9]+/g)?.sort().join(" ") || "";
}

function carrierWords(value: string) {
  return carrierTokens(value).split(" ").filter(Boolean);
}

function findCarrier(name: string, carriers: Array<{ id: string; name: string }>) {
  const normalized = carrierTokens(name);
  if (normalized.includes("gyv")) return carriers.find(carrier => carrier.name.toLowerCase() === "gyv") || null;
  const exact = carriers.find(carrier => carrierTokens(carrier.name) === normalized);
  if (exact) return exact;
  const sourceWords = carrierWords(name);
  const candidates = carriers.filter(carrier => {
    const candidateWords = carrierWords(carrier.name);
    return sourceWords.length >= 2 && sourceWords.every(word => candidateWords.includes(word));
  });
  return candidates.length === 1 ? candidates[0] : null;
}

function readableError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const candidate = error as { message?: unknown; details?: unknown };
    if (typeof candidate.message === "string") return candidate.message;
    if (typeof candidate.details === "string") return candidate.details;
    try { return JSON.stringify(error); } catch { /* noop */ }
  }
  return "Ocurrió un error inesperado al consultar las rendiciones.";
}

export async function GET(request: Request) {
  const authorization = await authorize(request);
  if (!authorization.actor) return unauthorized(authorization.reason);
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || "list";
    if (action === "list") {
      const { data, error } = await supabaseAdmin.from("treasury_settlements").select("*")
        .order("settlement_date", { ascending: false }).order("code", { ascending: false }).limit(500);
      if (error) throw error;
      const rows = data || [];
      const stats = rows.reduce((acc, row) => {
        if (row.status === "confirmed") acc.confirmed += 1;
        else if (row.count_date || asNumber(row.counted_cash) > 0) acc.drafts += 1;
        else acc.pending += 1;
        if (row.status !== "confirmed" && Math.abs(asNumber(row.difference)) > 300) acc.differences += 1;
        return acc;
      }, { pending: 0, drafts: 0, differences: 0, confirmed: 0 });
      return NextResponse.json({ rows, stats });
    }
    if (action === "carriers") {
      const { data, error } = await supabaseAdmin
        .from("carriers")
        .select("id, name, vehicle_description")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return NextResponse.json({ carriers: data || [] });
    }
    if (action === "detail") {
      const settlementId = searchParams.get("settlementId");
      if (!settlementId) return NextResponse.json({ error: "Falta la rendición." }, { status: 400 });
      const [settlementRes, expensesRes, countsRes] = await Promise.all([
        supabaseAdmin.from("treasury_settlements").select("*").eq("id", settlementId).single(),
        supabaseAdmin.from("treasury_settlement_expenses").select("*").eq("settlement_id", settlementId).order("expense_type").order("sort_order"),
        supabaseAdmin.from("treasury_settlement_cash_counts").select("*").eq("settlement_id", settlementId),
      ]);
      if (settlementRes.error) throw settlementRes.error;
      if (expensesRes.error) throw expensesRes.error;
      if (countsRes.error) throw countsRes.error;
      return NextResponse.json({ settlement: settlementRes.data, expenses: expensesRes.data || [], cashCounts: countsRes.data || [] });
    }
    return NextResponse.json({ error: "Acción inválida." }, { status: 400 });
  } catch (error) {
    console.error("[Rendiciones GET]", error);
    return NextResponse.json({ error: readableError(error) }, { status: 500 });
  }
}

async function importCurrentMonth(actor: AuthorizedUser) {
  const [settlementRows, countRows] = await fetchSpreadsheetValueRanges(SOURCE_SPREADSHEET_ID, [
    "'Entregas'!A2:AT3232",
    "'Cuenta Dinero'!A2:S4252",
  ]);
  const current = argentinaMonth();
  const monthRows = settlementRows.map((row, index) => ({ row, sourceRow: index + 2, date: parseSheetDate(row[2]) })).filter(item => {
    if (!item.date || !String(item.row[1] || "").trim()) return false;
    const [year, month] = item.date.split("-").map(Number);
    return year === current.year && month === current.month;
  });
  const countsByCode = new Map<string, string[]>();
  countRows.forEach(row => {
    const code = String(row[0] || "").trim().toUpperCase();
    if (code) countsByCode.set(code, row);
  });
  const { data: activeCarriers, error: carriersError } = await supabaseAdmin
    .from("carriers")
    .select("id, name")
    .eq("is_active", true);
  if (carriersError) throw carriersError;

  let countsAssociated = 0;
  for (const item of monthRows) {
    const row = item.row;
    const code = String(row[1]).trim().toUpperCase();
    const countRow = countsByCode.get(code);
    const importedCarrierName = String(row[3] || countRow?.[2] || "Sin fletero").trim() || "Sin fletero";
    const matchedCarrier = findCarrier(importedCarrierName, activeCarriers || []);
    const countDate = parseSheetDate(countRow?.[1]);
    const confirmed = /^(true|verdadero|si|sí|x)$/i.test(String(row[0] || "").trim());
    const tollTickets = row.slice(8, 17).map(asNumber);
    const tollTotal = asNumber(row[7]);
    const expenses: Array<{ expense_type: string; amount: number; reference: string; notes: string; sort_order: number }> = [];
    let sortOrder = 0;
    tollTickets.forEach((amount, index) => {
      if (amount > 0) expenses.push({ expense_type: "toll", amount, reference: `Ticket peaje ${index + 1}`, notes: "", sort_order: sortOrder++ });
    });
    const tollDifference = Math.max(0, tollTotal - tollTickets.reduce((sum, amount) => sum + amount, 0));
    if (tollDifference > 0) expenses.push({ expense_type: "toll", amount: tollDifference, reference: "Peajes sin detalle", notes: "", sort_order: sortOrder++ });

    const extraTotal = asNumber(row[17]);
    const extraLabels = ["Alimento personal", "Combustible", "Gasto policial", "Insumos de computación", "Arreglos / repuestos"];
    const extraValues = row.slice(18, 23).map(asNumber);
    extraValues.forEach((amount, index) => {
      if (amount > 0) expenses.push({ expense_type: "extraordinary", amount, reference: extraLabels[index], notes: "", sort_order: sortOrder++ });
    });
    const extraDifference = Math.max(0, extraTotal - extraValues.reduce((sum, amount) => sum + amount, 0));
    if (extraDifference > 0) expenses.push({ expense_type: "extraordinary", amount: extraDifference, reference: "Gasto extraordinario", notes: "", sort_order: sortOrder++ });

    const cashCounts = countRow ? DENOMINATIONS.map((denomination, index) => ({
      money_kind: denomination.kind,
      denomination: denomination.denomination,
      quantity: Math.max(0, Math.trunc(asNumber(countRow[index + 3]))),
    })).filter(entry => entry.quantity > 0) : [];
    if (countRow) countsAssociated += 1;

    const payload = {
      code,
      route_sheet_id: null,
      settlement_date: item.date,
      carrier_id: matchedCarrier?.id || null,
      carrier_name: matchedCarrier?.name || importedCarrierName,
      route_detail: String(row[4] || "").trim() || null,
      source: "spreadsheet",
      source_spreadsheet_id: SOURCE_SPREADSHEET_ID,
      source_row: item.sourceRow,
      status: confirmed ? "confirmed" : "draft",
      change_fund: asNumber(row[6]), shortage_recovered: asNumber(row[36]),
      deliveries_total: asNumber(row[5]), electronic_total: asNumber(row[23]),
      tolls_total: tollTotal, extraordinary_total: extraTotal,
      expected_cash: asNumber(row[34]), counted_cash: asNumber(row[35]), difference: asNumber(row[37]),
      whatsapp_message: String(row[42] || "").trim() || null,
      notes: String(row[45] || "").trim() || null,
      count_date: countDate,
      counted_at: countDate ? `${countDate}T12:00:00.000Z` : null,
      created_by: actor.id,
      confirmed_by: confirmed ? actor.id : null,
      confirmed_at: confirmed ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };
    const { data: settlement, error: upsertError } = await supabaseAdmin.from("treasury_settlements")
      .upsert(payload, { onConflict: "code" }).select("id").single();
    if (upsertError) throw upsertError;
    const [deleteExpenses, deleteCounts] = await Promise.all([
      supabaseAdmin.from("treasury_settlement_expenses").delete().eq("settlement_id", settlement.id),
      supabaseAdmin.from("treasury_settlement_cash_counts").delete().eq("settlement_id", settlement.id),
    ]);
    if (deleteExpenses.error) throw deleteExpenses.error;
    if (deleteCounts.error) throw deleteCounts.error;
    if (expenses.length > 0) {
      const result = await supabaseAdmin.from("treasury_settlement_expenses").insert(expenses.map(expense => ({ settlement_id: settlement.id, ...expense })));
      if (result.error) throw result.error;
    }
    if (cashCounts.length > 0) {
      const result = await supabaseAdmin.from("treasury_settlement_cash_counts").insert(cashCounts.map(count => ({ settlement_id: settlement.id, ...count })));
      if (result.error) throw result.error;
    }
  }
  return { imported: monthRows.length, countsAssociated, month: `${String(current.month).padStart(2, "0")}/${current.year}` };
}

export async function POST(request: Request) {
  const authorization = await authorize(request);
  if (!authorization.actor) return unauthorized(authorization.reason);
  const actor = authorization.actor;
  try {
    const body = await request.json() as SavePayload;
    if (body.action === "import-month") {
      const result = await importCurrentMonth(actor);
      return NextResponse.json({ success: true, ...result });
    }
    if (!body.action || !["create", "save", "confirm"].includes(body.action)) return NextResponse.json({ error: "Acción inválida." }, { status: 400 });
    if (!body.settlementDate || !body.carrierId) return NextResponse.json({ error: "Completá la fecha y seleccioná un transportista." }, { status: 400 });
    if (body.action !== "create" && !body.settlementId) return NextResponse.json({ error: "Falta la rendición." }, { status: 400 });
    const expenses = Array.isArray(body.expenses) ? body.expenses.slice(0, 100) : [];
    const cashCounts = Array.isArray(body.cashCounts) ? body.cashCounts.slice(0, 30) : [];
    if (expenses.some(expense => !["toll", "extraordinary"].includes(expense.type || "") || asNumber(expense.amount) < 0)) {
      return NextResponse.json({ error: "Hay gastos inválidos en la rendición." }, { status: 400 });
    }
    const { data: carrier, error: carrierError } = await supabaseAdmin
      .from("carriers")
      .select("id, name")
      .eq("id", body.carrierId)
      .eq("is_active", true)
      .single();
    if (carrierError || !carrier) return NextResponse.json({ error: "El transportista seleccionado no está disponible." }, { status: 400 });

    const { data, error } = await supabaseAdmin.rpc("save_manual_treasury_settlement", {
      p_actor_id: actor.id,
      p_settlement_id: body.action === "create" ? null : body.settlementId,
      p_code: String(body.code || "").slice(0, 80),
      p_settlement_date: body.settlementDate,
      p_carrier_name: carrier.name,
      p_route_detail: String(body.routeDetail || "").slice(0, 500),
      p_deliveries_total: Math.max(0, asNumber(body.deliveriesTotal)),
      p_electronic_total: Math.max(0, asNumber(body.electronicTotal)),
      p_change_fund: Math.max(0, asNumber(body.changeFund)),
      p_shortage_recovered: asNumber(body.shortageRecovered),
      p_notes: String(body.notes || "").slice(0, 4000),
      p_whatsapp_message: String(body.whatsappMessage || "").slice(0, 4000),
      p_count_date: body.countDate || null,
      p_counted_cash_override: body.countedCashOverride == null ? null : Math.max(0, asNumber(body.countedCashOverride)),
      p_expenses: expenses.filter(expense => asNumber(expense.amount) > 0).map((expense, index) => ({
        expense_type: expense.type, amount: asNumber(expense.amount),
        reference: String(expense.reference || "").slice(0, 500), notes: String(expense.notes || "").slice(0, 1000), sort_order: index,
      })),
      p_cash_counts: cashCounts.filter(count => asNumber(count.quantity) > 0).map(count => ({
        money_kind: count.kind, denomination: asNumber(count.denomination), quantity: Math.max(0, Math.trunc(asNumber(count.quantity))),
      })),
      p_confirm: body.action === "confirm",
    });
    if (error) throw error;
    const { error: carrierUpdateError } = await supabaseAdmin
      .from("treasury_settlements")
      .update({ carrier_id: carrier.id, carrier_name: carrier.name })
      .eq("id", data.id);
    if (carrierUpdateError) throw carrierUpdateError;
    return NextResponse.json({ success: true, settlement: data });
  } catch (error) {
    console.error("[Rendiciones POST]", error);
    return NextResponse.json({ error: readableError(error) }, { status: 500 });
  }
}
