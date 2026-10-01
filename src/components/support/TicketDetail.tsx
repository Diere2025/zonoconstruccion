'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { actionLabel, availableActions, nextActor, type TicketAction } from '@/lib/support/actions';
import { commandBody, errorMessage, supportRequest } from '@/lib/support/client';
import { code, dateLabel, isOpen, manages, priorities, ticketTypes, responsibleLabel, type ActionRequest, type Attachment, type SupportMe, type Ticket } from '@/lib/support/types';
import { Alert, Loading, primaryClass, secondaryClass, useSupport } from './SupportShell';
import { AttachmentViewer } from './AttachmentViewer';
import { StatusBadge } from './TicketList';
import { TicketActionDialog } from './TicketActionDialog';
import { TicketDataEditor } from './TicketDataEditor';
import { TicketMessageEditor } from './TicketMessageEditor';
import { TicketTimeline, type TimelineCategory } from './TicketTimeline';
import { isShipping } from '@/lib/support/shipping';
import { ShippingQuoteList, ShippingRequestSummary } from './ShippingQuotes';
import { useRefreshSignal } from './useRefreshSignal';
import { CopyReportButton } from './CopyReportButton';
interface Detail { ticket:Ticket;me:SupportMe;pending:ActionRequest|null;report_attachments:Attachment[] }
export function TicketDetail({id}:{id:string}) {
    const {me,refresh}=useSupport();const [detail,setDetail]=useState<Detail|null>(null);const [error,setError]=useState('');const [revision,setRevision]=useState(0);const [action,setAction]=useState<TicketAction|null>(null);const [category,setCategory]=useState<TimelineCategory>('conversation');const [dirty,setDirty]=useState(false);const [editorKey,setEditorKey]=useState(0);const [editing,setEditing]=useState(false);
    const signal=useRefreshSignal(!dirty && !action && !editing);
    const value=useSearchParams().get('returnTo');
    const back=value && /^\/(?:incidencias|solicitudes-logistica)(?:\/mis|\/gestion)?(?:\?|$)/.test(value)?value:(detail && isShipping(detail.ticket)?'/solicitudes-logistica':'/incidencias');
    const load=useCallback(async()=>{const result=await supportRequest<Detail>(`tickets/${id}`);setDetail(result);setError('');},[id]);
    const done=useCallback(async()=>{await load();setRevision(n=>n+1);await refresh();},[load,refresh]);
    useEffect(()=>{let alive=true;void supportRequest<Detail>(`tickets/${id}`).then(result=>{if(alive){setDetail(result);setError('');}}).catch(e=>{if(alive)setError(errorMessage(e));});return()=>{alive=false;};},[id,signal]);
    useEffect(()=>{if(!me.impersonating)void supportRequest(`tickets/${id}/read`,{method:'POST',body:commandBody({})}).then(refresh).catch(()=>{});},[id,me.impersonating,refresh]);
    const discard=()=>{if(dirty && !window.confirm('¿Descartar el borrador actual?'))return false;setDirty(false);setEditorKey(n=>n+1);return true;};
    if(!detail)return error?<><Alert>{error}</Alert><button className={secondaryClass} onClick={()=>void load().catch(e=>setError(errorMessage(e)))}>Reintentar</button></>:<Loading/>;
    const t=detail.ticket;const shipping=isShipping(t);const manager=manages(detail.me,t);const requester=t.created_by===me.user_id;const open=isOpen(t.status);const name=(user:string|null)=>detail.me.people.find(p=>p.id===user)?.name || 'Usuario';
    const actions=availableActions(detail.me,t);const prominent=actions.filter(a=>['start','take','withdraw','request_validation','close_admin','validate','reject'].includes(a));const other=actions.filter(a=>!prominent.includes(a));
    const start=(a:TicketAction)=>{if(discard())setAction(a);};
    return <div className="space-y-3">
      <header className="-mx-1 flex flex-wrap items-center justify-between gap-2 border-b bg-slate-50 px-1 py-2"><div className="min-w-0"><Link href={back} className="text-xs text-indigo-600">← Volver a la bandeja</Link><div className="mt-1 flex flex-wrap items-center gap-2"><span className="text-xs font-semibold text-indigo-600">{code(t.number)}</span><StatusBadge status={t.status} shipping={shipping}/></div><h2 className="mt-1 text-lg font-semibold">{t.title}</h2></div>
        <div className="flex flex-wrap items-center gap-2">{prominent.map(a=><button key={a} disabled={me.impersonating} onClick={()=>start(a)} className={a==='start' || a==='take' || a==='withdraw' || a==='validate' || (a==='request_validation' && !actions.includes('start'))?primaryClass:secondaryClass}>{actionLabel(a,t)}</button>)}{other.length>0 && <details className="relative"><summary className={`${secondaryClass} cursor-pointer`}>Más acciones</summary><div className="absolute right-0 z-30 mt-1 min-w-48 rounded-md border bg-white p-1 shadow-sm">{other.map(a=><button key={a} disabled={me.impersonating} onClick={e=>{e.currentTarget.closest('details')?.removeAttribute('open');start(a);}} className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-50">{actionLabel(a,t)}</button>)}</div></details>}</div>
      </header>{error && <Alert>{error}</Alert>}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border bg-white px-3 py-2 text-sm sm:grid-cols-4">{[['Solicitante',name(t.created_by)],['Responsable',responsibleLabel(t,detail.me.sectors,name)],['Área responsable',detail.me.sectors.find(s=>s.id===t.sector_id)?.name || 'Sector'],['Área o módulo afectado',t.module || 'No indicado'],['Prioridad',priorities[t.priority]]].map(([label,value])=><div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-0.5 font-medium">{value}</dd></div>)}</dl>
      {open && <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><p className="font-medium text-slate-700">{requester && !detail.pending && ['new','in_progress'].includes(t.status) ? t.status==='new' ? `Tu solicitud está pendiente de atención. Responsable: ${responsibleLabel(t,detail.me.sectors,name)}. Te avisaremos cuando comience la atención.` : `Tu solicitud está en atención. Responsable: ${responsibleLabel(t,detail.me.sectors,name)}. Te avisaremos cuando necesitemos tu respuesta o que revises una solución.` : nextActor(t,user=>name(user))}</p>{manager && <button className={secondaryClass} onClick={()=>setEditing(!editing)}>Editar datos</button>}</div>}
      {editing && manager && open && <TicketDataEditor key={t.version} ticket={t} me={detail.me} onDone={done}/>}
      {!open && <p className="text-xs text-slate-500">{t.closure_kind==='administrative'?`Cerrado por ${name(t.closed_by)} · sin validación del solicitante`:t.closure_kind==='validated'?`${shipping?'Opción elegida por':'Cierre confirmado por'} ${name(t.closed_by)}`:'Ticket cancelado'}{t.closed_at?` · ${dateLabel(t.closed_at)}`:''}</p>}
      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section className="min-w-0 select-none rounded-md border bg-white p-3"><div className="mb-2 flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">{shipping?'Solicitud de envío':'Reporte'}</h3><CopyReportButton key={t.description} text={t.description}/></div>{shipping && t.shipping_request?<div className="select-text"><ShippingRequestSummary request={t.shipping_request}/></div>:t.description.length>500?<details><summary className="select-text cursor-pointer text-sm">{t.description.slice(0,230)}… Ver descripción completa</summary><p className="select-text mt-2 whitespace-pre-wrap text-sm leading-relaxed">{t.description}</p></details>:<p className="select-text whitespace-pre-wrap text-sm leading-relaxed">{t.description}</p>}<AttachmentViewer files={detail.report_attachments || []}/>
          <details className="mt-3 border-t pt-2 text-sm"><summary className="cursor-pointer text-slate-500">Más detalles</summary><dl className="mt-2 grid grid-cols-2 gap-2">{[['Tipo',ticketTypes[t.type]],['Módulo',t.module],['Fecha del reporte',dateLabel(t.created_at)],['Última actividad',dateLabel(t.updated_at)],['Prioridad sugerida',t.suggested_priority!==t.priority?priorities[t.suggested_priority]:''],['Pasos',t.steps],['Esperado',t.expected],['Obtenido',t.actual],['Impacto',t.impact]].filter(([,value])=>value).map(([label,value])=><div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="whitespace-pre-wrap text-sm">{value}</dd></div>)}</dl></details>
        </section>
        <section className="min-w-0 space-y-3 rounded-md border bg-white p-3">
          {shipping && t.shipping_quotes.length>0 && <section className="space-y-2 border-b pb-3"><h3 className="text-sm font-semibold">Alternativas de transporte</h3><ShippingQuoteList quotes={t.shipping_quotes} selected={t.shipping_selected} historical={!['waiting_validation','closed'].includes(t.status)}/></section>}{detail.pending && <details open={requester} className="border-b pb-2"><summary className="cursor-pointer text-sm font-medium">{requester?(t.status==='waiting_validation'?(shipping?'Te toca elegir una opción o pedir recotización':'Te toca probar la solución'):'Te toca responder'):`Solicitud pendiente para ${name(t.created_by)}`}</summary>{!shipping && t.solution && t.status==='waiting_validation' && <p className="mt-2 whitespace-pre-wrap text-sm"><strong>Solución:</strong> {t.solution}</p>}<p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{detail.pending.message?.body}</p></details>}
          <nav aria-label="Historial del ticket" className="flex gap-1 border-b pb-2">{([['conversation','Conversación'],['all','Actividad'],...(manager?[['notes','Notas internas']]:[])] as [TimelineCategory,string][]).map(([value,label])=><button key={value} onClick={()=>{if(value!==category && discard())setCategory(value);}} className={`rounded px-3 py-1.5 text-sm ${category===value?'bg-indigo-50 font-medium text-indigo-700':'text-slate-500 hover:bg-slate-50'}`}>{label}</button>)}</nav>
          {(open || dirty) && category!=='all' && <TicketMessageEditor key={`${category}-${editorKey}`} ticket={t} internal={category==='notes'} respond={requester && t.status==='waiting_requester'} disabled={!!me.impersonating || !open} onDone={done} onDirty={setDirty}/>}
          <TicketTimeline id={id} category={category} revision={revision+signal} me={detail.me} pendingId={detail.pending?.message_id} shipping={shipping}/>
        </section>
      </div>{action && <TicketActionDialog ticket={t} action={action} onClose={()=>setAction(null)} onDone={done}/>}
    </div>;
}
