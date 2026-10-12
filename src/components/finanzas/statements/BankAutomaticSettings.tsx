'use client';
import {useState} from 'react';
import {createAuthenticatedRequester} from '@/lib/authenticatedRequest';
import {supabase} from '@/lib/supabase';
import type {StatementAccount} from '@/lib/bankStatements/model';
const api=createAuthenticatedRequester(supabase);
export default function BankAutomaticSettings({accounts,onSaved}:{accounts:StatementAccount[];onSaved:()=>Promise<void>}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function change(account:string,enabled:boolean){setBusy(true);setError('');try{await api('/api/admin/bank-statements',{method:'POST',body:JSON.stringify({action:'automatic-configure',account,enabled})});await onSaved();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <section className="space-y-4"><p className="text-sm text-slate-600">Los movimientos bancarios impactan en la caja al capturarse, incluidos los de fechas anteriores dentro del período de importación. La clasificación y la revisión se pueden completar después.</p>{accounts.map(a=><div key={a.id} className="flex items-center justify-between gap-3 rounded-xl border p-3"><div><p className="text-sm font-semibold">{a.name}</p><p className="mt-1 text-xs text-slate-500">{a.automatic_from?'Activo desde '+new Intl.DateTimeFormat('es-AR',{timeZone:'America/Argentina/Buenos_Aires',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(a.automatic_from)):'Sin registro automático'}</p></div><button role="switch" aria-checked={!!a.automatic_from} aria-label={'Registro automático '+a.name} disabled={busy||!a.direct_from} onClick={()=>void change(a.id,!a.automatic_from)} className={'rounded-full px-4 py-2 text-xs font-semibold '+(a.automatic_from?'bg-emerald-100 text-emerald-800':'bg-slate-100 text-slate-600')}>{a.automatic_from?'Activo':'Activar'}</button></div>)}<p className="text-xs text-slate-500">También se registran las capturas que llegan tarde, desde la fecha de inicio configurada para cada cuenta (30/09/2026 en MP3, MP4 y MP5).</p>{error&&<p role="alert" className="text-sm text-red-700">{error}</p>}</section>;
}
