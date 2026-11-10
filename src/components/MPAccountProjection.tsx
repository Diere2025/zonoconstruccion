'use client';

import { ChevronDown, TrendingUp } from 'lucide-react';
import { projectIncomeThresholdDate, type AccountIncome } from '@/lib/mpAccountIncome';
import { MP_ALIAS_LIMITS } from '@/lib/mpDailyAliases';

const money = (amount: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(amount);
const dateLabel = (date: string) => date.split('-').reverse().join('/');
const millions = (amount: number) => '$' + (amount / 1_000_000) + 'M';

export default function MPAccountProjection({ accounts }: { accounts: AccountIncome[] }) {
  return (
    <details className="group min-w-0 rounded-3xl border border-slate-200 bg-white shadow-xs">
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-3xl p-4 sm:p-5 [&::-webkit-details-marker]:hidden">
        <span className="rounded-xl bg-blue-50 p-2 text-blue-600"><TrendingUp className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-[#001538] sm:text-base">Proyección mensual por cuenta</h2>
          <p className="text-xs text-slate-500">Mes actual · Ver acumulados, metas y estimación al cierre</p>
        </div>
        <ChevronDown className="h-5 w-5 shrink-0 text-slate-500 transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-4 border-t border-slate-100 p-4 sm:p-5">
        <p className="text-xs leading-relaxed text-slate-500">El mes actual se calcula completo hasta hoy, independientemente del rango de cobros. Incluye ingresos archivados y propios. La estimación usa el promedio por día calendario y las metas se reinician cada mes.</p>
        <div className="grid gap-4 lg:grid-cols-3">
          {accounts.map(account => {
            const projected = account.dailyAverage * Number(account.monthEnd.slice(8, 10));
            const policy = MP_ALIAS_LIMITS.find(item => item.id === account.id);
            const limit = policy?.limit ?? 40_000_000;
            const overflow = policy ? policy.overflowLimit : 50_000_000;
            const thresholds = [{ label: (policy ? 'Tope ' : 'Meta ') + millions(limit), amount: limit }];
            if (overflow) thresholds.push({ label: (policy ? 'Tope excepcional ' : 'Límite ') + millions(overflow), amount: overflow });
            const maximum = Math.max(overflow ?? limit, projected, account.monthAmount);
            const position = (amount: number) => Math.max(0, amount / maximum * 100) + '%';
            const status = account.monthAmount >= limit ? 'Tope habitual alcanzado'
              : projected >= limit ? 'Se proyecta alcanzar el tope habitual' : 'Por debajo del tope habitual';
            const color = projected >= (overflow ?? limit) ? 'bg-red-500' : account.monthAmount >= limit ? 'bg-amber-500' : 'bg-blue-600';
            const targetDate = (target: number) => {
              const date = projectIncomeThresholdDate(account, target);
              return account.monthAmount >= target ? 'Alcanzado' : !date ? 'Sin ingresos' : date > account.monthEnd ? 'No alcanza este mes' : dateLabel(date);
            };
            return (
              <article key={account.id} className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
                <h3 className="break-words text-sm font-bold text-[#001538]">{account.name}</h3>
                <p className="mt-1 text-xs text-slate-500">Acumulado del mes · Corte {dateLabel(account.asOf)}</p>
                <p className="mt-1 text-xl font-bold text-[#001538]">{money(account.monthAmount)}</p>
                <p className="mt-2 text-xs font-medium text-slate-600">{status}</p>
                <div className="relative mt-4 h-4 rounded-full bg-slate-200" role="img" aria-label={['Acumulado ' + money(account.monthAmount), 'proyectado al cierre ' + money(projected), ...thresholds.map(item => item.label)].join(', ')}>
                  <div className="absolute inset-y-0 left-0 rounded-full bg-blue-200" style={{ width: position(projected) }} />
                  <div className={'absolute inset-y-0 left-0 rounded-full ' + color} style={{ width: position(account.monthAmount) }} />
                  {thresholds.map(({ amount }, index) => <span key={amount} className={'absolute -top-1 bottom-[-4px] -translate-x-full border-l-2 ' + (index === 0 && overflow ? 'border-amber-600' : 'border-red-600')} style={{ left: position(amount) }} />)}
                </div>
                <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-600"><span className="flex items-center gap-1"><i className={'h-2 w-2 rounded-full ' + color} />Acumulado</span><span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-blue-200" />Estimado al cierre</span></div>
                <dl className="mt-4 space-y-2 border-t border-slate-200 pt-3 text-xs">
                  {[['Estimado al cierre', money(projected)], ['Promedio diario', money(account.dailyAverage)], ...thresholds.map(item => [item.label, targetDate(item.amount)])].map(([label, value]) => <div key={label} className="flex flex-wrap justify-between gap-1"><dt className="text-slate-500">{label}</dt><dd className="font-semibold text-slate-700">{value}</dd></div>)}
                </dl>
              </article>
            );
          })}
        </div>
      </div>
    </details>
  );
}
