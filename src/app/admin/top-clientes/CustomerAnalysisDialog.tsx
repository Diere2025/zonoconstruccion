'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, CalendarDays, Loader2, X } from 'lucide-react';
import { displayReportDate } from '@/components/ui/ReportDateRangePicker';
import { supabase } from '@/lib/supabase';
import { customerPriceIndexSource, displayPriceIndexMonth } from '@/lib/customerPriceIndex';
import { refreshCustomerPriceIndex } from '@/lib/customerPriceIndexClient';

type Values = { amount: number; amount_real: number | null };
type Purchase = Values & { id: string; day: string; code: string | null; channel: string | null; seller: string | null };
type Category = Values & { category: string; units: number };
type Product = Category & { name: string };
type Analysis = { as_of: string; ipc_month: string | null; orders: Purchase[]; products: Product[]; products_real: Product[]; categories: Category[] };
type Props = { clientId: string; name: string; includeHistory: boolean; adjustAmounts: boolean; onClose: () => void };

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const number = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });
const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const weekdays = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const dayLength = 86_400_000;
const calendarDate = (year: number, month: number, day: number) => new Date(Date.UTC(year, month, day));
const difference = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / dayLength;
const displayAmount = (amount: number | null) => amount == null ? 'Sin IPC' : money.format(amount);
const visibleAmount = (line: Values, adjusted: boolean) => adjusted ? line.amount_real : line.amount;
const styles = {
  panel: 'min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5',
  light: 'bg-slate-100 text-slate-600',
  activity: ['bg-slate-100 text-slate-500', 'bg-blue-100 text-blue-950', 'bg-blue-300 text-blue-950', 'bg-blue-700 text-white'],
};

function summarize(data: Analysis) {
  const byDay = new Map<string, Purchase[]>();
  let total = 0;
  let totalReal: number | null = 0;
  for (const order of data.orders) {
    total += order.amount;
    totalReal = totalReal == null || order.amount_real == null ? null : totalReal + order.amount_real;
    const list = byDay.get(order.day);
    if (list) list.push(order);
    else byDay.set(order.day, [order]);
  }
  const days = [...byDay.keys()].sort();
  const intervals = days.slice(1).map((day, i) => difference(days[i], day)).sort((a, b) => a - b);
  const center = Math.floor(intervals.length / 2);
  const cadence = intervals.length ? (intervals[center] + intervals[Math.floor((intervals.length - 1) / 2)]) / 2 : null;
  return { byDay, days, total, totalReal, cadence, first: days[0], last: days.at(-1) };
}

function SummaryCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return <div className={styles.panel}>
    <span className="text-sm font-medium text-slate-600">{label}</span>
    <p className="mt-1 text-xl font-bold tabular-nums tracking-tight text-slate-900">{value}</p>
    {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
  </div>;
}

function MonthlyTrend({ year, orders, monthCount, adjusted }: { year: number; orders: Purchase[]; monthCount: number; adjusted: boolean }) {
  const [metric, setMetric] = useState<'count' | 'amount'>('count');
  const series = months.slice(0, monthCount).map(month => ({ month, count: 0, amount: 0 as number | null }));
  for (const order of orders) {
    if (!order.day.startsWith(`${year}-`)) continue;
    const month = series[Number(order.day.slice(5, 7)) - 1];
    month.count++;
    const value = visibleAmount(order, adjusted);
    month.amount = month.amount == null || value == null ? null : month.amount + value;
  }
  const low = Math.min(0, ...series.map(item => item[metric] ?? 0));
  const high = Math.max(0, ...series.map(item => item[metric] ?? 0));
  const span = high - low || 1;
  const baseline = 100 * -low / span;
  return <section className={styles.panel} aria-label="Evolución mensual">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="flex items-center gap-2 font-bold"><BarChart3 className="h-5 w-5 text-blue-700" /> Evolución mensual</h3>
      <div className="flex rounded-lg bg-slate-100 p-1">
        {([['count', 'Pedidos'], ['amount', 'Monto']] as const).map(([value, label]) =>
          <button type="button" key={value} onClick={() => setMetric(value)} aria-pressed={value === metric}
            className={`rounded-md px-3 py-1 text-xs font-semibold ${value === metric ? 'bg-white text-blue-800 shadow-sm' : 'text-slate-600'}`}>
            {label}
          </button>)}
      </div>
    </div>
    <div className="mt-4 overflow-x-auto">
      <ol className="flex min-w-[540px] gap-1" aria-label={metric === 'count' ? 'Pedidos por mes' : 'Monto por mes'}>
        {series.map(item => {
          const value = item[metric] ?? 0;
          const label = metric === 'count' ? number.format(value) : displayAmount(item.amount);
          return <li className="min-w-0 flex-1 text-center" key={item.month} aria-label={`${item.month}, ${label}`}>
            <div className="relative mx-auto h-28 max-w-20 rounded bg-slate-50" title={`${item.month} · ${label}`}>
              <div className={`absolute inset-x-1 rounded-sm ${value < 0 ? 'bg-indigo-400' : 'bg-blue-600'}`}
                style={{ bottom: `${value < 0 ? baseline + 100 * value / span : baseline}%`, height: `${100 * Math.abs(value) / span}%` }} />
            </div>
            <p className="mt-1 truncate text-xs font-semibold" title={label}>{label}</p>
            <p className="text-xs text-slate-500">{item.month.slice(0, 3)}</p>
          </li>;
        })}
      </ol>
    </div>
  </section>;
}

function PurchaseCalendar({ year, asOf, monthCount, byDay, selected, onSelect }: {
  year: number; asOf: string; monthCount: number; byDay: Map<string, Purchase[]>; selected: string; onSelect: (day: string) => void;
}) {
  return <section className={styles.panel}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h3 className="flex items-center gap-2 font-bold"><CalendarDays className="h-5 w-5 text-blue-700" /> Mapa de compras</h3>
        <p className="mt-1 text-xs text-slate-600">Seleccioná un día marcado para ver sus pedidos.</p>
      </div>
      <div className="flex flex-wrap gap-2 text-xs" aria-label="Intensidad del mapa">
        {['0', '1', '2', '3 o más'].map((label, index) => (
          <span key={label} className={`rounded px-1.5 py-1 ${styles.activity[index]}`}>{label} {index === 1 ? 'pedido' : 'pedidos'}</span>
        ))}
      </div>
    </div>
    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {months.slice(0, monthCount).map((month, index) => {
        const blanks = (calendarDate(year, index, 1).getUTCDay() + 6) % 7;
        const limit = calendarDate(year, index + 1, 0).getUTCDate();
        return <div key={month} className="rounded-xl border border-slate-200 p-2.5">
          <h4 className="mb-2 text-sm font-semibold">{month}</h4>
          <div className="grid grid-cols-7 gap-1 text-center">
            {weekdays.map((day, i) => <span key={i} className="text-xs text-slate-500" aria-hidden="true">{day}</span>)}
            {Array.from({ length: blanks }, (_, i) => <span key={`blank-${i}`} aria-hidden="true" />)}
            {Array.from({ length: limit }, (_, i) => {
              const iso = calendarDate(year, index, i + 1).toISOString().slice(0, 10);
              const count = byDay.get(iso)?.length ?? 0;
              const base = 'flex h-7 min-w-0 items-center justify-center rounded text-xs tabular-nums';
              return count > 0
                ? <button type="button" key={iso} onClick={() => onSelect(iso)} aria-pressed={selected === iso}
                  aria-label={`${displayReportDate(iso)}, ${count} ${count === 1 ? 'pedido' : 'pedidos'}`}
                  className={`${base} ${styles.activity[Math.min(3, count)]} font-bold hover:ring-2 hover:ring-blue-600 ${selected === iso ? 'ring-2 ring-blue-700' : ''}`}>
                    {i + 1}
                  </button>
                : <span key={iso} aria-hidden="true" className={`${base} ${iso > asOf ? 'text-slate-300' : styles.light}`}>{i + 1}</span>;
            })}
          </div>
        </div>;
      })}
    </div>
  </section>;
}

function PurchaseList({ orders, selected, year, adjusted, clear }: { orders: Purchase[]; selected: string; year: number; adjusted: boolean; clear: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded || selected ? orders : orders.slice(0, 8);
  return <section className={styles.panel} aria-label="Detalle de pedidos">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-bold">{selected ? `Pedidos del ${displayReportDate(selected)}` : `Pedidos de ${year}`}</h3>
      {selected && <button type="button" onClick={clear} className="text-sm font-semibold text-blue-700 underline">Ver todos los del año</button>}
    </div>
    {visible.length ? <div className="overflow-x-auto"><table className="w-full text-sm">
      <thead className="bg-slate-50 text-left text-slate-600"><tr>
        {['Fecha', 'Pedido', 'Vendedor', 'Monto'].map(label => <th scope="col" className="px-2.5 py-2" key={label}>{label}</th>)}
      </tr></thead>
      <tbody className="divide-y divide-slate-100">{visible.map(order => <tr key={order.id}>
        <td className="whitespace-nowrap px-2.5 py-2">{displayReportDate(order.day)}</td>
        <td className="px-2.5 py-2">{order.code || 'Sin código'}</td>
        <td className="px-2.5 py-2">{order.seller || 'Sin vendedor registrado'}</td>
        <td className="whitespace-nowrap px-2.5 py-2 font-semibold">{displayAmount(visibleAmount(order, adjusted))}
          {adjusted && <div className="text-xs font-normal text-slate-500">{money.format(order.amount)} nominal</div>}
        </td>
      </tr>)}</tbody>
    </table></div> : <p className="py-2 text-sm text-slate-500">No hay compras entregadas en el año seleccionado.</p>}
    {!selected && orders.length > 8 && <button type="button" onClick={() => setExpanded(value => !value)}
      className="mt-3 text-sm font-semibold text-blue-700 underline">{expanded ? 'Mostrar los últimos ocho' : `Mostrar los ${number.format(orders.length)} pedidos`}</button>}
  </section>;
}

function ProductBreakdown({ data, adjusted }: { data: Analysis; adjusted: boolean }) {
  const categories = [...data.categories].sort((a, b) =>
    (visibleAmount(b, adjusted) ?? -Infinity) - (visibleAmount(a, adjusted) ?? -Infinity));
  const products = adjusted ? data.products_real ?? [] : data.products;
  const maxAmount = Math.max(1, ...categories.map(category => visibleAmount(category, adjusted) ?? 0));
  return <div className="grid gap-4 xl:grid-cols-2">
    <section className={styles.panel}>
      <h3 className="font-bold">Compras por categoría</h3>
      <p className="mt-1 text-xs text-slate-500">Todas las compras incluidas en el análisis.</p>
      {categories.length ? <ul className="mt-3 max-h-80 space-y-3 overflow-auto pr-1">{categories.map(category => (
        <li key={category.category}>
          <div className="mb-1 flex flex-wrap justify-between gap-x-2 text-sm">
            <span>{category.category}</span><span className="font-semibold tabular-nums">{displayAmount(visibleAmount(category, adjusted))}</span>
          </div>
          <div className="h-1.5 rounded bg-slate-100"><div className="h-full rounded bg-blue-600" style={{ width: `${100 * Math.max(0, visibleAmount(category, adjusted) ?? 0) / maxAmount}%` }} /></div>
        </li>
      ))}</ul> : <p className="mt-3 text-sm text-slate-500">Sin líneas de producto registradas.</p>}
    </section>
    <section className={styles.panel}>
      <h3 className="font-bold">Productos con mayor monto comprado</h3>
      <p className="mt-1 text-xs text-slate-500">Hasta 12 productos, según importe de las líneas de pedido.</p>
      {products.length ? <div className="mt-3 overflow-x-auto"><table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-slate-600"><tr>
          {['Producto', 'Unidades', 'Monto'].map(label => <th scope="col" key={label} className="px-2.5 py-2">{label}</th>)}
        </tr></thead>
        <tbody className="divide-y divide-slate-100">{products.map((product, index) => <tr key={`${product.name}-${index}`}>
          <td className="px-2.5 py-2">{product.name}<div className="text-xs text-slate-500">{product.category}</div></td>
          <td className="px-2.5 py-2">{number.format(product.units)}</td>
          <td className="whitespace-nowrap px-2.5 py-2 font-semibold">{displayAmount(visibleAmount(product, adjusted))}</td>
        </tr>)}</tbody>
      </table></div> : <p className="mt-3 text-sm text-slate-500">Sin productos para mostrar.</p>}
    </section>
  </div>;
}

export default function CustomerAnalysisDialog({ clientId, name, includeHistory, adjustAmounts = false, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const purchaseDetails = useRef<HTMLDivElement>(null);
  const [history, setHistory] = useState(includeHistory);
  const [adjusted, setAdjusted] = useState(adjustAmounts);
  const [data, setData] = useState<Analysis | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [year, setYear] = useState(0);
  const [selected, setSelected] = useState('');
  const stats = useMemo(() => data && summarize(data), [data]);

  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    if (selected) purchaseDetails.current?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError('');
    setSelected('');
    const load = async () => {
      try {
        if (adjusted) await refreshCustomerPriceIndex();
        if (controller.signal.aborted) return;
        const response = await supabase.rpc('get_customer_analysis', { p_client: clientId, p_history: history }).abortSignal(controller.signal);
        if (controller.signal.aborted) return;
        if (response.error) throw response.error;
        const result = response.data as Analysis;
        const firstYear = Number((result.orders.at(-1)?.day || result.as_of).slice(0, 4));
        const currentYear = Number(result.as_of.slice(0, 4));
        setYear(year => year >= firstYear && year <= currentYear
          ? year : Number((result.orders[0]?.day || result.as_of).slice(0, 4)));
        setData(result);
      } catch (failure) {
        if (!controller.signal.aborted) setError((failure as { message?: string })?.message || 'No se pudo cargar el análisis.');
      }
    };
    void load();
    return () => controller.abort();
  }, [clientId, history, adjusted, retry]);

  const fromYear = Number(stats?.first?.slice(0, 4) || year);
  const toYear = Number(data?.as_of.slice(0, 4) || year);
  const monthCount = data && year === toYear ? Number(data.as_of.slice(5, 7)) : 12;
  const yearOrders = data?.orders.filter(order => order.day.startsWith(`${year}-`)) ?? [];
  const selectedOrders = selected ? stats?.byDay.get(selected) ?? [] : yearOrders;

  return <dialog ref={dialog} onClose={onClose} aria-labelledby="customer-analysis-title"
    className="fixed inset-0 m-auto max-h-[94dvh] w-[min(96vw,1340px)] max-w-none overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 text-slate-900 shadow-2xl backdrop:bg-slate-950/55">
    <header className="sticky top-0 z-10 flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
      <div>
        <p className="text-sm font-medium text-blue-700">Análisis del cliente</p>
        <h2 id="customer-analysis-title" className="text-xl font-bold tracking-tight sm:text-2xl">{name}</h2>
        <p className="mt-1 text-xs text-slate-500">Compras entregadas de esta ficha, de todos los canales y vendedores.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={adjusted} onChange={event => setAdjusted(event.target.checked)} /> Ajustar montos por IPC
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={history} onChange={event => setHistory(event.target.checked)} /> Incluir pedidos históricos
        </label>
        <button type="button" aria-label="Cerrar análisis" onClick={() => dialog.current?.close()}
          className="rounded-lg border border-slate-200 p-2 hover:bg-slate-100"><X className="h-5 w-5" /></button>
      </div>
    </header>
    <div className="space-y-4 p-4 sm:p-6">
      {error ? <div role="alert" className={styles.panel}>
        <p className="text-red-700">{error}</p>
        <button type="button" onClick={() => setRetry(value => value + 1)} className="mt-2 text-sm font-semibold text-blue-700 underline">Reintentar</button>
      </div> : !data || !stats ? <p role="status" className={`${styles.panel} flex items-center gap-2`}><Loader2 className="h-5 w-5 animate-spin" /> Cargando análisis…</p>
        : !stats.last || !stats.first ? <div className={styles.panel}>
          <p>No se encontraron compras entregadas con este alcance.</p>
          {!history && <button type="button" onClick={() => setHistory(true)} className="mt-2 text-sm font-semibold text-blue-700 underline">Consultar también el histórico</button>}
        </div> : <>
          <section aria-label="Resumen del cliente" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard label={adjusted ? 'Monto comprado ajustado' : 'Monto comprado'} value={displayAmount(adjusted ? stats.totalReal : stats.total)}
              hint={`${number.format(data.orders.length)} pedidos · ${number.format(stats.days.length)} fechas de compra${adjusted ? ` · ${money.format(stats.total)} nominal` : ''}`} />
            <SummaryCard label="Primera compra" value={displayReportDate(stats.first)} />
            <SummaryCard label="Última compra" value={displayReportDate(stats.last)}
              hint={`${number.format(difference(stats.last, data.as_of))} días desde la última compra`} />
            <SummaryCard label="Frecuencia habitual" value={stats.cadence === null ? 'Sin intervalo' : `Cada ${number.format(stats.cadence)} días`}
              hint={stats.cadence === null ? 'Hay compras en una sola fecha' : 'Mediana entre fechas de compra'} />
          </section>
          {adjusted ? <p className="text-xs text-slate-600">{data.ipc_month
            ? <>Montos en pesos de {displayPriceIndexMonth(data.ipc_month)}. Los pedidos posteriores conservan su valor nominal hasta la publicación del índice. <a href={customerPriceIndexSource} target="_blank" rel="noreferrer" className="underline">Fuente INDEC</a></>
            : 'El ERP todavía no tiene una serie oficial del IPC disponible.'}
          </p> : history && <p className="text-xs text-slate-600">Ingresos en pesos nominales.</p>}
          <label className="inline-flex items-center gap-2 text-sm font-semibold">Año del mapa y la evolución
            <select value={year} onChange={event => { setYear(Number(event.target.value)); setSelected(''); }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
              {Array.from({ length: toYear - fromYear + 1 }, (_, index) => toYear - index).map(value => <option key={value}>{value}</option>)}
            </select>
          </label>
          <MonthlyTrend year={year} orders={data.orders} monthCount={monthCount} adjusted={adjusted} />
          <PurchaseCalendar year={year} asOf={data.as_of} monthCount={monthCount} byDay={stats.byDay} selected={selected} onSelect={setSelected} />
          <div ref={purchaseDetails}><PurchaseList key={year} orders={selectedOrders} selected={selected} year={year} adjusted={adjusted} clear={() => setSelected('')} /></div>
          <ProductBreakdown data={data} adjusted={adjusted} />
        </>}
    </div>
  </dialog>;
}
