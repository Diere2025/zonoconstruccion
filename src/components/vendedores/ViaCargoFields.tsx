'use client';

import { VIA_CARGO_MODES, type ViaCargoDestination } from '@/lib/viaCargo';
import { Truck } from 'lucide-react';
import ShippingGeographyFields from './ShippingGeographyFields';
import { normalizeGeography } from '@/lib/georef';

export default function ViaCargoFields({ value, onChange, destinations, selectedId, onSelect, loading, error }: {
  value: ViaCargoDestination;
  onChange: (value: ViaCargoDestination) => void;
  destinations: { id: string; via_cargo: ViaCargoDestination }[];
  selectedId: string;
  onSelect: (id: string) => void;
  loading: boolean;
  error: string;
}) {
  const input = 'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 transition-all';
  const labelStyle = 'block text-[9px] font-black uppercase tracking-wider text-slate-400';
  const field = (key: Exclude<keyof ViaCargoDestination, 'same_as_client'>, label: string, required = false, type = 'text', span = 'lg:col-span-2') => (
    <label className={`grid min-w-0 content-start gap-1 ${span}`} key={key}>
      <span className={labelStyle}>{label}{required ? ' *' : ' (opcional)'}</span>
      <input aria-label={label} className={input} type={type} required={required} maxLength={key === 'maps_url' ? 2000 : 250} value={value[key]} onChange={e => onChange({ ...value, [key]: e.target.value })} />
    </label>
  );
  return <section className="space-y-3 rounded-xl border border-slate-200/95 bg-slate-50/90 p-4" aria-label="Datos de envío — Vía Cargo">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 pb-1.5">
      <h4 className="flex items-center gap-1.5 text-xs font-black uppercase text-slate-800"><Truck className="h-4 w-4 text-brand-500" /> Datos de envío — Vía Cargo</h4>
    </div>
    <p className="text-[11px] text-slate-500">Cargá los datos de quien recibe. Logística define dónde se despacha a Vía Cargo.</p>
    {loading && <p className="text-xs text-slate-600">Buscando destinos guardados…</p>}
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    {destinations.length > 0 && <label className="grid gap-1"><span className={labelStyle}>Usar un destino guardado</span>
      <select aria-label="Destino Vía Cargo guardado" className={input} value={selectedId} onChange={e => onSelect(e.target.value)}>
        <option value="">Cargar un nuevo destino</option>
        {destinations.map(d => <option key={d.id} value={d.id}>{d.via_cargo.name} · {d.via_cargo.locality} · {VIA_CARGO_MODES[d.via_cargo.mode]}</option>)}
      </select>
    </label>}
    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-700">
      <input type="checkbox" className="accent-brand-500" checked={!!value.same_as_client} onChange={e => onChange({ ...value, same_as_client: e.target.checked })} />
      El destinatario es el mismo cliente
    </label>
    {value.same_as_client && <p className="text-[11px] text-slate-500">Se usarán el nombre, DNI/CUIT y teléfono de Cuenta del cliente. {(!value.name.trim() || !value.document.trim() || !value.phone.trim()) && <span className="font-bold text-amber-700">Completá esos datos en Cuenta del cliente para continuar.</span>}</p>}
    <fieldset className="space-y-2">
      <legend className={labelStyle}>Modalidad *</legend>
      <div className="flex flex-wrap gap-2">{Object.entries(VIA_CARGO_MODES).map(([key, label]) => <label key={key} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-[10px] font-bold transition-colors ${value.mode === key ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-700 hover:border-brand-200'}`}>
        <input className="accent-brand-500" type="radio" name="via-cargo-mode" value={key} checked={value.mode === key} onChange={() => onChange({ ...value, mode: key as ViaCargoDestination['mode'] })} />{label}
      </label>)}</div>
    </fieldset>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
      {!value.same_as_client && <>{field('name', 'Nombre y apellido', true)}{field('document', 'DNI / CUIT', true)}{field('phone', 'Teléfono de contacto', true, 'tel')}</>}
      <ShippingGeographyFields province={value.province} locality={value.locality} inputClass={input} labelClass={labelStyle}
        onChange={(province, locality) => onChange({ ...value, province, locality,
          postal_code: normalizeGeography(province) !== normalizeGeography(value.province) || normalizeGeography(locality) !== normalizeGeography(value.locality) ? '' : value.postal_code })} />
      <label className="grid min-w-0 content-start gap-1 lg:col-span-2">
        <span className="flex items-center justify-between gap-2"><span className={labelStyle}>Código postal *</span>
          <a href="https://www.correoargentino.com.ar/formularios/cpa" target="_blank" rel="noopener noreferrer" className="shrink-0 text-[9px] font-bold text-brand-600 hover:underline">Consultar CP ↗</a>
        </span>
        <input aria-label="Código postal" className={input} required maxLength={20} value={value.postal_code} onChange={e => onChange({ ...value, postal_code: e.target.value })} />
      </label>
      {value.mode === 'branch' && field('branch', 'Sucursal de retiro de destino', true)}
      {field('address', 'Dirección exacta, piso y departamento', value.mode === 'home', 'text', value.mode === 'branch' ? 'lg:col-span-2' : 'lg:col-span-3')}
      {field('maps_url', 'Link de Google Maps del destino', false, 'url', value.mode === 'branch' ? 'lg:col-span-2' : 'lg:col-span-3')}
      <label className="grid min-w-0 gap-1 sm:col-span-2 lg:col-span-6"><span className={labelStyle}>Referencias e indicaciones del cliente (opcional)</span>
        <textarea aria-label="Referencias del cliente para Vía Cargo" className={input} rows={2} maxLength={2000} value={value.references} onChange={e => onChange({ ...value, references: e.target.value })} placeholder="Cómo llegar, quién recibe, horarios, referencias de la sucursal…" />
      </label>
    </div>
    {value.mode === 'pending' && <p className="rounded-lg border border-amber-200/60 bg-amber-50 px-2.5 py-2 text-[10px] font-bold text-amber-700">Modalidad pendiente de definir. Completar con logística antes del despacho.</p>}
  </section>;
}
