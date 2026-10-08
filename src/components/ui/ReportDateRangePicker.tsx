'use client';

import { useState } from 'react';
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { today } from '@/lib/costs/model';

const presets = [
  ['hoy', 'Hoy'], ['ayer', 'Ayer'], ['7dias', 'Últimos 7 días'],
  ['30dias', 'Últimos 30 días'], ['semana', 'Esta semana'],
  ['mes', 'Este mes'], ['mes_pasado', 'Mes pasado'], ['personalizado', 'Personalizado'],
] as const;
export const displayReportDate = (value: string) => value ? value.split('-').reverse().join('/') : '';
const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const localDate = (value: string) => { const [y, m, d] = value.split('-').map(Number); return new Date(y, m - 1, d); };

export default function ReportDateRangePicker({ from, to, onChange, align = 'start' }: { from: string; to: string; onChange: (from: string, to: string) => void; align?: 'start' | 'end' }) {
  const [open, setOpen] = useState(false), [preset, setPreset] = useState(() => from === today() && to === today() ? 'hoy' : from === to.slice(0, 7) + '-01' && to === today() ? 'mes' : 'personalizado');
  const [draftPreset, setDraftPreset] = useState(preset), [start, setStart] = useState(from), [end, setEnd] = useState(to);
  const [view, setView] = useState(() => localDate(from)), [hover, setHover] = useState('');
  const [inputError, setInputError] = useState('');
  const choosePreset = (id: string) => {
    setDraftPreset(id); setInputError('');
    if (id === 'personalizado') return;
    const now = localDate(today()), first = new Date(now), last = new Date(now);
    if (id === 'ayer') { first.setDate(first.getDate() - 1); last.setDate(last.getDate() - 1); }
    if (id === '7dias' || id === '30dias') first.setDate(first.getDate() - (id === '7dias' ? 6 : 29));
    if (id === 'semana') first.setDate(first.getDate() - (first.getDay() + 6) % 7);
    if (id === 'mes') first.setDate(1);
    if (id === 'mes_pasado') { first.setDate(1); first.setMonth(first.getMonth() - 1); last.setDate(0); }
    setStart(iso(first)); setEnd(iso(last)); setView(first);
  };
  const chooseDay = (date: string) => {
    setDraftPreset('personalizado'); setInputError('');
    if (!start || end) { setStart(date); setEnd(''); }
    else { setStart(date < start ? date : start); setEnd(date < start ? start : date); }
  };
  const apply = () => {
    if (!start || !end || start > end) { setInputError('Seleccioná una fecha inicial y final válidas.'); return; }
    onChange(start, end); setPreset(draftPreset); setOpen(false);
  };
  return <div className="relative"><span className="block">Período</span>
    <button type="button" aria-expanded={open} aria-haspopup="dialog" onClick={() => {
      setStart(from); setEnd(to); setDraftPreset(preset); setView(localDate(from)); setInputError(''); setOpen(!open);
    }} className="flex w-full items-center gap-2 rounded border border-slate-300 bg-white p-2 text-left text-sm text-slate-900">
      <Calendar className="h-4 w-4"/><span>{presets.find(p => p[0] === preset)?.[1]} ({displayReportDate(from)} - {displayReportDate(to)})</span><ChevronDown className="h-4 w-4"/>
    </button>
    {open && <><div className="fixed inset-0 z-40" onClick={() => setOpen(false)}/>
      <div role="dialog" aria-label="Seleccionar rango de fechas" onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }} className={`absolute top-full z-50 mt-2 flex w-[650px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl md:flex-row ${align === 'end' ? 'right-0' : 'left-0'}`}>
        <div className="flex gap-1 overflow-x-auto bg-slate-50 p-3 md:w-40 md:shrink-0 md:flex-col md:border-r">
          {presets.map(([id, label]) => <button type="button" key={id} onClick={() => choosePreset(id)} aria-pressed={draftPreset === id} className={`whitespace-nowrap rounded-lg px-3 py-2 text-left text-xs ${draftPreset === id ? 'bg-blue-50 font-semibold text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`}>{label}</button>)}
        </div>
        <div className="min-w-0 flex-1 p-4">
          <div className="mb-3 flex items-center justify-between"><button type="button" aria-label="Mes anterior" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))} className="rounded border p-1"><ChevronLeft className="h-4 w-4"/></button><span className="text-xs font-bold">Seleccionar rango</span><button type="button" aria-label="Mes siguiente" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))} className="rounded border p-1"><ChevronRight className="h-4 w-4"/></button></div>
          <div className="flex gap-4">{[0, 1].map(offset => {
            const month = new Date(view.getFullYear(), view.getMonth() + offset, 1), blanks = (month.getDay() + 6) % 7, count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
            return <div key={offset} className={`min-w-0 flex-1 ${offset ? 'hidden md:block' : ''}`}><p className="mb-2 text-center text-xs font-bold capitalize">{month.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}</p><div className="grid grid-cols-7 gap-1 text-center">
              {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => <span key={d} className="text-[10px] text-slate-500">{d}</span>)}
              {Array.from({ length: blanks }, (_, i) => <span key={`blank-${i}`}/>)}
              {Array.from({ length: count }, (_, i) => {
                const date = iso(new Date(month.getFullYear(), month.getMonth(), i + 1)), boundary = date === start || date === end;
                const last = end || hover, within = start && last && date >= (start < last ? start : last) && date <= (start > last ? start : last);
                return <button type="button" key={date} aria-label={displayReportDate(date)} aria-pressed={Boolean(boundary || within)} onClick={() => chooseDay(date)} onMouseEnter={() => setHover(date)} onMouseLeave={() => setHover('')} className={`h-8 rounded text-xs ${boundary ? 'bg-blue-700 text-white' : within ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-100'}`}>{i + 1}</button>;
              })}</div></div>;
          })}</div>
          <div className="mt-4 flex flex-wrap items-end gap-2 border-t pt-3">
            <span className="text-sm">{displayReportDate(start) || 'Desde'} — {displayReportDate(end) || 'Hasta'}</span>
            <button type="button" onClick={() => setOpen(false)} className="ml-auto rounded border px-3 py-2 text-sm">Cancelar</button><button type="button" onClick={apply} className="rounded bg-blue-700 px-3 py-2 text-sm text-white">Aplicar</button>
          </div>{inputError && <p role="alert" className="mt-2 text-sm text-red-700">{inputError}</p>}
        </div>
      </div>
    </>}
  </div>;
}
