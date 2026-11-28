import { displayDate } from '@/lib/eerrNative/model';
import type { Advertising } from '@/lib/eerrNative/advertising';

const ars = new Intl.NumberFormat('es-AR', {style:'currency', currency: 'ARS', maximumFractionDigits: 0});
const usd = new Intl.NumberFormat('es-AR', {style:'currency', currency:'USD'});
const percent = new Intl.NumberFormat('es-AR', {style:'percent', maximumFractionDigits:2});
const dateTime = new Intl.DateTimeFormat('es-AR', {
  timeZone:'America/Argentina/Buenos_Aires', day:'2-digit', month:'2-digit', year:'numeric',
  hour:'2-digit', minute:'2-digit', hourCycle:'h23',
});
const formatArs = (value: number | null) => value === null ? 'Pendiente' : ars.format(value);

export default function NativeEerrAdvertising({ data }: {data?: Advertising}) {
  if (!data) return <p className="text-sm text-slate-600">El seguimiento de Meta está disponible desde octubre de 2026.</p>;

  const {days} = data;
  const spend = days.reduce((sum, day) => sum + day.usd, 0);
  const windowDays = Math.min(7, Math.floor(days.length / 2));
  const sumUsd = (rows: typeof days) => rows.reduce((sum, day) => sum + day.usd, 0);
  const current = windowDays ? sumUsd(days.slice(-windowDays)) : 0;
  const previous = windowDays ? sumUsd(days.slice(-2 * windowDays, -windowDays)) : 0;
  const variation = previous > 0 ? (current - previous) / previous : null;
  const cards = [
    ['Disponible hasta el límite de Meta', data.availableUsd === null ? 'No disponible' : usd.format(data.availableUsd)],
    ['Consumo de Meta al corte', days.length ? usd.format(spend) : 'No disponible'],
    ['Costo base por USD de Meta valuado', data.arsPerUsdt === null ? 'Pendiente' : ars.format(data.arsPerUsdt)],
    ['Fee imputado sobre el costo base', data.feeRate === null ? 'Pendiente' : percent.format(data.feeRate)],
  ];

  return <div className="space-y-4">
    <div>
      <h2 className="font-semibold">Publicidad · {data.account}</h2>
      {data.checkedAt && <p className="text-xs text-slate-600">Disponible actual consultado el {dateTime.format(new Date(data.checkedAt))}. El consumo corresponde al período seleccionado.</p>}
    </div>
    <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(([label,value]) => <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <dt className="text-xs text-slate-600">{label}</dt><dd className="mt-1 font-semibold tabular-nums">{value}</dd>
      </div>)}
    </dl>
    {data.issue && <p role="status" className="text-sm text-amber-800">{data.issue}</p>}
    {windowDays > 0 && <p className="text-sm text-slate-700">
      Consumo de los últimos {windowDays} días del corte: <strong>{usd.format(current)}</strong> frente a {usd.format(previous)} de los {windowDays} días anteriores.
      {variation !== null && <strong> {variation > 0 ? '+' : ''}{percent.format(variation)}.</strong>}
    </p>}
    {days.length > 0 && <div className="max-h-96 overflow-auto rounded-lg border border-slate-200">
      <table className="w-full text-sm tabular-nums">
        <thead className="sticky top-0 bg-slate-50 text-slate-700"><tr className="text-right">
          <th scope="col" className="p-2 text-left">Fecha</th>
          <th scope="col" className="p-2">Consumo USD</th>
          <th scope="col" className="p-2">USD pendientes de valuar</th>
          <th scope="col" className="p-2">Consumo ARS</th>
          <th scope="col" className="p-2">Fee ARS</th>
          <th scope="col" className="p-2">Total ARS</th>
        </tr></thead>
        <tbody>{[...days].reverse().map(day => <tr key={day.day} className="border-t border-slate-100 text-right">
          <td className="p-2 text-left">{displayDate(day.day)}</td><td className="p-2">{usd.format(day.usd)}</td>
          <td className="p-2">{day.unvaluedUsd ? usd.format(day.unvaluedUsd) : '—'}</td>
          <td className="p-2">{formatArs(day.spendArs)}</td><td className="p-2">{formatArs(day.feeArs)}</td>
          <td className="p-2 font-medium">{formatArs(day.spendArs === null || day.feeArs === null ? null : day.spendArs + day.feeArs)}</td>
        </tr>)}</tbody>
      </table>
    </div>}
    <p className="text-xs text-slate-600">Las recargas conservan el costo de los USDT al transferir. Meta imputa el costo y el fee de las recargas más antiguas según el consumo diario.</p>
    {!!data.arsAccounts?.length && (
      <div className="space-y-4 border-t border-slate-200 pt-4">
        {data.arsAccounts.map(acc => {
          const feeRate = acc.feeRate ?? 0.05;
          const feePct = (feeRate * 100).toLocaleString('es-AR');
          const dayFee = (day: { spendArs: number; feeArs?: number }) =>
            day.feeArs ?? Math.round(day.spendArs * feeRate * 100) / 100;
          const totalArs = acc.days.reduce((sum, day) => sum + day.spendArs, 0);
          const totalFeeArs = acc.days.reduce((sum, day) => sum + dayFee(day), 0);
          const activeDays = acc.days.filter(day => day.spendArs > 0);
          return (
            <section key={acc.id} className="space-y-3 rounded-lg border border-slate-200 p-4">
              <div>
                <h3 className="font-semibold">Publicidad · {acc.account} · ARS</h3>
                {acc.checkedAt && <p className="text-xs text-slate-600">Disponible actual consultado el {dateTime.format(new Date(acc.checkedAt))}. Consumo directo en pesos (ARS) con fee {feePct}% abonado en las recargas (no descontado del saldo disponible en Meta).</p>}
              </div>
              <dl className="grid gap-2 sm:grid-cols-4">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <dt className="text-xs text-slate-600">Disponible hasta el límite de Meta</dt>
                  <dd className="mt-1 font-semibold tabular-nums">{acc.availableArs === null ? 'No disponible' : ars.format(acc.availableArs)}</dd>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <dt className="text-xs text-slate-600">Consumo de Meta al corte (ARS)</dt>
                  <dd className="mt-1 font-semibold tabular-nums">{acc.days.length ? ars.format(totalArs) : 'No disponible'}</dd>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <dt className="text-xs text-slate-600">Fee imputado ({feePct}%)</dt>
                  <dd className="mt-1 font-semibold tabular-nums">{acc.days.length ? ars.format(totalFeeArs) : 'No disponible'}</dd>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <dt className="text-xs text-slate-600">Total imputado</dt>
                  <dd className="mt-1 font-semibold tabular-nums">{acc.days.length ? ars.format(totalArs + totalFeeArs) : 'No disponible'}</dd>
                </div>
              </dl>
              {acc.issue && <p role="status" className="text-sm text-amber-800">{acc.issue}</p>}
              {activeDays.length > 0 ? (
                <div className="max-h-72 overflow-auto rounded-lg border border-slate-200">
                  <table className="w-full text-sm tabular-nums">
                    <thead className="sticky top-0 bg-slate-50 text-slate-700">
                      <tr className="text-right">
                        <th scope="col" className="p-2 text-left">Fecha</th>
                        <th scope="col" className="p-2">Consumo ARS</th>
                        <th scope="col" className="p-2">Fee ({feePct}%)</th>
                        <th scope="col" className="p-2">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...activeDays].reverse().map(day => {
                        const fee = dayFee(day);
                        return (
                          <tr key={day.day} className="border-t border-slate-100 text-right">
                            <td className="p-2 text-left">{displayDate(day.day)}</td>
                            <td className="p-2">{ars.format(day.spendArs)}</td>
                            <td className="p-2">{ars.format(fee)}</td>
                            <td className="p-2 font-medium">{ars.format(day.spendArs + fee)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : !acc.issue && (
                <p className="text-xs text-slate-500">Sin consumo registrado en el período seleccionado.</p>
              )}
            </section>
          );
        })}
      </div>
    )}
    {!!data.transfers?.length && <details>
      <summary className="cursor-pointer text-sm font-semibold">Costo de las cargas y transferencias</summary>
      <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-left text-sm tabular-nums">
          <thead className="bg-slate-50"><tr>{['Fecha','Destino y referencia','Acreditado','Costo total','Fee incluido'].map(label =>
            <th key={label} scope="col" className="p-2">{label}</th>)}</tr></thead>
          <tbody>{data.transfers.map(transfer => <tr key={transfer.reference} className="border-t border-slate-100">
            <td className="p-2">{displayDate(transfer.day)}</td>
            <td className="p-2">{transfer.destination} · {transfer.reference}</td>
            <td className="p-2">{transfer.destination === 'Meta' ? usd.format(transfer.credited) :
              transfer.credited.toLocaleString('es-AR', {maximumFractionDigits:8}) + ' USDT'}</td>
            <td className="p-2">{formatArs(transfer.amountArs)}</td>
            <td className="p-2">{formatArs(transfer.feeArs)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </details>}
    {!!data.redot?.length && <section>
      <h3 className="mb-2 font-semibold">Consumos de Redot</h3>
      <ul className="divide-y rounded-lg border border-slate-200">
        {data.redot.map(charge => <li key={charge.reference} className="flex flex-wrap justify-between gap-2 p-2 text-sm">
          <span>{displayDate(charge.day)} · {charge.reference} · {charge.kind === 'redot_ads' ? 'Publicidad TikTok' : 'Gasto operativo'}</span>
          <span>{formatArs(charge.amountArs)}</span>
        </li>)}
      </ul>
    </section>}
  </div>;
}
