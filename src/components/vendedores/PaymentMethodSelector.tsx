"use client";

import { CUOTA_SIMPLE_PAYMENT_PLANS, isCuotaSimplePaymentMethod, isRetiredPaymentMethod } from '@/lib/cuotaSimple';

type Method = { id: string; name: string; surcharge_percentage: number; installments: number };

export default function PaymentMethodSelector({ methods, value, onChange, extraOptions = [] }: {
  methods: Method[];
  value: string;
  onChange: (id: string) => void;
  extraOptions?: { value: string; label: string }[];
}) {
  const available = methods.filter(method => !isRetiredPaymentMethod(method.name));
  const plans = CUOTA_SIMPLE_PAYMENT_PLANS.map(plan => available.find(method => method.name.toLowerCase() === plan.name.toLowerCase()));
  const selected = available.find(method => method.id === value);
  const isSimple = Boolean(selected && isCuotaSimplePaymentMethod(selected.name));
  const defaultPlan = plans.find(method => method?.installments === 6);

  return (
    <div className="flex flex-col gap-2">
      <select
        aria-label="Medio de pago"
        value={isSimple ? 'cuota-simple' : value}
        onChange={event => {
          const id = event.target.value;
          if (id === 'cuota-simple') {
            if (defaultPlan) onChange(defaultPlan.id);
          } else onChange(id);
        }}
        className="w-full px-2.5 py-1.5 text-xs font-bold border border-slate-200 rounded-lg outline-none bg-slate-50 text-slate-700 focus:ring-2 focus:ring-brand-500/10 focus:border-brand-500 cursor-pointer"
      >
        {extraOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        {available.filter(method => !isCuotaSimplePaymentMethod(method.name)).map(method => (
          <option key={method.id} value={method.id}>
            {method.name}{method.surcharge_percentage > 0 ? ` (+${method.surcharge_percentage}% Recargo)` : ''}
          </option>
        ))}
        {defaultPlan && <option value="cuota-simple">Cuota Simple</option>}
        {selected === undefined && value && !extraOptions.some(option => option.value === value) && (
          <option value={value} disabled>Medio de pago anterior</option>
        )}
      </select>
      {isSimple && (
        <div>
          <span className="block text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1.5">Cantidad de cuotas</span>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Cantidad de cuotas">
            {CUOTA_SIMPLE_PAYMENT_PLANS.map((plan, index) => {
              const method = plans[index];
              const active = method?.id === value;
              return (
                <button
                  key={plan.installments}
                  type="button"
                  aria-pressed={active}
                  disabled={!method}
                  onClick={() => { if (method) onChange(method.id); }}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-colors disabled:opacity-40 ${active ? 'bg-blue-600 border-blue-600 text-white shadow-sm ring-2 ring-blue-100' : 'bg-white border-slate-200 text-slate-700 hover:border-blue-300'}`}
                >
                  {plan.installments} cuotas
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[10px] font-bold text-slate-500">Recargo: {selected?.surcharge_percentage.toLocaleString('es-AR')}%</p>
        </div>
      )}
    </div>
  );
}
