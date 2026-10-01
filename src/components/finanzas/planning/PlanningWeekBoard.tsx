'use client';

import { useRef, useState, type DragEvent } from 'react';
import { AlertTriangle, ArrowRightLeft, Check, CheckCircle2, ChevronDown, GripVertical, Link2, Plus, RotateCcw } from 'lucide-react';
import type { Fund, Item, ProjectionRow, Realization } from '@/lib/paymentPlanning/model';

type Props = {
  dates: string[];
  funds: Fund[];
  items: Item[];
  rows: ProjectionRow[];
  realized: Map<string, number>;
  realizationDates: Map<string, string>;
  today: string;
  reliableFrom: string | null;
  historicalOpenings: { fund_id: string; date: string; opening: number }[];
  incomeEntries: { fund_id: string; date: string; title: string; amount: number; origin: 'sheet' | 'scenario' }[];
  reserveEntries: { fund_id: string; date: string; title: string; amount: number; kind: 'reserve' | 'release'; origin: 'sheet' | 'planned' }[];
  latestRealizations: Map<string, Realization>;
  unreconciledItems: Set<string>;
  realizedRows: ProjectionRow[];
  realizationBalances: Record<string, number>;
  historicalClosings: { fund_id: string; date: string; closing: number }[];
  historicalItemBalances: Record<string, number>;
  historicalItemOrder: Record<string, number>;
  onNewPayment: (date: string, fundId: string) => void;
  onReconcile: (item: Item, date: string, fundId: string) => void;
  unanchoredFunds: string[];
  working: boolean;
  error: string;
  onOpen: (item: Item) => void;
  onMoveDialog: (item: Item) => void;
  onRealize: (item: Item) => void;
  onMove: (item: Item, date: string, fundId: string) => Promise<boolean>;
};

const format = (amount: number, currency: string) => new Intl.NumberFormat('es-AR', {
  style: 'currency', currency, maximumFractionDigits: 2
}).format(amount);
const dateLabel = (value: string) => new Intl.DateTimeFormat('es-AR', {
  weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC'
}).format(new Date(`${value}T12:00:00Z`));
const dateNumber = (value: string) => `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}`;

export default function PlanningWeekBoard({ dates, funds, items, rows, realized, realizationDates, today,
  reliableFrom, historicalOpenings, incomeEntries, reserveEntries, latestRealizations, unreconciledItems,
  realizedRows, realizationBalances, historicalClosings, historicalItemBalances, historicalItemOrder, onNewPayment, onReconcile,
  unanchoredFunds, working, error, onOpen, onMoveDialog, onRealize, onMove }: Props) {
  const draggedIdRef = useRef<string | null>(null);
  const lastTargetRef = useRef<{ date: string; fundId: string } | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [dragMessage, setDragMessage] = useState('');
  const [expandedDone, setExpandedDone] = useState<Set<string>>(() => new Set());
  const pending = (item: Item) => item.amount === null ? null : Math.max(0,
    Number(item.amount) - (realized.get(item.id) || 0) - Number(item.closed_amount || 0));
  const isRealized = (item: Item) => item.status === 'active' && item.amount !== null && Number(item.amount) > 0
    && (realized.get(item.id) || 0) >= Number(item.amount);
  const canMove = (item: Item) => item.status === 'active'
    && pending(item) !== null && Number(pending(item)) > 0;
  const carryDate = dates.find(date => date >= today) || dates[0];
  const displayDate = (item: Item) => isRealized(item) ? latestRealizations.get(item.id)?.effective_date || item.scheduled_date : item.scheduled_date && item.scheduled_date < dates[0]
    ? isRealized(item) ? realizationDates.get(item.id) : canMove(item) ? carryDate : null
    : item.scheduled_date;
  const canDrop = (fund: Fund, date: string, itemId: string | null = draggedId) => {
    const dragged = items.find(item => item.id === itemId);
    return !!dragged && !working && date >= today && canMove(dragged)
      && funds.find(source => source.id === dragged.fund_id)?.currency === fund.currency;
  };
  const key = (date: string, fundId: string) => `${date}:${fundId}`;
  const sourceOpening = new Map(historicalOpenings.map(row => [key(row.date, row.fund_id), row.opening]));
  const sourceClosing = new Map(historicalClosings.map(row => [key(row.date, row.fund_id), row.closing]));
  const toggleDone = (laneKey: string) => setExpandedDone(previous => {
    const next = new Set(previous);
    if (next.has(laneKey)) next.delete(laneKey); else next.add(laneKey);
    return next;
  });
  const finishMove = async (itemId: string | null, date: string, fund: Fund) => {
    const item = items.find(row => row.id === itemId);
    draggedIdRef.current = null;
    lastTargetRef.current = null;
    setDraggedId(null); setOver(null);
    if (!item) { setDragMessage('No se identificó la tarjeta. Volvé a intentar o usá “Mover fecha o caja”.'); return; }
    if (!canMove(item)) { setDragMessage('Este movimiento no tiene importe pendiente para reprogramar.'); return; }
    if (date < today) { setDragMessage('Elegí una fecha desde hoy en adelante.'); return; }
    if (funds.find(source => source.id === item.fund_id)?.currency !== fund.currency) {
      setDragMessage('La caja de destino debe usar la misma moneda.'); return;
    }
    if (item.scheduled_date === date && item.fund_id === fund.id) { setDragMessage('La tarjeta ya está en esa fecha y caja.'); return; }
    setDragMessage('Guardando el movimiento…');
    const ok = await onMove(item, date, fund.id);
    setDragMessage(ok ? '' : 'No se guardó el movimiento. Revisá el error indicado abajo.');
  };
  const drop = async (event: DragEvent<HTMLElement>, date: string, fund: Fund) => {
    event.preventDefault();
    event.stopPropagation();
    await finishMove(event.dataTransfer.getData('text/plain') || draggedIdRef.current, date, fund);
  };
  const dragEnd = (event: DragEvent<HTMLElement>) => {
    const itemId = draggedIdRef.current;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-planning-date]');
    const date = target?.dataset.planningDate || lastTargetRef.current?.date;
    const fundId = target?.dataset.planningFund || lastTargetRef.current?.fundId;
    const fund = funds.find(row => row.id === fundId);
    if (itemId && date && fund) void finishMove(itemId, date, fund);
    else { draggedIdRef.current = null; lastTargetRef.current = null; setDraggedId(null); setOver(null); }
  };

  const columns = { gridTemplateColumns: `140px repeat(${funds.length}, minmax(300px, 1fr))` };
  const width = { minWidth: `${140 + funds.length * 300}px` };
  return <section aria-label="Agenda de pagos por fecha y caja" className="space-y-3">
    {(error || dragMessage) && <div role={error ? 'alert' : 'status'} className={`rounded-xl border px-4 py-2 text-sm ${error ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>{error || dragMessage}</div>}
    <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-950">
      Las fechas están alineadas entre cajas. Arrastrá una tarjeta a la intersección de la fecha y caja de destino.
      <span className="block text-xs text-teal-800">Desde el corte conciliado: disponible = apertura + ingresos − pagos − reserva interna. Los realizados quedan plegados por fecha y caja; podés expandirlos para verlos o revertirlos.</span>
    </div>
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div style={width}>
        <div className="grid border-b border-slate-200 bg-slate-100 text-sm font-semibold" style={columns}>
          <div className="sticky left-0 z-10 bg-slate-100 p-3">Fecha</div>
          {funds.map(fund => <div key={fund.id} className="border-l border-slate-200 p-3">
            {fund.name}<span className="ml-1 text-xs font-normal text-slate-500">{fund.currency}</span>
            {fund.kind === 'personal' && <span className="block text-[11px] font-normal text-slate-500">MP3 · MP4 · MP5 agrupadas</span>}
          </div>)}
        </div>
        {dates.map((date, dateIndex) => {
          const daily = rows.filter(row => row.date === date);
          const trustworthy = !reliableFrom || date >= reliableFrom;
          const pendingPayments = items.filter(item => item.kind === 'expense' && displayDate(item) === date && !isRealized(item)).length;
          const donePayments = items.filter(item => item.kind === 'expense' && displayDate(item) === date && isRealized(item)).length;
          return <div key={date} className={`grid ${dateIndex > 0 ? 'border-t-2 border-t-slate-300' : ''} ${dateIndex % 2 ? 'bg-slate-50/80' : 'bg-white'}`} style={columns}>
            <div className={`sticky left-0 z-10 border-r border-l-4 p-3 ${dateIndex % 2 ? 'border-l-teal-500 bg-slate-100' : 'border-l-slate-400 bg-slate-50'}`}>
              <h3 className="text-sm font-semibold capitalize">{dateLabel(date)}</h3>
              <p className="mt-1 text-xs tabular-nums text-slate-500">{dateNumber(date)}</p>
              <p className="mt-2 text-xs text-slate-500">{pendingPayments} {pendingPayments === 1 ? 'pago pendiente' : 'pagos pendientes'}</p>
              {donePayments > 0 && <p className="text-xs text-emerald-700">{donePayments} {donePayments === 1 ? 'realizado' : 'realizados'}</p>}
            </div>
            {funds.map(fund => {
              const row = daily.find(entry => entry.fund_id === fund.id);
              const laneItems = items.filter(item => (isRealized(item) ? latestRealizations.get(item.id)?.fund_id || item.fund_id : item.fund_id) === fund.id && displayDate(item) === date);
              const pendingItems = laneItems.filter(item => !isRealized(item));
              const realizedItems = laneItems.filter(isRealized).sort((a,b) => {
                if (!trustworthy && historicalItemOrder[a.id] !== undefined && historicalItemOrder[b.id] !== undefined) return historicalItemOrder[a.id] - historicalItemOrder[b.id];
                const left = latestRealizations.get(a.id), right = latestRealizations.get(b.id);
                return (left?.created_at || '').localeCompare(right?.created_at || '') || (left?.id || a.id).localeCompare(right?.id || b.id);
              });
              const unlinkedDone = realizedItems.filter(item => unreconciledItems.has(item.id)).length;
              const laneKey = key(date, fund.id);
              const laneIncome = incomeEntries.filter(entry => entry.date === date && entry.fund_id === fund.id);
              const laneReserves = reserveEntries.filter(entry => entry.date === date && entry.fund_id === fund.id);
              const activeDrop = over === key(date, fund.id) && canDrop(fund, date);
              const balanceVisible = !!row && trustworthy && !unanchoredFunds.includes(fund.id);
              const sheetOpening = !trustworthy ? sourceOpening.get(laneKey) : undefined;
              const sheetClosing = !trustworthy ? sourceClosing.get(laneKey) : undefined;
              const actualRow = realizedRows.find(entry => entry.date === date && entry.fund_id === fund.id);
              const visibleIncome = row ? row.income + (!trustworthy ? laneIncome.reduce((sum, entry) => sum + entry.amount, 0) : 0) : null;
              const historicalReserveChange = laneReserves.reduce((sum, entry) => sum + (entry.kind === 'release' ? entry.amount : -entry.amount), 0);
              const renderCard = (item: Item) => {
                const movable = canMove(item) && !working;
                const remainder = pending(item);
                const done = isRealized(item);
                const unlinked = done && unreconciledItems.has(item.id);
                const latest = latestRealizations.get(item.id);
                const afterPayment = trustworthy ? latest && realizationBalances[latest.id] : historicalItemBalances[item.id];
                const partial = !done && (realized.get(item.id) || 0) > 0;
                const overdue = !!item.scheduled_date && item.scheduled_date < date;
                return <div key={item.id} draggable={movable}
                  onDragStart={event => { if (!movable) { event.preventDefault(); return; } draggedIdRef.current = item.id; lastTargetRef.current = null; event.dataTransfer.setData('text/plain', item.id); event.dataTransfer.effectAllowed = 'move'; setDragMessage(''); setDraggedId(item.id); }}
                  onDragEnd={dragEnd}
                  className={`flex min-h-7 items-center gap-1 rounded-md border px-1 py-0.5 text-xs ${unlinked ? 'border-amber-300 bg-amber-100 text-amber-950 ring-1 ring-inset ring-amber-200' : done ? 'border-emerald-300 bg-emerald-100 text-emerald-950 ring-1 ring-inset ring-emerald-200' : 'border-slate-200 bg-slate-50'} ${movable ? 'cursor-grab active:cursor-grabbing' : ''} ${draggedId === item.id ? 'opacity-50' : ''}`}>
                  {movable && <GripVertical size={12} aria-hidden="true" className="shrink-0 text-slate-400" />}
                  {unlinked ? <AlertTriangle size={13} aria-label="Realizado sin Movimiento asociado" className="shrink-0 text-amber-700" /> : done ? <CheckCircle2 size={13} aria-label="Realizado" className="shrink-0 text-emerald-700" /> : <span title={item.kind === 'expense' ? 'Pago' : 'Ingreso'} aria-label={item.kind === 'expense' ? 'Pago' : 'Ingreso'} className={`h-1.5 w-1.5 shrink-0 rounded-full ${item.kind === 'expense' ? 'bg-rose-500' : 'bg-emerald-500'}`} />}
                  <button type="button" onClick={() => onOpen(item)} title={item.title} className="min-w-0 flex-1 truncate text-left font-medium hover:text-teal-700">{item.title}</button>
                  {done ? <span title={unlinked ? 'Pago realizado pendiente de crear o asociar un Movimiento' : 'Realizado con Movimiento asociado'} className={`shrink-0 text-[10px] font-semibold ${unlinked ? 'text-amber-800' : 'text-emerald-800'}`}>{unlinked ? 'Sin conciliar' : 'Realizado'}</span> : <>{partial && <span className="shrink-0 text-[10px] font-medium text-amber-700">Parcial</span>}{overdue && <span title="Fecha original" className="shrink-0 text-[10px] font-medium text-amber-700">{dateNumber(item.scheduled_date!)}</span>}</>}
                  <span className={`shrink-0 whitespace-nowrap text-[11px] font-semibold tabular-nums ${unlinked ? 'text-amber-900' : done ? 'text-emerald-900' : item.kind === 'expense' ? 'text-rose-700' : 'text-emerald-700'}`}>
                    {remainder === null ? 'A confirmar' : `${item.kind === 'expense' ? '−' : '+'} ${format(done ? Number(item.amount) : remainder, fund.currency)}`}
                  </span>
                  {(done || partial) && afterPayment !== undefined && <span title={trustworthy ? 'Disponible luego de esta realización, sin ingresos estimados ni pagos pendientes' : 'Saldo de esta fila en la planilla original'} className={`ml-1 shrink-0 border-l pl-1 text-[10px] tabular-nums ${unlinked ? 'border-amber-300' : 'border-emerald-300'}`}>Saldo{!trustworthy ? ' hoja' : ''} <strong>{format(afterPayment, fund.currency)}</strong></span>}
                  {item.status === 'active' && item.amount !== null && Number(item.amount)>0 && <button type="button" disabled={working} onClick={()=>onReconcile(item,date,fund.id)} title="Conciliar o ver Movimientos vinculados" aria-label={`Conciliar con Movimientos: ${item.title}`} className={`flex shrink-0 items-center gap-0.5 rounded p-0.5 ${unlinked ? 'text-amber-900 hover:bg-amber-200' : 'text-teal-800 hover:bg-teal-100'}`}><Link2 size={13}/>{unlinked && <span className="text-[10px] font-semibold">Conciliar</span>}</button>}
                  {done && <button type="button" onClick={() => onOpen(item)} title="Ver o revertir la realización" aria-label={`Ver o revertir la realización de ${item.title}`} className="shrink-0 rounded p-0.5 text-emerald-800 hover:bg-emerald-200"><RotateCcw size={12} /></button>}
                  {movable && <button type="button" onClick={() => onRealize(item)} title={item.kind === 'expense' ? 'Marcar pago como realizado' : 'Registrar cobro'} aria-label={`${item.kind === 'expense' ? 'Marcar pago como realizado' : 'Registrar cobro'}: ${item.title}`} className="shrink-0 rounded p-0.5 text-emerald-700 hover:bg-emerald-100"><Check size={12} /></button>}
                  {movable && <button type="button" onClick={() => onMoveDialog(item)} title="Mover fecha o caja" aria-label={`Mover fecha o caja: ${item.title}`} className="shrink-0 rounded p-0.5 text-teal-700 hover:bg-teal-100"><ArrowRightLeft size={12} /></button>}
                </div>;
              };
              return <section key={fund.id} aria-label={`${fund.name} el ${date}`}
                data-planning-date={date} data-planning-fund={fund.id}
                onDragOver={event => { event.preventDefault(); const allowed = canDrop(fund, date, draggedIdRef.current); event.dataTransfer.dropEffect = allowed ? 'move' : 'none'; if (allowed) { lastTargetRef.current = { date, fundId: fund.id }; setOver(key(date, fund.id)); } }}
                onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) { lastTargetRef.current = null; setOver(null); } }}
                onDrop={event => void drop(event, date, fund)}
                className={`min-h-24 border-l px-2 py-2 transition-colors ${activeDrop ? 'border-teal-500 bg-teal-50 ring-2 ring-inset ring-teal-300' : dateIndex % 2 ? 'border-slate-200 bg-slate-50/80' : 'border-slate-200 bg-white'}`}>
                <div className="mb-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 border-b border-slate-100 pb-1.5 text-[10px]">
                  <div className="flex min-w-0 justify-between gap-1 text-slate-500"><span>Apertura{sheetOpening !== undefined && <span title="Valor de la planilla original; conciliación histórica parcial" className="ml-1 text-[9px] text-amber-700">hoja</span>}</span><span className="tabular-nums">{balanceVisible ? format(row.opening, fund.currency) : sheetOpening !== undefined ? format(sheetOpening, fund.currency) : '—'}</span></div>
                  <div className="flex min-w-0 justify-between gap-1 text-emerald-700"><span>Ingresos</span><span className="tabular-nums">{visibleIncome !== null ? `+ ${format(visibleIncome, fund.currency)}` : '—'}</span></div>
                  <div className="flex min-w-0 justify-between gap-1 text-rose-700"><span>Pagos</span><span className="tabular-nums">{row ? `− ${format(row.expense, fund.currency)}` : '—'}</span></div>
                  <div className="flex min-w-0 justify-between gap-1 text-slate-500"><span title={trustworthy ? 'Reserva interna acumulada' : 'Cambio de reserva interna según la planilla'}>Reserva</span><span className="tabular-nums">{row ? !trustworthy && laneReserves.length ? `${historicalReserveChange > 0 ? '+' : historicalReserveChange < 0 ? '−' : ''} ${format(Math.abs(historicalReserveChange), fund.currency)}` : format(row.reserved, fund.currency) : '—'}</span></div>
                  <div className="col-span-2 flex justify-between border-t border-slate-100 pt-0.5 text-xs font-semibold"><span>{trustworthy ? 'Disponible proyectado' : 'Disponible hoja'}</span><span className={`tabular-nums ${(balanceVisible ? row.free : sheetClosing || 0) < 0 ? 'text-rose-700' : ''}`}>{balanceVisible ? format(row.free, fund.currency) : sheetClosing !== undefined ? format(sheetClosing, fund.currency) : '—'}</span></div>
                  {trustworthy && actualRow && !unanchoredFunds.includes(fund.id) && (date <= today || realizedItems.length > 0) && <div title="Apertura más cobros registrados, menos pagos realizados y reserva interna. Los ingresos estimados y pagos pendientes se muestran en la proyección." className="col-span-2 flex justify-between text-xs font-semibold text-teal-900"><span>Saldo tras realizados</span><span className={`tabular-nums ${actualRow.free < 0 ? 'text-rose-700' : ''}`}>{format(actualRow.free, fund.currency)}</span></div>}
                </div>
                <div className="space-y-0.5">
                  {laneIncome.map((entry, index) => <div key={`${entry.origin}-${date}-${fund.id}-${index}`} title={entry.origin === 'sheet' ? 'Ingreso de la planilla original; conciliación histórica parcial' : 'Ingreso previsto por el escenario activo'} className="flex h-7 items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 text-xs text-emerald-900">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                    <span className="min-w-0 flex-1 truncate font-medium">{entry.title}</span>
                    <span className="shrink-0 text-[10px] text-emerald-700">{entry.origin === 'sheet' ? 'Hoja' : 'Escenario'}</span>
                    <span className="shrink-0 whitespace-nowrap font-semibold tabular-nums">+ {format(entry.amount, fund.currency)}</span>
                  </div>)}
                  {laneReserves.map((entry, index) => <div key={`reserve-${date}-${fund.id}-${index}`} title={entry.kind === 'release' ? 'Liberación de reserva interna: aumenta el disponible, no representa un cobro nuevo' : 'Apartamiento de dinero en una reserva interna'} className={`flex h-7 items-center gap-1 rounded-md border px-2 text-xs ${entry.kind === 'release' ? 'border-teal-200 bg-teal-50 text-teal-900' : 'border-sky-200 bg-sky-50 text-sky-900'}`}>
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${entry.kind === 'release' ? 'bg-teal-500' : 'bg-sky-500'}`} />
                    <span className="min-w-0 flex-1 truncate font-medium">{entry.title}</span>
                    <span className="shrink-0 text-[10px]">{entry.kind === 'release' ? 'Libera reserva' : 'Reserva'}{entry.origin === 'sheet' ? ' · Hoja' : ''}</span>
                    <span className="shrink-0 whitespace-nowrap font-semibold tabular-nums">{entry.kind === 'release' ? '+' : '−'} {format(entry.amount, fund.currency)}</span>
                  </div>)}
                  {pendingItems.map(renderCard)}
                  {realizedItems.length > 0 && <>
                    <button type="button" aria-expanded={expandedDone.has(laneKey)} aria-controls={`realizados-${date}-${fund.id}`} onClick={() => toggleDone(laneKey)} className="flex w-full items-center justify-between rounded-md bg-emerald-50 px-2 py-1 text-left text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100">
                      <span className="flex items-center gap-1"><CheckCircle2 size={12} /> Realizados ({realizedItems.length}){unlinkedDone > 0 && <span title={`${unlinkedDone} pagos o ingresos realizados sin Movimiento asociado`} className="ml-1 flex items-center gap-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800"><AlertTriangle size={11}/>{unlinkedDone} sin conciliar</span>}</span>
                      <ChevronDown size={13} className={expandedDone.has(laneKey) ? 'rotate-180' : ''} />
                    </button>
                    <div id={`realizados-${date}-${fund.id}`} hidden={!expandedDone.has(laneKey)} className="space-y-0.5 pt-0.5">{expandedDone.has(laneKey) && realizedItems.map(renderCard)}</div>
                  </>}
                  {!laneItems.length && !laneIncome.length && !laneReserves.length && <p className="py-2 text-center text-[11px] text-slate-400">Soltá un movimiento aquí</p>}
                </div>
                <button type="button" disabled={working} onClick={() => onNewPayment(date, fund.id)} className="mt-2 flex items-center gap-1 rounded-md border border-dashed border-slate-300 px-2 py-1 text-[11px] font-medium text-teal-800 hover:border-teal-400 hover:bg-teal-50 disabled:opacity-50"><Plus size={13}/> Nuevo pago</button>
              </section>;
            })}
          </div>;
        })}
      </div>
    </div>
  </section>;
}
