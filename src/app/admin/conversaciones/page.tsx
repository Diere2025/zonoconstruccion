"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { 
  MessageSquare, 
  Search, 
  Calendar, 
  Tag as TagIcon, 
  User, 
  Phone, 
  ExternalLink, 
  ShoppingCart, 
  CheckCircle2, 
  Clock, 
  RefreshCw, 
  Filter, 
  MapPin, 
  Check, 
  CheckCheck, 
  Send, 
  Sparkles,
  ArrowRight,
  TrendingUp,
  AlertCircle,
  Copy,
  Mic,
  Image as ImageIcon
} from "lucide-react";
import { Button } from "@/components/ui/Button";

interface Tag {
  id: string;
  name: string;
  color: string;
}

interface ChatMessage {
  id: string;
  fromMe: boolean;
  senderName: string;
  time: string;
  body: string;
  mediaType?: string | null;
  mediaUrl?: string | null;
  originalFilename?: string | null;
}

interface MatchedOrder {
  id: string;
  customerName: string;
  locality?: string;
  address?: string;
  totalAmount?: number;
  orderDate?: string;
  status?: string;
  whaticketLink?: string;
}

interface Conversation {
  id: string;
  contact: {
    id?: string;
    name: string;
    number: string;
    profilePicUrl?: string | null;
    tags: Tag[];
  };
  seller: string;
  queue: string;
  status: string;
  unreadMessages: number;
  lastMessage: string;
  lastMessageTime: string;
  lastMessageDate: string;
  rawTimestamp: string;
  isConfirmedReservation: boolean;
  matchedOrder?: MatchedOrder | null;
  messages: ChatMessage[];
}

export default function ConversacionesAdminPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [sellers, setSellers] = useState<Array<{ id: string; name: string }>>([]);
  const [metrics, setMetrics] = useState({ total: 0, withOrders: 0, totalSold: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [dateFilter, setDateFilter] = useState("2026-09-05"); // Ayer por defecto
  const [tagFilter, setTagFilter] = useState("all");          // Todas por defecto para mostrar todas las ventas
  const [searchQuery, setSearchQuery] = useState("");
  const [sellerFilter, setSellerFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copiedPhone, setCopiedPhone] = useState(false);

  const fetchConversations = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (dateFilter) params.set("date", dateFilter);
      if (tagFilter) params.set("tag", tagFilter);
      if (searchQuery) params.set("search", searchQuery);
      if (sellerFilter !== "all") params.set("seller", sellerFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);

      const res = await fetch(`/api/admin/conversaciones?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Error ${res.status}: Falló la carga de conversaciones`);
      }
      const data = await res.json();
      setConversations(data.conversations || []);
      if (data.tags) setTags(data.tags);
      if (data.sellers) setSellers(data.sellers);
      if (data.metrics) setMetrics(data.metrics);

      // Auto-select first conversation
      if (data.conversations && data.conversations.length > 0) {
        setSelectedId((prev) => (prev && data.conversations.some((c: Conversation) => c.id === prev) ? prev : data.conversations[0].id));
      } else {
        setSelectedId(null);
      }
    } catch (err: any) {
      setError(err.message || "Error al cargar conversaciones");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchConversations();
  }, [dateFilter, tagFilter, sellerFilter, statusFilter]);

  // Client-side instant search filter
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase().trim();
    return conversations.filter((c) => {
      const name = (c.contact?.name || "").toLowerCase();
      const phone = (c.contact?.number || "").toLowerCase();
      const msg = (c.lastMessage || "").toLowerCase();
      return name.includes(q) || phone.includes(q) || msg.includes(q);
    });
  }, [conversations, searchQuery]);

  const selectedConversation = useMemo(() => {
    return filteredConversations.find((c) => c.id === selectedId) || filteredConversations[0] || null;
  }, [filteredConversations, selectedId]);

  const handleCopyPhone = (number: string) => {
    navigator.clipboard.writeText(number);
    setCopiedPhone(true);
    setTimeout(() => setCopiedPhone(false), 2000);
  };

  // Helper to format WhatsApp markdown text (*bold*)
  const renderFormattedText = (text: string) => {
    const parts = text.split("\n");
    return parts.map((line, idx) => {
      // Replace *text* with <strong>text</strong>
      const boldReplaced = line.split(/(\*[^*]+\*)/g).map((chunk, cIdx) => {
        if (chunk.startsWith("*") && chunk.endsWith("*") && chunk.length > 2) {
          return <strong key={cIdx} className="font-semibold text-slate-900">{chunk.slice(1, -1)}</strong>;
        }
        return chunk;
      });

      return (
        <span key={idx} className="block leading-relaxed">
          {boldReplaced}
        </span>
      );
    });
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1700px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
              <MessageSquare className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                Conversaciones WhatsApp (Whaticket)
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-300">
                  Espejo Zono
                </span>
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Auditoría y visualización de chats vinculados directamente con los pedidos y clientes del ERP.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchConversations}
            disabled={isLoading}
            className="flex items-center gap-1.5 text-slate-700 bg-white shadow-xs"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-emerald-600" : ""}`} />
            Actualizar
          </Button>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 shrink-0">
            <MessageSquare className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900">{metrics.total}</div>
            <div className="text-xs text-slate-500 font-medium">Conversaciones Filtradas</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-emerald-700">{metrics.withOrders}</div>
            <div className="text-xs text-slate-500 font-medium">Con Pedido en Zono ERP</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100 shrink-0">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900">
              ${metrics.totalSold.toLocaleString("es-AR")}
            </div>
            <div className="text-xs text-slate-500 font-medium">Ventas Cruzadas ERP</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100 shrink-0">
            <User className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900">Jazmín</div>
            <div className="text-xs text-slate-500 font-medium">Ventas Minoristas Zono</div>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Quick Date Pills */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-medium">
            <button
              onClick={() => setDateFilter("2026-09-05")}
              className={`px-3 py-1.5 rounded-md transition-all ${
                dateFilter === "2026-09-05" 
                  ? "bg-white text-emerald-700 shadow-xs font-semibold" 
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Ayer (05/09/2026)
            </button>
            <button
              onClick={() => setDateFilter("2026-09-06")}
              className={`px-3 py-1.5 rounded-md transition-all ${
                dateFilter === "2026-09-06" 
                  ? "bg-white text-emerald-700 shadow-xs font-semibold" 
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Hoy (06/09/2026)
            </button>
            <button
              onClick={() => setDateFilter("all")}
              className={`px-3 py-1.5 rounded-md transition-all ${
                dateFilter === "all" 
                  ? "bg-white text-emerald-700 shadow-xs font-semibold" 
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Todas las fechas
            </button>
          </div>

          {/* Search Box */}
          <div className="relative min-w-[240px] flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar cliente, teléfono o texto..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all text-slate-800 placeholder-slate-400"
            />
          </div>
        </div>

        {/* Dropdowns */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
          {/* Tag Dropdown */}
          <div className="flex items-center gap-2">
            <TagIcon className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="w-full text-xs font-medium bg-slate-50 border border-slate-300 rounded-md py-1.5 px-2.5 text-slate-700 focus:ring-1 focus:ring-emerald-500"
            >
              <option value="all">Todas las Etiquetas (Ventas + Consultas)</option>
              <option value="Cliente">Solo Etiqueta: Cliente</option>
              {tags
                .filter((t) => t.name !== "Cliente")
                .map((t) => (
                  <option key={t.id} value={t.name}>
                    {t.name}
                  </option>
                ))}
            </select>
          </div>

          {/* Vendedor Dropdown */}
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={sellerFilter}
              onChange={(e) => setSellerFilter(e.target.value)}
              className="w-full text-xs font-medium bg-slate-50 border border-slate-300 rounded-md py-1.5 px-2.5 text-slate-700 focus:ring-1 focus:ring-emerald-500"
            >
              <option value="all">Todos los Vendedores</option>
              {sellers.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Date Picker Manual */}
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="date"
              value={dateFilter === "all" ? "" : dateFilter}
              onChange={(e) => setDateFilter(e.target.value || "all")}
              className="w-full text-xs font-medium bg-slate-50 border border-slate-300 rounded-md py-1.5 px-2.5 text-slate-700 focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>
      </div>

      {/* Main Content Area: Chat list & Chat Viewer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: List of Chats (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col h-[750px]">
          <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs text-slate-500 font-semibold">
            <span>CLIENTES ({filteredConversations.length})</span>
            <span>ESTADO / HORARIO</span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {isLoading ? (
              <div className="p-8 text-center text-slate-400 space-y-2">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-500" />
                <p className="text-xs">Cargando conversaciones de Whaticket...</p>
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="p-8 text-center text-slate-400 space-y-2">
                <MessageSquare className="w-8 h-8 mx-auto text-slate-300" />
                <p className="text-sm font-medium text-slate-600">No se encontraron conversaciones</p>
                <p className="text-xs text-slate-400">Probá cambiando la fecha o la etiqueta seleccionada.</p>
              </div>
            ) : (
              filteredConversations.map((c) => {
                const isSelected = selectedId === c.id;
                const clientName = c.contact?.name || "Sin nombre";
                const phone = c.contact?.number || "";
                const cleanPhone = phone.replace(/\D/g, "");

                return (
                  <div
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className={`p-3.5 cursor-pointer transition-all flex gap-3 hover:bg-slate-50 ${
                      isSelected ? "bg-emerald-50/60 border-l-4 border-l-emerald-600" : ""
                    }`}
                  >
                    {/* Avatar */}
                    <div className="relative shrink-0">
                      <div className="w-11 h-11 rounded-full bg-slate-800 text-white font-semibold text-sm flex items-center justify-center shadow-xs">
                        {clientName.charAt(0).toUpperCase()}
                      </div>
                      {c.matchedOrder && (
                        <div 
                          title="Tiene pedido cargado en Zono ERP" 
                          className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center border-2 border-white shadow-xs"
                        >
                          <ShoppingCart className="w-2.5 h-2.5" />
                        </div>
                      )}
                    </div>

                    {/* Chat Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <h3 className="text-sm font-bold text-slate-900 truncate">
                          {clientName}
                        </h3>
                        <span className="text-[11px] text-slate-400 shrink-0 font-medium">
                          {c.lastMessageTime}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1.5">
                        <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="font-mono text-[11px] truncate">{phone}</span>
                        <span className="text-slate-300">•</span>
                        <span className="truncate text-slate-600 font-medium">{c.seller}</span>
                      </div>

                      {/* Last message snippet */}
                      <p className="text-xs text-slate-600 truncate line-clamp-1 mb-2">
                        {c.lastMessage || "Sin mensajes"}
                      </p>

                      {/* Tags & Order Badges */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {c.contact?.tags?.slice(0, 2).map((tg) => (
                          <span
                            key={tg.id}
                            style={{ 
                              backgroundColor: tg.color ? `${tg.color}20` : "#35baf620", 
                              color: tg.color || "#0284c7" 
                            }}
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-md"
                          >
                            {tg.name}
                          </span>
                        ))}

                        {c.matchedOrder && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                            <span>🛒 ${c.matchedOrder.totalAmount?.toLocaleString("es-AR")}</span>
                            <span>• {c.matchedOrder.locality}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Chat Viewer (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col h-[750px]">
          {selectedConversation ? (
            <>
              {/* Chat Header */}
              <div className="p-4 bg-slate-900 text-white flex items-center justify-between gap-4 shrink-0 shadow-xs">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center border border-emerald-500/30 shrink-0">
                    {selectedConversation.contact?.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-base font-bold truncate text-white">
                      {selectedConversation.contact?.name}
                    </h2>
                    <div className="flex items-center gap-2 text-xs text-slate-300 mt-0.5">
                      <span className="font-mono">{selectedConversation.contact?.number}</span>
                      <span>•</span>
                      <span className="text-emerald-400 font-medium">
                        Atendido por {selectedConversation.seller}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Header Action Buttons */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleCopyPhone(selectedConversation.contact?.number)}
                    title="Copiar teléfono"
                    className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-all text-xs flex items-center gap-1"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    {copiedPhone && <span className="text-[10px] text-emerald-400 font-semibold">Copiado!</span>}
                  </button>

                  <a
                    href={`https://wa.me/${selectedConversation.contact?.number.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Abrir WhatsApp Web
                  </a>
                </div>
              </div>

              {/* Matched Order Alert Banner if linked in Zono */}
              {selectedConversation.matchedOrder ? (
                <div className="p-3 bg-emerald-50 border-b border-emerald-200 flex items-center justify-between gap-3 text-xs text-emerald-900">
                  <div className="flex items-center gap-2 truncate">
                    <div className="p-1.5 bg-emerald-200 text-emerald-800 rounded-md shrink-0">
                      <ShoppingCart className="w-4 h-4" />
                    </div>
                    <div className="truncate">
                      <span className="font-bold">Pedido vinculado en Zono:</span>{" "}
                      <span>{selectedConversation.matchedOrder.customerName}</span> •{" "}
                      <span className="font-semibold text-emerald-700">
                        ${selectedConversation.matchedOrder.totalAmount?.toLocaleString("es-AR")}
                      </span>{" "}
                      • Localidad: {selectedConversation.matchedOrder.locality || "S/D"}
                    </div>
                  </div>

                  <Link
                    href={`/vendedores/pedidos?search=${encodeURIComponent(selectedConversation.matchedOrder.customerName.split(" ")[0])}`}
                    className="px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shrink-0 flex items-center gap-1 transition-all"
                  >
                    Ver en Pedidos
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              ) : (
                <div className="p-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs text-slate-500">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-3.5 h-3.5 text-slate-400" />
                    <span>Sin pedido confirmado en el ERP todavía</span>
                  </div>
                  <Link
                    href={`/vendedores/pedidos?client_name=${encodeURIComponent(selectedConversation.contact?.name)}&client_phone=${encodeURIComponent(selectedConversation.contact?.number)}`}
                    className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 hover:underline flex items-center gap-1"
                  >
                    + Crear Pedido para este cliente
                  </Link>
                </div>
              )}

              {/* WhatsApp Messages View Area */}
              <div 
                className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-slate-100"
                style={{
                  backgroundImage: "radial-gradient(#cbd5e1 1px, transparent 1px)",
                  backgroundSize: "20px 20px"
                }}
              >
                {/* Date Divider */}
                <div className="flex justify-center">
                  <span className="text-[11px] font-semibold text-slate-500 bg-white/90 px-3 py-1 rounded-full shadow-xs border border-slate-200">
                    Ayer, 5 de Septiembre de 2026
                  </span>
                </div>

                {/* Chat Balloons */}
                {selectedConversation.messages?.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.fromMe ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-3.5 shadow-xs text-sm ${
                        msg.fromMe
                          ? "bg-emerald-100 text-slate-900 border border-emerald-200/80 rounded-tr-xs"
                          : "bg-white text-slate-900 border border-slate-200 rounded-tl-xs"
                      }`}
                    >
                      {/* Sender Name */}
                      <div className="flex items-center justify-between gap-4 mb-1 border-b border-black/5 pb-1">
                        <span
                          className={`text-[11px] font-bold ${
                            msg.fromMe ? "text-emerald-800" : "text-blue-700"
                          }`}
                        >
                          {msg.senderName}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {msg.time}
                        </span>
                      </div>

                      {/* Audio Player if voice note */}
                      {msg.mediaType === "audio" && (
                        <div className="my-2 p-2.5 rounded-xl bg-black/5 flex flex-col gap-1">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
                            <Mic className="w-4 h-4" />
                            <span>Nota de voz (Audio)</span>
                          </div>
                          {msg.mediaUrl ? (
                            <audio 
                              controls 
                              src={msg.mediaUrl} 
                              className="w-full h-9 mt-1" 
                              preload="none" 
                            />
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">
                              Audio de WhatsApp
                            </span>
                          )}
                        </div>
                      )}

                      {/* Image Viewer if image attached */}
                      {msg.mediaType === "image" && (
                        <div className="my-2">
                          {msg.mediaUrl ? (
                            <a 
                              href={msg.mediaUrl} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              title="Clic para ver en tamaño original"
                            >
                              <img 
                                src={msg.mediaUrl} 
                                alt="Adjunto de WhatsApp" 
                                className="max-h-72 rounded-lg object-cover shadow-xs border border-black/10 hover:opacity-95 transition-all" 
                              />
                            </a>
                          ) : (
                            <div className="p-2.5 rounded-lg bg-black/5 flex items-center gap-2 text-xs text-slate-600">
                              <ImageIcon className="w-4 h-4 text-slate-400" />
                              <span>Foto / Comprobante adjunto</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Body */}
                      {msg.body && (
                        <div className="text-slate-800 whitespace-pre-wrap text-[13px] leading-relaxed">
                          {renderFormattedText(msg.body)}
                        </div>
                      )}

                      {/* Read status icon */}
                      {msg.fromMe && (
                        <div className="flex justify-end mt-1">
                          <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Bottom Quick Bar */}
              <div className="p-3 bg-white border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span>Conversación sincronizada desde Whaticket</span>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={`https://wa.me/${selectedConversation.contact?.number.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 hover:underline flex items-center gap-1"
                  >
                    Responder en WhatsApp Web ↗
                  </a>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
              <MessageSquare className="w-12 h-12 text-slate-300 mb-3" />
              <p className="text-base font-medium text-slate-700">Seleccioná un cliente de la lista</p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                Podés ver los mensajes detallados, el vendedor a cargo y el pedido asociado en Zono.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
