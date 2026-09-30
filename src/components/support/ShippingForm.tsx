'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { commandBody, errorMessage, supportRequest } from '@/lib/support/client';
import type { ShippingRequest } from '@/lib/support/shipping';
import { Alert, fieldClass, primaryClass, secondaryClass, useSupport } from './SupportShell';
import { AttachmentEditor, pastedImages, usePendingImages } from './AttachmentEditor';
import { useUnsavedChanges } from './useUnsavedChanges';

export function ShippingForm() {
    const { me } = useSupport();
    const router = useRouter();
    const images = usePendingImages();
    const key = useRef(crypto.randomUUID());
    const [busy, setBusy] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [error, setError] = useState('');
    const [progress, setProgress] = useState('');
    useUnsavedChanges(dirty || images.images.length > 0);
    const submit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (busy || me.impersonating) return;
        const values = new FormData(event.currentTarget);
        const shipping_request = Object.fromEntries(['locality', 'province', 'postal_code', 'address', 'customer', 'reference', 'products', 'conditions'].map(name => [name, String(values.get(name) || '').trim()])) as unknown as ShippingRequest;
        setBusy(true); setError('');
        try {
            const attachments = await images.upload(null, 'public', setProgress);
            const result = await supportRequest<{ id: string }>('tickets', { method: 'POST', body: commandBody({ workflow: 'shipping', shipping_request, attachments }, undefined, undefined, key.current) });
            images.clear(); setDirty(false);
            router.push(`/solicitudes-logistica/${result.id}`);
        } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); setProgress(''); }
    };
    return <form onSubmit={submit} onChange={() => setDirty(true)} onPaste={event => { if (!busy) try { pastedImages(event, images.images, images.setImages); } catch (e) { setError(errorMessage(e)); } }} className="mx-auto max-w-3xl space-y-4 rounded-lg border bg-white p-4 sm:p-6">
        <div><h2 className="text-lg font-semibold">Cotizar un envío fuera de cobertura</h2><p className="mt-1 text-sm text-slate-500">Logística recibe estos datos y compara transportes. Indicá las cantidades y las condiciones para evitar consultas adicionales.</p></div>
        {error && <Alert>{error}</Alert>}
        <fieldset disabled={busy || me.impersonating} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">{([['locality', 'Localidad', true], ['province', 'Provincia', true], ['postal_code', 'Código postal', true], ['address', 'Dirección de entrega', false], ['customer', 'Cliente', false], ['reference', 'Código de presupuesto o pedido', false]] as const).map(([name, label, required]) => <label key={name} className="text-sm font-medium">{label}{!required && <span className="font-normal text-slate-400"> (opcional)</span>}<input name={name} required={required} maxLength={250} className={`${fieldClass} mt-1`} /></label>)}</div>
            <label className="block text-sm font-medium">Productos y cantidades<textarea name="products" required maxLength={3000} rows={4} className={`${fieldClass} mt-1`} placeholder="Ej.: 1 biodigestor de 600 L. Agregá medidas, peso o cantidad de bultos si los conocés." /></label>
            <label className="block text-sm font-medium">Condiciones de entrega (opcional)<textarea name="conditions" maxLength={3000} rows={3} className={`${fieldClass} mt-1`} placeholder="Domicilio o sucursal, acceso, descarga y fecha necesaria." /></label>
            <p className="text-xs text-slate-500">La referencia permite identificar el presupuesto o pedido; no modifica sus importes ni confirma un despacho.</p>
            <AttachmentEditor images={images.images} onChange={images.setImages} disabled={busy} />
        </fieldset>
        <div className="flex justify-end gap-2 border-t pt-3"><button type="button" disabled={busy} className={secondaryClass} onClick={() => { if (!dirty && !images.images.length || window.confirm('¿Descartar el borrador?')) router.push('/solicitudes-logistica'); }}>Cancelar</button><button className={primaryClass} disabled={busy || me.impersonating}>{busy ? progress || 'Enviando…' : 'Solicitar cotización'}</button></div>
    </form>;
}
