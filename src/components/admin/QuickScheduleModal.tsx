"use client";

import React, { useState } from "react";
import { X, Calendar, CalendarClock, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { Product } from "@/types";

interface QuickScheduleModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function QuickScheduleModal({ product, isOpen, onClose, onSuccess }: QuickScheduleModalProps) {
  const getTomorrowStr = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  };

  const [newPrice, setNewPrice] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(getTomorrowStr());
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Set default price when opening
  React.useEffect(() => {
    if (product) {
      setNewPrice(product.price ? String(product.price) : "");
      setEffectiveDate(getTomorrowStr());
      setNotes("");
      setErrorMsg(null);
    }
  }, [product, isOpen]);

  if (!isOpen || !product) return null;

  const handleQuickDate = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    setEffectiveDate(d.toISOString().split("T")[0]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPrice = parseFloat(newPrice.replace(/[$.\s]/g, "").replace(",", "."));
    if (isNaN(cleanPrice) || cleanPrice <= 0) {
      setErrorMsg("Por favor ingresa un precio válido mayor a 0.");
      return;
    }

    if (!effectiveDate) {
      setErrorMsg("Por favor selecciona una fecha de vigencia.");
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/admin/scheduled-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item: {
            product_id: product.id,
            product_name: product.name,
            sku: product.sku || null,
            price: cleanPrice,
            effective_date: effectiveDate,
            notes: notes.trim() || undefined
          }
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Error al programar precio.");

      onClose();
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || "Ocurrió un error.");
    } finally {
      setSubmitting(false);
    }
  };

  const diff = product.price ? parseFloat(newPrice.replace(/[$.\s]/g, "").replace(",", ".")) - product.price : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 overflow-hidden relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600">
            <CalendarClock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Programar Cambio de Precio</h3>
            <p className="text-xs text-slate-500">El precio actual se mantiene hasta la fecha elegida</p>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-xl text-xs flex items-center gap-2 border border-red-200">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-0.5">Producto</span>
            <div className="font-bold text-slate-900 text-xs">{product.name}</div>
            {product.sku && <div className="text-[10px] text-slate-500 font-mono">SKU: {product.sku}</div>}
            <div className="mt-2 flex items-center justify-between text-xs pt-2 border-t border-slate-200/60">
              <span className="text-slate-500">Precio Actual:</span>
              <span className="font-bold text-slate-700">{formatPrice(product.price)}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">Nuevo Precio ($)</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">$</span>
              <input
                type="text"
                required
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                placeholder="Ej: 89300"
                className="w-full pl-8 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            {!isNaN(diff) && diff !== 0 && (
              <span className={`text-[11px] font-bold block ${diff > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {diff > 0 ? `+${formatPrice(diff)} (+${((diff / product.price) * 100).toFixed(1)}%)` : `${formatPrice(diff)} (${((diff / product.price) * 100).toFixed(1)}%)`}
              </span>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
              <span>Fecha de Vigencia</span>
              <span className="text-[10px] text-slate-400 font-normal">A partir de las 00:00 hs</span>
            </label>
            <input
              type="date"
              required
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
            />
            <div className="flex gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => handleQuickDate(1)}
                className="px-2.5 py-1 text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors cursor-pointer"
              >
                Mañana
              </button>
              <button
                type="button"
                onClick={() => handleQuickDate(3)}
                className="px-2.5 py-1 text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors cursor-pointer"
              >
                En 3 días
              </button>
              <button
                type="button"
                onClick={() => handleQuickDate(7)}
                className="px-2.5 py-1 text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors cursor-pointer"
              >
                En 7 días
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">Notas / Motivo (Opcional)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej: Aumento proveedor, inflación, etc."
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 px-5 py-2 text-xs font-bold bg-brand-600 text-white hover:bg-brand-700 rounded-xl transition-colors shadow-sm cursor-pointer disabled:opacity-50"
            >
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarClock className="w-3.5 h-3.5" />}
              Guardar Programación
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
