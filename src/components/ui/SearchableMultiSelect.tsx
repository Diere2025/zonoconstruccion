"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';

type Option = { value: string; label: string };

export default function SearchableMultiSelect({ label, value, options, onChange, placeholder = 'Seleccionar opciones…' }: {
  label: string; value: string[]; options: Option[]; onChange: (value: string[]) => void; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const filtered = useMemo(() => options.filter(option => normalize(option.label).includes(normalize(query))), [options, query]);
  useEffect(() => {
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  const toggle = (option: Option) => {
    if (option.value === 'all') { onChange(['all']); return; }
    onChange(value.includes(option.value) ? value.filter(item => item !== option.value) : [...value.filter(item => item !== 'all'), option.value]);
  };

  return <div className="relative" ref={root}>
    <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
    <button type="button" aria-label={label} aria-expanded={open} aria-haspopup="listbox" onClick={() => { setOpen(!open); if (!open) setTimeout(() => input.current?.focus(), 0); }}
      className="flex min-h-11 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 shadow-sm hover:border-slate-300">
      <span className="truncate">{value.length ? `${value.length} ${value.length === 1 ? 'selección' : 'selecciones'} · ${value.slice(0, 2).map(item => options.find(option => option.value === item)?.label || item).join(', ')}${value.length > 2 ? '…' : ''}` : placeholder}</span>
      <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-slate-400" />
    </button>
    {open && <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
      <div className="relative mb-2"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" /><input ref={input} value={query} onChange={event => setQuery(event.target.value)}
        onKeyDown={event => { if (event.key === 'Escape') setOpen(false); }} placeholder="Escribí para filtrar…" aria-label={`Filtrar ${label}`}
        className="h-9 w-full rounded-lg border border-slate-200 pl-8 pr-3 text-sm outline-none focus:border-blue-400" /></div>
      <div role="listbox" aria-label={label} aria-multiselectable="true" className="max-h-56 overflow-y-auto">
        {filtered.map(option => <button key={option.value} type="button" role="option" aria-selected={value.includes(option.value)} onClick={() => toggle(option)}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-slate-700 hover:bg-blue-50">
          <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${value.includes(option.value) ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300'}`}>
            {value.includes(option.value) && <Check className="h-3 w-3" />}</span>{option.label}</button>)}
        {!filtered.length && <p className="px-2 py-3 text-sm text-slate-500">Sin opciones para esa búsqueda.</p>}
      </div>
      {value.length > 0 && <button type="button" onClick={() => onChange([])} className="mt-2 flex items-center gap-1 px-2 text-xs font-medium text-slate-500 hover:text-slate-800"><X className="h-3 w-3" /> Limpiar selección</button>}
    </div>}
  </div>;
}
