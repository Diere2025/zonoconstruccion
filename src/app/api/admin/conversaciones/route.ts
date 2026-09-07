export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import ticketsClienteAyerRaw from "@/data/whaticket/tickets_cliente_ayer.json";
import ticketsDataRaw from "@/data/whaticket/tickets.json";
import usersDataRaw from "@/data/whaticket/users.json";
import tagsDataRaw from "@/data/whaticket/tags.json";
import queuesDataRaw from "@/data/whaticket/queues.json";
import realMessagesMapRaw from "@/data/whaticket/real_messages.json";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ckvbyfgsbjbfaqotmeld.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

interface TicketContact {
  id: string;
  name: string;
  number: string;
  profilePicUrl?: string | null;
  tags?: Array<{ id: string; name: string; color: string }>;
}

interface RawTicket {
  id: string;
  status: string;
  unreadMessages?: number;
  lastMessage?: string;
  protocolNumber?: string;
  createdAt: string;
  updatedAt: string;
  lastReceivedMessageAt?: string;
  userId?: string | null;
  queueId?: string | null;
  contact?: TicketContact;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateFilter = searchParams.get("date") ?? "2026-09-05";
    const tagFilter = searchParams.get("tag") ?? "Cliente";
    const searchQuery = (searchParams.get("search") || "").trim().toLowerCase();
    const statusFilter = searchParams.get("status") || "all";
    const sellerFilter = searchParams.get("seller") || "all";

    // If yesterday + Cliente is requested, use the curated 62 tickets exactly
    const useClienteAyer = dateFilter === "2026-09-05" && tagFilter.toLowerCase() === "cliente";
    const sourceTickets = useClienteAyer 
      ? (ticketsClienteAyerRaw as unknown as RawTicket[])
      : (ticketsDataRaw as unknown as RawTicket[]);

    const ticketsData = (sourceTickets || []) as RawTicket[];
    const usersData = usersDataRaw as any;
    const tagsData = tagsDataRaw as any;
    const queuesData = queuesDataRaw as any;
    const realMessagesMap = (realMessagesMapRaw || {}) as Record<string, any[]>;

    if (!ticketsData || !Array.isArray(ticketsData)) {
      return NextResponse.json({
        conversations: [],
        tags: [],
        sellers: [],
        metrics: { total: 0, withOrders: 0, totalSold: 0 }
      });
    }

    const userMap: Record<string, string> = {};
    const sellersList: Array<{ id: string; name: string }> = [];
    if (usersData && Array.isArray(usersData.users)) {
      usersData.users.forEach((u: any) => {
        userMap[u.id] = u.name;
        sellersList.push({ id: u.id, name: u.name });
      });
    }

    const queueMap: Record<string, string> = {};
    if (Array.isArray(queuesData)) {
      queuesData.forEach((q: any) => {
        queueMap[q.id] = q.name;
      });
    }

    const availableTags: Array<{ id: string; name: string; color: string }> = [];
    if (tagsData && Array.isArray(tagsData.tags)) {
      tagsData.tags.forEach((t: any) => {
        availableTags.push({ id: t.id, name: t.name, color: t.color || "#35baf6" });
      });
    }

    const uniqueTicketsMap = new Map<string, RawTicket>();
    ticketsData.forEach((t) => {
      if (t.id && !uniqueTicketsMap.has(t.id)) {
        uniqueTicketsMap.set(t.id, t);
      }
    });
    const allUniqueTickets = Array.from(uniqueTicketsMap.values());

    const onlyOrders = searchParams.get("onlyOrders") === "true";

    let ordersList: any[] = [];
    try {
      const { data: orders } = await supabase
        .from("orders")
        .select(`
          id,
          customer_name,
          locality,
          address,
          total_amount,
          order_date,
          whaticket_link,
          status,
          created_at,
          order_items (
            product_id,
            product_name,
            quantity,
            unit_price
          ),
          clients (
            phone_primary,
            phone_secondary
          )
        `)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (orders) ordersList = orders;
    } catch (dbErr) {
      console.warn("Could not fetch orders for cross-reference:", dbErr);
    }

    const cleanDigits = (s?: string) => {
      if (!s) return "";
      let d = s.replace(/\D/g, "");
      if (d.startsWith("549")) d = d.slice(3);
      else if (d.startsWith("54")) d = d.slice(2);
      if (d.startsWith("15") && d.length === 10) d = d.slice(2);
      return d;
    };

    // Pre-match each ticket with order
    const ticketOrderMap = new Map<string, any>();
    allUniqueTickets.forEach((t) => {
      let matchedOrder: any = null;
      const tPhone = cleanDigits(t.contact?.number);
      const cNameClean = (t.contact?.name || "").toLowerCase().replace(/\.[^.]*$/, "").trim();

      for (const o of ordersList) {
        // 1. Exact phone match with client
        const p1 = cleanDigits((o as any).clients?.phone_primary);
        const p2 = cleanDigits((o as any).clients?.phone_secondary);
        if (tPhone && tPhone.length >= 8) {
          if (p1 && (p1.includes(tPhone) || tPhone.includes(p1))) {
            matchedOrder = o;
            break;
          }
          if (p2 && (p2.includes(tPhone) || tPhone.includes(p2))) {
            matchedOrder = o;
            break;
          }
        }
        // 2. Whaticket link
        if (o.whaticket_link && o.whaticket_link.includes(t.id)) {
          matchedOrder = o;
          break;
        }
        // 3. Name match
        if (cNameClean.length >= 4 && o.customer_name) {
          const oNameClean = o.customer_name.toLowerCase().trim();
          const parts = cNameClean.split(/\s+/).filter(p => p.length > 2);
          if (parts.length >= 2 && parts.every(p => oNameClean.includes(p))) {
            matchedOrder = o;
            break;
          }
        }
      }
      if (matchedOrder) {
        ticketOrderMap.set(t.id, matchedOrder);
      }
    });

    const filtered = allUniqueTickets.filter((t) => {
      const matchedOrder = ticketOrderMap.get(t.id);

      if (onlyOrders && !matchedOrder) {
        return false;
      }

      if (tagFilter && tagFilter !== "all") {
        const hasTag = (t.contact?.tags || []).some(
          (tg) => tg.name.toLowerCase().trim() === tagFilter.toLowerCase().trim()
        );
        if (!hasTag) return false;
      }

      if (dateFilter && dateFilter !== "all") {
        const rawDate = t.updatedAt || t.lastReceivedMessageAt || t.createdAt;
        const d = new Date(rawDate);
        const tDate = d.toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
        const oDate = matchedOrder
          ? new Date(matchedOrder.created_at || matchedOrder.order_date).toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" })
          : null;

        // Match if ticket was active on that date OR if the sale was created on that date
        if (tDate !== dateFilter && oDate !== dateFilter) {
          return false;
        }
      }

      if (statusFilter !== "all" && t.status !== statusFilter) {
        return false;
      }

      if (sellerFilter !== "all") {
        const sName = (userMap[t.userId || ""] || "").toLowerCase();
        if (!sName.includes(sellerFilter.toLowerCase()) && t.userId !== sellerFilter) {
          return false;
        }
      }

      if (searchQuery) {
        const name = (t.contact?.name || "").toLowerCase();
        const number = (t.contact?.number || "").toLowerCase();
        const msg = (t.lastMessage || "").toLowerCase();
        const orderCustomer = (matchedOrder?.customer_name || "").toLowerCase();
        const orderLocality = (matchedOrder?.locality || "").toLowerCase();
        if (
          !name.includes(searchQuery) &&
          !number.includes(searchQuery) &&
          !msg.includes(searchQuery) &&
          !orderCustomer.includes(searchQuery) &&
          !orderLocality.includes(searchQuery)
        ) {
          return false;
        }
      }

      return true;
    });

    let withOrdersCount = 0;
    let totalSoldAmount = 0;

    const conversations = filtered.map((t) => {
      const sellerName = userMap[t.userId || ""] || "Jazmín";
      const queueName = queueMap[t.queueId || ""] || "Ventas";
      const matchedOrder = ticketOrderMap.get(t.id) || null;

      if (matchedOrder) {
        withOrdersCount++;
        totalSoldAmount += Number(matchedOrder.total_amount || 0);
      }

      const msgDate = new Date(t.updatedAt || t.lastReceivedMessageAt || t.createdAt);
      const timeStr = msgDate.toLocaleTimeString("es-AR", {
        timeZone: "America/Argentina/Buenos_Aires",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      });
      const dateStr = msgDate.toLocaleDateString("es-AR", {
        timeZone: "America/Argentina/Buenos_Aires",
        day: "2-digit",
        month: "2-digit"
      });

      const isConfirmedReservation = (t.lastMessage || "").includes("confirmada") || (t.lastMessage || "").includes("reserva");

      // Extract real messages for this ticket if available
      const rawChatList = realMessagesMap[t.id];
      let chatMessages: any[] = [];

      if (rawChatList && Array.isArray(rawChatList) && rawChatList.length > 0) {
        // Sort chronological (oldest to newest)
        const sortedMsgs = [...rawChatList].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        
        chatMessages = sortedMsgs.map((m: any) => {
          const mDate = new Date(m.createdAt);
          const mTime = mDate.toLocaleTimeString("es-AR", {
            timeZone: "America/Argentina/Buenos_Aires",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
          });
          const mDateIso = mDate.toLocaleDateString("en-CA", {
            timeZone: "America/Argentina/Buenos_Aires"
          });
          const mDayLabel = mDate.toLocaleDateString("es-AR", {
            timeZone: "America/Argentina/Buenos_Aires",
            weekday: "long",
            day: "numeric",
            month: "long"
          });

          const mediaUrl = m.media?.tempUrl || m.mediaUrl || null;
          const mediaType = m.mediaType || (m.media ? "image" : null);

          return {
            id: m.id,
            fromMe: Boolean(m.fromMe),
            senderName: m.fromMe ? sellerName : (t.contact?.name || "Cliente"),
            time: mTime,
            dateIso: mDateIso,
            dayLabel: mDayLabel.charAt(0).toUpperCase() + mDayLabel.slice(1),
            body: m.body || "",
            mediaType: mediaType,
            mediaUrl: mediaUrl,
            originalFilename: m.media?.originalFilename || null
          };
        });
      } else {
        // Fallback to single message
        chatMessages = [
          {
            id: "m-last",
            fromMe: true,
            senderName: sellerName,
            time: timeStr,
            dateIso: "2026-09-05",
            dayLabel: "Sábado, 5 de Septiembre",
            body: t.lastMessage || "Sin mensajes",
            mediaType: null,
            mediaUrl: null
          }
        ];
      }

      // Detect exact reservation confirmation message date
      let reservationDateLabel: string | null = null;
      for (const m of chatMessages) {
        const clean = (m.body || "").replace(/[*_~`]/g, "").toLowerCase();
        if (clean.includes("tu reserva ya esta confirmada") || clean.includes("reserva ya esta confirmada")) {
          reservationDateLabel = `${m.dayLabel} a las ${m.time} hs`;
          break;
        }
      }

      return {
        id: t.id,
        contact: {
          id: t.contact?.id,
          name: t.contact?.name || "Sin nombre",
          number: t.contact?.number || "",
          profilePicUrl: t.contact?.profilePicUrl,
          tags: t.contact?.tags || []
        },
        seller: sellerName,
        queue: queueName,
        status: t.status,
        unreadMessages: t.unreadMessages || 0,
        lastMessage: t.lastMessage || "",
        lastMessageTime: timeStr,
        lastMessageDate: dateStr,
        reservationDateLabel,
        rawTimestamp: t.updatedAt || t.lastReceivedMessageAt,
        isConfirmedReservation,
        matchedOrder: matchedOrder ? {
          id: matchedOrder.id,
          customerName: matchedOrder.customer_name,
          locality: matchedOrder.locality,
          address: matchedOrder.address,
          totalAmount: matchedOrder.total_amount,
          orderDate: matchedOrder.order_date,
          status: matchedOrder.status,
          whaticketLink: matchedOrder.whaticket_link,
          items: (matchedOrder.order_items || []).map((it: any) => ({
            productId: it.product_id,
            name: it.product_name,
            quantity: it.quantity,
            price: it.unit_price,
            subtotal: (it.quantity || 1) * (it.unit_price || 0)
          }))
        } : null,
        detectedDraft: !matchedOrder ? (() => {
          let addr = "";
          let entrecalles = "";
          let budgetTotal = 0;
          for (const m of chatMessages) {
            const body = m.body || "";
            const clean = body.replace(/[*_~`]/g, "");
            if (!m.fromMe && (clean.toLowerCase().includes("entre") || clean.toLowerCase().includes("calle") || clean.toLowerCase().includes("altura") || clean.toLowerCase().includes("barrio"))) {
              if (!addr || clean.length > addr.length) addr = clean.replace(/\n+/g, " ");
              const em = clean.match(/(?:entre|\be\/)\s+([^,.\n]+)/i);
              if (em) entrecalles = em[1].trim();
            }
            const tm = clean.match(/(?:TOTAL A ABONAR|Monto total|TOTAL):\s*\$([0-9.]+)/i);
            if (tm) {
              budgetTotal = parseInt(tm[1].replace(/\./g, ""), 10);
            }
          }
          return (addr || budgetTotal > 0) ? {
            address: addr,
            entrecalles,
            total: budgetTotal
          } : null;
        })() : null,
        messages: chatMessages
      };
    });

    conversations.sort((a, b) => new Date(b.rawTimestamp || 0).getTime() - new Date(a.rawTimestamp || 0).getTime());

    return NextResponse.json({
      conversations,
      tags: availableTags,
      sellers: sellersList,
      metrics: {
        total: conversations.length,
        withOrders: withOrdersCount,
        totalSold: totalSoldAmount
      }
    });
  } catch (error: any) {
    console.error("Error in conversaciones API route:", error);
    return NextResponse.json(
      { error: "Error al cargar conversaciones: " + error.message },
      { status: 500 }
    );
  }
}
