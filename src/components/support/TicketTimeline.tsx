'use client';
import { useEffect, useState } from 'react';
import { supportRequest, errorMessage } from '@/lib/support/client';
import { dateLabel, statuses, type SupportEvent, type SupportMe } from '@/lib/support/types';
import { Alert, eventLabels, secondaryClass } from './SupportShell';
import { AttachmentViewer } from './AttachmentViewer';
export type TimelineCategory = 'conversation' | 'notes' | 'all';
export function TicketTimeline({ id, category, revision, me, pendingId }: {id:string;category:TimelineCategory;revision:number;me:SupportMe;pendingId?:string}) {
    const [items,setItems]=useState<SupportEvent[]>([]);const [next,setNext]=useState<string|null>(null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);
    useEffect(()=>{let alive=true;setBusy(true);setItems([]);setNext(null);void supportRequest<{items:SupportEvent[];next:string|null}>(`tickets/${id}/timeline?category=${category}&limit=20`).then(data=>{if(alive){setItems(data.items);setNext(data.next);setError('');}}).catch(e=>{if(alive)setError(errorMessage(e));}).finally(()=>{if(alive)setBusy(false);});return()=>{alive=false;};},[id,category,revision]);
    const older=async()=>{if(!next || busy)return;setBusy(true);try{const data=await supportRequest<{items:SupportEvent[];next:string|null}>(`tickets/${id}/timeline?category=${category}&limit=20&cursor=${encodeURIComponent(next)}`);setItems(current=>[...current,...data.items.filter(e=>!current.some(x=>x.id===e.id))]);setNext(data.next);}catch(e){setError(errorMessage(e));}finally{setBusy(false);}};
    return <div className="space-y-1">{error && <Alert>{error}</Alert>}{items.map(event=>{
        const summary=event.kind==='imported'?`Importado de la planilla${event.details.legacy_id?` · ID ${event.details.legacy_id}`:''}`:eventLabels[event.kind] || 'Actividad';
        const compact=category==='all' || event.message_id===pendingId || (event.message?.body.length || 0)>320;
        const content=event.message && <div className="mt-2"><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{event.message.body}</p><AttachmentViewer files={event.message.attachments || []}/></div>;
        return <article key={event.id} className="border-b border-slate-100 py-2.5 last:border-0"><div className="flex flex-wrap items-center justify-between gap-1 text-xs text-slate-500"><span><strong className="font-medium text-slate-700">{me.people.find(p=>p.id===event.actor_id)?.name || 'Usuario'}</strong>{event.visibility==='internal' && <span className="ml-2 text-amber-700">Interno</span>}</span><time dateTime={event.created_at}>{dateLabel(event.created_at)}</time></div>
          {compact ? <details className="mt-1 text-sm"><summary className="cursor-pointer text-slate-700">{summary}{event.details.status && category==='all'?` · ${statuses[event.details.status]}`:''}</summary>{content}</details> : <><p className="mt-1 text-xs text-slate-500">{summary}</p>{content}</>}
        </article>;
    })}{!busy && !items.length && <p className="py-4 text-sm text-slate-500">{category==='notes'?'No hay notas internas.':category==='conversation'?'Todavía no hay mensajes.':'No hay actividad.'}</p>}{busy && <p className="py-2 text-xs text-slate-500">Cargando…</p>}{next && <button onClick={()=>void older()} disabled={busy} className={secondaryClass}>Ver anteriores</button>}</div>;
}
