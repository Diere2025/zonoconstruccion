'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { commandBody, errorMessage, supportRequest } from '@/lib/support/client';
import type { ShippingRequest } from '@/lib/support/shipping';
import { argentinaProvinces } from '@/lib/support/shipping';
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
        const shipping_request = Object.fromEntries(['locality', 'province', 'postal_code', 'address', 'map_url', 'customer', 'reference', 'products', 'conditions'].map(name => [name, String(values.get(name) || '').trim()])) as unknown as ShippingRequest;
        setBusy(true); setError('');
        try {
            const attachments = await images.upload(null, 'public', setProgress);
            const result = await supportRequest<{ id: string }>('tickets', { method: 'POST', body: commandBody({ workflow: 'shipping', shipping_request, attachments }, undefined, undefined, key.current) });
            images.clear(); setDirty(false);
            router.push(`/solicitudes-logistica/${result.id}`);
        } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); setProgress(''); }
    };
    return <form data-shortcut-submit onSubmit={submit} onChange={() => setDirty(true)} onPaste={event => { if (!busy) try { pastedImages(event, images.images, images.setImages); } catch (e) { setError(errorMessage(e)); } }} className="mx-auto max-w-3xl space-y-4 rounded-lg border bg-white p-4 sm:p-6">
        <div><h2 className="text-lg font-semibold">Cotizar un envío fuera de cobertura</h2><p className="mt-1 text-sm text-slate-500">Logística recibe estos datos y compara transportes. Indicá las cantidades y las condiciones para evitar consultas adicionales.</p></div>
        {me.impersonating && <p id="shipping-preview-notice" role="status" className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Estás usando «Ver como usuario». Podés completar los campos para probar el formulario. Para enviar una solicitud, volvé a tu cuenta con «Volver a administrador». Este borrador no se guarda al cambiar de cuenta.</p>}
        {error && <Alert>{error}</Alert>}
        <fieldset disabled={busy} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">{([['locality', 'Localidad', true], ['province', 'Provincia', true], ['postal_code', 'Código postal', false], ['address', 'Dirección de entrega', false], ['customer', 'Cliente', false], ['reference', 'Código de presupuesto o pedido', false]] as const).map(([name, label, required]) => <label key={name} className="text-sm font-medium">{label}{!required && <span className="font-normal text-slate-400"> (opcional)</span>}{name === 'province' ? <select name="province" required defaultValue="Buenos Aires" className={`${fieldClass} mt-1`}>{argentinaProvinces.map(province => <option key={province} value={province}>{province}</option>)}</select> : <input name={name} required={required} maxLength={250} className={`${fieldClass} mt-1`} />}</label>)}</div>
            <label className="block text-sm font-medium">Enlace de mapa <span className="font-normal text-slate-400">(opcional)</span><input name="map_url" type="url" pattern="https?://.*" maxLength={2000} className={`${fieldClass} mt-1`} placeholder="https://maps.app.goo.gl/…" /><span className="mt-1 block text-xs font-normal text-slate-500">Pegá el enlace de la ubicación de entrega.</span></label>
            <label className="block text-sm font-medium">Productos y cantidades<textarea name="products" required maxLength={3000} rows={4} className={`${fieldClass} mt-1`} placeholder="Ej.: 1 biodigestor de 600 L. Agregá medidas, peso o cantidad de bultos si los conocés." /></label>
            <label className="block text-sm font-medium">Condiciones de entrega (opcional)<textarea name="conditions" maxLength={3000} rows={3} className={`${fieldClass} mt-1`} placeholder="Domicilio o sucursal, acceso, descarga y fecha necesaria." /></label>
            <p className="text-xs text-slate-500">La referencia permite identificar el presupuesto o pedido; no modifica sus importes ni confirma un despacho.</p>
            <AttachmentEditor images={images.images} onChange={images.setImages} disabled={busy} />
        </fieldset>
        <div className="border-t pt-3">{me.impersonating && <p className="mb-3 text-sm text-amber-800">El envío está deshabilitado en «Ver como usuario». Volvé a tu cuenta para solicitar la cotización.</p>}<div className="flex justify-end gap-2"><button type="button" disabled={busy} className={secondaryClass} onClick={() => { if (!dirty && !images.images.length || window.confirm('¿Descartar el borrador?')) router.push('/solicitudes-logistica'); }}>Cancelar</button><button type="submit" className={primaryClass} aria-describedby={me.impersonating ? 'shipping-preview-notice' : undefined} disabled={busy || me.impersonating}>{busy ? progress || 'Enviando…' : 'Solicitar cotización'}</button></div></div>
    </form>;
}
