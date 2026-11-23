'use client';

import { useState } from 'react';
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { financeDateRange } from '@/lib/financeDateRange';
import { treasuryToday as today } from '@/lib/treasuryTransactionTime';

const presets = [
  ['hoy', 'Hoy'], ['ayer', 'Ayer'], ['7dias', 'Últimos 7 días'],
  ['30dias', 'Últimos 30 días'], ['semana', 'Esta semana'],
  ['mes', 'Este mes'], ['mes_pasado', 'Mes pasado'], ['año', 'Este año'], ['personalizado', 'Personalizado'],
] as const;
type Preset = typeof presets[number][0];
type Selection = Preset | 'todo' | 'year';
type Period = { from: string; to: string };
export const displayReportDate = (value: string) => value ? value.split('-').reverse().join('/') : '';
const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const localDate = (value: string) => { const [y, m, d] = value.split('-').map(Number); return new Date(y, m - 1, d); };
const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export default function ReportDateRangePicker({ from, to, onChange, align = 'start', hideLabel=false, emptyLabel='Todas las fechas', includeCurrentYear=false, fullPeriod }: { from: string; to: string; onChange: (from: string, to: string) => void; align?: 'start' | 'end'; hideLabel?:boolean; emptyLabel?:string; includeCurrentYear?:boolean; fullPeriod?: Period }) {
  const [open, setOpen] = useState(false);
  const [applied, setApplied] = useState<({ id: Selection } & Period) | null>(null);
  const [draftPreset, setDraftPreset] = useState<Selection>('personalizado'), [start, setStart] = useState(from), [end, setEnd] = useState(to);
  const [view, setView] = useState(() => localDate(from||to||today())), [hover, setHover] = useState('');
  const [inputError, setInputError] = useState('');
  const availablePresets = presets.filter(([id]) => id !== 'año' || includeCurrentYear);
  const withinLimits = (date: string) => !fullPeriod || (date >= fullPeriod.from && date <= fullPeriod.to);
  const bounded = (start: string, end: string) => ({
    from: fullPeriod && start < fullPeriod.from ? fullPeriod.from : start,
    to: fullPeriod && end > fullPeriod.to ? fullPeriod.to : end,
  });
  const yearPeriod = (year: number) => bounded(`${year}-01-01`, `${year}-12-31`);
  const matches = (id: Selection) => {
    if (id === 'todo') return from === fullPeriod?.from && to === fullPeriod?.to;
    if (id === 'year') {
      const range = yearPeriod(Number(from.slice(0, 4)));
      return from === range.from && to === range.to;
    }
    const range = financeDateRange(id);
    const limits = bounded(range.start, range.end);
    return from === limits.from && to === limits.to;
  };
  const shownPreset = applied && applied.from === from && applied.to === to &&
    (applied.id === 'personalizado' || matches(applied.id))
    ? applied.id
    : (['todo', 'hoy', '7dias', 'mes'] as const).find(matches) ?? 'personalizado';
  const selectionLabel = shownPreset === 'todo' ? 'Todo el período' : shownPreset === 'year'
    ? `Año ${from.slice(0, 4)}` : presets.find(([id]) => id === shownPreset)?.[1];
  const pickRange = (id: Selection, range: Period) => {
    setDraftPreset(id);
    setStart(range.from);
    setEnd(range.to);
    setView(localDate(range.from));
    setHover('');
    setInputError('');
  };
  const choosePreset = (id: Preset | 'todo') => {
    if (id === 'todo') {
      if (fullPeriod) pickRange(id, fullPeriod);
      return;
    }
    setDraftPreset(id); setInputError('');
    if (id === 'personalizado') return;
    const range = financeDateRange(id);
    pickRange(id, bounded(range.start, range.end));
  };
  const chooseDay = (date: string) => {
    setDraftPreset('personalizado'); setInputError('');
    if (!start || end) { setStart(date); setEnd(''); }
    else { setStart(date < start ? date : start); setEnd(date < start ? start : date); }
  };
  const apply = () => {
    if (!start || !end || start > end || !withinLimits(start) || !withinLimits(end)) { setInputError('Seleccioná una fecha inicial y final válidas.'); return; }
    onChange(start, end); setApplied({ id: draftPreset, from: start, to: end }); setOpen(false);
  };
  return <div className="relative">{!hideLabel&&<span className="block">Período</span>}
    <button type="button" aria-expanded={open} aria-haspopup="dialog" onClick={() => {
      setStart(from); setEnd(to); setDraftPreset(shownPreset); setView(localDate(from||to||today())); setInputError(''); setOpen(!open);
    }} className="flex h-10 w-full items-center gap-2 rounded border border-slate-300 bg-white p-2 text-left text-sm text-slate-900">
      <Calendar className="h-4 w-4 shrink-0"/><span>{!from&&!to?emptyLabel:`${selectionLabel} (${displayReportDate(from)} - ${displayReportDate(to)})`}</span><ChevronDown className="h-4 w-4 shrink-0"/>
    </button>
    {open && <><div className="fixed inset-0 z-40" onClick={() => setOpen(false)}/>
      <div role="dialog" aria-label="Seleccionar rango de fechas" onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }} className={`absolute top-full z-50 mt-2 flex w-[650px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl md:flex-row ${align === 'end' ? 'right-0' : 'left-0'}`}>
        <div className="flex gap-1 overflow-x-auto bg-slate-50 p-3 md:w-40 md:shrink-0 md:flex-col md:border-r">
          {(fullPeriod ? [['todo', 'Todo el período'] as const, ...availablePresets] : availablePresets).map(([id, label]) => <button type="button" key={id} onClick={() => choosePreset(id)} aria-pressed={draftPreset === id} className={`whitespace-nowrap rounded-lg px-3 py-2 text-left text-xs ${draftPreset === id ? 'bg-blue-50 font-semibold text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`}>{label}</button>)}
        </div>
        <div className="min-w-0 flex-1 p-4">
          {fullPeriod && <div className="mb-3 grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-xs font-semibold">Año completo
              <select value={draftPreset === 'year' ? start.slice(0, 4) : ''} onChange={event => {
                if (event.target.value) pickRange('year', yearPeriod(Number(event.target.value)));
              }} className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm">
                <option value="">Elegí un año</option>
                {Array.from({ length: Number(fullPeriod.to.slice(0, 4)) - Number(fullPeriod.from.slice(0, 4)) + 1 },
                  (_, index) => Number(fullPeriod.to.slice(0, 4)) - index).map(year => <option key={year}>{year}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold">Mes visible
              <select value={view.getMonth()} onChange={event => setView(new Date(view.getFullYear(), Number(event.target.value), 1))}
                className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm">
                {months.map((month, index) => <option key={month} value={index}>{month}</option>)}
              </select>
            </label>
          </div>}
          <div className="mb-3 flex items-center justify-between"><button type="button" aria-label="Mes anterior" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))} className="rounded border p-1"><ChevronLeft className="h-4 w-4"/></button><span className="text-xs font-bold">Seleccionar rango</span><button type="button" aria-label="Mes siguiente" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))} className="rounded border p-1"><ChevronRight className="h-4 w-4"/></button></div>
          <div className="flex gap-4">{[0, 1].map(offset => {
            const month = new Date(view.getFullYear(), view.getMonth() + offset, 1), blanks = (month.getDay() + 6) % 7, count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
            return <div key={offset} className={`min-w-0 flex-1 ${offset ? 'hidden md:block' : ''}`}><p className="mb-2 text-center text-xs font-bold capitalize">{month.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}</p><div className="grid grid-cols-7 gap-1 text-center">
              {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => <span key={d} className="text-[10px] text-slate-500">{d}</span>)}
              {Array.from({ length: blanks }, (_, i) => <span key={`blank-${i}`}/>)}
              {Array.from({ length: count }, (_, i) => {
                const date = iso(new Date(month.getFullYear(), month.getMonth(), i + 1)), boundary = date === start || date === end;
                const last = end || hover, within = start && last && date >= (start < last ? start : last) && date <= (start > last ? start : last);
                return <button type="button" key={date} disabled={!withinLimits(date)} aria-label={displayReportDate(date)} aria-pressed={Boolean(boundary || within)} onClick={() => chooseDay(date)} onMouseEnter={() => setHover(date)} onMouseLeave={() => setHover('')} className={`h-8 rounded text-xs disabled:text-slate-300 ${boundary ? 'bg-blue-700 text-white' : within ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-100'}`}>{i + 1}</button>;
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
