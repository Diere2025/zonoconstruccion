'use client';
import { useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
const style='w-full min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500';
// Native pickers use the browser's locale. Keep the visible value explicitly Argentine.
export default function VisitDateInput({label,value,onChange,required=false}:{label:string;value:string;onChange:(value:string)=>void;required?:boolean}) {
  const picker=useRef<HTMLInputElement>(null);
  const [typed,setTyped]=useState<{iso:string;text:string}|null>(null);
  const display=typed?.iso===value?typed.text:value.split('-').reverse().join('/');
  return <label className="block space-y-1 text-sm font-medium">{label}<div className="relative"><input aria-label={label} className={`${style} pr-12`} required={required} inputMode="numeric" placeholder="dd/mm/aaaa" pattern="[0-9]{2}/[0-9]{2}/[0-9]{4}" value={display} onChange={e=>{const text=e.target.value,iso=text.split('/').reverse().join('-');setTyped({iso,text});onChange(iso);}} /><button type="button" aria-label={`Elegir ${label.toLowerCase()}`} className="absolute right-2 top-2 rounded p-1.5 text-slate-500" onClick={()=>{try{picker.current?.showPicker();}catch{picker.current?.focus();}}}><CalendarDays size={18}/></button><input ref={picker} aria-label={`Selector de ${label.toLowerCase()}`} type="date" tabIndex={-1} className="absolute right-3 top-3 h-px w-px opacity-0" value={/^\d{4}-\d{2}-\d{2}$/.test(value)?value:''} onChange={e=>{setTyped(null);onChange(e.target.value);}}/></div></label>;
}
