'use client';

import { useState } from 'react';
import type { AliasPlan, DailyAliases } from '@/lib/mpDailyAliases';

const dateLabel = (date: string) => date.split('-').reverse().join('/');
const money = (amount: number) => new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', maximumFractionDigits: 2,
}).format(amount);

export default function MPDailyAliases({ data, onPublish }: {
  data: DailyAliases | null;
  onPublish: (plan: AliasPlan) => Promise<void>;
}) {
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const plan = data?.plan;
  const tomorrowPublished = data?.published.some(item => item.date === data.tomorrow);

  async function publish(plan: AliasPlan) {
    setPublishing(true);
    setError('');
    try {
      await onPublish(plan);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudieron publicar los alias.');
    } finally {
      setPublishing(false);
    }
  }

  return (
    <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-xs sm:p-5">
      <div>
        <h2 className="text-sm font-bold text-slate-900 sm:text-base">Alias diarios para Logística</h2>
        <p className="text-xs text-slate-500">Usá los dos alias publicados para la fecha de cobro.</p>
      </div>
      {data ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[data.today, data.tomorrow].map((date, index) => {
            const day = data.published.find(item => item.date === date);
            return (
              <div key={date} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <h3 className="text-sm font-semibold text-slate-800">{index === 0 ? 'Hoy' : 'Mañana'} · {dateLabel(date)}</h3>
                {day ? (
                  <ul aria-label="Alias publicados" className="mt-2 flex flex-wrap gap-2">
                    {day.aliases.map(alias => <li key={alias} className="rounded-lg bg-blue-50 px-2 py-1 text-sm font-semibold text-blue-700">{alias}</li>)}
                  </ul>
                ) : <p className="mt-1 text-sm text-slate-500">Pendiente de publicación</p>}
              </div>
            );
          })}
        </div>
      ) : <p className="text-sm text-slate-600">No se pudieron consultar los alias diarios. Volvé a actualizar Chequeo de Pagos.</p>}
      {plan && !tomorrowPublished && (
        <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/50 p-3 sm:p-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Sugerencia para el {dateLabel(plan.date)}</h3>
            <p className="text-xs text-slate-600">Cobros de clientes registrados hoy en las tres cuentas {money(plan.expected)}. Ese importe se usa como estimación para mañana.</p>
          </div>
          {plan.aliases.length === 2 ? (
            <>
              <ul className="grid gap-2 sm:grid-cols-2">
                {plan.aliases.map(item => (
                  <li key={item.alias} className="rounded-lg border border-slate-200 bg-white p-2">
                    <div className="text-sm font-semibold text-slate-900">{item.alias}</div>
                    <div className="text-xs text-slate-600">Margen mensual {money(item.remaining)} · Tope {money(item.limit)}</div>
                  </li>
                ))}
              </ul>
              {plan.usesException && <p className="text-xs font-medium text-amber-800">Se usa el tope excepcional de $30M en cobroszono porque ningún par cubre el importe estimado con los topes habituales.</p>}
              <button type="button" disabled={publishing} onClick={() => void publish(plan)} className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60">
                {publishing ? 'Publicando…' : 'Enviar alias a Logística'}
              </button>
              <p className="text-xs text-slate-600">El par queda publicado en Chequeo de Pagos para esa fecha.</p>
            </>
          ) : <p className="text-sm font-medium text-amber-800">No hay dos cuentas habilitadas con margen suficiente para cubrir el importe estimado.</p>}
        </div>
      )}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </section>
  );
}
