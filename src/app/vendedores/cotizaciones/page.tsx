"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, CalendarClock, FileText, MessageCircle, Plus, RefreshCw, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatPrice } from "@/lib/utils";
import { SalesQuoteStatus, updateSalesQuoteStatus } from "@/lib/salesQuotes";

const STATUSES: Array<{ value: SalesQuoteStatus; label: string; tone: string }> = [
  { value: "draft", label: "Borrador", tone: "bg-slate-100 text-slate-700" },
  { value: "sent", label: "Enviado", tone: "bg-blue-100 text-blue-700" },
  { value: "follow_up", label: "Seguimiento", tone: "bg-amber-100 text-amber-800" },
  { value: "accepted", label: "Aceptado", tone: "bg-emerald-100 text-emerald-700" },
  { value: "rejected", label: "Rechazado", tone: "bg-rose-100 text-rose-700" },
  { value: "expired", label: "Vencido", tone: "bg-orange-100 text-orange-700" },
  { value: "converted", label: "Convertido", tone: "bg-violet-100 text-violet-700" }
];

export default function CotizacionesPage() {
  const router = useRouter();
  const [quotes, setQuotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [channel, setChannel] = useState<"todos" | "minorista" | "mayorista">("todos");
  const [status, setStatus] = useState<"todos" | SalesQuoteStatus>("todos");

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("channel");
    if (value === "minorista" || value === "mayorista") setChannel(value);
  }, []);

  const loadQuotes = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("sales_quotes")
      .select("*, sales_quote_items(*), sales_quote_followups(*)")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) {
      alert(`No se pudieron cargar los presupuestos: ${error.message}`);
      setQuotes([]);
    } else {
      setQuotes(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadQuotes(); }, [loadQuotes]);

  const filtered = useMemo(() => quotes.filter(quote => {
    if (channel !== "todos" && quote.channel !== channel) return false;
    if (status !== "todos" && quote.status !== status) return false;
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return `${quote.quote_number} ${quote.customer_name || ""} ${quote.customer_phone || ""}`.toLowerCase().includes(needle);
  }), [quotes, channel, status, search]);

  const changeStatus = async (quoteId: string, nextStatus: SalesQuoteStatus) => {
    try {
      await updateSalesQuoteStatus(quoteId, nextStatus);
      setQuotes(current => current.map(quote => quote.id === quoteId ? { ...quote, status: nextStatus } : quote));
    } catch (error: any) {
      alert(`No se pudo cambiar el estado: ${error.message || error}`);
    }
  };

  const addFollowUp = async (quote: any) => {
    const note = prompt(`Seguimiento de ${quote.quote_number}:`);
    if (!note?.trim()) return;
    const nextDate = prompt("Próximo seguimiento (AAAA-MM-DD, opcional):")?.trim();
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("sales_quote_followups").insert({
      quote_id: quote.id,
      created_by: userData.user?.id || null,
      note: note.trim(),
      next_follow_up_at: nextDate ? `${nextDate}T12:00:00` : null
    });
    if (error) return alert(`No se pudo guardar el seguimiento: ${error.message}`);
    await changeStatus(quote.id, "follow_up");
    loadQuotes();
  };

  const convertToOrder = async (quote: any) => {
    if (quote.status === "converted") return;
    const conditions = quote.commercial_conditions || {};
    const items = (quote.sales_quote_items || []).sort((a: any, b: any) => a.sort_order - b.sort_order);
    sessionStorage.setItem("preloaded_budget", JSON.stringify({
      quoteId: quote.id,
      quoteNumber: quote.quote_number,
      channel: quote.channel,
      clientId: quote.client_id,
      customerName: quote.customer_name,
      customerPhone: quote.customer_phone,
      notes: quote.notes,
      orderDiscountType: quote.discount_type,
      orderDiscountValue: quote.discount_value,
      paymentType: conditions.paymentType,
      cardInstallments: conditions.cardInstallments,
      cardSurcharge: conditions.cardSurcharge,
      items: items.map((item: any) => ({
        id: item.product_id,
        name: `${item.product_name}${item.variant === "ciego" ? " (CIEGO)" : ""}`,
        sku: item.sku || item.product_name,
        quantity: Number(item.quantity),
        customPrice: Number(item.unit_price),
        basePrice: Number(item.list_unit_price),
        discountType: Number(item.discount_percentage) > 0 ? "percentage" : undefined,
        discountValue: Number(item.discount_percentage) || 0,
        cost: item.metadata?.cost || 0,
        bundleParentId: item.metadata?.bundleParentId,
        isIncludedInKit: item.metadata?.isIncludedInKit,
        baseQuantity: item.metadata?.baseQuantity
      }))
    }));
    await changeStatus(quote.id, "accepted");
    router.push(`/vendedores/pedidos?tab=form&client_type=${quote.channel === "mayorista" ? "mayoristas" : "minoristas"}`);
  };

  return (
    <div className="space-y-5 pb-20">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-black text-slate-900"><FileText className="h-5 w-5 text-blue-600" /> Presupuestos y Seguimiento</h1>
          <p className="mt-1 text-xs font-medium text-slate-500">Los presupuestos no reservan stock ni activan Logística hasta convertirse y guardarse como pedido.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/vendedores/presupuestos" className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white"><Plus className="mr-1 inline h-3.5 w-3.5" />Nuevo minorista</Link>
          <Link href="/vendedores/presupuestos-mayorista" className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-black text-white"><Plus className="mr-1 inline h-3.5 w-3.5" />Nuevo mayorista</Link>
        </div>
      </div>

      <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[1fr_auto_auto_auto]">
        <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3"><Search className="h-4 w-4 text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Código, cliente o teléfono" className="w-full py-2 text-sm outline-none" /></label>
        <select value={channel} onChange={event => setChannel(event.target.value as any)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold"><option value="todos">Ambos canales</option><option value="minorista">Minorista</option><option value="mayorista">Mayorista</option></select>
        <select value={status} onChange={event => setStatus(event.target.value as any)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold"><option value="todos">Todos los estados</option>{STATUSES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
        <button onClick={loadQuotes} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600"><RefreshCw className="mr-1 inline h-3.5 w-3.5" />Actualizar</button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[950px] text-left text-xs">
            <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500"><tr><th className="p-3">Presupuesto</th><th className="p-3">Cliente</th><th className="p-3">Canal</th><th className="p-3">Total</th><th className="p-3">Estado</th><th className="p-3">Vigencia</th><th className="p-3 text-right">Acciones</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan={7} className="p-10 text-center text-slate-400">Cargando presupuestos…</td></tr> : filtered.length === 0 ? <tr><td colSpan={7} className="p-10 text-center text-slate-400">No hay presupuestos para estos filtros.</td></tr> : filtered.map(quote => {
                const statusConfig = STATUSES.find(item => item.value === quote.status) || STATUSES[0];
                return <tr key={quote.id} className="hover:bg-slate-50/70">
                  <td className="p-3"><strong className="text-slate-900">{quote.quote_number}</strong><div className="text-[10px] text-slate-400">{new Date(quote.created_at).toLocaleDateString("es-AR")}</div></td>
                  <td className="p-3"><strong>{quote.customer_name || "Sin identificar"}</strong><div className="text-[10px] text-slate-400">{quote.customer_phone || "Sin teléfono"}</div></td>
                  <td className="p-3 font-bold capitalize">{quote.channel}</td>
                  <td className="p-3 font-black text-slate-900">{formatPrice(Number(quote.total_amount))}</td>
                  <td className="p-3"><select value={quote.status} disabled={quote.status === "converted"} onChange={event => changeStatus(quote.id, event.target.value as SalesQuoteStatus)} className={`rounded-lg border-0 px-2 py-1 text-[10px] font-black ${statusConfig.tone}`}>{STATUSES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></td>
                  <td className="p-3"><CalendarClock className="mr-1 inline h-3.5 w-3.5 text-slate-400" />{quote.valid_until ? new Date(`${quote.valid_until}T12:00:00`).toLocaleDateString("es-AR") : "Sin fecha"}</td>
                  <td className="p-3"><div className="flex justify-end gap-2"><button onClick={() => addFollowUp(quote)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 font-bold text-slate-600"><MessageCircle className="mr-1 inline h-3.5 w-3.5" />Seguimiento</button><button onClick={() => convertToOrder(quote)} disabled={quote.status === "converted" || quote.status === "rejected"} className="rounded-lg bg-blue-600 px-2.5 py-1.5 font-black text-white disabled:opacity-30">Convertir <ArrowRight className="ml-1 inline h-3.5 w-3.5" /></button></div></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
