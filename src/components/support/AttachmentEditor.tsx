'use client';
/* eslint-disable @next/next/no-img-element -- Private blob previews must bypass shared image caches. */
import { useEffect, useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { supportRequest } from '@/lib/support/client';
import type { Attachment } from '@/lib/support/types';
import { Alert, secondaryClass } from './SupportShell';
export interface PendingImage {
    key: string;
    file: File;
    preview: string;
    uploaded?: Attachment;
}
export function usePendingImages() {
    const [images, setImages] = useState<PendingImage[]>([]);
    const latest = useRef(images);
    useEffect(() => { latest.current = images; }, [images]);
    useEffect(() => () => { latest.current.forEach(image => URL.revokeObjectURL(image.preview)); }, []);
    const clear = () => { images.forEach(image => URL.revokeObjectURL(image.preview)); setImages([]); };
    const upload = async (ticketId: string | null, visibility: 'public' | 'internal', onProgress: (value: string) => void) => {
        const ids: string[] = [];
        for (let i = 0; i < images.length; i++) {
            const image = images[i];
            onProgress(`Subiendo imagen ${i + 1} de ${images.length}…`);
            if (image.uploaded) {
                ids.push(image.uploaded.id);
                continue;
            }
            const form = new FormData();
            form.set('file', image.file);
            form.set('visibility', visibility);
            form.set('idempotencyKey', image.key);
            if (ticketId)
                form.set('ticket_id', ticketId);
            const result = await supportRequest<Attachment>('uploads', { method: 'POST', body: form });
            setImages(current => current.map(item => item.key === image.key ? { ...item, uploaded: result } : item));
            ids.push(result.id);
        }
        return ids;
    };
    return { images, setImages, clear, upload };
}
export function AttachmentEditor({ images, onChange, disabled = false }: {
    images: PendingImage[];
    onChange: (images: PendingImage[]) => void;
    disabled?: boolean;
}) {
    const input = useRef<HTMLInputElement>(null);
    const [error, setError] = useState('');
    const add = (files: File[]) => {
        if (disabled)
            return;
        const candidates = files.filter(f => f.type.startsWith('image/'));
        if (candidates.length === 0) {
            setError('Elegí imágenes JPG, PNG o WebP.');
            return;
        }
        if (images.length + candidates.length > 5) {
            setError('Podés adjuntar hasta 5 imágenes por envío.');
            return;
        }
        if (candidates.some(f => !['image/png', 'image/jpeg', 'image/webp'].includes(f.type) || f.size > 10 * 1024 * 1024)) {
            setError('Cada imagen debe ser JPG, PNG o WebP y pesar hasta 10 MB.');
            return;
        }
        if ([...images.map(i => i.file), ...candidates].reduce((n, f) => n + f.size, 0) > 25 * 1024 * 1024) {
            setError('El envío puede incluir hasta 25 MB de imágenes.');
            return;
        }
        setError('');
        onChange([...images, ...candidates.map(file => ({ key: crypto.randomUUID(), file, preview: URL.createObjectURL(file) }))]);
    };
    return <div onPaste={e => { const files = Array.from(e.clipboardData.files); if (files.some(f => f.type.startsWith('image/'))) {
        e.preventDefault();
        add(files);
    } }} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); add(Array.from(e.dataTransfer.files)); }} className="space-y-3">
    {error && <Alert>{error}</Alert>}
    <div tabIndex={disabled ? -1 : 0} role="group" aria-label="Pegar o arrastrar capturas" className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-slate-200 bg-slate-50 p-2 focus:border-indigo-400 focus:outline-none"><button type="button" disabled={disabled} className={secondaryClass} onClick={() => input.current?.click()}><ImagePlus className="size-4"/>Adjuntar capturas</button><p className="text-xs text-slate-500">Pegá con Ctrl+V acá o en el mensaje, arrastrá imágenes o elegilas. Hasta 5 imágenes · 10 MB cada una.</p><input ref={input} hidden type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={disabled} onChange={e => { add(Array.from(e.target.files || [])); e.target.value = ''; }}/></div>
    {images.length > 0 && <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{images.map(image => <div key={image.key} className="relative rounded-xl border border-slate-200 bg-white p-2"><img src={image.preview} alt={`Vista previa de ${image.file.name}`} className="h-16 w-full rounded-lg object-contain"/><p className="mt-2 truncate pr-6 text-xs text-slate-500">{image.file.name}</p><button type="button" aria-label={`Quitar ${image.file.name}`} disabled={disabled} onClick={() => { URL.revokeObjectURL(image.preview); onChange(images.filter(i => i.key !== image.key)); }} className="absolute right-2 top-2 rounded-full bg-white p-1 shadow"><X className="size-4"/></button></div>)}</div>}
  </div>;
}
// Use at the text editor ancestor, preserving ordinary text paste.
export function pastedImages(event: React.ClipboardEvent, images: PendingImage[], onChange: (images: PendingImage[]) => void) {
    const files = Array.from(event.clipboardData.files).filter(f => ['image/png', 'image/jpeg', 'image/webp'].includes(f.type));
    if (files.length === 0)
        return;
    event.preventDefault();
    if (images.length + files.length > 5 || files.some(f => f.size > 10 * 1024 * 1024) || [...images.map(i => i.file), ...files].reduce((n, f) => n + f.size, 0) > 25 * 1024 * 1024)
        throw new Error('Podés enviar hasta 5 imágenes, 10 MB por imagen y 25 MB en total.');
    onChange([...images, ...files.map(file => ({ key: crypto.randomUUID(), file, preview: URL.createObjectURL(file) }))]);
}
