'use client';
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { actionLabels, availableActions, type TicketAction } from '@/lib/support/actions';
import { commandBody, errorMessage, supportRequest } from '@/lib/support/client';
import { code, type SupportMe, type Ticket } from '@/lib/support/types';
import { Alert, fieldClass, primaryClass, secondaryClass } from './SupportShell';
import { AttachmentEditor, pastedImages, usePendingImages } from './AttachmentEditor';
import { useUnsavedChanges } from './useUnsavedChanges';
export function TicketActionDialog({ ticket, action, onClose, onDone }: { ticket: Ticket; action: TicketAction; onClose: () => void; onDone: () => Promise<void> }) {
    const dialog = useRef<HTMLDialogElement>(null);
    const key = useRef(crypto.randomUUID());
    const [body,setBody] = useState('');
    const [solution,setSolution] = useState('');
    const [busy,setBusy] = useState(false);
    const [error,setError] = useState('');
    const [progress,setProgress] = useState('');
    const [context,setContext] = useState<{ticket: Ticket; me: SupportMe} | null>(null);
    const images = usePendingImages();
    const dirty = Boolean(body || solution || images.images.length);
    useUnsavedChanges(dirty);
    useEffect(()=>{ let alive=true; dialog.current?.showModal(); void supportRequest<{ticket:Ticket;me:SupportMe}>(`tickets/${ticket.id}`).then(data=>{if(alive)setContext(data);}).catch(e=>{if(alive)setError(errorMessage(e));}); return()=>{alive=false;}; },[ticket.id]);
    const close = () => { if (!busy && (!dirty || window.confirm('¿Descartar el borrador?'))) onClose(); };
    const requester = context?.me.people.find(p=>p.id===ticket.created_by)?.name || 'el solicitante';
    const permits = context && !context.me.impersonating && availableActions(context.me,context.ticket).includes(action);
    const withImages = ['request_validation','request_info','request_action','reject'].includes(action);
    const requiresBody = !['take','validate'].includes(action);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault(); if (busy || !permits || !context) return;
        setBusy(true);setError('');
        try {
            const attachments = withImages ? await images.upload(ticket.id,'public',setProgress) : [];
            await supportRequest(`tickets/${ticket.id}/actions`, { method:'POST', body:commandBody({body,solution,attachments,confirmed:action==='validate'}, context.ticket.version, action, key.current) });
            images.clear();setBody('');setSolution('');await onDone();onClose();
        } catch(e) { setError(errorMessage(e));
            // Retain the original intent and draft; never silently select another action.
            await supportRequest<{ticket:Ticket;me:SupportMe}>(`tickets/${ticket.id}`).then(setContext).catch(()=>setContext(null));
        } finally {setBusy(false);setProgress('');}
    };
    return <dialog ref={dialog} onCancel={e=>{e.preventDefault();close();}} aria-label={actionLabels[action]} className="w-[calc(100%-2rem)] max-w-lg rounded-lg border border-slate-200 bg-white p-0 text-slate-900 backdrop:bg-slate-950/40"><form onSubmit={submit} onPaste={e=>{if(!busy && withImages)try{pastedImages(e,images.images,images.setImages);}catch(err){setError(errorMessage(err));}}}>
      <header className="flex items-center justify-between border-b px-4 py-3"><div><h2 className="font-semibold">{actionLabels[action]}{action==='request_validation' ? ` · ${requester}` : ''}</h2><p className="mt-1 text-xs text-slate-500">{code(ticket.number)} · {ticket.title}</p></div><button type="button" onClick={close} disabled={busy} aria-label="Cerrar diálogo" className="p-2"><X className="size-4"/></button></header>
      <div className="max-h-[65vh] space-y-3 overflow-auto p-4">{error && <Alert>{error}</Alert>}{context && !permits && <Alert>La acción ya no está disponible. Revisá el estado actual antes de continuar.</Alert>}
        {action==='close_admin' && <p className="text-sm text-slate-600">Se cerrará sin esperar la confirmación de {requester}. El motivo quedará registrado.</p>}
        {action==='validate' && <p className="text-sm">¿Probaste la solución y confirmás que funciona? Al confirmar se cerrará el ticket.</p>}
        {action==='take' && <p className="text-sm">Quedarás como responsable de este ticket.</p>}
        <fieldset disabled={busy || !permits} className="space-y-3">
          {action==='request_validation' && <label className="block text-sm">Qué se resolvió<textarea required rows={2} maxLength={10000} value={solution} onChange={e=>setSolution(e.target.value)} className={`${fieldClass} mt-1`}/></label>}
          {requiresBody && <label className="block text-sm">{action==='request_validation' ? 'Qué debe probar' : action==='close_admin' ? 'Motivo del cierre' : action==='request_info' || action==='request_action' ? 'Qué necesitás del solicitante' : 'Mensaje o motivo'}<textarea required rows={3} maxLength={10000} value={body} onChange={e=>setBody(e.target.value)} className={`${fieldClass} mt-1`}/></label>}
          {withImages && <AttachmentEditor images={images.images} onChange={images.setImages} disabled={busy}/>}
        </fieldset>
      </div><footer className="flex justify-end gap-2 border-t px-4 py-3"><button type="button" disabled={busy} onClick={close} className={secondaryClass}>Volver</button><button disabled={busy || !permits} className={primaryClass}>{busy ? progress || 'Guardando…' : actionLabels[action]}</button></footer>
    </form></dialog>;
}
