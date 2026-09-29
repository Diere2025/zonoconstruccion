'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Send } from 'lucide-react';
import { commandBody, errorMessage, supportRequest } from '@/lib/support/client';
import { priorities, ticketTypes } from '@/lib/support/types';
import { Alert, fieldClass, primaryClass, secondaryClass, useSupport } from './SupportShell';
import { AttachmentEditor, pastedImages, usePendingImages } from './AttachmentEditor';
import { useUnsavedChanges } from './useUnsavedChanges';
export function TicketForm() {
    const { me } = useSupport();
    const router = useRouter();
    const uploads = usePendingImages();
    const [type, setType] = useState('error');
    const [priority, setPriority] = useState('medium');
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState('');
    const [error, setError] = useState('');
    const [dirty, setDirty] = useState(false);
    const key = useRef(crypto.randomUUID());
    useUnsavedChanges(dirty || uploads.images.length > 0);
    const submit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (busy || me.impersonating)
            return;
        const form = new FormData(e.currentTarget);
        const payload: Record<string, unknown> = {};
        for (const field of ['title', 'description', 'sector_id', 'module', 'steps', 'expected', 'actual', 'impact'])
            payload[field] = String(form.get(field) || '').trim();
        payload.type = type;
        payload.suggested_priority = priority;
        setBusy(true);
        setError('');
        try {
            payload.attachments = await uploads.upload(null, 'public', setProgress);
            setProgress('Creando incidencia…');
            const result = await supportRequest<{
                id: string;
            }>('tickets', { method: 'POST', body: commandBody(payload, undefined, undefined, key.current) });
            uploads.clear();
            setDirty(false);
            router.push(`/incidencias/${result.id}`);
        }
        catch (e) {
            setError(errorMessage(e));
        }
        finally {
            setBusy(false);
            setProgress('');
        }
    };
    return <form onSubmit={submit} onChange={() => setDirty(true)} onPaste={e => { if (busy)
        return; try {
        pastedImages(e, uploads.images, uploads.setImages);
    }
    catch (error) {
        setError(errorMessage(error));
    } }} className="mx-auto max-w-3xl space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
    <div><h2 className="text-xl font-bold">Nueva incidencia</h2><p className="mt-1 text-sm text-slate-500">Contanos qué sucede y qué necesitás. Podés agregar capturas.</p></div>
    {error && <Alert>{error}</Alert>}
    <fieldset disabled={busy || me.impersonating} className="space-y-5">
      <label className="block text-sm font-semibold">Título<input autoFocus name="title" required minLength={5} maxLength={160} className={`${fieldClass} mt-2`} placeholder="Ej.: No puedo eliminar una rendición"/></label>
      <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold">Sector responsable<select name="sector_id" required className={`${fieldClass} mt-2`} defaultValue={me.sectors.find(s => s.name.startsWith('General'))?.id}><option value="">Elegí un sector</option>{me.sectors.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label className="text-sm font-semibold">Tipo<select className={`${fieldClass} mt-2`} value={type} onChange={e => setType(e.target.value)}>{Object.entries(ticketTypes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>
      <label className="block text-sm font-semibold">Descripción<textarea name="description" required minLength={10} maxLength={10000} rows={5} className={`${fieldClass} mt-2`} placeholder="Explicá qué pasó y cómo afecta tu trabajo. Pegá una captura con Ctrl+V si ayuda."/></label>
      <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold">Módulo o área afectada <span className="font-normal text-slate-400">(opcional)</span><input name="module" maxLength={160} className={`${fieldClass} mt-2`} placeholder="Ej.: Tesorería y Finanzas"/></label><label className="text-sm font-semibold">Prioridad sugerida<select className={`${fieldClass} mt-2`} value={priority} onChange={e => setPriority(e.target.value)}>{Object.entries(priorities).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>
      <label className="block text-sm font-semibold">Impacto en el trabajo {priority === 'critical' ? '' : '(opcional)'}<textarea name="impact" required={priority === 'critical'} minLength={priority === 'critical' ? 10 : undefined} maxLength={2000} rows={2} className={`${fieldClass} mt-2`} placeholder="¿Qué tarea está bloqueada? ¿A cuántas personas afecta?"/></label>
      {type === 'error' && <details className="rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer text-sm font-semibold">Agregar detalles para reproducir el error (opcional)</summary><div className="mt-4 space-y-3">{[['steps', 'Pasos para reproducir'], ['expected', 'Qué esperabas que suceda'], ['actual', 'Qué sucedió realmente']].map(([name, label]) => <label className="block text-sm" key={name}>{label}<textarea name={name} rows={2} maxLength={5000} className={`${fieldClass} mt-2`}/></label>)}</div></details>}
      <AttachmentEditor images={uploads.images} onChange={uploads.setImages} disabled={busy}/>
    </fieldset>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5"><button type="button" disabled={busy} className={secondaryClass} onClick={() => { if (!dirty || window.confirm('¿Salir y descartar este borrador?'))
        router.push('/incidencias'); }}>Cancelar</button><button type="submit" disabled={busy || me.impersonating} className={primaryClass}><Send className="size-4"/>{busy ? progress || 'Enviando…' : 'Crear incidencia'}</button></div>
  </form>;
}
