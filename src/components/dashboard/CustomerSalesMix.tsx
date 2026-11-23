'use client';

import { useMemo, useState } from 'react';
import { formatPrice } from '@/lib/utils';
import { emptyDashboardSalesMix, type DashboardSalesMix } from '@/lib/dashboardScope';
import { displayReportDate } from '@/components/ui/ReportDateRangePicker';

const buckets = [
  ['first', 'Clientes nuevos', 'bg-blue-600'],
  ['repeat', 'Recompras', 'bg-emerald-600'],
  ['unknown', 'Sin identificar', 'bg-slate-400'],
] as const;
const total = ({ first, repeat, unknown }: DashboardSalesMix) => first + repeat + unknown;
const monthLabel = (date: string) => `${date.slice(5, 7)}/${date.slice(0, 4)}`;
const percent = new Intl.NumberFormat('es-AR', { style: 'percent', maximumFractionDigits: 1 });

export function CustomerSalesMixAmounts({ mix, failed }: { mix?: DashboardSalesMix; failed: boolean }) {
  if (!mix) return <p className="border-t border-slate-100 pt-2 text-[10px] text-slate-500">
    {failed ? 'Desglose temporalmente no disponible' : 'Calculando nuevos y recompras…'}
  </p>;
  const sum = total(mix);
  return <dl className="space-y-1 border-t border-slate-100 pt-2 text-[10px] font-medium">
    {buckets.filter(([key]) => key !== 'unknown' || mix.unknown !== 0).map(([key, label, color]) => (
      <div className="flex items-start justify-between gap-2" key={key}>
        <dt className="flex items-center gap-1.5 text-slate-600">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${color}`} aria-hidden="true" />{label}
        </dt>
        <dd className="text-right font-semibold tabular-nums text-slate-800">{formatPrice(mix[key])}
          {sum > 0 && mix[key] >= 0 && mix[key] <= sum && <span className="ml-1 font-normal text-slate-500">({percent.format(mix[key] / sum)})</span>}
        </dd>
      </div>
    ))}
  </dl>;
}

export default function CustomerSalesMix({ byDay, failed }: { byDay?: Record<string, DashboardSalesMix>; failed: boolean }) {
  const [group, setGroup] = useState<'day' | 'month'>('day');
  const [sort, setSort] = useState<'date' | 'amount'>('amount');
  const rows = useMemo(() => {
    const grouped = new Map<string, DashboardSalesMix>();
    for (const [day, mix] of Object.entries(byDay ?? {})) {
      const key = group === 'month' ? day.slice(0, 7) : day;
      const entry = grouped.get(key) ?? emptyDashboardSalesMix();
      for (const [bucket] of buckets) entry[bucket] += mix[bucket];
      grouped.set(key, entry);
    }
    return [...grouped.entries()].sort(([aDay, a], [bDay, b]) => (
      (sort === 'amount' ? total(b) - total(a) : 0) || bDay.localeCompare(aDay)
    ));
  }, [byDay, group, sort]);
  const max = Math.max(1, ...rows.map(([, mix]) => Math.max(0, mix.first) + Math.max(0, mix.repeat) + Math.max(0, mix.unknown)));

  return <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6" aria-labelledby="customer-sales-mix-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 id="customer-sales-mix-title" className="text-base font-bold text-slate-900">Facturación por tipo de cliente</h2>
        <p className="mt-1 text-xs text-slate-600">Nuevos en el día de su primera venta registrada. Recompras a partir del día siguiente, con el historial del ERP como referencia.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-1.5">Agrupar
          <select className="rounded-lg border border-slate-300 bg-white px-2 py-1.5" value={group} onChange={e => setGroup(e.target.value as 'day' | 'month')}>
            <option value="day">Por día</option><option value="month">Por mes</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5">Orden
          <select className="rounded-lg border border-slate-300 bg-white px-2 py-1.5" value={sort} onChange={e => setSort(e.target.value as 'date' | 'amount')}>
            <option value="amount">Mayor facturación</option><option value="date">Más reciente</option>
          </select>
        </label>
      </div>
    </div>
    {!byDay ? <p role="status" className="text-sm text-slate-500">{failed ? 'El desglose no está disponible. Podés volver a cargarlo con Refrescar.' : 'Calculando el desglose…'}</p>
      : rows.length === 0 ? <p className="text-sm text-slate-500">No hay ventas para los filtros seleccionados.</p>
        : <div className="max-h-[28rem] overflow-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="sticky top-0 bg-slate-100 text-xs text-slate-700"><tr>
              <th scope="col" className="px-3 py-3">{group === 'day' ? 'Fecha' : 'Mes'}</th>
              {buckets.map(([key, label, color]) => <th scope="col" key={key} className="px-3 py-3">
                <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${color}`} aria-hidden="true" />{label}
              </th>)}
              <th scope="col" className="px-3 py-3">Total</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">{rows.map(([day, mix]) => (
              <tr key={day} className="hover:bg-slate-50">
                <th scope="row" className="whitespace-nowrap px-3 py-2.5 font-semibold">{group === 'day' ? displayReportDate(day) : monthLabel(day)}</th>
                {buckets.map(([key]) => <td className="whitespace-nowrap px-3 py-2.5 tabular-nums" key={key}>{formatPrice(mix[key])}</td>)}
                <td className="min-w-36 whitespace-nowrap px-3 py-2.5 font-semibold tabular-nums">
                  {formatPrice(total(mix))}
                  <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                    {buckets.map(([key, , color]) => <span className={color} key={key} style={{ width: `${100 * Math.max(0, mix[key]) / max}%` }} />)}
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>}
  </section>;
}
