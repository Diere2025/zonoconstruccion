'use client';

import { Fragment, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Maximize2, Search } from 'lucide-react';
import { displayDate, type buildReport } from '@/lib/eerrNative/model';
import { buildMatrix } from '@/lib/eerrNative/matrix';

type Report = ReturnType<typeof buildReport>;
const currency = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 });
const money = (value: number | null) => value === null ? 'Pendiente' : currency.format(value);
const percent = (value: number, base: number) =>
  base > 0 ? new Intl.NumberFormat('es-AR', { style: 'percent', maximumFractionDigits: 1 }).format(value / base) : '—';
const normalize = (value: string) => value.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
const button = 'rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-100';
const nameCell = 'sticky left-0 z-10 min-w-40 max-w-40 border-r border-slate-200 px-3 py-2.5 text-left sm:min-w-72 sm:max-w-72';

export default function NativeEerrMatrix({ report }: { report: Report }) {
  const matrix = buildMatrix(report);
  const { totals, days, period } = report;
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string[]>([]);
  const dialog = useRef<HTMLDialogElement>(null);
  const [fullScreen, setFullScreen] = useState(false);
  const search = normalize(query.trim());
  const groups = matrix.flatMap(group => {
    if (normalize(group.title).includes(search)) return [group];
    const rows = group.rows.filter(row => normalize(row.label).includes(search));
    return rows.length ? [{ ...group, rows }] : [];
  });

  const projection = totals.result === null ? null : totals.result * period.length / days.length;
  const amount = (category: string) => report.groups.find(group => group.category === category)?.amount ?? 0;
  const adSpend = amount('Publicidad') + amount('Publicidad (Fee)');
  const freight = amount('Servicio de Flete');
  const indicators = [
    { label: 'Facturación total', value: totals.revenue, detail: 'Ventas por fecha de entrega' },
    { label: 'Costo Mercadería (CMV)', value: totals.cmv, detail: percent(totals.cmv, totals.revenue) + ' sobre ventas · identificado' },
    { label: totals.result === null ? 'Resultado parcial' : 'Utilidad neta actual', value: totals.identifiedBalance, detail: 'Margen neto ' + percent(totals.identifiedBalance, totals.revenue) },
    { label: 'Proyección fin de mes', value: projection, detail: projection === null ? 'Pendiente de conciliación' : 'Estimación por días calendario' },
  ];
  const controls = [
    { label: 'Flete', value: freight, ratio: percent(freight, totals.revenue) },
    { label: 'Publicidad + Fee', value: adSpend, ratio: percent(adSpend, totals.revenue) },
    { label: 'Sueldos al corte', value: amount('Sueldos') },
    { label: 'Costos MercadoPago', value: amount('Costos MercadoPago') },
  ];

  function renderTable(inDialog: boolean) {
    return (
      <>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-3">
          <label className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
            <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
            <input aria-label="Filtrar concepto o rubro" value={query} onChange={event => setQuery(event.target.value)}
              placeholder="Filtrar concepto o rubro…" className="min-w-0 bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-indigo-500" />
          </label>
          <button type="button" className={button} disabled={!!search} onClick={() => setExpanded(matrix.map(group => group.title))}>Expandir</button>
          <button type="button" className={button} disabled={!!search} onClick={() => setExpanded([])}>Contraer</button>
          {inDialog ? (
            <button type="button" className={button} onClick={() => dialog.current?.close()}>Salir de pantalla completa</button>
          ) : (
            <button type="button" className={button + ' inline-flex items-center gap-1.5'} onClick={() => {
              dialog.current?.showModal();
              setFullScreen(true);
            }}><Maximize2 className="h-3.5 w-3.5" aria-hidden="true" /> Pantalla completa</button>
          )}
          <span className="ml-auto text-xs text-slate-500">Matriz consolidada</span>
        </div>
        <div className="overflow-auto" tabIndex={0} aria-label="Desplazar matriz del EERR">
          <table aria-label="Matriz consolidada del EERR Sistema" className="w-full text-xs tabular-nums">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th scope="col" className={nameCell + ' bg-slate-100'}>Rubro / Concepto</th>
                <th scope="col" className="min-w-32 px-3 py-2.5 text-right">Total al corte</th>
                <th scope="col" className="min-w-20 px-3 py-2.5 text-right">% Inc.</th>
                {days.map(day => <th key={day.day} scope="col" className="whitespace-nowrap px-3 py-2.5 text-right">{displayDate(day.day).slice(0, 5)}</th>)}
              </tr>
            </thead>
            <tbody>
              {groups.map(group => {
                const open = !!search || expanded.includes(group.title);
                const groupColor = group.title.startsWith('1.') ? 'bg-indigo-50 text-indigo-950' :
                  group.title.startsWith('8.') ? 'bg-emerald-50 text-emerald-950' : 'bg-slate-100 text-slate-900';
                const renderValues = (item: typeof group.subtotal) => (
                  <>
                    <td className={'whitespace-nowrap px-3 py-2.5 text-right ' + (item.total < 0 ? 'text-rose-700' : '')}>{money(item.total)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right text-slate-600">{percent(item.total, totals.revenue)}</td>
                    {item.values.map((value, index) => (
                      <td key={days[index].day} className={'whitespace-nowrap px-3 py-2.5 text-right ' + (value < 0 ? 'text-rose-700' : '')}>
                        {value === 0 ? '—' : money(value)}
                      </td>
                    ))}
                  </>
                );
                return (
                  <Fragment key={group.title}>
                    <tr className={'border-t border-slate-200 font-bold ' + groupColor}>
                      <th scope="row" className={nameCell + ' ' + groupColor}>
                        <button type="button" className="flex w-full items-center gap-2 text-left" aria-expanded={open}
                          disabled={!!search} onClick={() => setExpanded(previous => open ? previous.filter(title => title !== group.title) : [...previous, group.title])}>
                          {open ? <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" /> : <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />}
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: group.color }} />
                          {group.title}
                        </button>
                      </th>
                      {renderValues(group.subtotal)}
                    </tr>
                    {open && group.rows.map(item => (
                      <tr key={item.label} className="border-t border-slate-100 bg-white">
                        <th scope="row" className={nameCell + ' bg-white pl-8 font-medium'}>
                          {item.label}
                          {item.note && <span className="mt-0.5 block text-[11px] font-normal text-slate-500">{item.note}</span>}
                        </th>
                        {renderValues(item)}
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
              {!groups.length && <tr><td colSpan={days.length + 3} className="px-4 py-6 text-slate-600">No hay rubros o conceptos que coincidan.</td></tr>}
            </tbody>
          </table>
        </div>
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {indicators.map((indicator, index) => (
          <div key={indicator.label} className={'rounded-2xl border p-3 shadow-sm sm:p-4 ' +
            (index === 3 ? 'border-indigo-700 bg-gradient-to-br from-indigo-700 via-violet-700 to-purple-800 text-white' : 'border-slate-200 bg-white')}>
            <p className={'text-xs font-semibold uppercase tracking-wide ' + (index === 3 ? 'text-indigo-100' : 'text-slate-600')}>{indicator.label}</p>
            <p className={'mt-2 text-lg font-bold tabular-nums sm:text-2xl ' + (index === 2 ? (totals.identifiedBalance < 0 ? 'text-rose-700' : 'text-emerald-700') : '')}>{money(indicator.value)}</p>
            <p className={'mt-1 text-xs ' + (index === 3 ? 'text-indigo-100' : 'text-slate-600')}>{indicator.detail}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2 lg:grid-cols-4">
        {controls.map(control => (
          <div key={control.label} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs">
            <p className="text-slate-600">{control.label}</p>
            <p className="font-semibold tabular-nums">{money(control.value)} {control.ratio && <span className="font-normal text-slate-600">· {control.ratio}</span>}</p>
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">{!fullScreen && renderTable(false)}</div>
      <dialog ref={dialog} aria-label="Matriz consolidada en pantalla completa" onClose={() => setFullScreen(false)}
        className="fixed inset-0 m-auto max-h-[94dvh] w-[96vw] max-w-none overflow-auto rounded-2xl border border-slate-200 bg-white text-slate-900 backdrop:bg-slate-900/60">
        {fullScreen && renderTable(true)}
      </dialog>
    </div>
  );
}
