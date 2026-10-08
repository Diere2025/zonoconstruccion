"use client";
import {useState} from 'react';
import SelectionModal from './SelectionModal';
import {fieldClass} from './OperationFields';
import {supplierPreferences,type SupplierOption,type SupplierPreferences} from '@/lib/financialOperations/supplierFrequency';

const storageKey='movimientos-supplier-preferences-v1';
export default function SupplierPicker({suppliers,value,onChange}:{suppliers:SupplierOption[];value:string;onChange:(id:string)=>void}){
 const [open,setOpen]=useState(false),[tab,setTab]=useState<'frequent'|'other'|'settings'>('frequent'),[query,setQuery]=useState('');
 const [preferences,setPreferences]=useState<SupplierPreferences>({frequent:[],hidden:[]}),[storageError,setStorageError]=useState('');
 function show(){let saved:unknown=null;try{saved=JSON.parse(localStorage.getItem(storageKey)||'null');setStorageError('');}catch{setStorageError('No se pudieron leer las preferencias de este navegador.');}setPreferences(supplierPreferences(saved,suppliers));setTab('frequent');setQuery('');setOpen(true);}
 function save(next:SupplierPreferences){setPreferences(next);try{localStorage.setItem(storageKey,JSON.stringify(next));setStorageError('');}catch{setStorageError('La selección se aplica aquí, pero no se pudo guardar en este navegador.');}}
 const toggle=(key:keyof SupplierPreferences,id:string)=>save({...preferences,[key]:preferences[key].includes(id)?preferences[key].filter(v=>v!==id):[...preferences[key],id]});
 const selected=suppliers.find(s=>s.id===value);
 const visible=suppliers.filter(s=>!preferences.hidden.includes(s.id));
 const rows=(tab==='settings'?suppliers:visible.filter(s=>tab==='frequent'?preferences.frequent.includes(s.id):!preferences.frequent.includes(s.id))).filter(s=>s.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort((a,b)=>tab==='frequent'?preferences.frequent.indexOf(a.id)-preferences.frequent.indexOf(b.id):a.name.localeCompare(b.name,'es'));
 return <div><span className="text-xs font-semibold">Proveedor</span><button type="button" aria-label="Seleccionar proveedor" onClick={show} className={`${fieldClass} text-left`}>{selected?.name||'Seleccionar proveedor'}<span className="float-right">▾</span></button>
 {open&&<SelectionModal title="Seleccionar proveedor" onClose={()=>setOpen(false)}><div className="mb-3 flex flex-wrap gap-2" role="tablist" aria-label="Listas de proveedores">{([['frequent','Frecuentes'],['other','Otros proveedores'],['settings','Configurar']] as const).map(([id,label])=><button key={id} type="button" role="tab" aria-selected={tab===id} onClick={()=>{setTab(id);setQuery('');}} className={`rounded-lg border px-3 py-2 text-sm ${tab===id?'bg-blue-50 text-blue-800':''}`}>{label}</button>)}</div>
 <input aria-label="Buscar proveedor" placeholder="Buscar proveedor" className={fieldClass} value={query} onChange={e=>setQuery(e.target.value)}/>
 <div className="mt-3 space-y-2">{rows.map(s=>tab==='settings'?<div key={s.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm"><span className="min-w-0 flex-1">{s.name}</span><label><input type="checkbox" checked={preferences.frequent.includes(s.id)} onChange={()=>toggle('frequent',s.id)}/> Frecuente</label><label><input type="checkbox" checked={!preferences.hidden.includes(s.id)} onChange={()=>toggle('hidden',s.id)}/> Visible</label></div>:<button key={s.id} type="button" onClick={()=>{onChange(s.id);setOpen(false);}} className={`block w-full rounded-lg border p-3 text-left text-sm ${value===s.id?'border-blue-400 bg-blue-50':''}`}><span className="font-medium">{s.name}{value===s.id?' ✓':''}</span>{Boolean(s.recent_payment_count)&&<span className="mt-1 block text-xs text-slate-500">{s.recent_payment_count} {s.recent_payment_count===1?'pago':'pagos'} en los últimos 3 meses</span>}</button>)}</div>
 {!rows.length&&<p className="mt-3 text-sm text-slate-500">{query?'Sin proveedores para esta búsqueda.':tab==='frequent'?'Podés marcar proveedores en Configurar o elegir desde Otros proveedores.':'No hay proveedores en esta lista.'}</p>}
 {tab==='settings'&&<button type="button" className="mt-3 rounded-lg border px-3 py-2 text-sm" onClick={()=>save({...preferences,frequent:supplierPreferences(null,suppliers).frequent})}>Usar sugerencias de los últimos 3 meses</button>}
 <p className="mt-3 text-xs text-slate-500">Inicialmente se sugieren los 8 proveedores con más pagos en los últimos 3 meses. Podés cambiar los frecuentes y ocultar proveedores; las preferencias se guardan en este navegador.</p>
 {suppliers.length>0&&suppliers.every(s=>s.recent_payment_count===undefined)&&<p className="mt-2 text-xs text-amber-700">No están disponibles las sugerencias automáticas. Podés configurar tus frecuentes manualmente.</p>}
 {storageError&&<p role="alert" className="mt-2 text-xs text-amber-700">{storageError}</p>}</SelectionModal>}
 </div>;
}
