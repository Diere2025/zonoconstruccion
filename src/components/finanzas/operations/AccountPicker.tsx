"use client";
import {useState} from 'react';
import SelectionModal from './SelectionModal';
import {fieldClass} from './OperationFields';
type Account={id:string;name:string;currency:string};
type Preferences={frequent:string[];hidden:string[]};
const storageKey='movimientos-account-preferences-v1';
export default function AccountPicker({label='Cuenta',accounts,value,onChange,disabled=false}:{label?:string;accounts:Account[];value:string;onChange:(id:string)=>void;disabled?:boolean}) {
 const [open,setOpen]=useState(false),[tab,setTab]=useState<'frequent'|'other'|'settings'>('frequent'),[query,setQuery]=useState('');
 const [preferences,setPreferences]=useState<Preferences>({frequent:[],hidden:[]}),[storageError,setStorageError]=useState('');
 const loadPreferences=()=>{try{const saved=JSON.parse(localStorage.getItem(storageKey)||'null');if(saved&&Array.isArray(saved.frequent)&&Array.isArray(saved.hidden))setPreferences(saved);}catch{setStorageError('No se pudieron leer las preferencias de este navegador.');}};
 const save=(next:Preferences)=>{setPreferences(next);try{localStorage.setItem(storageKey,JSON.stringify(next));setStorageError('');}catch{setStorageError('Las preferencias se aplican aquí, pero no se pudieron guardar en este navegador.');}};
 const toggle=(key:keyof Preferences,id:string)=>save({...preferences,[key]:preferences[key].includes(id)?preferences[key].filter(v=>v!==id):[...preferences[key],id]});
 const selected=accounts.find(a=>a.id===value);
 const visible=accounts.filter(a=>!preferences.hidden.includes(a.id));
 const frequent=visible.filter(a=>preferences.frequent.includes(a.id));
 const rows=(tab==='settings'?accounts:tab==='frequent'?frequent:visible.filter(a=>!preferences.frequent.includes(a.id))).filter(a=>`${a.name} ${a.currency}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
 return <div><span className="text-xs font-semibold">{label}</span><button type="button" disabled={disabled} aria-label={`Seleccionar ${label.toLocaleLowerCase()}`} onClick={()=>{loadPreferences();setOpen(true);setQuery('');setTab('frequent');}} className={`${fieldClass} text-left disabled:opacity-60`}>{selected?`${selected.name} · ${selected.currency}`:'Seleccionar cuenta'} <span className="float-right">▾</span></button>
 {open&&<SelectionModal title={`Seleccionar ${label.toLocaleLowerCase()}`} onClose={()=>setOpen(false)}><div className="mb-3 flex flex-wrap gap-2" role="tablist">{([['frequent','Frecuentes'],['other','Otras cuentas'],['settings','Configurar']] as const).map(([id,text])=><button key={id} type="button" role="tab" aria-selected={tab===id} onClick={()=>setTab(id)} className={`rounded-lg border px-3 py-2 text-sm ${tab===id?'bg-blue-50 text-blue-800':''}`}>{text}</button>)}</div><input aria-label="Buscar cuenta" placeholder="Buscar cuenta" className={fieldClass} value={query} onChange={e=>setQuery(e.target.value)}/><div className="mt-3 space-y-2">{rows.map(a=>tab==='settings'?<div key={a.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm"><span className="flex-1">{a.name} · {a.currency}</span><label><input type="checkbox" checked={preferences.frequent.includes(a.id)} onChange={()=>toggle('frequent',a.id)}/> Frecuente</label><label><input type="checkbox" checked={!preferences.hidden.includes(a.id)} onChange={()=>toggle('hidden',a.id)}/> Visible</label></div>:<button key={a.id} type="button" onClick={()=>{onChange(a.id);setOpen(false);}} className={`block w-full rounded-lg border p-3 text-left text-sm ${value===a.id?'border-blue-400 bg-blue-50':''}`}>{a.name} · {a.currency}{value===a.id?' ✓':''}</button>)}</div>{!rows.length&&<p className="mt-3 text-sm text-slate-500">{tab==='frequent'?'Marcá tus cuentas frecuentes en Configurar o seleccioná desde Otras cuentas.':'Sin cuentas para esta búsqueda.'}</p>}<p className="mt-3 text-xs text-slate-500">Las preferencias se guardan en este navegador. Ocultar una cuenta solo cambia esta selección; conserva sus movimientos.</p>{storageError&&<p role="alert" className="mt-2 text-xs text-amber-700">{storageError}</p>}</SelectionModal>}
 </div>;
}
