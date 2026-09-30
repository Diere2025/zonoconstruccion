'use client';
import { useEffect, useState } from 'react';
import { supportRequest, errorMessage } from '@/lib/support/client';
import { dateLabel, statuses, type SupportEvent, type SupportMe } from '@/lib/support/types';
import { Alert, eventLabels, secondaryClass } from './SupportShell';
import { shippingStatuses } from '@/lib/support/shipping';
import { AttachmentViewer } from './AttachmentViewer';
import { administrativeEventContext } from '@/lib/support/eventContext';
export type TimelineCategory = 'conversation' | 'notes' | 'all';
export function TicketTimeline({ id, category, revision, me, pendingId, shipping=false }: {id:string;category:TimelineCategory;revision:number;me:SupportMe;pendingId?:string;shipping?:boolean}) {
    const requestKey=JSON.stringify([id,category,revision]);
    const [result,setResult]=useState<{key:string;items:SupportEvent[];next:string|null;error:string;loadingOlder?:boolean}|null>(null);
    const current=result?.key===requestKey?result:null;
    const items=current?.items || [];const next=current?.next || null;const error=current?.error || '';const busy=!current || !!current.loadingOlder;
    useEffect(()=>{let alive=true;void supportRequest<{items:SupportEvent[];next:string|null}>(`tickets/${id}/timeline?category=${category}&limit=20`).then(data=>{if(alive)setResult({key:requestKey,...data,error:''});}).catch(e=>{if(alive)setResult({key:requestKey,items:[],next:null,error:errorMessage(e)});});return()=>{alive=false;};},[id,category,requestKey]);
    const older=async()=>{if(!next || busy)return;setResult(value=>value?.key===requestKey?{...value,loadingOlder:true}:value);try{const data=await supportRequest<{items:SupportEvent[];next:string|null}>(`tickets/${id}/timeline?category=${category}&limit=20&cursor=${encodeURIComponent(next)}`);setResult(value=>value?.key===requestKey?{...value,items:[...value.items,...data.items.filter(e=>!value.items.some(x=>x.id===e.id))],next:data.next,error:''}:value);}catch(e){setResult(value=>value?.key===requestKey?{...value,error:errorMessage(e)}:value);}finally{setResult(value=>value?.key===requestKey?{...value,loadingOlder:false}:value);}};
    return <div className="space-y-1">{error && <Alert>{error}</Alert>}{items.map(event=>{
        const summary=event.kind==='imported'?`Importado de la planilla${event.details.legacy_id?` · ID ${event.details.legacy_id}`:''}`:eventLabels[event.kind] || 'Actividad';
        const context=administrativeEventContext(event,me);
        const compact=!context && (category==='all' || event.message_id===pendingId || (event.message?.body.length || 0)>320);
        const content=<>{context && <p className="mt-1 text-sm text-slate-700">{context}</p>}{event.message && <div className="mt-2">{context && <p className="text-xs font-medium text-slate-500">Motivo del cambio</p>}<p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{event.message.body}</p><AttachmentViewer files={event.message.attachments || []}/></div>}</>;
        return <article key={event.id} className="border-b border-slate-100 py-2.5 last:border-0"><div className="flex flex-wrap items-center justify-between gap-1 text-xs text-slate-500"><span><strong className="font-medium text-slate-700">{me.people.find(p=>p.id===event.actor_id)?.name || 'Usuario'}</strong>{event.visibility==='internal' && <span className="ml-2 text-amber-700">Interno</span>}</span><time dateTime={event.created_at}>{dateLabel(event.created_at)}</time></div>
          {compact ? <details className="mt-1 text-sm"><summary className="cursor-pointer text-slate-700">{summary}{event.details.status && category==='all'?` · ${(shipping?shippingStatuses:statuses)[event.details.status]}`:''}</summary>{content}</details> : <><p className="mt-1 text-xs text-slate-500">{summary}</p>{content}</>}
        </article>;
    })}{!busy && !items.length && <p className="py-4 text-sm text-slate-500">{category==='notes'?'No hay notas internas.':category==='conversation'?'Todavía no hay mensajes.':'No hay actividad.'}</p>}{busy && <p className="py-2 text-xs text-slate-500">Cargando…</p>}{next && <button onClick={()=>void older()} disabled={busy} className={secondaryClass}>Ver anteriores</button>}</div>;
}
