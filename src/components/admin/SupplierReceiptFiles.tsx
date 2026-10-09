"use client";
import {useEffect, useState, useRef} from 'react';
import {supabase} from '@/lib/supabase';
import {createAuthenticatedRequester} from '@/lib/authenticatedRequest';

export default function SupplierReceiptFiles({id}: {id: string}) {
  const input = useRef<HTMLInputElement>(null);
  const api = useRef(createAuthenticatedRequester(supabase));
  const [files, setFiles] = useState<Array<{name: string; url: string}>>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    setFiles([]); setError('');
    api.current('/api/admin/supplier-receipt-files?id=' + id).then(data => {if (active) setFiles(data.files);}).catch(e => {if (active) setError(e.message);});
    return () => {active = false;};
  }, [id]);
  async function upload(selected: FileList | null) {
    if (!selected?.length || busy) return;
    setBusy(true); setError('');
    try {
      const form = new FormData(); form.set('id', id);
      Array.from(selected).forEach(file => form.append('files', file));
      await api.current('/api/admin/supplier-receipt-files', {method: 'POST', body: form});
      const data = await api.current('/api/admin/supplier-receipt-files?id=' + id);
      setFiles(data.files);
    } catch (e: any) {setError(e.message);}
    finally {setBusy(false);}
  }
  return <section className="space-y-2 rounded-xl border p-3 text-xs">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="font-bold">Comprobante / remito del proveedor</h4>
      <button type="button" disabled={busy} onClick={() => input.current?.click()} className={`inline-flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5 font-bold text-brand-700 hover:bg-brand-100 cursor-pointer ${busy ? 'opacity-50 pointer-events-none' : ''}`}>{busy ? 'Subiendo…' : '+ Adjuntar comprobante / remito'}
      </button>
        <input ref={input} aria-label="Adjuntar comprobante del proveedor" type="file" multiple disabled={busy} accept="image/jpeg,image/png,image/webp,image/gif,.pdf,.doc,.docx" className="hidden" onChange={e => {void upload(e.target.files); e.target.value = '';}} />
    </div>
    {files.map(file => <a key={file.url} href={file.url} target="_blank" rel="noopener noreferrer" className="block truncate text-brand-600 underline">{file.name}</a>)}
    {!files.length && <p className="text-slate-500">Sin adjuntos. Imágenes, PDF o Word; hasta 5 archivos de 10 MB.</p>}
    {error && <p role="alert" className="text-red-600">{error}</p>}
  </section>;
}
