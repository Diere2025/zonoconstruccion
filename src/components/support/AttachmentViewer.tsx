'use client';
/* eslint-disable @next/next/no-img-element -- Authenticated blob images must bypass shared image caches. */
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Loader2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { supportImage, errorMessage } from '@/lib/support/client';
import type { Attachment } from '@/lib/support/types';
import { Alert, secondaryClass } from './SupportShell';
function PrivateImage({ file, onOpen }: {
    file: Attachment;
    onOpen: () => void;
}) {
    const [url, setUrl] = useState('');
    const [error, setError] = useState('');
    useEffect(() => { let alive = true; let allocated = ''; void supportImage(file.id).then(value => { allocated = value; if (alive)
        setUrl(value);
    else
        URL.revokeObjectURL(value); }).catch(e => { if (alive)
        setError(errorMessage(e)); }); return () => { alive = false; if (allocated)
        URL.revokeObjectURL(allocated); }; }, [file.id]);
    if (error)
        return <Alert>{error}</Alert>;
    return <button type="button" onClick={onOpen} className="w-24 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-white p-1 text-left hover:border-indigo-400 focus-visible:outline-2 focus-visible:outline-indigo-500">{url ? <img src={url} alt={file.name} className="h-16 w-full object-contain"/> : <div className="flex h-16 items-center justify-center"><Loader2 className="size-5 animate-spin text-slate-400"/></div>}<span className="mt-1 block truncate text-xs text-slate-500">{file.name} · Ampliar</span></button>;
}
export function AttachmentViewer({ files }: {
    files: Attachment[];
}) {
    const [index, setIndex] = useState<number | null>(null);
    const [url, setUrl] = useState('');
    const [error, setError] = useState('');
    const [zoom, setZoom] = useState(false);
    const dialog = useRef<HTMLDialogElement>(null);
    const current = index === null ? null : files[index];
    useEffect(() => {
        if (!current)
            return;
        let alive = true;
        let allocated = '';
        dialog.current?.showModal();
        void supportImage(current.id).then(value => { allocated = value; if (alive) {
            setUrl(value);
            setError('');
        }
        else
            URL.revokeObjectURL(value); }).catch(e => { if (alive)
            setError(errorMessage(e)); });
        return () => { alive = false; if (allocated)
            URL.revokeObjectURL(allocated); };
    }, [current]);
    const close = () => { dialog.current?.close(); setIndex(null); setUrl(''); setZoom(false); };
    const move = (direction: number) => { if (index === null)
        return; setUrl(''); setZoom(false); setIndex((index + direction + files.length) % files.length); };
    if (files.length === 0)
        return null;
    return <><div className="mt-2 flex flex-wrap gap-2">{files.map((file, i) => <PrivateImage key={file.id} file={file} onOpen={() => setIndex(i)}/>)}</div><dialog ref={dialog} onCancel={close} aria-label="Visor de captura" className="h-[90vh] w-[95vw] max-w-6xl rounded-2xl bg-white p-0 backdrop:bg-slate-950/70">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3"><span className="max-w-[40%] truncate text-sm font-semibold">{current?.name}</span><div className="flex gap-2">{files.length > 1 && <><button aria-label="Imagen anterior" className={secondaryClass} onClick={() => move(-1)}><ChevronLeft className="size-4"/></button><button aria-label="Imagen siguiente" className={secondaryClass} onClick={() => move(1)}><ChevronRight className="size-4"/></button></>}<button aria-label={zoom ? 'Ajustar imagen' : 'Tamaño original'} className={secondaryClass} onClick={() => setZoom(!zoom)}>{zoom ? <ZoomOut className="size-4"/> : <ZoomIn className="size-4"/>}</button>{url && <a download={current?.name} href={url} className={secondaryClass} aria-label="Descargar captura"><Download className="size-4"/></a>}<button aria-label="Cerrar visor" className={secondaryClass} onClick={close}><X className="size-4"/></button></div></div>
    <div className="h-[calc(90vh-5rem)] overflow-auto bg-slate-100 p-3">{error ? <Alert>{error}</Alert> : url ? <img alt={current?.name || 'Captura'} src={url} style={zoom ? { maxWidth: 'none' } : { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', margin: 'auto' }}/> : <Loader2 className="mx-auto mt-20 size-8 animate-spin text-indigo-500"/>}</div>
  </dialog></>;
}
