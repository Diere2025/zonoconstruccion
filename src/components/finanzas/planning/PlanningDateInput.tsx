'use client';

import { useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { validDate } from '@/lib/paymentPlanning/model';

type Props = { value: string; onChange: (value: string) => void; label: string; required?: boolean; min?: string; className?: string };
const format = (value: string) => value ? `${value.slice(8,10)}/${value.slice(5,7)}/${value.slice(0,4)}` : '';
const parse = (value: string) => {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return null;
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  return validDate(iso) ? iso : null;
};

export default function PlanningDateInput({ value, onChange, label, required, min, className = '' }: Props) {
  const [draft, setDraft] = useState(() => format(value));
  const [invalid, setInvalid] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const update = (next: string) => {
    setDraft(next);
    setInvalid(false);
    const parsed = parse(next);
    inputRef.current?.setCustomValidity(next && next.length === 10 && (!parsed || (min && parsed < min))
      ? 'Ingresá una fecha válida en formato dd/mm/aaaa.' : '');
    if (!next && !required) onChange('');
    if (parsed && (!min || parsed >= min)) onChange(parsed);
  };
  return <span className={`mt-1 flex items-center justify-between rounded-lg border px-3 py-2 ${invalid ? 'border-rose-400' : 'border-slate-200'} ${className}`}>
    <input ref={inputRef} type="text" aria-label={label} aria-invalid={invalid} inputMode="numeric" placeholder="dd/mm/aaaa" value={draft}
      required={required} pattern="\d{2}/\d{2}/\d{4}"
      onChange={event => update(event.target.value)}
      onBlur={() => { if (draft && (!parse(draft) || (min && parse(draft)! < min))) {
        setInvalid(true); inputRef.current?.setCustomValidity('Ingresá una fecha válida en formato dd/mm/aaaa.');
      } }}
      className="min-w-0 flex-1 bg-transparent tabular-nums outline-none" />
    <span className="relative ml-2 flex h-5 w-5 shrink-0 items-center justify-center text-slate-500">
      <CalendarDays size={16} aria-hidden="true" />
      <input type="date" aria-label={`Elegir ${label}`} value={value} min={min}
        onChange={event => { if (event.target.value) update(format(event.target.value)); }}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
    </span>
    {invalid && <span className="sr-only" role="alert">Fecha inválida. Usá dd/mm/aaaa.</span>}
  </span>;
}
