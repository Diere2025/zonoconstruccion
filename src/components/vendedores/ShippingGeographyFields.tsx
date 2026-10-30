'use client';

import { useEffect, useId, useState } from 'react';
import { normalizeGeography, type GeoLocality, type GeoProvince } from '@/lib/georef';

let provincesCache: GeoProvince[] | null = null;
let provincesRequest: Promise<GeoProvince[]> | null = null;
async function getProvinces(): Promise<GeoProvince[]> {
  if (provincesCache) return provincesCache;
  if (!provincesRequest) provincesRequest = fetch('/api/georef?kind=provinces').then(async response => {
    if (!response.ok) throw new Error('UNAVAILABLE');
    const body = await response.json();
    if (!Array.isArray(body.results)) throw new Error('INVALID_RESPONSE');
    provincesCache = body.results;
    return body.results;
  }).finally(() => { provincesRequest = null; });
  return provincesRequest;
}

function SearchField({ label, value, onChange, onSelect, items, busy, message, inputClass, labelClass, placeholder }: {
  label: string; value: string; onChange: (value: string) => void; onSelect: (id: string) => void;
  items: { id: string; name: string; detail?: string }[]; busy?: boolean; message?: string;
  inputClass: string; labelClass: string; placeholder: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  useEffect(() => {
    if (open && active >= 0) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, id, open]);
  return <div className="relative min-w-0 lg:col-span-2" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <label className="grid gap-1" htmlFor={id}><span className={labelClass}>{label} *</span>
      <input id={id} aria-label={label} required autoComplete="off" maxLength={80} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-options`} aria-activedescendant={open && active >= 0 && items[active] ? `${id}-${active}` : undefined}
        value={value} placeholder={placeholder} className={inputClass} onFocus={() => { setOpen(true); setActive(-1); }}
        onChange={event => { onChange(event.target.value); setOpen(true); setActive(-1); }} onKeyDown={event => {
          if (event.key === 'Escape') { event.preventDefault(); setOpen(false); setActive(-1); }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); setOpen(true);
            setActive(previous => !items.length ? -1 : previous < 0 ? (event.key === 'ArrowDown' ? 0 : items.length - 1) : (previous + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length);
          }
          if (event.key === 'Enter' && open) { event.preventDefault(); if (active >= 0 && items[active]) onSelect(items[active].id); setOpen(false); setActive(-1); }
        }} />
    </label>
    {open && <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-60 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
      <ul id={`${id}-options`} role="listbox" aria-label={`Sugerencias de ${label}`}>
        {items.map((item, index) => <li key={item.id} id={`${id}-${index}`} role="option" aria-selected={index === active}>
          <button type="button" tabIndex={-1} className={`block w-full px-3 py-2 text-left text-xs hover:bg-brand-50 ${index === active ? 'bg-brand-50' : ''}`} onMouseDown={event => event.preventDefault()} onClick={() => { onSelect(item.id); setOpen(false); setActive(-1); }}>
            <span className="font-bold text-slate-800">{item.name}</span>{item.detail && <span className="mt-0.5 block text-[10px] text-slate-500">{item.detail}</span>}
          </button>
        </li>)}
      </ul>
      {busy ? <p role="status" className="p-3 text-[10px] text-slate-500">Buscando…</p> : message && <p role="status" className="p-3 text-[10px] text-slate-500">{message}</p>}
    </div>}
  </div>;
}

export default function ShippingGeographyFields({ province, locality, onChange, inputClass, labelClass }: {
  province: string; locality: string; onChange: (province: string, locality: string) => void; inputClass: string; labelClass: string;
}) {
  const [provinces, setProvinces] = useState<GeoProvince[]>([]);
  const [provinceError, setProvinceError] = useState(false);
  const [localities, setLocalities] = useState<GeoLocality[]>([]);
  const [busy, setBusy] = useState(false);
  const [localityError, setLocalityError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    getProvinces().then(rows => { if (!cancelled) setProvinces(rows); }).catch(() => { if (!cancelled) setProvinceError(true); });
    return () => { cancelled = true; };
  }, []);
  const provinceId = provinces.find(row => normalizeGeography(row.name) === normalizeGeography(province))?.id;
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLocalities([]); setLocalityError(false);
    if (locality.trim().length < 2) { setBusy(false); return; }
    setBusy(true);
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ kind: 'localities', q: locality.trim() });
        if (provinceId || province.trim()) params.set('province', provinceId || province.trim());
        const response = await fetch(`/api/georef?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error('UNAVAILABLE');
        const body = await response.json();
        if (!Array.isArray(body.results)) throw new Error('INVALID_RESPONSE');
        if (!cancelled) setLocalities(body.results);
      } catch { if (!cancelled) setLocalityError(true); }
      finally { if (!cancelled) setBusy(false); }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); controller.abort(); };
  }, [locality, province, provinceId]);
  const matchingProvinces = provinces.filter(row => normalizeGeography(row.name).includes(normalizeGeography(province)));
  return <>
    <SearchField label="Provincia" value={province} placeholder="Buscar provincia…" inputClass={inputClass} labelClass={labelClass}
      onChange={next => onChange(next, next === province ? locality : '')}
      onSelect={id => { const row = provinces.find(p => p.id === id); if (row) onChange(row.name, normalizeGeography(row.name) === normalizeGeography(province) ? locality : ''); }}
      items={matchingProvinces} message={provinceError ? 'Georef no responde. Podés escribir la provincia manualmente.' : matchingProvinces.length ? undefined : 'Podés escribir la provincia manualmente.'} />
    <SearchField label="Localidad de destino" value={locality} placeholder="Buscar localidad…" inputClass={inputClass} labelClass={labelClass}
      onChange={next => onChange(province, next)} onSelect={id => { const row = localities.find(l => l.id === id); if (row) onChange(row.province.name, row.name); }}
      items={localities.map(row => ({ id: row.id, name: row.name, detail: [row.department, row.province.name].filter(Boolean).join(' · ') }))} busy={busy}
      message={localityError ? 'Georef no responde. Podés escribir la localidad manualmente.' : locality.trim().length < 2 ? 'Escribí al menos 2 caracteres. Podés buscar sin elegir provincia.' : localities.length ? undefined : 'Sin coincidencias. Podés completar la localidad manualmente.'} />
  </>;
}
