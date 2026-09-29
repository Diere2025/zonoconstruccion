'use client';
import { useEffect, useRef, useState } from 'react';
import { commandBody, errorMessage, supportRequest } from '@/lib/support/client';
import { isOpen, type Ticket } from '@/lib/support/types';
import { AttachmentEditor, pastedImages, usePendingImages } from './AttachmentEditor';
import { Alert, fieldClass, primaryClass } from './SupportShell';
import { useUnsavedChanges } from './useUnsavedChanges';
export function TicketMessageEditor({ ticket, internal, respond, disabled, onDone, onDirty }: { ticket: Ticket; internal: boolean; respond: boolean; disabled: boolean; onDone: () => Promise<void>; onDirty: (dirty: boolean) => void }) {
    const [body,setBody]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [progress,setProgress]=useState('');
    const images=usePendingImages();const key=useRef(crypto.randomUUID());
    const intent=useRef(respond?'respond':'message');
    useEffect(()=>{if(!body && !images.images.length)intent.current=respond?'respond':'message';},[respond,body,images.images.length]);
    useUnsavedChanges(Boolean(body || images.images.length));
    useEffect(()=>{onDirty(Boolean(body || images.images.length));},[body,images.images.length,onDirty]);
    const send=async(event:React.FormEvent)=>{event.preventDefault();if(busy || disabled)return;setBusy(true);setError('');try{
        if (!isOpen(ticket.status)) throw new Error('El ticket está cerrado. Revisá su estado antes de enviar.');
        const attachments=await images.upload(ticket.id,internal?'internal':'public',setProgress);
        const action=internal?'message':intent.current;
        await supportRequest(`tickets/${ticket.id}/${action==='message'?'messages':'actions'}`,{method:'POST',body:commandBody({body,attachments,visibility:internal?'internal':'public'},ticket.version,action,key.current)});
        images.clear();setBody('');key.current=crypto.randomUUID();await onDone();
    }catch(e){setError(errorMessage(e));}finally{setBusy(false);setProgress('');}};
    return <form onSubmit={send} onPaste={e=>{if(!busy)try{pastedImages(e,images.images,images.setImages);}catch(err){setError(errorMessage(err));}}} className="space-y-2 border-b pb-3">
      {error && <Alert>{error}</Alert>}<fieldset disabled={busy || disabled} className="space-y-2"><label className="block text-sm font-medium">{internal?'Nota interna · solo gestores':respond?'Responder solicitud':'Comentario'}<textarea rows={2} maxLength={10000} required={!images.images.length} value={body} onChange={e=>setBody(e.target.value)} className={`${fieldClass} mt-1`} placeholder="Escribí o pegá una captura con Ctrl+V."/></label><AttachmentEditor images={images.images} onChange={images.setImages} disabled={busy}/></fieldset>
      <button className={primaryClass} disabled={busy || disabled}>{busy?progress || 'Enviando…':internal?'Guardar nota interna':respond?'Responder solicitud':'Enviar comentario'}</button>
    </form>;
}

