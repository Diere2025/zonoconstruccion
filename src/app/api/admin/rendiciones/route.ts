export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchSpreadsheetValueRanges, fetchSpreadsheetValues } from "@/lib/googleSheets";
import { isExcludedDeliveryStatus, settlementOrdersTotal } from "@/lib/settlementOrders";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const SOURCE_SPREADSHEET_ID = "1NEXHZbDJhXCHpsZEyKq3k3rq_O_foLDtct-hvsFeifI";
const LOGISTICS_SPREADSHEET_ID = "1TYeIyGbDleed1bTJyhuaxcM97KMbNbL--1OswOppROg";
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
type ElectronicTicketPayload = {
  amount?: number;
  reference?: string;
  payment_type?: string;
  order_id?: string | null;
  order_code?: string | null;
  mp_payment_id?: string | null;
  notes?: string | null;
};
type SavePayload = {
  action?: "create" | "save" | "confirm" | "import-month" | "confirm-entregando" | "generate-movements" | "update-delivery-status";
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
  electronicTickets?: ElectronicTicketPayload[];
  items?: any[];
  deliveryId?: string;
  deliveryStatus?: string;
  financialAccountId?: string;
  movementDate?: string;
  movements?: Array<{
    detail?: string;
    concept?: string;
    type?: string;
    amount?: number;
    category?: string;
    sub_category?: string;
    notes?: string;
  }>;
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
  const match = String(value ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const fullYear = year.length === 2 ? `20${year}` : year;
  const parsed = new Date(Date.UTC(Number(fullYear), Number(month) - 1, Number(day)));
  if (parsed.getUTCFullYear() !== Number(fullYear) || parsed.getUTCMonth() !== Number(month) - 1 || parsed.getUTCDate() !== Number(day)) return null;
  return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
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

function findCarrier<T extends { id: string; name: string }>(name: string, carriers: T[]): T | null {
  const normalized = carrierTokens(name);
  if (normalized.includes("gyv")) return carriers.find(carrier => carrier.name.toLowerCase() === "gyv") || null;
  const exact = carriers.find(carrier => carrierTokens(carrier.name) === normalized);
  if (exact) return exact;
  const sourceWords = carrierWords(name);
  const candidates = carriers.filter(carrier => {
    const candidateWords = carrierWords(carrier.name);
    return sourceWords.length >= 2 && sourceWords.every(word => candidateWords.includes(word));
  });
  if (candidates.length === 1) return candidates[0];

  const candidateSubsets = carriers.filter(carrier => {
    const candidateWords = carrierWords(carrier.name);
    return candidateWords.length >= 2 && candidateWords.every(word => sourceWords.includes(word));
  });
  if (candidateSubsets.length === 1) return candidateSubsets[0];

  const significantSourceWords = sourceWords.filter(w => w.length >= 4);
  const bySignificantWord = carriers.filter(carrier => {
    const candidateWords = carrierWords(carrier.name);
    return significantSourceWords.some(w => candidateWords.includes(w));
  });
  if (bySignificantWord.length === 1) return bySignificantWord[0];

  return null;
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
    if (action === "financial-accounts") {
      const { data, error } = await supabaseAdmin
        .from("financial_accounts")
        .select("id, name, type, currency, is_active")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return NextResponse.json({ accounts: data || [] });
    }
    if (action === "detail") {
      const settlementId = searchParams.get("settlementId");
      if (!settlementId) return NextResponse.json({ error: "Falta la rendición." }, { status: 400 });
      const [settlementRes, expensesRes, countsRes, electronicTicketsRes, accountsRes] = await Promise.all([
        supabaseAdmin.from("treasury_settlements").select("*").eq("id", settlementId).single(),
        supabaseAdmin.from("treasury_settlement_expenses").select("*").eq("settlement_id", settlementId).order("expense_type").order("sort_order"),
        supabaseAdmin.from("treasury_settlement_cash_counts").select("*").eq("settlement_id", settlementId),
        supabaseAdmin.from("treasury_settlement_electronic_tickets").select("*").eq("settlement_id", settlementId).order("sort_order"),
        supabaseAdmin.from("financial_accounts").select("id, name, type, currency, is_active").eq("is_active", true).order("name"),
      ]);
      if (settlementRes.error) throw settlementRes.error;
      if (expensesRes.error) throw expensesRes.error;
      if (countsRes.error) throw countsRes.error;
      if (electronicTicketsRes.error) throw electronicTicketsRes.error;

      const settlement = settlementRes.data;
      let electronicTickets = electronicTicketsRes.data || [];

      // Load route orders and auto-detect linked payments from Chequeo de Pagos (mp_payments)
      let routeOrders: any[] = [];
      let targetRouteSheetId = settlement.route_sheet_id;

      if (!targetRouteSheetId && settlement.carrier_id && settlement.settlement_date) {
        const { data: matchedRoute } = await supabaseAdmin
          .from("route_sheets")
          .select("id")
          .eq("carrier_id", settlement.carrier_id)
          .eq("delivery_date", settlement.settlement_date)
          .maybeSingle();
        if (matchedRoute?.id) {
          targetRouteSheetId = matchedRoute.id;
          await supabaseAdmin.from("treasury_settlements").update({ route_sheet_id: targetRouteSheetId }).eq("id", settlementId);
          settlement.route_sheet_id = targetRouteSheetId;
        }
      }

      if (targetRouteSheetId) {
        try {
          const { data: deliveries } = await supabaseAdmin
            .from("deliveries")
            .select("id, delivery_order, order_id, predominant_zone, status, failure_reason, notes")
            .eq("route_sheet_id", targetRouteSheetId)
            .order("delivery_order", { ascending: true });

          const orderIds = (deliveries || []).map(d => d.order_id).filter(Boolean);
          const ordersMap = new Map<string, any>();
          if (orderIds.length > 0) {
            const { data: matchedOrders } = await supabaseAdmin
              .from("orders")
              .select("id, legacy_code, customer_name, address, locality, total_amount, payment_status, status, channel, totals")
              .in("id", orderIds);
            (matchedOrders || []).forEach(o => ordersMap.set(o.id, o));
          }

          const orderCodes = Array.from(ordersMap.values()).map(o => o.legacy_code).filter(Boolean);

          let mpPayments: any[] = [];
          if (orderIds.length > 0 || orderCodes.length > 0) {
            let query = supabaseAdmin
              .from("mp_payments")
              .select("id, amount, payment_type, payer_name, order_code, order_id, received_at, linked_by, account_name, is_verified, notes");
            if (orderIds.length > 0 && orderCodes.length > 0) {
              query = query.or(`order_id.in.(${orderIds.join(",")}),order_code.in.(${orderCodes.join(",")})`);
            } else if (orderIds.length > 0) {
              query = query.in("order_id", orderIds);
            } else {
              query = query.in("order_code", orderCodes);
            }
            const { data } = await query;
            mpPayments = data || [];
          }

          routeOrders = (deliveries || []).map(d => {
            const order = d.order_id ? ordersMap.get(d.order_id) : null;
            const cleanCode = (order?.legacy_code || "").trim().toUpperCase();
            const matchingPayments = mpPayments.filter(p =>
              (d.order_id && p.order_id === d.order_id) ||
              (cleanCode && p.order_code && String(p.order_code).trim().toUpperCase().includes(cleanCode))
            );

            const isPreviouslyPaid = (order?.payment_status || "").toLowerCase().includes("abonad") ||
              (order?.totals?.pending_balance === 0 && Number(order?.total_amount || 0) > 0);
            const depositAmount = Number(order?.totals?.deposit_amount || 0);
            const pendingBalance = order?.totals?.pending_balance !== undefined
              ? Number(order.totals.pending_balance)
              : (isPreviouslyPaid ? 0 : Number(order?.total_amount || 0));
            const toCollectAmount = isExcludedDeliveryStatus(d.status || "") ? 0 : isPreviouslyPaid ? 0 : Math.max(0, pendingBalance);

            return {
              deliveryId: d.id,
              orderId: d.order_id,
              orderCode: order?.legacy_code || "Sin código",
              customerName: order?.customer_name || "Sin cliente",
              address: order?.address || "",
              locality: order?.locality || d.predominant_zone || "",
              stopOrder: d.delivery_order || 1,
              totalAmount: Number(order?.total_amount) || 0,
              paymentStatus: order?.payment_status || d.status || "",
              deliveryStatus: d.status === "fallido" ? (d.failure_reason || "No entregado") : (d.status || ""),
              isPreviouslyPaid,
              previouslyPaidAmount: depositAmount > 0
                ? depositAmount
                : (isPreviouslyPaid ? Number(order?.total_amount || 0) : 0),
              toCollectAmount,
              linkedPayments: matchingPayments.map(p => ({
                id: p.id,
                amount: Number(p.amount) || 0,
                payerName: p.payer_name || "",
                paymentType: p.payment_type || "POINT",
                receivedAt: p.received_at || "",
                linkedBy: p.linked_by || "",
                accountName: p.account_name || "",
                isVerified: p.is_verified,
                notes: p.notes || "",
              })),
              totalLinkedAmount: matchingPayments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0),
            };
          });

          if (mpPayments.length > 0) {
            const existingMpIds = new Set(electronicTickets.map((t: any) => t.mp_payment_id).filter(Boolean));
            for (const mp of mpPayments) {
              if (!existingMpIds.has(mp.id)) {
                electronicTickets.push({
                  id: `mp-${mp.id}`,
                  settlement_id: settlementId,
                  amount: Number(mp.amount) || 0,
                  reference: mp.payer_name ? `${mp.payer_name} (${mp.order_code || 'MP'})` : `Cobro MP ${mp.order_code || ''}`,
                  payment_type: (mp.payment_type || "POINT").toUpperCase(),
                  order_id: mp.order_id,
                  order_code: mp.order_code,
                  mp_payment_id: mp.id,
                  notes: `Detectado de Chequeo de Pagos (${mp.linked_by || 'Logística'})`,
                  sort_order: electronicTickets.length,
                });
              }
            }
          }
        } catch (linkErr) {
          console.warn("[Rendiciones] Error auto-linking mp_payments and orders:", linkErr);
        }
      }

      let existingMovements: any[] = [];
      try {
        if (settlement.code) {
          const { data: txList } = await supabaseAdmin
            .from("cash_transactions")
            .select("id, type, amount, concept, category, created_at, financial_account_id")
            .ilike("notes", `%${settlement.code}%`);
          existingMovements = txList || [];
        }
      } catch (e) {
        console.warn("[Rendiciones] Error fetching existing movements:", e);
      }

      return NextResponse.json({
        settlement,
        expenses: expensesRes.data || [],
        cashCounts: countsRes.data || [],
        electronicTickets,
        routeOrders,
        financialAccounts: accountsRes.data || [],
        existingMovements,
      });
    }
    if (action === "preview-entregando") {
      const source = searchParams.get("source") === "entregados" ? "entregados" : "entregando";
      const date = searchParams.get("date") || "";
      if (source === "entregados" && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Seleccioná una fecha válida." }, { status: 400 });
      const preview = await getEntregandoPreview(source, date);
      return NextResponse.json({ success: true, preview });
    }
    return NextResponse.json({ error: "Acción inválida." }, { status: 400 });
  } catch (error) {
    console.error("[Rendiciones GET]", error);
    return NextResponse.json({ error: readableError(error) }, { status: 500 });
  }
}

async function getEntregandoPreview(source: "entregando" | "entregados" = "entregando", date = "") {
  const rows = await fetchSpreadsheetValues(LOGISTICS_SPREADSHEET_ID, source === "entregados" ? "'🔴 Entregados'!A2:CG" : "'Entregando'!A3:CG");
  let currentHeaderCarrier = "";
  let currentHeaderRouteNumber = 1;
  const groups = new Map<string, {
    key: string;
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
    orders: Array<{
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
    }>;
  }>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const orderCode = String(row[0] || "").trim();
    if (!orderCode) continue;

    const dateRaw = String(row[1] || "").trim();
    const dateParsed = parseSheetDate(dateRaw);
    if (!dateParsed) {
      if (orderCode.length > 3) {
        const rMatch = orderCode.match(/\b(?:R|REC|RECORRIDO)[\s-_]*(\d+)\b/i);
        currentHeaderRouteNumber = rMatch ? (parseInt(rMatch[1], 10) || 1) : 1;
        currentHeaderCarrier = orderCode
          .replace(/\s+GV$/i, "")
          .replace(/[-_\s]+(?:R|REC|RECORRIDO)[\s-_]*\d+\b/i, "")
          .trim();
      }
      continue;
    }
    if (date && dateParsed !== date) continue;

    const carrierName = String(row[79] || currentHeaderCarrier || "Sin Fletero").trim();
    const totalToCollect = asNumber(row[28]);
    const paidAmount = asNumber(row[23]);
    const paymentState = String(row[22] || "").trim();
    const deliveryStatus = source === "entregados" ? String(row[15] || "").trim() : "Entregando";
    const isPreviouslyPaid = paymentState.toLowerCase().includes("abonad") && !paymentState.toLowerCase().includes("no abonad");
    const fullOrderTotal = isPreviouslyPaid && paidAmount > 0 ? paidAmount : (totalToCollect + paidAmount);
    const stopOrder = parseInt(String(row[14] || "")) || 0;
    const zone = String(row[78] || "").trim();
    const vehicle = String(row[80] || "").trim();
    const companion = String(row[81] || "").trim();
    const driverHours = String(row[82] || "").trim();

    // Check Col 13 (Recorrido) or default to header
    const rowRouteRaw = String(row[13] || "").trim();
    let runNumber = currentHeaderRouteNumber;
    if (rowRouteRaw) {
      const colMatch = rowRouteRaw.match(/\b(?:R|REC|RECORRIDO)?[\s-_]*(\d+)\b/i);
      if (colMatch) runNumber = parseInt(colMatch[1], 10) || 1;
    }

    const routeNumberStr = `R${runNumber}`;
    const groupKey = `${carrierName.toLowerCase()}|${dateParsed}|${routeNumberStr}`;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        key: groupKey,
        carrierName,
        deliveryDate: dateParsed,
        dateDisplay: dateRaw,
        runNumber,
        routeNumberStr,
        routeDetail: `${routeNumberStr}${zone ? ` · ${zone}` : ` · ${carrierName}`}`,
        zone,
        vehicle,
        companion,
        driverHours,
        totalAmount: 0,
        orders: [],
      });
    }

    const grp = groups.get(groupKey)!;
    const nextOrder = {
      orderCode,
      stopOrder,
      totalAmount: fullOrderTotal > 0 ? fullOrderTotal : totalToCollect,
      toCollectAmount: totalToCollect,
      paidAmount,
      paymentState: paymentState || (isPreviouslyPaid ? "Abonado" : "Pendiente"),
      deliveryStatus,
      isPreviouslyPaid,
      customerName: String(row[4] || "").trim(),
      address: String(row[17] || "").trim(),
      paymentType: String(row[20] || "").trim(),
    };
    const existingOrderIndex = grp.orders.findIndex(order => order.orderCode.toUpperCase() === orderCode.toUpperCase());
    if (existingOrderIndex >= 0) grp.orders[existingOrderIndex] = nextOrder;
    else grp.orders.push(nextOrder);
    grp.totalAmount = settlementOrdersTotal(grp.orders);
  }

  const groupList = Array.from(groups.values());
  if (groupList.length === 0) return [];

  // A manual correction on an existing draft must survive another read of Entregando.
  if (source === "entregando") {
    const codes = Array.from(new Set(groupList.flatMap(group => group.orders.map(order => order.orderCode.toUpperCase()))));
    for (let offset = 0; offset < codes.length; offset += 200) {
      const { data: matchedOrders, error: ordersError } = await supabaseAdmin.from("orders")
        .select("id, legacy_code").in("legacy_code", codes.slice(offset, offset + 200));
      if (ordersError) throw ordersError;
      const byId = new Map((matchedOrders || []).map(order => [order.id, String(order.legacy_code).toUpperCase()]));
      if (byId.size === 0) continue;
      const { data: deliveries, error: deliveriesError } = await supabaseAdmin.from("deliveries")
        .select("order_id, delivery_date, status, failure_reason").in("order_id", Array.from(byId.keys()));
      if (deliveriesError) throw deliveriesError;
      const corrected = new Map((deliveries || []).filter(delivery => isExcludedDeliveryStatus(delivery.status || ""))
        .map(delivery => [`${byId.get(delivery.order_id)}|${delivery.delivery_date}`, delivery.failure_reason || delivery.status]));
      for (const group of groupList) {
        for (const order of group.orders) {
          const status = corrected.get(`${order.orderCode.toUpperCase()}|${group.deliveryDate}`);
          if (status) order.deliveryStatus = status;
        }
        group.totalAmount = settlementOrdersTotal(group.orders);
      }
    }
  }

  const { data: carriers } = await supabaseAdmin
    .from("carriers")
    .select("id, name, vehicle_description")
    .eq("is_active", true);

  const dates = Array.from(new Set(groupList.map(g => g.deliveryDate)));
  const { data: existingSettlements } = await supabaseAdmin
    .from("treasury_settlements")
    .select("id, code, status, carrier_id, carrier_name, settlement_date, deliveries_total, route_detail, route_sheet_id, change_fund")
    .in("settlement_date", dates);

  return groupList.map(grp => {
    const matchedCarrier = findCarrier(grp.carrierName, carriers || []);
    const existing = (existingSettlements || []).find(s =>
      (
        (matchedCarrier && s.carrier_id === matchedCarrier.id) ||
        carrierTokens(s.carrier_name) === carrierTokens(grp.carrierName)
      ) &&
      s.settlement_date === grp.deliveryDate &&
      (
        (s.route_detail && s.route_detail.toUpperCase().includes(grp.routeNumberStr)) ||
        groupList.filter(g => g.carrierName.toLowerCase() === grp.carrierName.toLowerCase() && g.deliveryDate === grp.deliveryDate).length === 1
      )
    );

    return {
      ...grp,
      source,
      carrierId: matchedCarrier?.id || null,
      matchedCarrierName: matchedCarrier?.name || grp.carrierName,
      matchedVehicle: matchedCarrier?.vehicle_description || grp.vehicle,
      existingSettlementId: existing?.id || null,
      existingSettlementCode: existing?.code || null,
      existingStatus: existing?.status || null,
      changeFund: existing?.change_fund || 0,
    };
  });
}

async function confirmEntregandoItems(actor: AuthorizedUser, items: any[]) {
  const { data: activeCarriers } = await supabaseAdmin
    .from("carriers")
    .select("id, name, vehicle_description")
    .eq("is_active", true);

  const carriersList = [...(activeCarriers || [])];
  let createdCount = 0;
  let updatedCount = 0;

  for (const item of items) {
    const source = item.source === "entregados" ? "entregados" : "entregando";
    const selectedOrders = Array.isArray(item.orders) ? item.orders : [];
    const deliveriesTotal = settlementOrdersTotal(selectedOrders);
    let matchedCarrier = item.carrierId ? carriersList.find(c => c.id === item.carrierId) || null : null;
    if (!matchedCarrier) {
      matchedCarrier = findCarrier(item.carrierName, carriersList);
    }
    if (!matchedCarrier) {
      const { data: newCarrier, error: newCarrierErr } = await supabaseAdmin.from("carriers").insert({
        name: item.carrierName,
        vehicle_description: item.vehicle || "Agrale",
        is_active: true,
      }).select("id, name, vehicle_description").single();
      if (newCarrierErr) throw newCarrierErr;
      matchedCarrier = newCarrier;
      carriersList.push(matchedCarrier);
    }

    const runNumber = item.runNumber || 1;
    let { data: routeSheet } = await supabaseAdmin.from("route_sheets")
      .select("id, code")
      .eq("delivery_date", item.deliveryDate)
      .eq("carrier_id", matchedCarrier.id)
      .eq("run_number", runNumber)
      .maybeSingle();

    const routeCode = `HR-${item.deliveryDate.replace(/-/g, '')}-${matchedCarrier.name.slice(0, 3).toUpperCase()}-R${runNumber}`;

    if (!routeSheet) {
      const { data: createdRoute, error: routeErr } = await supabaseAdmin.from("route_sheets").insert({
        carrier_id: matchedCarrier.id,
        delivery_date: item.deliveryDate,
        run_number: runNumber,
        code: routeCode,
        total_theoretical_cash: deliveriesTotal,
        has_assistant: Boolean(item.companion),
        status: 'Pendiente',
      }).select("id, code").single();
      if (routeErr) throw routeErr;
      routeSheet = createdRoute;
    }

    let { data: existingSettlement } = await supabaseAdmin
      .from("treasury_settlements")
      .select("id, status, change_fund, tolls_total, extraordinary_total, electronic_total, counted_cash, shortage_recovered")
      .eq("route_sheet_id", routeSheet.id)
      .maybeSingle();
    if (!existingSettlement && item.existingSettlementId) {
      const existingById = await supabaseAdmin.from("treasury_settlements")
        .select("id, status, change_fund, tolls_total, extraordinary_total, electronic_total, counted_cash, shortage_recovered")
        .eq("id", item.existingSettlementId).eq("settlement_date", item.deliveryDate).maybeSingle();
      if (existingById.error) throw existingById.error;
      existingSettlement = existingById.data;
    }
    if (existingSettlement?.status === "confirmed") continue;
    if (routeSheet) {
      const routeUpdate = await supabaseAdmin.from("route_sheets").update({
        total_theoretical_cash: deliveriesTotal,
        has_assistant: Boolean(item.companion),
      }).eq("id", routeSheet.id);
      if (routeUpdate.error) throw routeUpdate.error;
    }

    const orderCodes = selectedOrders.map((o: any) => o.orderCode);
    let orderMap = new Map<string, string>();
    if (orderCodes.length > 0) {
      const { data: matchedOrders } = await supabaseAdmin
        .from("orders")
        .select("id, legacy_code")
        .in("legacy_code", orderCodes);
      (matchedOrders || []).forEach(o => {
        if (o.legacy_code) orderMap.set(o.legacy_code.toUpperCase(), o.id);
      });
    }

    for (const order of selectedOrders) {
      const orderId = orderMap.get(order.orderCode.toUpperCase()) || null;
      const normalizedStatus = String(order.deliveryStatus || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const deliveryStatus = normalizedStatus.includes("postergad") ? "postergado"
        : normalizedStatus.includes("anulad") ? "anulado"
        : normalizedStatus.includes("cancelad") ? "cancelado"
        : normalizedStatus.includes("no entregad") ? "no entregado"
        : normalizedStatus.includes("entregando") || normalizedStatus.includes("en recorrido") ? "en_recorrido"
        : "entregado";
      const excluded = isExcludedDeliveryStatus(deliveryStatus);
      const storedStatus = excluded ? "fallido" : deliveryStatus;
      let deliveryId: string | null = null;

      if (orderId) {
        const { data: existingByOrder } = await supabaseAdmin
          .from("deliveries")
          .select("id")
          .eq("order_id", orderId)
          .maybeSingle();
        if (existingByOrder) deliveryId = existingByOrder.id;
      }

      if (!deliveryId && !orderId && order.stopOrder) {
        const { data: existingByRouteOrder } = await supabaseAdmin
          .from("deliveries")
          .select("id")
          .eq("route_sheet_id", routeSheet.id)
          .eq("delivery_order", order.stopOrder)
          .maybeSingle();
        if (existingByRouteOrder) deliveryId = existingByRouteOrder.id;
      }

      if (deliveryId) {
        const deliveryUpdate = await supabaseAdmin.from("deliveries").update({
          route_sheet_id: routeSheet.id,
          order_id: orderId,
          carrier_id: matchedCarrier.id,
          delivery_date: item.deliveryDate,
          run_number: runNumber,
          delivery_order: order.stopOrder,
          status: storedStatus,
          failure_reason: excluded ? deliveryStatus : null,
          logistics_contact: item.logisticsContact || "Pablo",
          predominant_zone: item.zone || null,
          companion: item.companion || null,
          driver_hours: item.driverHours || null,
        }).eq("id", deliveryId);
        if (deliveryUpdate.error) throw deliveryUpdate.error;
      } else if (orderId) {
        const deliveryInsert = await supabaseAdmin.from("deliveries").insert({
          route_sheet_id: routeSheet.id,
          order_id: orderId,
          carrier_id: matchedCarrier.id,
          delivery_date: item.deliveryDate,
          run_number: runNumber,
          delivery_order: order.stopOrder,
          status: storedStatus,
          failure_reason: excluded ? deliveryStatus : null,
          logistics_contact: item.logisticsContact || "Pablo",
          predominant_zone: item.zone || null,
          companion: item.companion || null,
          driver_hours: item.driverHours || null,
        });
        if (deliveryInsert.error) throw deliveryInsert.error;
      }
    }

    const changeFund = Math.max(0, asNumber(item.changeFund));

    if (existingSettlement) {
      if (existingSettlement.status === 'draft') {
        const finalChangeFund = source === "entregados" ? Number(existingSettlement.change_fund || 0)
          : item.changeFund !== undefined ? changeFund : Number(existingSettlement.change_fund || 0);
        const expectedCash = deliveriesTotal + finalChangeFund
          - Number(existingSettlement.tolls_total || 0) - Number(existingSettlement.extraordinary_total || 0)
          - Number(existingSettlement.electronic_total || 0);
        const difference = Number(existingSettlement.counted_cash || 0) + Number(existingSettlement.shortage_recovered || 0) - expectedCash;

        const settlementUpdate = await supabaseAdmin.from("treasury_settlements").update({
          route_sheet_id: routeSheet.id,
          carrier_id: matchedCarrier.id,
          carrier_name: matchedCarrier.name,
          route_detail: item.routeDetail || item.zone,
          deliveries_total: deliveriesTotal,
          change_fund: finalChangeFund,
          expected_cash: expectedCash,
          difference: difference,
          updated_at: new Date().toISOString(),
        }).eq("id", existingSettlement.id);
        if (settlementUpdate.error) throw settlementUpdate.error;
        updatedCount++;
      }
    } else {
      const expectedCash = deliveriesTotal + changeFund;
      const settlementInsert = await supabaseAdmin.from("treasury_settlements").insert({
        route_sheet_id: routeSheet.id,
        carrier_id: matchedCarrier.id,
        carrier_name: matchedCarrier.name,
        settlement_date: item.deliveryDate,
        route_detail: item.routeDetail || item.zone,
        deliveries_total: deliveriesTotal,
        change_fund: changeFund,
        expected_cash: expectedCash,
        difference: -expectedCash,
        source: 'route',
        status: 'draft',
        notes: `Generada desde hoja ${source === "entregados" ? "Entregados" : "Entregando"} (${selectedOrders.length} pedidos)`,
        created_by: actor.id,
      });
      if (settlementInsert.error) throw settlementInsert.error;
      createdCount++;
    }
  }

  return { created: createdCount, updated: updatedCount };
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

    const pointTickets = row.slice(24, 34).map(asNumber);
    const electronicTotal = asNumber(row[23]);
    const electronicTickets: Array<{
      amount: number;
      reference: string;
      payment_type: string;
      sort_order: number;
    }> = [];
    let pointOrder = 0;
    pointTickets.forEach((amount, index) => {
      if (amount > 0) {
        electronicTickets.push({
          amount,
          reference: `Ticket ${index + 1}`,
          payment_type: "POINT",
          sort_order: pointOrder++,
        });
      }
    });
    const pointDifference = Math.max(0, electronicTotal - pointTickets.reduce((sum, amount) => sum + amount, 0));
    if (pointDifference > 0) {
      electronicTickets.push({
        amount: pointDifference,
        reference: "Tickets sin detalle",
        payment_type: "POINT",
        sort_order: pointOrder++,
      });
    }

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
    const [deleteExpenses, deleteCounts, deleteTickets] = await Promise.all([
      supabaseAdmin.from("treasury_settlement_expenses").delete().eq("settlement_id", settlement.id),
      supabaseAdmin.from("treasury_settlement_cash_counts").delete().eq("settlement_id", settlement.id),
      supabaseAdmin.from("treasury_settlement_electronic_tickets").delete().eq("settlement_id", settlement.id),
    ]);
    if (deleteExpenses.error) throw deleteExpenses.error;
    if (deleteCounts.error) throw deleteCounts.error;
    if (deleteTickets.error) throw deleteTickets.error;
    if (expenses.length > 0) {
      const result = await supabaseAdmin.from("treasury_settlement_expenses").insert(expenses.map(expense => ({ settlement_id: settlement.id, ...expense })));
      if (result.error) throw result.error;
    }
    if (cashCounts.length > 0) {
      const result = await supabaseAdmin.from("treasury_settlement_cash_counts").insert(cashCounts.map(count => ({ settlement_id: settlement.id, ...count })));
      if (result.error) throw result.error;
    }
    if (electronicTickets.length > 0) {
      const result = await supabaseAdmin.from("treasury_settlement_electronic_tickets").insert(electronicTickets.map(ticket => ({ settlement_id: settlement.id, ...ticket })));
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
    if (body.action === "confirm-entregando") {
      const items = Array.isArray(body.items) ? body.items : [];
      if (items.length === 0) return NextResponse.json({ error: "No se seleccionaron recorridos para crear." }, { status: 400 });
      const result = await confirmEntregandoItems(actor, items);
      return NextResponse.json({ success: true, ...result });
    }
    if (body.action === "update-delivery-status") {
      if (!body.settlementId || !body.deliveryId || !body.deliveryStatus) return NextResponse.json({ error: "Faltan datos del pedido." }, { status: 400 });
      const allowed = ["en_recorrido", "entregado", "postergado", "anulado", "cancelado", "no entregado"];
      if (!allowed.includes(body.deliveryStatus)) return NextResponse.json({ error: "Estado de pedido inválido." }, { status: 400 });
      const { data: settlement, error: settlementError } = await supabaseAdmin.from("treasury_settlements")
        .select("id, status, settlement_date, route_sheet_id, deliveries_total, change_fund, tolls_total, extraordinary_total, electronic_total, counted_cash, shortage_recovered")
        .eq("id", body.settlementId).single();
      if (settlementError) throw settlementError;
      if (settlement.status !== "draft") return NextResponse.json({ error: "La rendición confirmada no se puede modificar." }, { status: 409 });
      const { data: delivery, error: deliveryError } = await supabaseAdmin.from("deliveries")
        .select("id, route_sheet_id, order_id, status").eq("id", body.deliveryId).single();
      if (deliveryError) throw deliveryError;
      if (!settlement.route_sheet_id || delivery.route_sheet_id !== settlement.route_sheet_id) return NextResponse.json({ error: "El pedido no pertenece a esta rendición." }, { status: 400 });
      if (!delivery.order_id) return NextResponse.json({ error: "El pedido no tiene un importe verificable." }, { status: 400 });
      const { data: order, error: orderError } = await supabaseAdmin.from("orders")
        .select("legacy_code, total_amount, payment_status, totals").eq("id", delivery.order_id).single();
      if (orderError) throw orderError;
      const paid = String(order.payment_status || "").toLowerCase().includes("abonad") ||
        (order.totals?.pending_balance === 0 && Number(order.total_amount || 0) > 0);
      let amount = paid ? 0 : Math.max(0, Number(order.totals?.pending_balance ?? order.total_amount ?? 0) || 0);
      if (order.legacy_code) {
        try {
          for (const range of ["'🔴 Entregados'!A2:AC", "'Entregando'!A3:AC"]) {
            const sheetRows = await fetchSpreadsheetValues(LOGISTICS_SPREADSHEET_ID, range);
            const sheetRow = sheetRows.find(row => String(row[0] || "").trim().toUpperCase() === String(order.legacy_code).trim().toUpperCase()
              && parseSheetDate(row[1]) === settlement.settlement_date);
            if (sheetRow && asNumber(sheetRow[28]) > 0) { amount = asNumber(sheetRow[28]); break; }
          }
        } catch (sheetError) {
          console.warn("[Rendiciones] No se pudo verificar el importe en la planilla:", sheetError);
        }
      }
      const oldExcluded = isExcludedDeliveryStatus(delivery.status || "");
      const newExcluded = isExcludedDeliveryStatus(body.deliveryStatus);
      const adjustment = oldExcluded === newExcluded ? 0 : newExcluded ? -amount : amount;
      const deliveriesTotal = Math.max(0, Number(settlement.deliveries_total || 0) + adjustment);
      const expectedCash = deliveriesTotal + Number(settlement.change_fund || 0) - Number(settlement.tolls_total || 0)
        - Number(settlement.extraordinary_total || 0) - Number(settlement.electronic_total || 0);
      const difference = Number(settlement.counted_cash || 0) + Number(settlement.shortage_recovered || 0) - expectedCash;
      const updateDelivery = await supabaseAdmin.from("deliveries").update({
        status: newExcluded ? "fallido" : body.deliveryStatus,
        failure_reason: newExcluded ? body.deliveryStatus : null,
      }).eq("id", delivery.id);
      if (updateDelivery.error) throw updateDelivery.error;
      const routeUpdate = await supabaseAdmin.from("route_sheets").update({ total_theoretical_cash: deliveriesTotal }).eq("id", settlement.route_sheet_id);
      if (routeUpdate.error) throw routeUpdate.error;
      const updateSettlement = await supabaseAdmin.from("treasury_settlements").update({
        deliveries_total: deliveriesTotal, expected_cash: expectedCash, difference, updated_at: new Date().toISOString(),
      }).eq("id", settlement.id);
      if (updateSettlement.error) throw updateSettlement.error;
      return NextResponse.json({ success: true, deliveriesTotal, orderAmount: amount });
    }
    if (body.action === "generate-movements") {
      const { settlementId, code, carrierName, financialAccountId, movementDate, movements } = body;
      if (!settlementId || !code) {
        return NextResponse.json({ error: "Faltan los datos de la rendición." }, { status: 400 });
      }
      if (!financialAccountId) {
        return NextResponse.json({ error: "Seleccioná una caja o cuenta financiera." }, { status: 400 });
      }
      const rawMovements = Array.isArray(movements) ? movements : [];
      if (rawMovements.length === 0) {
        return NextResponse.json({ error: "No hay movimientos para registrar." }, { status: 400 });
      }

      const { data: account, error: accError } = await supabaseAdmin
        .from("financial_accounts")
        .select("id, name, currency, type")
        .eq("id", financialAccountId)
        .single();
      if (accError || !account) {
        return NextResponse.json({ error: "La cuenta seleccionada no es válida." }, { status: 400 });
      }

      const { data: pms } = await supabaseAdmin
        .from("payment_methods")
        .select("id, name");
      const paymentMethodId = pms?.find(p => p.name.toLowerCase().includes("efectivo"))?.id || pms?.[0]?.id;

      const { data: settlement } = await supabaseAdmin
        .from("treasury_settlements")
        .select("id, code, route_sheet_id")
        .eq("id", settlementId)
        .maybeSingle();

      let dateStr = (movementDate || "").trim();
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
        const [d, m, y] = dateStr.split("/");
        dateStr = `${y}-${m}-${d}`;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        dateStr = new Date().toISOString().split("T")[0];
      }
      const createdAt = new Date(dateStr + "T12:00:00").toISOString();

      const toInsert = rawMovements.map(m => {
        const isExpense = m.type === "Gasto" || m.type === "egreso";
        const isToll = (m.detail || m.concept || "").toLowerCase().includes("peaje");

        let defaultCategory = "Recaudación";
        let defaultSubCategory = "Venta - Recorridos";

        if (isExpense) {
          if (isToll) {
            defaultCategory = "Gasto Peajes";
            defaultSubCategory = "Peajes";
          } else {
            defaultCategory = "Gastos Operativos";
            defaultSubCategory = "Extraordinario";
          }
        }

        return {
          type: isExpense ? "egreso" : "ingreso",
          category: m.category || defaultCategory,
          sub_category: m.sub_category || defaultSubCategory,
          amount: Math.abs(asNumber(m.amount)),
          currency: account.currency || "ARS",
          payment_method_id: paymentMethodId,
          financial_account_id: account.id,
          concept: (m.concept || m.detail || "Movimiento Rendición").trim(),
          notes: `Rendición ${code} (${carrierName || ''}). ${m.notes || ''}`.trim(),
          business_unit: "ZONO",
          route_sheet_id: settlement?.route_sheet_id || null,
          created_by: actor.id,
          created_at: createdAt,
        };
      }).filter(item => item.amount > 0);

      if (toInsert.length === 0) {
        return NextResponse.json({ error: "Todos los montos de los movimientos son cero." }, { status: 400 });
      }

      const { data: inserted, error: insertError } = await supabaseAdmin
        .from("cash_transactions")
        .insert(toInsert)
        .select("id, concept, amount, type, created_at, category, financial_account_id");

      if (insertError) throw insertError;

      return NextResponse.json({
        success: true,
        count: inserted?.length || 0,
        insertedMovements: inserted || [],
        accountName: account.name,
      });
    }
    if (!body.action || !["create", "save", "confirm"].includes(body.action)) return NextResponse.json({ error: "Acción inválida." }, { status: 400 });
    if (!body.settlementDate || !body.carrierId) return NextResponse.json({ error: "Completá la fecha y seleccioná un transportista." }, { status: 400 });
    if (body.action !== "create" && !body.settlementId) return NextResponse.json({ error: "Falta la rendición." }, { status: 400 });
    const expenses = Array.isArray(body.expenses) ? body.expenses.slice(0, 100) : [];
    const cashCounts = Array.isArray(body.cashCounts) ? body.cashCounts.slice(0, 30) : [];
    const electronicTickets = Array.isArray(body.electronicTickets) ? body.electronicTickets.slice(0, 100) : [];
    if (expenses.some(expense => !["toll", "extraordinary"].includes(expense.type || "") || asNumber(expense.amount) < 0)) {
      return NextResponse.json({ error: "Hay gastos inválidos en la rendición." }, { status: 400 });
    }
    if (electronicTickets.some(ticket => asNumber(ticket.amount) < 0)) {
      return NextResponse.json({ error: "Hay tickets de cobro electrónico con monto negativo." }, { status: 400 });
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
      p_electronic_tickets: electronicTickets.filter(ticket => asNumber(ticket.amount) > 0).map((ticket, index) => ({
        amount: asNumber(ticket.amount),
        reference: String(ticket.reference || "").slice(0, 500),
        payment_type: String(ticket.payment_type || "POINT").slice(0, 50),
        order_id: ticket.order_id || null,
        order_code: ticket.order_code ? String(ticket.order_code).slice(0, 100) : null,
        mp_payment_id: ticket.mp_payment_id ? String(ticket.mp_payment_id).slice(0, 100) : null,
        notes: ticket.notes ? String(ticket.notes).slice(0, 1000) : null,
        sort_order: index,
      })),
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
