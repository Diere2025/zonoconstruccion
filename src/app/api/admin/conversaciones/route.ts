export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
    const tagFilter = searchParams.get("tag") ?? "all";
    const searchQuery = (searchParams.get("search") || "").trim().toLowerCase();
    const statusFilter = searchParams.get("status") || "all";
    const sellerFilter = searchParams.get("seller") || "all";

    const ticketsData = (ticketsDataRaw || []) as unknown as RawTicket[];
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
        .select("id, customer_name, locality, address, total_amount, order_date, whaticket_link, status, created_at")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (orders) ordersList = orders;
    } catch (dbErr) {
      console.warn("Could not fetch orders for cross-reference:", dbErr);
    }

    // Pre-match each ticket with order
    const ticketOrderMap = new Map<string, any>();
    allUniqueTickets.forEach((t) => {
      let matchedOrder: any = null;
      for (const o of ordersList) {
        if (o.whaticket_link && o.whaticket_link.includes(t.id)) {
          matchedOrder = o;
          break;
        }
        if (t.contact?.name && o.customer_name) {
          const cNameClean = t.contact.name.toLowerCase().split(".")[0].trim();
          const oNameClean = o.customer_name.toLowerCase().trim();
          if (cNameClean.length >= 4 && (oNameClean.includes(cNameClean) || cNameClean.includes(oNameClean))) {
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

          const mediaUrl = m.media?.tempUrl || m.mediaUrl || null;
          const mediaType = m.mediaType || (m.media ? "image" : null);

          return {
            id: m.id,
            fromMe: Boolean(m.fromMe),
            senderName: m.fromMe ? sellerName : (t.contact?.name || "Cliente"),
            time: mTime,
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
            body: t.lastMessage || "Sin mensajes",
            mediaType: null,
            mediaUrl: null
          }
        ];
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
          whaticketLink: matchedOrder.whaticket_link
        } : null,
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
