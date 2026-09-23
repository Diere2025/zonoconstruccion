"use client";

import React, { useState, useEffect } from "react";
import { MapPin, X, Loader2, AlertCircle, Plus, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { supabase } from "@/lib/supabase";

export interface ZoneOption {
  id: string;
  name: string;
  delivery_schedule?: string | null;
  delivery_time_id?: string | null;
  delivery_times?: any;
  is_active?: boolean;
  color?: string | null;
}

export interface CreatedLocality {
  id: string;
  name: string;
  zone_id: string;
  zones?: {
    name: string;
    delivery_schedule?: string;
    delivery_time_id?: string | null;
    delivery_times?: {
      name: string;
      description: string;
      delivery_days?: number[];
    } | null;
  };
}

interface AddLocalityModalProps {
  isOpen: boolean;
  onClose: () => void;
  zones: ZoneOption[];
  initialName?: string;
  onLocalityCreated: (locality: CreatedLocality) => void;
}

export default function AddLocalityModal({
  isOpen,
  onClose,
  zones,
  initialName = "",
  onLocalityCreated
}: AddLocalityModalProps) {
  const [name, setName] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName(initialName.trim());
      setZoneId("");
      setError(null);
      setLoading(false);
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = previousOverflow;
      };
    }
  }, [isOpen, initialName]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      setError("El nombre de la localidad es obligatorio.");
      return;
    }
    if (!zoneId) {
      setError("Debes seleccionar una zona para la localidad.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        throw new Error("Tu sesión ha expirado. Por favor, recarga la página o inicia sesión nuevamente.");
      }

      const res = await fetch("/api/vendedores/create-locality", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          name: cleanName,
          zone_id: zoneId
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.locality) {
        throw new Error(data.error || "No se pudo registrar la localidad.");
      }

      onLocalityCreated(data.locality);
      onClose();
    } catch (err: any) {
      console.error("[AddLocalityModal] Error:", err);
      setError(err.message || "Ocurrió un error al guardar la localidad.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600">
              <MapPin className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-800 tracking-tight leading-snug">
                Agregar Localidad
              </h2>
              <p className="text-[11px] font-bold text-slate-500">
                Crea una localidad y asígnala a su zona de reparto
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-xs text-red-700 font-semibold animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1">{error}</div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">
              Nombre de la Localidad <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Pilar, Garín, Don Torcuato, etc."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-bold text-sm outline-none focus:ring-2 focus:ring-brand-500/15 focus:border-brand-500 transition-all text-slate-800 placeholder:text-slate-400 placeholder:font-normal"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">
              Zona de Reparto <span className="text-red-500">*</span>
            </label>
            <select
              required
              value={zoneId}
              onChange={(e) => setZoneId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-bold text-sm outline-none focus:ring-2 focus:ring-brand-500/15 focus:border-brand-500 transition-all text-slate-800"
            >
              <option value="">-- Seleccionar Zona --</option>
              {zones.map((z) => {
                const dt = Array.isArray(z.delivery_times) ? z.delivery_times[0] : z.delivery_times;
                const schedule = dt
                  ? `${dt.name} (${dt.description})`
                  : z.delivery_schedule;
                return (
                  <option key={z.id} value={z.id}>
                    {z.name} {schedule ? `• Reparto: ${schedule}` : ""}
                  </option>
                );
              })}
            </select>
          </div>

          <div className="bg-brand-50/60 border border-brand-100 rounded-xl p-3 text-[11px] text-brand-800 space-y-1">
            <p className="font-bold flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-brand-600 shrink-0" />
              Disponible de inmediato
            </p>
            <p className="text-brand-700/90 leading-relaxed pl-5 text-[10.5px]">
              La localidad se seleccionará automáticamente en este pedido y quedará guardada para futuros pedidos de todo el equipo.
            </p>
          </div>

          {/* Footer Actions */}
          <div className="pt-2 flex items-center justify-end gap-2.5">
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={onClose}
              className="rounded-xl font-bold text-xs cursor-pointer"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="rounded-xl font-black text-xs bg-brand-600 hover:bg-brand-700 text-white flex items-center gap-2 shadow-md shadow-brand-500/20 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span>Guardar Localidad</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
