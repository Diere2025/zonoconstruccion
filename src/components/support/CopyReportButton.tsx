'use client';
import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';

export function CopyReportButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState('');
    useEffect(() => {
        if (!copied) return;
        const timer = setTimeout(() => setCopied(false), 2000);
        return () => clearTimeout(timer);
    }, [copied]);
    const copy = async () => {
        setError('');
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
        } catch {
            setError('No se pudo copiar. Seleccioná el texto del reporte y usá Ctrl+C.');
        }
    };
    return <div className="flex items-center gap-2">
        <button type="button" onClick={() => void copy()} aria-label={copied ? 'Texto del reporte copiado' : 'Copiar texto del reporte'} title={copied ? 'Copiado' : 'Copiar texto del reporte'}
            className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-indigo-600 focus-visible:outline-2 focus-visible:outline-indigo-500">
            {copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
        </button>
        <span role="status" className="sr-only">{copied ? 'Texto del reporte copiado' : ''}</span>
        {error && <span role="alert" className="max-w-64 text-xs text-rose-700">{error}</span>}
    </div>;
}
