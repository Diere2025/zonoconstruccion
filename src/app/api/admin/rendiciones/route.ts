import {ensureSettlementRoute} from '@/lib/logisticsDispatch/settlementRoute';
import {deliveredSourceOnly,assignedDispatchCode,mergeDeliveredGroups} from '@/lib/logisticsDispatch/settlementSource';
import {projectCorrectedDeliveredRows} from '@/lib/logisticsDispatch/identityCorrectionServer';
import { settlementPaymentReassignments } from "@/lib/settlementPaymentReassignment";
import {carrierIdentityKey,resolveCarrierIdentity,normalizeSettlementCarriers,canonicalCarrierOptions} from '@/lib/carrierIdentity';
import {splitOrderCodes} from '@/lib/orderSync';
import {consolidateSettlementSnapshots,sameDispatchCarrier} from '@/lib/logisticsDispatch/settlementIdentity';
export const runtime = "edge";
export const dynamic = "force-dynamic";

import { settlementDispatchReferences } from "@/lib/logisticsDispatch/references";
import { treasuryDateTime, treasuryToday } from "@/lib/treasuryTransactionTime";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchSpreadsheetValueRanges, fetchSpreadsheetValues } from "@/lib/googleSheets";
import { isExcludedDeliveryStatus, settlementOrdersTotal, settlementDeliveryStatus, isSettlementDeliveryCorrection, settlementPreviewDeliveryStatus } from "@/lib/settlementOrders";
import { reconcileImportedTickets } from "@/lib/treasuryTicketReconciliation";

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

type AuthorizedUser = { id: string; name: string; roles: string[]; canImportMonth: boolean };
type AuthorizationResult = { actor: AuthorizedUser; reason: null } | {
  actor: null;
  reason: "missing_token" | "server_config" | "auth_unavailable" | "invalid_session" | "inactive" | "forbidden";
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
  original_order_code?: string | null;
  original_order_id?: string | null;
  notes?: string | null;
};
type SavePayload = {
  action?: "create" | "save" | "confirm" | "import-month" | "confirm-entregando" | "confirm-entregados" | "generate-movements" | "update-delivery-status" | "archive" | "delete-archived" | "reopen";
  archiveReason?: string;
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
  generationMode?: "initial" | "replace" | "duplicate";
  previousMovementIds?: string[];
  deliveryStatuses?: Array<{ deliveryId: string; status: string }>;
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
  if (error && (error.name === "AuthRetryableFetchError" || error.status === 0 || (error.status || 0) >= 500)) {
    return { actor: null, reason: "auth_unavailable" };
  }
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
  const canImportMonth = isKnownAdmin || (seller
    ? String(seller.role || "").toLowerCase() === "admin" || (Array.isArray(seller.roles) && seller.roles.some(role => String(role).toLowerCase() === "admin"))
    : roles.includes("admin"));
  return { actor: { id: user.id, name: seller?.full_name || user.user_metadata?.full_name || user.email || "Usuario", roles, canImportMonth }, reason: null };
}

function unauthorized(reason: AuthorizationResult["reason"]) {
  const messages = {
    missing_token: "La sesión venció. Volvé a ingresar.",
    server_config: "El servidor no pudo validar la sesión. Revisá la configuración de acceso.",
    auth_unavailable: "No se pudo conectar al servicio de acceso. Esperá unos instantes y volvé a intentar.",
    invalid_session: "La sesión no pudo validarse. Actualizá la página o volvé a ingresar.",
    inactive: "Tu usuario está inactivo.",
    forbidden: "No tenés permisos para acceder a rendiciones.",
  };
  const status = reason === "missing_token" || reason === "invalid_session" ? 401
    : reason === "server_config" || reason === "auth_unavailable" ? 503 : 403;
  const response = NextResponse.json({ error: messages[reason || "forbidden"] }, { status });
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

function carrierTokens(value:string){return carrierIdentityKey(value);}
function findCarrier<T extends {id:string;name:string}>(name:string,carriers:T[]):T|null{return resolveCarrierIdentity(name,carriers).carrier;}
async function canonicalSettlementView(rows:any[]){const catalog=await supabaseAdmin.from('carriers').select('id,name,is_active');if(catalog.error)throw catalog.error;return consolidateSettlementSnapshots(normalizeSettlementCarriers(rows,catalog.data||[]));}

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
        .neq("status", "archived")
        .order("settlement_date", { ascending: false }).order("code", { ascending: false }).limit(500);
      if (error) throw error;
      const rows = await canonicalSettlementView(await settlementDispatchReferences(supabaseAdmin, data || []));
      const stats = rows.reduce((acc, row) => {
        if (row.status === "confirmed") acc.confirmed += 1;
        else if (row.movements_generated_at || row.count_date || asNumber(row.counted_cash) > 0) acc.drafts += 1;
        else acc.pending += 1;
        if (row.status !== "confirmed" && Math.abs(asNumber(row.difference)) > 300) acc.differences += 1;
        return acc;
      }, { pending: 0, drafts: 0, differences: 0, confirmed: 0 });
      if (searchParams.get("scope") === "archived") {
        const archived = await supabaseAdmin.from("treasury_settlements").select("*")
          .eq("status", "archived").order("archived_at", { ascending: false }).limit(500);
        if (archived.error) throw archived.error;
        return NextResponse.json({ rows: await settlementDispatchReferences(supabaseAdmin, archived.data || []), stats, canImportMonth: authorization.actor.canImportMonth });
      }
      return NextResponse.json({ rows, stats, canImportMonth: authorization.actor.canImportMonth });
    }
    if (action === "carriers") {
      const { data, error } = await supabaseAdmin
        .from("carriers")
        .select("id, name, vehicle_description")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return NextResponse.json({ carriers: canonicalCarrierOptions(data || []) });
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

      const related=await supabaseAdmin.from('treasury_settlements').select('*').eq('settlement_date',settlementRes.data.settlement_date).neq('status','archived');if(related.error)throw related.error;
      const projected=consolidateSettlementSnapshots(await settlementDispatchReferences(supabaseAdmin,related.data||[]));
      const settlement = projected.find(row=>row.id===settlementId)||(await settlementDispatchReferences(supabaseAdmin,[settlementRes.data]))[0];
      let electronicTickets = electronicTicketsRes.data || [];

      // Load route orders and auto-detect linked payments from Chequeo de Pagos (mp_payments)
      let routeOrders: any[] = [];
      let targetRouteSheetId = settlement.route_sheet_id;

      if (!settlement.dispatch_code && settlement.status !== "archived" && !targetRouteSheetId && settlement.carrier_id && settlement.settlement_date) {
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

          const receiptsByOrder = new Map<string, Array<{ id: string; amount: number; receiptUrl: string; reference: string }>>();
          if (orderIds.length > 0) {
            const { data: clientPayments, error: paymentsError } = await supabaseAdmin
              .from("client_payments")
              .select("id, order_id, amount, receipt_url, notes, status")
              .in("order_id", orderIds);
            if (paymentsError) console.warn("[Rendiciones] No se pudieron leer comprobantes del pedido:", paymentsError);
            for (const payment of clientPayments || []) {
              const receiptUrl = String(payment.receipt_url || "").trim();
              if (!receiptUrl || /cancelad|anulad|rechazad/i.test(String(payment.status || ""))) continue;
              const receipts = receiptsByOrder.get(payment.order_id) || [];
              if (!receipts.some(receipt => receipt.receiptUrl === receiptUrl)) receipts.push({
                id: payment.id,
                amount: Number(payment.amount) || 0,
                receiptUrl,
                reference: String(payment.notes || "Comprobante del pedido"),
              });
              receiptsByOrder.set(payment.order_id, receipts);
            }
          }

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
            const priorPaymentReceipts = [...(receiptsByOrder.get(d.order_id) || [])];
            const addOrderReceipt = (receiptUrl: unknown, amount: unknown, reference: string) => {
              const url = String(receiptUrl || "").trim();
              if (url && !priorPaymentReceipts.some(receipt => receipt.receiptUrl === url)) priorPaymentReceipts.push({
                id: `order-${priorPaymentReceipts.length}`,
                amount: Number(amount) || 0,
                receiptUrl: url,
                reference,
              });
            };
            addOrderReceipt(order?.totals?.deposit_receipt_url, order?.totals?.deposit_amount, "Comprobante de seña");
            if (Array.isArray(order?.totals?.payments_breakdown)) {
              order.totals.payments_breakdown.forEach((payment: any, index: number) =>
                addOrderReceipt(payment.receipt_url, payment.total_amount ?? payment.amount, `Comprobante de pago ${index + 1}`));
            }
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
            const deliveryStatus = settlementDeliveryStatus(d.status, d.failure_reason);
            const toCollectAmount = isExcludedDeliveryStatus(deliveryStatus) ? 0 : isPreviouslyPaid ? 0 : Math.max(0, pendingBalance);

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
              deliveryStatus,
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
              priorPaymentReceipts,
              totalLinkedAmount: matchingPayments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0),
            };
          });

          if (mpPayments.length > 0 && settlement.status === "draft") {
            const previouslyPaidOrderIds = new Set(routeOrders.filter(order => order.isPreviouslyPaid).map(order => order.orderId).filter(Boolean));
            const previouslyPaidCodes = routeOrders.filter(order => order.isPreviouslyPaid).map(order => String(order.orderCode).trim().toUpperCase()).filter(Boolean);
            const eligiblePayments = mpPayments.filter(mp =>
              !((mp.order_id && previouslyPaidOrderIds.has(mp.order_id)) ||
                (mp.order_code && previouslyPaidCodes.some(code => String(mp.order_code).trim().toUpperCase().includes(code))))
            );
            const reconciled = reconcileImportedTickets(electronicTickets, eligiblePayments, settlement.source);
            electronicTickets = reconciled.tickets;
            for (const mp of reconciled.unmatchedPayments) {
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
        } catch (linkErr) {
          console.warn("[Rendiciones] Error auto-linking mp_payments and orders:", linkErr);
        }
      }

      // Snapshot the actual payment link, even if it was moved outside this route.
      // This lets a refreshed editor recover from a concurrent Chequeo correction.
      const paymentIds = [...new Set(electronicTickets.map(ticket => ticket.mp_payment_id).filter(Boolean))];
      let ticketPaymentLinks: Array<{ id: string; order_id: string | null; order_code: string | null }> = [];
      if (paymentIds.length) {
        const links = await supabaseAdmin.from("mp_payments").select("id, order_id, order_code").in("id", paymentIds);
        if (links.error) throw links.error;
        ticketPaymentLinks = links.data || [];
      }

      const { data: existingMovements, error: movementsError } = await supabaseAdmin
        .from("cash_transactions")
        .select("id, type, amount, concept, category, created_at, financial_account_id")
        .eq("treasury_settlement_id", settlementId)
        .order("registered_at", { ascending: false }).order("id", { ascending: false });
      if (movementsError) throw movementsError;

      return NextResponse.json({
        settlement,
        expenses: expensesRes.data || [],
        cashCounts: countsRes.data || [],
        electronicTickets: electronicTickets.map(ticket => {
          const payment = ticketPaymentLinks.find(payment => String(payment.id) === ticket.mp_payment_id);
          return payment ? { ...ticket, payment_order_code: payment.order_code, payment_order_id: payment.order_id } : ticket;
        }),
        routeOrders,
        financialAccounts: accountsRes.data || [],
        existingMovements: existingMovements || [],
      });
    }
    if (action === "preview-entregados" || action === "preview-entregando") {
      if ((searchParams.get("source") && searchParams.get("source") !== "entregados") || (action === "preview-entregando" && searchParams.get("source") !== "entregados")) return NextResponse.json({error:"Entregando ya no se importa. Usá Entregados."},{status:400});
      const source = "entregados" as const;
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

async function getEntregandoPreview(source: "entregando" | "entregados" = "entregados", date = "") {
  deliveredSourceOnly(source);
  const rows = await projectCorrectedDeliveredRows(supabaseAdmin, await fetchSpreadsheetValues(LOGISTICS_SPREADSHEET_ID, "'🔴 Entregados'!A2:CO"));
  let currentHeaderCarrier = "";
  let currentHeaderRouteNumber = 1;
  const groups = new Map<string, {
    key: string;
    carrierName: string;
    deliveryDate: string;
    dateDisplay: string;
    runNumber: number;
    routeNumberStr: string;
    dispatchCode: string;
    sourceIssue?: string;
    routeDetail: string;
    zone: string;
    vehicle: string;
    companion: string;
    driverHours: string;
    totalAmount: number;
    orders: Array<{
      orderCode: string;
      sourceRow?: number;
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
    const sheetStatus = String(row[15] || "").trim();
    const deliveryStatus = sheetStatus || (source === "entregados" ? "" : "Entregando");
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

    const rawDispatchCode = String(row[92] || '').trim().toUpperCase();
    const dispatchCode = /^LOG_REC_\d+[A-Z]?$/.test(rawDispatchCode) ? rawDispatchCode : '';
    const routeNumberStr = `R${runNumber}`;
    const groupKey = `${dispatchCode || carrierName.toLowerCase()}|${dateParsed}|${routeNumberStr}`;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        key: groupKey,
        carrierName,
        deliveryDate: dateParsed,
        dateDisplay: dateRaw,
        runNumber,
        routeNumberStr,
        dispatchCode,
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
      sourceRow:i+2,
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

  let groupList = Array.from(groups.values());
  if (groupList.length === 0) return [];

  const { data: carriers, error: carriersError } = await supabaseAdmin
    .from("carriers")
    .select("id, name, vehicle_description")
    .eq("is_active", true);
  if (carriersError) throw carriersError;
  groupList=mergeDeliveredGroups(groupList,name=>findCarrier(name,carriers||[])?.id||carrierIdentityKey(name),settlementOrdersTotal);

  const dates = Array.from(new Set(groupList.map(g => g.deliveryDate)));
  const { data: rawExistingSettlements, error: settlementsError } = await supabaseAdmin
    .from("treasury_settlements")
    .select("id, code, status, carrier_id, carrier_name, settlement_date, deliveries_total, route_detail, route_sheet_id, change_fund, source_row, source, electronic_total, tolls_total, extraordinary_total, expected_cash, counted_cash, difference, shortage_recovered")
    .neq("status", "archived")
    .in("settlement_date", dates);
  if (settlementsError) throw settlementsError;
  const referencedSettlements=await settlementDispatchReferences(supabaseAdmin, rawExistingSettlements || []);
  const storedDispatchIds=new Set(referencedSettlements.filter(s=>s.dispatch_code).map(s=>s.id));
  const existingSettlements = consolidateSettlementSnapshots(referencedSettlements);

  const matches = new Map<string, { settlement: NonNullable<typeof existingSettlements>[number] | null; issue: string | null }>();
  const buckets = new Map<string, typeof groupList>();
  for (const group of groupList) {
    const carrier = findCarrier(group.carrierName, carriers || []);
    const bucketKey = `${group.deliveryDate}|${group.dispatchCode || carrier?.id || carrierTokens(group.carrierName)}`;
    buckets.set(bucketKey, [...(buckets.get(bucketKey) || []), group]);
  }
  for (const bucket of buckets.values()) {
    const carrier = findCarrier(bucket[0].carrierName, carriers || []);
    const candidates = (existingSettlements || []).filter(settlement =>
      settlement.settlement_date === bucket[0].deliveryDate &&
      (!bucket[0].dispatchCode || !settlement.dispatch_code || settlement.dispatch_code===bucket[0].dispatchCode) &&
      ((bucket[0].dispatchCode && settlement.dispatch_code === bucket[0].dispatchCode) || (carrier && settlement.carrier_id === carrier.id) || findCarrier(settlement.carrier_name, carriers || [])?.id === carrier?.id && Boolean(carrier) || carrierTokens(settlement.carrier_name) === carrierTokens(bucket[0].carrierName))
    );
    const assigned = new Set<string>();
    for (const group of bucket) {
      const explicit = candidates.filter(settlement => {
        const match = String(settlement.route_detail || "").match(/\b(?:R|REC|RECORRIDO)[\s._-]*(\d+)\b/i);
        return match && Number(match[1]) === group.runNumber;
      });
      if (explicit.length === 1) {
        matches.set(group.key, { settlement: explicit[0], issue: null });
        assigned.add(explicit[0].id);
      } else if (explicit.length > 1) {
        matches.set(group.key, { settlement: null, issue: `Hay ${explicit.length} rendiciones para ${group.routeNumberStr} (${explicit.map(s => s.code).join(", ")}). Revisalas antes de continuar.` });
        explicit.forEach(settlement => assigned.add(settlement.id));
      }
    }
    const remainingGroups = bucket.filter(group => !matches.has(group.key)).sort((a, b) => a.runNumber - b.runNumber);
    const unnumbered = candidates.filter(settlement => !assigned.has(settlement.id) &&
      !/\b(?:R|REC|RECORRIDO)[\s._-]*\d+\b/i.test(String(settlement.route_detail || "")))
      .sort((a, b) => (a.source_row ?? Number.MAX_SAFE_INTEGER) - (b.source_row ?? Number.MAX_SAFE_INTEGER));
    if (unnumbered.length === remainingGroups.length) {
      remainingGroups.forEach((group, index) => matches.set(group.key, { settlement: unnumbered[index], issue: null }));
    } else if (unnumbered.length > 0) {
      const issue = "Hay rendiciones anteriores sin número de recorrido y no se puede determinar cuál corresponde. Revisalas antes de continuar.";
      (remainingGroups.length ? remainingGroups : bucket).forEach(group => matches.set(group.key, { settlement: null, issue }));
    }
  }

  const knownDispatches=await supabaseAdmin.from('logistics_dispatches').select('code,delivery_date,carrier_name').in('delivery_date',dates);if(knownDispatches.error)throw knownDispatches.error;
  const sourceCodes=[...new Set(groupList.map(g=>g.dispatchCode).filter(Boolean))];
  for(let offset=0;offset<sourceCodes.length;offset+=200){const explicit=await supabaseAdmin.from('logistics_dispatches').select('code,delivery_date,carrier_name').in('code',sourceCodes.slice(offset,offset+200));if(explicit.error)throw explicit.error;knownDispatches.data=[...new Map([...(knownDispatches.data||[]),...(explicit.data||[])].map(d=>[d.code,d])).values()];}
  return groupList.map(grp => {
    const matchedCarrier = findCarrier(grp.carrierName, carriers || []);
    const match = matches.get(grp.key);
    const existing = match?.settlement;
    const dispatchCandidates=(knownDispatches.data||[]).filter(d=>d.delivery_date===grp.deliveryDate&&((matchedCarrier&&findCarrier(d.carrier_name,carriers||[])?.id===matchedCarrier.id)||carrierTokens(d.carrier_name)===carrierTokens(grp.carrierName)));
    const dispatchCode=grp.dispatchCode||existing?.dispatch_code||"";

    return {
      ...grp,
      dispatchCode,
      dispatchCandidates,
      dispatchNeedsAssignment: !dispatchCode,
      existingDispatchCode: existing?.dispatch_code || "",
      requiresDispatchLink: Boolean(existing?.route_sheet_id && !storedDispatchIds.has(existing.id)),
      source,
      carrierId: matchedCarrier?.id || null,
      matchedCarrierName: matchedCarrier?.name || grp.carrierName,
      matchedVehicle: matchedCarrier?.vehicle_description || grp.vehicle,
      existingSettlementId: existing?.id || null,
      existingSettlementCode: existing?.code || null,
      existingStatus: existing?.status || null,
      existingRouteSheetId: existing?.route_sheet_id || null,
      matchingIssue: grp.sourceIssue || (!matchedCarrier?"Fletero sin identificación única en el catálogo. Revisar el nombre antes de generar.":null) || match?.issue || (grp.dispatchCode&&(knownDispatches.data||[]).some(d=>d.code===grp.dispatchCode&&d.delivery_date!==grp.deliveryDate)?'El código de delivery corresponde a otra fecha; revisar la postergación en la planilla.':null),
      changeFund: existing?.change_fund || 0,
    };
  });
}

async function linkGeneratedDispatch(code:string,date:string,carrier:string,settlementId:string,routeId:string){
 const existing=await supabaseAdmin.from('logistics_dispatches').select('id,delivery_date,carrier_name').eq('code',code).maybeSingle();if(existing.error)throw existing.error;
 if(existing.data&&!sameDispatchCarrier(existing.data.carrier_name,carrier))throw new Error('El delivery pertenece a otro fletero.');
 if(existing.data&&existing.data.delivery_date!==date)throw new Error('El código de delivery pertenece a otra fecha. Revisá la planilla antes de vincular.');
 let dispatchId=existing.data?.id;
 if(!dispatchId){const created=await supabaseAdmin.from('logistics_dispatches').upsert({code,delivery_date:date,carrier_name:carrier,data:{}},{onConflict:'code',ignoreDuplicates:true}).select('id,delivery_date').maybeSingle();if(created.error)throw created.error;const resolved=created.data|| (await supabaseAdmin.from('logistics_dispatches').select('id,delivery_date').eq('code',code).single()).data;if(!resolved||resolved.delivery_date!==date)throw new Error('El delivery cambió; volvé a leer la hoja.');dispatchId=resolved.id;}
 const old=await supabaseAdmin.from('logistics_dispatch_settlements').select('dispatch_id').eq('settlement_id',settlementId).maybeSingle();if(old.error)throw old.error;if(old.data&&old.data.dispatch_id!==dispatchId)throw new Error('La rendición ya pertenece a otro delivery.');
 const bound=await supabaseAdmin.from('logistics_dispatch_settlements').upsert({settlement_id:settlementId,dispatch_id:dispatchId},{onConflict:'settlement_id',ignoreDuplicates:true});if(bound.error)throw bound.error;
 const route=await supabaseAdmin.from('logistics_dispatch_routes').select('dispatch_id').eq('route_sheet_id',routeId).maybeSingle();if(route.error)throw route.error;if(route.data&&route.data.dispatch_id!==dispatchId)throw new Error('El recorrido ya pertenece a otro delivery.');
 const attached=await supabaseAdmin.from('logistics_dispatch_routes').upsert({route_sheet_id:routeId,dispatch_id:dispatchId},{onConflict:'route_sheet_id',ignoreDuplicates:true});if(attached.error)throw attached.error;
 const verified=await supabaseAdmin.from('logistics_dispatch_settlements').select('dispatch_id').eq('settlement_id',settlementId).single();if(verified.error||verified.data.dispatch_id!==dispatchId)throw verified.error||new Error('El vínculo de la rendición cambió; volvé a leer.');
 const deliveries=await supabaseAdmin.from('deliveries').select('id,order_id,status,orders(legacy_code)').eq('route_sheet_id',routeId);if(deliveries.error)throw deliveries.error;
 const attempts=(deliveries.data||[]).flatMap(delivery=>{const order=Array.isArray(delivery.orders)?delivery.orders[0]:delivery.orders;return splitOrderCodes(order?.legacy_code).map(orderCode=>({dispatch_id:dispatchId,order_code:orderCode,order_id:delivery.order_id,delivery_id:delivery.id,outcome:delivery.status||'En recorrido',executed:true,source_rows:[],source_spreadsheet_id:LOGISTICS_SPREADSHEET_ID}));});
 if(attempts.length){const stored=await supabaseAdmin.from('logistics_dispatch_attempts').upsert(attempts,{onConflict:'dispatch_id,order_code',ignoreDuplicates:true});if(stored.error)throw stored.error;}

}

async function confirmEntregandoItems(actor: AuthorizedUser, items: any[]) {
  // Never rely on a settlement id supplied by the browser: the preview may be stale.
  // Resolve every selected route again before making any writes.
  items.forEach(item=>deliveredSourceOnly(item.source));
  const previews = new Map<string, Awaited<ReturnType<typeof getEntregandoPreview>>[number]>();
  const sourceDates = new Set(items.map(item => `${"entregados"}|${item.deliveryDate}`));
  for (const sourceDate of sourceDates) {
    const [source, deliveryDate] = sourceDate.split("|") as ["entregando" | "entregados", string];
    const fresh = await getEntregandoPreview(source, deliveryDate);
    fresh.forEach(group => previews.set(`${sourceDate}|${group.key}`, group));
  }
  for (const item of items) {
    const source = "entregados";
    const fresh = previews.get(`${source}|${item.deliveryDate}|${item.key}`);
    if (!fresh) throw new Error(`El recorrido de ${item.carrierName || "la selección"} cambió en la planilla. Volvé a leerla.`);
    if (fresh.matchingIssue) throw new Error(fresh.matchingIssue);
    const requested=String(fresh.dispatchCode||item.dispatchCode||"").trim().toUpperCase();
    const knownResult=requested?await supabaseAdmin.from("logistics_dispatches").select("code,delivery_date,carrier_name").eq("code",requested).maybeSingle():{data:null,error:null};
    if(knownResult.error)throw knownResult.error;
    if(knownResult.data&&!sameDispatchCarrier(knownResult.data.carrier_name,fresh.carrierName))throw new Error(`La logística ${requested} pertenece a ${knownResult.data.carrier_name} y el recorrido figura como ${fresh.carrierName}. Revisá el fletero y el código en Entregados.`);
    fresh.dispatchCode=assignedDispatchCode(fresh.dispatchCode,fresh.existingDispatchCode,item.dispatchCode,fresh.dispatchCandidates||[],knownResult.data,fresh.deliveryDate);
    if (fresh.existingStatus === "confirmed") {
      if (source !== "entregados" || (fresh.existingRouteSheetId && !fresh.requiresDispatchLink)) throw new Error(`${fresh.existingSettlementCode} ya está confirmada y vinculada, o requiere leer la hoja Entregados.`);
      item.orders = fresh.orders;
    }
    item.existingSettlementId = fresh.existingSettlementId;
    item.existingStatus = fresh.existingStatus;
    item.dispatchCode = fresh.dispatchCode;
    item.carrierId = fresh.carrierId;
    item.carrierName=fresh.matchedCarrierName||fresh.carrierName;
    item.deliveryDate=fresh.deliveryDate;
    item.runNumber=fresh.runNumber;
    item.routeDetail=fresh.routeDetail;
    item.zone=fresh.zone;
    item.existingRouteSheetId = fresh.existingRouteSheetId;
    if(fresh.dispatchCode){const dispatch=await supabaseAdmin.from('logistics_dispatches').select('delivery_date').eq('code',fresh.dispatchCode).maybeSingle();if(dispatch.error)throw dispatch.error;if(dispatch.data&&dispatch.data.delivery_date!==fresh.deliveryDate)throw new Error('El delivery '+fresh.dispatchCode+' pertenece a otra fecha. Revisá el código en la planilla.');}
  }

  const { data: activeCarriers, error: activeCarriersError } = await supabaseAdmin
    .from("carriers")
    .select("id, name, vehicle_description")
    .eq("is_active", true);
  if (activeCarriersError) throw activeCarriersError;

  const carriersList = [...(activeCarriers || [])];
  let createdCount = 0;
  let updatedCount = 0;
  let linkedCount = 0;

  for (const item of items) {
    const source = "entregados";
    const selectedOrders = Array.isArray(item.orders) ? item.orders : [];
    const deliveriesTotal = settlementOrdersTotal(selectedOrders);
    let matchedCarrier = item.carrierId ? carriersList.find(c => c.id === item.carrierId) || null : null;
    if (!matchedCarrier) {
      matchedCarrier = findCarrier(item.carrierName, carriersList);
    }
    if (!matchedCarrier) throw new Error('El fletero no tiene una identidad única en el catálogo. Revisá sus alias antes de generar otra rendición.');

    const runNumber = item.runNumber || 1;
    const routeSheet = await ensureSettlementRoute(supabaseAdmin,{carrierId:matchedCarrier.id,deliveryDate:item.deliveryDate,runNumber,existingRouteSheetId:item.existingRouteSheetId,total:deliveriesTotal,hasAssistant:Boolean(item.companion)});

    const { data: foundSettlement, error: existingSettlementError } = await supabaseAdmin
      .from("treasury_settlements")
      .select("id, status, route_sheet_id, change_fund, tolls_total, extraordinary_total, electronic_total, counted_cash, shortage_recovered")
      .eq("route_sheet_id", routeSheet.id)
      .neq("status", "archived")
      .maybeSingle();
    if (existingSettlementError) throw existingSettlementError;
    let existingSettlement = foundSettlement;
    if (!existingSettlement && item.existingSettlementId) {
      const existingById = await supabaseAdmin.from("treasury_settlements")
        .select("id, status, route_sheet_id, change_fund, tolls_total, extraordinary_total, electronic_total, counted_cash, shortage_recovered")
        .eq("id", item.existingSettlementId).eq("settlement_date", item.deliveryDate).neq("status", "archived").maybeSingle();
      if (existingById.error) throw existingById.error;
      existingSettlement = existingById.data;
    }
    if (existingSettlement && item.existingSettlementId && existingSettlement.id !== item.existingSettlementId) {
      throw new Error(`El recorrido de ${item.carrierName} ya está asociado a otra rendición. Revisá las duplicadas antes de continuar.`);
    }
    if (existingSettlement?.status === "confirmed" && existingSettlement.route_sheet_id) { if(item.dispatchCode) { await linkGeneratedDispatch(item.dispatchCode,item.deliveryDate,item.carrierName,existingSettlement.id,routeSheet.id); linkedCount++; } continue; }
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
        : /pendiente[_ ]ruteo/.test(normalizedStatus) ? "pendiente_ruteo"
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

    if (existingSettlement?.status === "confirmed") {
      const { data: linked, error: linkError } = await supabaseAdmin.from("treasury_settlements")
        .update({ route_sheet_id: routeSheet.id, updated_at: new Date().toISOString() })
        .eq("id", existingSettlement.id)
        .is("route_sheet_id", null)
        .select("id")
        .single();
      if (linkError || !linked) throw linkError || new Error("La rendición cambió mientras se vinculaban los pedidos.");
      if(item.dispatchCode) await linkGeneratedDispatch(item.dispatchCode,item.deliveryDate,item.carrierName,existingSettlement.id,routeSheet.id);
      linkedCount++;
      continue;
    }

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
        }).eq("id", existingSettlement.id).eq("status", "draft");
        if (settlementUpdate.error) throw settlementUpdate.error;
        if(item.dispatchCode) await linkGeneratedDispatch(item.dispatchCode,item.deliveryDate,item.carrierName,existingSettlement.id,routeSheet.id);
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
      }).select("id").single();
      if (settlementInsert.error) throw settlementInsert.error;
      if(item.dispatchCode) await linkGeneratedDispatch(item.dispatchCode,item.deliveryDate,item.carrierName,settlementInsert.data.id,routeSheet.id);
      createdCount++;
    }
  }

  return { created: createdCount, updated: updatedCount, linked: linkedCount };
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
  let imported = 0;
  let skippedArchived = 0;
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

    const { data: previouslyImported, error: previousError } = await supabaseAdmin
      .from("treasury_settlements")
      .select("route_sheet_id, status")
      .eq("code", code)
      .maybeSingle();
    if (previousError) throw previousError;
    // Importing a legacy row must never reactivate a rendition that Treasury archived.
    if (previouslyImported?.status === "archived") {
      skippedArchived += 1;
      continue;
    }
    // Confirmation belongs to Treasury; a later sheet import must preserve it.
    if (previouslyImported?.status === "confirmed") continue;
    if (countRow) countsAssociated += 1;

    const payload = {
      code,
      route_sheet_id: previouslyImported?.route_sheet_id || null,
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
    imported += 1;
  }
  return { imported, skippedArchived, countsAssociated, month: `${String(current.month).padStart(2, "0")}/${current.year}` };
}

export async function POST(request: Request) {
  const authorization = await authorize(request);
  if (!authorization.actor) return unauthorized(authorization.reason);
  const actor = authorization.actor;
  try {
    const body = await request.json() as SavePayload;
    if (body.action === "reopen") {
      if (!body.settlementId) return NextResponse.json({ error: "Falta la rendición." }, { status: 400 });
      const result = await supabaseAdmin.rpc("reopen_treasury_settlement", {
        p_actor_id: actor.id, p_settlement_id: body.settlementId,
      });
      if (result.error) return NextResponse.json({ error: readableError(result.error) }, { status: result.error.code === "42501" ? 403 : 409 });
      return NextResponse.json({ success: true, settlement: result.data });
    }
    if (body.action === "archive" || body.action === "delete-archived") {
      if (!body.settlementId) return NextResponse.json({ error: "Falta la rendición." }, { status: 400 });
      if (body.action === "delete-archived" && !actor.canImportMonth) {
        return NextResponse.json({ error: "Sólo un administrador puede eliminar rendiciones archivadas." }, { status: 403 });
      }
      const reason = String(body.archiveReason || "").trim();
      if (body.action === "archive" && (!reason || reason.length > 1000)) {
        return NextResponse.json({ error: "Ingresá un motivo de baja de hasta 1.000 caracteres." }, { status: 400 });
      }
      const result = await supabaseAdmin.rpc(body.action === "archive" ? "archive_treasury_settlement" : "delete_archived_treasury_settlement", {
        p_actor_id: actor.id, p_settlement_id: body.settlementId,
        ...(body.action === "archive" ? { p_reason: reason } : {}),
      });
      if (result.error) return NextResponse.json({ error: readableError(result.error) }, { status: result.error.code === "42501" ? 403 : 409 });
      return NextResponse.json({ success: true, settlement: result.data });
    }
    if (body.settlementId) {
      const current = await supabaseAdmin.from("treasury_settlements").select("status").eq("id", body.settlementId).maybeSingle();
      if (current.error) throw current.error;
      if (!current.data) return NextResponse.json({ error: "La rendición no existe." }, { status: 404 });
      if (current.data.status === "archived") return NextResponse.json({ error: "La rendición está archivada y no admite cambios." }, { status: 409 });
    }
    if (body.action === "import-month") {
      if (!actor.canImportMonth) return NextResponse.json({ error: "Sólo un administrador puede importar rendiciones desde la planilla." }, { status: 403 });
      const result = await importCurrentMonth(actor);
      return NextResponse.json({ success: true, ...result });
    }
    if (body.action === "confirm-entregados" || body.action === "confirm-entregando") {
      const items = Array.isArray(body.items) ? body.items : [];
      if (items.length === 0) return NextResponse.json({ error: "No se seleccionaron recorridos para crear." }, { status: 400 });
      if(items.some(item=>item.source && item.source!=="entregados") || (body.action==="confirm-entregando" && items.some(item=>item.source!=="entregados")))return NextResponse.json({error:"Entregando ya no se importa. Usá Entregados."},{status:400});
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
        .select("id, route_sheet_id, order_id, status, failure_reason").eq("id", body.deliveryId).single();
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
          for (const range of ["'🔴 Entregados'!A2:AC"]) {
            const sheetRows = await fetchSpreadsheetValues(LOGISTICS_SPREADSHEET_ID, range);
            const sheetRow = sheetRows.find(row => String(row[0] || "").trim().toUpperCase() === String(order.legacy_code).trim().toUpperCase()
              && parseSheetDate(row[1]) === settlement.settlement_date);
            if (sheetRow && asNumber(sheetRow[28]) > 0) { amount = asNumber(sheetRow[28]); break; }
          }
        } catch (sheetError) {
          console.warn("[Rendiciones] No se pudo verificar el importe en la planilla:", sheetError);
        }
      }
      const oldExcluded = isExcludedDeliveryStatus(settlementDeliveryStatus(delivery.status, delivery.failure_reason));
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
      const paymentMethodId = pms?.find(p => /efectivo|^contado$/i.test(p.name || ""))?.id || pms?.[0]?.id;

      const { data: settlement, error: settlementError } = await supabaseAdmin
        .from("treasury_settlements")
        .select("id, code, carrier_name, route_sheet_id")
        .eq("id", settlementId)
        .maybeSingle();

      if (settlementError) throw settlementError;
      if (!settlement) return NextResponse.json({ error: "La rendición no existe." }, { status: 404 });
      let dateStr = (movementDate || "").trim();
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
        const [d, m, y] = dateStr.split("/");
        dateStr = `${y}-${m}-${d}`;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        dateStr = treasuryToday();
      }
      const createdAt = treasuryDateTime(dateStr);

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
          notes: `Rendición ${settlement.code} (${settlement.carrier_name || ''}). ${m.notes || ''}`.trim(),
          business_unit: "ZONO",
          route_sheet_id: settlement?.route_sheet_id || null,
          created_by: actor.id,
          created_at: createdAt,
        };
      }).filter(item => item.amount > 0);

      if (toInsert.length === 0) {
        return NextResponse.json({ error: "Todos los montos de los movimientos son cero." }, { status: 400 });
      }

      const { data: inserted, error: insertError } = await supabaseAdmin.rpc("generate_treasury_settlement_movements", {
        p_actor_id: actor.id,
        p_settlement_id: settlementId,
        p_mode: body.generationMode || "initial",
        p_previous_ids: body.previousMovementIds || [],
        p_movements: toInsert,
      });
      if (insertError) return NextResponse.json({ error: readableError(insertError) }, { status: insertError.code === "42501" ? 403 : 409 });

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

    const reassignments = settlementPaymentReassignments(electronicTickets);
    const { data, error } = await supabaseAdmin.rpc(reassignments.length ? "save_treasury_settlement_with_payment_links" : "save_treasury_settlement_with_orders", {
      ...(reassignments.length ? { p_reassignments: reassignments } : {}),
      p_delivery_statuses: body.deliveryStatuses || [],
      p_save: {
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
      },
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
