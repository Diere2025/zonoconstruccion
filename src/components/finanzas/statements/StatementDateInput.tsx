'use client';
import {useEffect,useId,useState} from 'react';
const label=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)?`${value.slice(8,10)}/${value.slice(5,7)}/${value.slice(0,4)}`:'';
const parse=(value:string)=>{const m=value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);if(!m)return null;const day=+m[1],month=+m[2],year=+m[3],check=new Date(Date.UTC(year,month-1,day));return year>=1900&&check.getUTCFullYear()===year&&check.getUTCMonth()===month-1&&check.getUTCDate()===day?`${m[3]}-${m[2]}-${m[1]}`:null;};
export default function StatementDateInput({value,onChange,label:accessibleLabel,disabled,className}:{value:string;onChange:(value:string)=>void;label:string;disabled?:boolean;className?:string}){
 const [text,setText]=useState(label(value)),[invalid,setInvalid]=useState(false);const id=useId();
 useEffect(()=>{setText(label(value));setInvalid(false);},[value]);
 const change=(raw:string)=>{const digits=raw.replace(/\D/g,'').slice(0,8),formatted=digits.slice(0,2)+(digits.length>2?'/'+digits.slice(2,4):'')+(digits.length>4?'/'+digits.slice(4):'');setText(formatted);setInvalid(false);const day=parse(formatted);if(day)onChange(day);else if(!digits)onChange('');};
 const finish=()=>{if(!text&&value)setText(label(value));if(text&&!parse(text)){setText(label(value));setInvalid(true);}};
 return <span className="inline-flex flex-col"><input type="text" inputMode="numeric" maxLength={10} placeholder="DD/MM/YYYY" aria-label={accessibleLabel} aria-describedby={invalid?id:undefined} value={text} disabled={disabled} className={className} onChange={e=>change(e.target.value)} onBlur={finish} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();finish();}}}/>{invalid&&<small id={id} className="text-rose-700">Ingresá una fecha válida en DD/MM/YYYY.</small>}</span>;
}
