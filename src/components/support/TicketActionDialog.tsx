'use client';
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { actionLabel, availableActions, type TicketAction } from '@/lib/support/actions';
import { isShipping, quoteExpired, type ShippingQuote } from '@/lib/support/shipping';
import { emptyQuote, ShippingQuoteEditor, ShippingQuoteList } from './ShippingQuotes';
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
    const shipping = isShipping(ticket);
    const label = actionLabel(action, ticket);
    const [quotes, setQuotes] = useState<ShippingQuote[]>(ticket.shipping_quotes?.length ? ticket.shipping_quotes : [emptyQuote()]);
    const [selected, setSelected] = useState(-1);
    const [busy,setBusy] = useState(false);
    const [error,setError] = useState('');
    const [progress,setProgress] = useState('');
    const [context,setContext] = useState<{ticket: Ticket; me: SupportMe} | null>(null);
    const images = usePendingImages();
    const [quotesDirty, setQuotesDirty] = useState(false);
    const dirty = Boolean(body || solution || images.images.length || quotesDirty || selected >= 0);
    useUnsavedChanges(dirty);
    useEffect(()=>{ let alive=true; dialog.current?.showModal(); dialog.current?.querySelector('textarea')?.focus(); void supportRequest<{ticket:Ticket;me:SupportMe}>(`tickets/${ticket.id}`).then(data=>{if(alive)setContext(data);}).catch(e=>{if(alive)setError(errorMessage(e));}); return()=>{alive=false;}; },[ticket.id]);
    const close = () => { if (!busy && (!dirty || window.confirm('¿Descartar el borrador?'))) onClose(); };
    const requester = context?.me.people.find(p=>p.id===ticket.created_by)?.name || 'el solicitante';
    const permits = context && !context.me.impersonating && availableActions(context.me,context.ticket).includes(action);
    const withImages = ['request_validation','request_info','request_action','reject'].includes(action);
    const requiresBody = !['take','validate'].includes(action) && !(shipping && action === 'request_validation');
    const submit = async (event: React.FormEvent) => {
        event.preventDefault(); if (busy || !permits || !context) return;
        setBusy(true);setError('');
        try {
            const attachments = withImages ? await images.upload(ticket.id,'public',setProgress) : [];
            const command = shipping ? ({ request_validation: 'shipping_quote', validate: 'shipping_finish', reject: 'shipping_requote' } as Record<string, string>)[action] || action : action;
            await supportRequest(`tickets/${ticket.id}/actions`, { method:'POST', body:commandBody({body,solution,attachments,confirmed:action==='validate', ...(shipping && action === 'request_validation' ? { quotes } : {}), ...(shipping && action === 'validate' ? { selected } : {})}, context.ticket.version, command, key.current) });
            images.clear();setBody('');setSolution('');await onDone();onClose();
        } catch(e) { setError(errorMessage(e));
            if (shipping && action==='validate') setSelected(-1);
            // Retain the original intent and draft; never silently select another action.
            await supportRequest<{ticket:Ticket;me:SupportMe}>(`tickets/${ticket.id}`).then(setContext).catch(()=>setContext(null));
        } finally {setBusy(false);setProgress('');}
    };
    return <dialog ref={dialog} onCancel={e=>{e.preventDefault();close();}} aria-label={label} className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-lg rounded-lg border border-slate-200 bg-white p-0 text-slate-900 backdrop:bg-slate-950/40"><form onSubmit={submit} onPaste={e=>{if(!busy && withImages)try{pastedImages(e,images.images,images.setImages);}catch(err){setError(errorMessage(err));}}}>
      <header className="flex items-center justify-between border-b px-4 py-3"><div><h2 className="font-semibold">{label}{action==='request_validation' ? ` · ${requester}` : ''}</h2><p className="mt-1 text-xs text-slate-500">{code(ticket.number)} · {ticket.title}</p></div><button type="button" onClick={close} disabled={busy} aria-label="Cerrar diálogo" className="p-2"><X className="size-4"/></button></header>
      <div className="max-h-[65vh] space-y-3 overflow-auto p-4">{error && <Alert>{error}</Alert>}{context && !permits && <Alert>La acción ya no está disponible. Revisá el estado actual antes de continuar.</Alert>}
        {action==='close_admin' && <p className="text-sm text-slate-600">Se cerrará sin esperar la confirmación de {requester}. El motivo quedará registrado.</p>}
        {action==='validate' && <p className="text-sm">{shipping ? 'Elegí la alternativa que se comunicará al cliente. Esto finaliza la solicitud de cotización; el despacho se gestiona por separado.' : '¿Probaste la solución y confirmás que funciona? Al confirmar se cerrará el ticket.'}</p>}
        {action==='take' && <p className="text-sm">Quedarás como responsable de este ticket.</p>}
        <fieldset disabled={busy} className="space-y-3">
          {shipping && action==='request_validation' && <ShippingQuoteEditor quotes={quotes} onChange={value => {setQuotes(value);setQuotesDirty(true);}}/>}
          {shipping && action==='validate' && context && <ShippingQuoteList quotes={context.ticket.shipping_quotes} selection={selected} onSelect={setSelected}/>}
          {!shipping && action==='request_validation' && <label className="block text-sm">Qué se resolvió<textarea required rows={2} maxLength={10000} value={solution} onChange={e=>setSolution(e.target.value)} className={`${fieldClass} mt-1`}/></label>}
          {requiresBody && <label className="block text-sm">{action==='request_validation' ? 'Qué debe probar' : action==='close_admin' ? 'Motivo del cierre' : action==='request_info' || action==='request_action' ? 'Qué necesitás del solicitante' : 'Mensaje o motivo'}<textarea required rows={3} maxLength={10000} value={body} onChange={e=>setBody(e.target.value)} className={`${fieldClass} mt-1`}/></label>}
          {withImages && <AttachmentEditor images={images.images} onChange={images.setImages} disabled={busy}/>}
        </fieldset>
      </div><footer className="flex justify-end gap-2 border-t px-4 py-3"><button type="button" disabled={busy} onClick={close} className={secondaryClass}>Volver</button><button disabled={busy || !permits || (shipping && action==='validate' && (selected < 0 || !context?.ticket.shipping_quotes[selected] || quoteExpired(context.ticket.shipping_quotes[selected])))} className={primaryClass}>{busy ? progress || 'Guardando…' : label}</button></footer>
    </form></dialog>;
}
