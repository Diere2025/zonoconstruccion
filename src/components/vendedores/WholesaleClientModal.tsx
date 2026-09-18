"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Building2, Check, Loader2, MapPin, Phone, Plus, Search, Tag, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

export interface WholesaleClientOption {
  id: string;
  business_name: string;
  tax_id?: string | null;
  phone_primary: string;
  phone_secondary?: string | null;
  billing_address?: string | null;
  is_wholesale?: boolean;
  internal_code?: string | null;
  default_discount_label?: string | null;
  default_discount_coef?: number | null;
  notes?: string | null;
}

interface Props {
  open: boolean;
  selectedClientId?: string;
  onClose: () => void;
  onSelect: (client: WholesaleClientOption) => void;
}

const emptyForm = {
  internalCode: "",
  businessName: "",
  taxId: "",
  phonePrimary: "",
  phoneSecondary: "",
  billingAddress: "",
  discountPct: "",
  discountLabel: "",
  notes: ""
};

export default function WholesaleClientModal({ open, selectedClientId, onClose, onSelect }: Props) {
  const [tab, setTab] = useState<"search" | "create">("search");
  const [query, setQuery] = useState("");
  const [clients, setClients] = useState<WholesaleClientOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (!open) return;
    setError("");
    setTab("search");
    setQuery("");
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open]);

  useEffect(() => {
    if (!open || tab !== "search") return;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        let request = supabase
          .from("clients")
          .select("id, business_name, tax_id, phone_primary, phone_secondary, billing_address, is_wholesale, internal_code, default_discount_label, default_discount_coef, notes")
          .eq("is_wholesale", true)
          .order("business_name")
          .limit(80);

        const cleanQuery = query.trim();
        if (cleanQuery) {
          const safeQuery = cleanQuery.replace(/[,%()]/g, " ").trim();
          request = request.or(
            `business_name.ilike.%${safeQuery}%,tax_id.ilike.%${safeQuery}%,phone_primary.ilike.%${safeQuery}%,phone_secondary.ilike.%${safeQuery}%,internal_code.ilike.%${safeQuery}%`
          );
        }

        const { data, error: searchError } = await request;
        if (searchError) throw searchError;
        setClients((data || []) as WholesaleClientOption[]);
      } catch (searchError) {
        setError(searchError instanceof Error ? searchError.message : "No se pudieron cargar los clientes mayoristas.");
      } finally {
        setLoading(false);
      }
    }, query ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [open, query, tab]);

  const normalizedDiscount = useMemo(() => {
    const value = Number(String(form.discountPct).replace(",", "."));
    return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
  }, [form.discountPct]);

  const createClient = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.businessName.trim() || !form.phonePrimary.trim()) return;
    setSaving(true);
    setError("");
    try {
      const discountCoefficient = Math.round((1 - normalizedDiscount / 100) * 10000) / 10000;
      const { data, error: createError } = await supabase
        .from("clients")
        .insert({
          internal_code: form.internalCode.trim() || null,
          business_name: form.businessName.trim(),
          tax_id: form.taxId.trim() || null,
          phone_primary: form.phonePrimary.trim(),
          phone_secondary: form.phoneSecondary.trim() || null,
          billing_address: form.billingAddress.trim() || null,
          is_wholesale: true,
          client_type: "Mayorista",
          default_discount_coef: discountCoefficient,
          default_discount_label: form.discountLabel.trim() || (normalizedDiscount > 0 ? `Descuento habitual ${normalizedDiscount}%` : null),
          notes: form.notes.trim() || null
        })
        .select("id, business_name, tax_id, phone_primary, phone_secondary, billing_address, is_wholesale, internal_code, default_discount_label, default_discount_coef, notes")
        .single();
      if (createError) throw createError;
      setForm(emptyForm);
      onSelect(data as WholesaleClientOption);
      onClose();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "No se pudo crear el cliente mayorista.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10";
  const labelClass = "mb-1 block text-[9px] font-black uppercase tracking-wider text-slate-500";

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-white/20 bg-white shadow-2xl" onMouseDown={event => event.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-slate-200 bg-gradient-to-r from-emerald-700 to-teal-700 px-5 py-4 text-white">
          <div>
            <div className="flex items-center gap-2"><Building2 className="h-5 w-5" /><h2 className="text-base font-black">Clientes Mayoristas</h2></div>
            <p className="mt-1 text-[11px] font-medium text-emerald-50">Buscá una cuenta existente o registrá una nueva para AquaFort.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-white/80 transition hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex gap-1 border-b border-slate-200 bg-slate-50 p-2">
          <button type="button" onClick={() => setTab("search")} className={`flex-1 rounded-xl px-3 py-2 text-xs font-black transition ${tab === "search" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}><Search className="mr-1.5 inline h-3.5 w-3.5" />Buscar cliente</button>
          <button type="button" onClick={() => setTab("create")} className={`flex-1 rounded-xl px-3 py-2 text-xs font-black transition ${tab === "create" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}><Plus className="mr-1.5 inline h-3.5 w-3.5" />Nuevo mayorista</button>
        </div>

        {error && <div className="mx-5 mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{error}</div>}

        {tab === "search" ? (
          <div className="flex min-h-0 flex-1 flex-col p-5">
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Razón social, CUIT, teléfono o código interno..." className={`${inputClass} pl-10`} />
            </div>
            <div className="min-h-[300px] flex-1 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50/70 p-2">
              {loading ? (
                <div className="flex h-52 items-center justify-center gap-2 text-xs font-bold text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Buscando clientes...</div>
              ) : clients.length === 0 ? (
                <div className="flex h-52 flex-col items-center justify-center text-center"><Building2 className="mb-2 h-8 w-8 text-slate-300" /><p className="text-xs font-black text-slate-600">No encontramos clientes mayoristas</p><button type="button" onClick={() => setTab("create")} className="mt-3 rounded-xl bg-emerald-600 px-4 py-2 text-[10px] font-black text-white">Crear cliente nuevo</button></div>
              ) : clients.map(client => {
                const discount = client.default_discount_coef != null ? Math.round((1 - Number(client.default_discount_coef)) * 10000) / 100 : 0;
                const selected = client.id === selectedClientId;
                return (
                  <button key={client.id} type="button" onClick={() => { onSelect(client); onClose(); }} className={`mb-2 w-full rounded-2xl border p-3 text-left transition last:mb-0 ${selected ? "border-emerald-400 bg-emerald-50 ring-2 ring-emerald-500/10" : "border-slate-200 bg-white hover:border-emerald-300 hover:shadow-sm"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0"><p className="truncate text-xs font-black text-slate-900">{client.business_name}</p><p className="mt-0.5 text-[10px] font-semibold text-slate-500">{client.internal_code ? `${client.internal_code} · ` : ""}{client.tax_id || "Sin CUIT"}</p></div>
                      {selected ? <span className="flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-1 text-[9px] font-black text-white"><Check className="h-3 w-3" />Seleccionado</span> : <span className="rounded-lg bg-slate-100 px-2 py-1 text-[9px] font-black text-slate-600">Elegir</span>}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-semibold text-slate-600">
                      <span className="flex items-center gap-1"><Phone className="h-3 w-3 text-emerald-600" />{client.phone_primary || "Sin teléfono"}</span>
                      {client.billing_address && <span className="flex items-center gap-1"><MapPin className="h-3 w-3 text-emerald-600" />{client.billing_address}</span>}
                      {discount > 0 && <span className="flex items-center gap-1 font-black text-emerald-700"><Tag className="h-3 w-3" />{client.default_discount_label || `${discount}% habitual`}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <form onSubmit={createClient} className="overflow-y-auto p-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div><label className={labelClass}>Código interno</label><input value={form.internalCode} onChange={e => setForm({ ...form, internalCode: e.target.value })} placeholder="Ej. MAY-001" className={inputClass} /></div>
              <div><label className={labelClass}>Razón social *</label><input required value={form.businessName} onChange={e => setForm({ ...form, businessName: e.target.value })} placeholder="Corralón / Distribuidor" className={inputClass} /></div>
              <div><label className={labelClass}>CUIT</label><input value={form.taxId} onChange={e => setForm({ ...form, taxId: e.target.value })} placeholder="30-71234567-8" className={inputClass} /></div>
              <div><label className={labelClass}>Teléfono principal *</label><input required value={form.phonePrimary} onChange={e => setForm({ ...form, phonePrimary: e.target.value })} placeholder="WhatsApp de contacto" className={inputClass} /></div>
              <div><label className={labelClass}>Teléfono alternativo</label><input value={form.phoneSecondary} onChange={e => setForm({ ...form, phoneSecondary: e.target.value })} placeholder="Opcional" className={inputClass} /></div>
              <div><label className={labelClass}>Domicilio comercial</label><input value={form.billingAddress} onChange={e => setForm({ ...form, billingAddress: e.target.value })} placeholder="Calle, número y localidad" className={inputClass} /></div>
              <div><label className={labelClass}>Descuento habitual (%)</label><input type="number" min="0" max="100" step="0.01" value={form.discountPct} onChange={e => setForm({ ...form, discountPct: e.target.value })} placeholder="Ej. 8" className={inputClass} /></div>
              <div><label className={labelClass}>Nombre del descuento</label><input value={form.discountLabel} onChange={e => setForm({ ...form, discountLabel: e.target.value })} placeholder="Ej. Corralón habitual" className={inputClass} /></div>
              <div className="md:col-span-2"><label className={labelClass}>Observaciones comerciales</label><textarea rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Condiciones acordadas, contacto, horarios u otra información útil..." className={`${inputClass} resize-none`} /></div>
            </div>
            <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button type="submit" disabled={saving || !form.businessName.trim() || !form.phonePrimary.trim()} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-black text-white shadow-md shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Crear y seleccionar</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
