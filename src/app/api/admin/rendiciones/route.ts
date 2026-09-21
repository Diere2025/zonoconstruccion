export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const supabaseAuth = createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type AuthorizedUser = {
  id: string;
  name: string;
  roles: string[];
};

type AuthorizationResult =
  | { actor: AuthorizedUser; reason: null }
  | { actor: null; reason: "missing_token" | "server_config" | "invalid_session" | "inactive" | "forbidden" };

type PaymentPayload = {
  clientPaymentId?: string;
  kind?: string;
  amount?: number;
};

type ExpensePayload = {
  type?: string;
  amount?: number;
  reference?: string;
  notes?: string;
};

type CashCountPayload = {
  kind?: string;
  denomination?: number;
  quantity?: number;
};

type SavePayload = {
  action?: string;
  routeSheetId?: string;
  changeFund?: number;
  shortageRecovered?: number;
  notes?: string;
  whatsappMessage?: string;
  payments?: PaymentPayload[];
  expenses?: ExpensePayload[];
  cashCounts?: CashCountPayload[];
};

type PaymentRow = Record<string, unknown> & {
  id: string;
  route_sheet_id?: string | null;
};

async function authorize(request: Request): Promise<AuthorizationResult> {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { actor: null, reason: "missing_token" };
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return { actor: null, reason: "server_config" };

  // User JWTs are validated with the public Auth client. The service client is
  // reserved for the database work that follows authorization.
  const { data: { user }, error } = await supabaseAuth.auth.getUser(token);
  if (error || !user) return { actor: null, reason: "invalid_session" };

  let { data: seller } = await supabaseAdmin
    .from("sellers")
    .select("id, full_name, email, role, roles, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!seller && user.email) {
    const { data: sellerByEmail } = await supabaseAdmin
      .from("sellers")
      .select("id, full_name, email, role, roles, is_active")
      .ilike("email", user.email)
      .maybeSingle();
    seller = sellerByEmail;
  }

  const roles = Array.from(new Set([
    seller?.role,
    ...(Array.isArray(seller?.roles) ? seller.roles : []),
    user.user_metadata?.role,
    ...(Array.isArray(user.user_metadata?.roles) ? user.user_metadata.roles : []),
  ].filter(Boolean).map(value => String(value).toLowerCase())));

  const isKnownAdmin = ["diego.boveda@gmail.com", "caroibarra.93@gmail.com"]
    .includes((user.email || "").toLowerCase());
  if (seller?.is_active === false) return { actor: null, reason: "inactive" };
  if (!roles.includes("admin") && !roles.includes("administracion") && !isKnownAdmin) {
    return { actor: null, reason: "forbidden" };
  }

  return {
    actor: {
      id: user.id,
      name: seller?.full_name || user.user_metadata?.full_name || user.email || "Usuario",
      roles,
    },
    reason: null,
  };
}

function unauthorized(reason: AuthorizationResult["reason"]) {
  const messages: Record<Exclude<AuthorizationResult["reason"], null>, string> = {
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
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readableError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const candidate = error as { message?: unknown; details?: unknown };
    if (typeof candidate.message === "string") return candidate.message;
    if (typeof candidate.details === "string") return candidate.details;
    try {
      return JSON.stringify(error);
    } catch {
      return "Ocurrió un error inesperado al consultar las rendiciones.";
    }
  }
  return "Ocurrió un error inesperado al consultar las rendiciones.";
}

export async function GET(request: Request) {
  const authorization = await authorize(request);
  if (!authorization.actor) return unauthorized(authorization.reason);
  const actor = authorization.actor;

  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || "list";

    if (action === "list") {
      const { data: routeSheets, error: routesError } = await supabaseAdmin
        .from("route_sheets")
        .select("id, code, delivery_date, run_number, status, updated_at, carrier_id, carriers(id, name)")
        .eq("status", "Cerrada")
        .order("delivery_date", { ascending: false })
        .order("run_number", { ascending: false })
        .limit(300);
      if (routesError) throw routesError;

      const routeIds = (routeSheets || []).map(route => route.id);
      if (routeIds.length === 0) {
        return NextResponse.json({ rows: [], stats: { pending: 0, drafts: 0, differences: 0, confirmed: 0 } });
      }

      const [settlementsRes, deliveriesRes, paymentsRes] = await Promise.all([
        supabaseAdmin
          .from("treasury_settlements")
          .select("*")
          .in("route_sheet_id", routeIds),
        supabaseAdmin
          .from("deliveries")
          .select("id, route_sheet_id, status")
          .in("route_sheet_id", routeIds),
        supabaseAdmin
          .from("client_payments")
          .select("id, route_sheet_id, amount")
          .in("route_sheet_id", routeIds),
      ]);

      if (settlementsRes.error) throw settlementsRes.error;
      if (deliveriesRes.error) throw deliveriesRes.error;
      if (paymentsRes.error) throw paymentsRes.error;

      const settlementByRoute = new Map((settlementsRes.data || []).map(item => [item.route_sheet_id, item]));
      const deliveriesByRoute = new Map<string, number>();
      const paymentsByRoute = new Map<string, number>();
      (deliveriesRes.data || []).forEach(delivery => {
        deliveriesByRoute.set(delivery.route_sheet_id, (deliveriesByRoute.get(delivery.route_sheet_id) || 0) + 1);
      });
      (paymentsRes.data || []).forEach(payment => {
        paymentsByRoute.set(payment.route_sheet_id, (paymentsByRoute.get(payment.route_sheet_id) || 0) + asNumber(payment.amount));
      });

      const rows = (routeSheets || []).map(route => ({
        ...route,
        delivery_count: deliveriesByRoute.get(route.id) || 0,
        route_payments_total: paymentsByRoute.get(route.id) || 0,
        settlement: settlementByRoute.get(route.id) || null,
      }));
      const stats = rows.reduce((acc, row) => {
        if (!row.settlement) acc.pending += 1;
        else if (row.settlement.status === "confirmed") acc.confirmed += 1;
        else acc.drafts += 1;
        if (row.settlement && Math.abs(asNumber(row.settlement.difference)) > 300) acc.differences += 1;
        return acc;
      }, { pending: 0, drafts: 0, differences: 0, confirmed: 0 });

      return NextResponse.json({ rows, stats });
    }

    if (action === "detail") {
      const routeSheetId = searchParams.get("routeSheetId");
      if (!routeSheetId) {
        return NextResponse.json({ error: "Falta la hoja de ruta." }, { status: 400 });
      }

      const [routeRes, deliveriesRes, settlementRes] = await Promise.all([
        supabaseAdmin
          .from("route_sheets")
          .select("id, code, delivery_date, run_number, status, carrier_id, carriers(id, name, phone)")
          .eq("id", routeSheetId)
          .single(),
        supabaseAdmin
          .from("deliveries")
          .select("id, route_sheet_id, order_id, status, delivery_order, orders(id, legacy_code, customer_name, total_amount, payment_status)")
          .eq("route_sheet_id", routeSheetId)
          .order("delivery_order", { ascending: true }),
        supabaseAdmin
          .from("treasury_settlements")
          .select("*")
          .eq("route_sheet_id", routeSheetId)
          .maybeSingle(),
      ]);

      if (routeRes.error) throw routeRes.error;
      if (deliveriesRes.error) throw deliveriesRes.error;
      if (settlementRes.error) throw settlementRes.error;

      const orderIds = (deliveriesRes.data || [])
        .map(delivery => delivery.order_id)
        .filter((id): id is string => Boolean(id));

      const routePaymentsPromise = supabaseAdmin
        .from("client_payments")
        .select("id, client_id, order_id, amount, currency, status, route_sheet_id, receipt_url, notes, created_at, payment_method_id, payment_methods(id, name), orders(id, legacy_code, customer_name)")
        .eq("route_sheet_id", routeSheetId)
        .order("created_at", { ascending: true });
      const orderPaymentsPromise = orderIds.length > 0
        ? supabaseAdmin
          .from("client_payments")
          .select("id, client_id, order_id, amount, currency, status, route_sheet_id, receipt_url, notes, created_at, payment_method_id, payment_methods(id, name), orders(id, legacy_code, customer_name)")
          .in("order_id", orderIds)
          .order("created_at", { ascending: true })
        : Promise.resolve({ data: [], error: null });

      const [routePaymentsRes, orderPaymentsRes] = await Promise.all([routePaymentsPromise, orderPaymentsPromise]);
      if (routePaymentsRes.error) throw routePaymentsRes.error;
      if (orderPaymentsRes.error) throw orderPaymentsRes.error;

      const paymentsMap = new Map<string, PaymentRow>();
      [...(routePaymentsRes.data || []), ...(orderPaymentsRes.data || [])].forEach(payment => {
        paymentsMap.set(payment.id, payment as PaymentRow);
      });

      let links: Record<string, unknown>[] = [];
      let expenses: Record<string, unknown>[] = [];
      let cashCounts: Record<string, unknown>[] = [];
      if (settlementRes.data?.id) {
        const [linksRes, expensesRes, countsRes] = await Promise.all([
          supabaseAdmin.from("treasury_settlement_payment_links").select("*").eq("settlement_id", settlementRes.data.id),
          supabaseAdmin.from("treasury_settlement_expenses").select("*").eq("settlement_id", settlementRes.data.id).order("expense_type").order("sort_order"),
          supabaseAdmin.from("treasury_settlement_cash_counts").select("*").eq("settlement_id", settlementRes.data.id),
        ]);
        if (linksRes.error) throw linksRes.error;
        if (expensesRes.error) throw expensesRes.error;
        if (countsRes.error) throw countsRes.error;
        links = linksRes.data || [];
        expenses = expensesRes.data || [];
        cashCounts = countsRes.data || [];
      }

      return NextResponse.json({
        route: routeRes.data,
        deliveries: deliveriesRes.data || [],
        payments: Array.from(paymentsMap.values()).map(payment => ({
          ...payment,
          belongs_to_route: payment.route_sheet_id === routeSheetId,
        })),
        settlement: settlementRes.data || null,
        links,
        expenses,
        cashCounts,
        actor,
      });
    }

    return NextResponse.json({ error: "Acción inválida." }, { status: 400 });
  } catch (error) {
    const message = readableError(error);
    console.error("[Rendiciones GET]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authorization = await authorize(request);
  if (!authorization.actor) return unauthorized(authorization.reason);
  const actor = authorization.actor;

  try {
    const body = await request.json() as SavePayload;
    if (body.action !== "save" && body.action !== "confirm") {
      return NextResponse.json({ error: "Acción inválida." }, { status: 400 });
    }
    if (!body.routeSheetId) {
      return NextResponse.json({ error: "Falta la hoja de ruta." }, { status: 400 });
    }

    const payments: PaymentPayload[] = Array.isArray(body.payments) ? body.payments.slice(0, 500) : [];
    const expenses: ExpensePayload[] = Array.isArray(body.expenses) ? body.expenses.slice(0, 100) : [];
    const cashCounts: CashCountPayload[] = Array.isArray(body.cashCounts) ? body.cashCounts.slice(0, 30) : [];

    if (payments.some(payment => !payment.clientPaymentId || !["cash", "electronic"].includes(payment.kind || "") || asNumber(payment.amount) < 0)) {
      return NextResponse.json({ error: "Hay pagos inválidos en la rendición." }, { status: 400 });
    }
    if (expenses.some(expense => !["toll", "extraordinary"].includes(expense.type || "") || asNumber(expense.amount) < 0)) {
      return NextResponse.json({ error: "Hay gastos inválidos en la rendición." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.rpc("save_treasury_settlement", {
      p_actor_id: actor.id,
      p_route_sheet_id: body.routeSheetId,
      p_change_fund: Math.max(0, asNumber(body.changeFund)),
      p_shortage_recovered: Math.max(0, asNumber(body.shortageRecovered)),
      p_notes: typeof body.notes === "string" ? body.notes.slice(0, 4000) : "",
      p_whatsapp_message: typeof body.whatsappMessage === "string" ? body.whatsappMessage.slice(0, 4000) : "",
      p_payments: payments.map(payment => ({
        client_payment_id: payment.clientPaymentId,
        payment_kind: payment.kind,
        amount: Math.max(0, asNumber(payment.amount)),
      })),
      p_expenses: expenses
        .filter(expense => asNumber(expense.amount) > 0)
        .map((expense, index) => ({
          expense_type: expense.type,
          amount: asNumber(expense.amount),
          reference: typeof expense.reference === "string" ? expense.reference.slice(0, 500) : "",
          notes: typeof expense.notes === "string" ? expense.notes.slice(0, 1000) : "",
          sort_order: index,
      })),
      p_cash_counts: cashCounts
        .filter(count => asNumber(count.quantity) > 0)
        .map(count => ({
          money_kind: count.kind,
          denomination: asNumber(count.denomination),
          quantity: Math.max(0, Math.trunc(asNumber(count.quantity))),
        })),
      p_confirm: body.action === "confirm",
    });
    if (error) throw error;

    return NextResponse.json({ success: true, settlement: data });
  } catch (error) {
    const message = readableError(error);
    console.error("[Rendiciones POST]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
