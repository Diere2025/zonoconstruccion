"use client";
import {useEffect, useState, useRef} from 'react';
import {supabase} from '@/lib/supabase';
import {createAuthenticatedRequester} from '@/lib/authenticatedRequest';

export default function SupplierReceiptFiles({id}: {id: string}) {
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
      <label className="cursor-pointer text-brand-600 font-bold">{busy ? 'Subiendo…' : 'Adjuntar archivos'}
        <input aria-label="Adjuntar comprobante del proveedor" type="file" multiple disabled={busy} accept="image/jpeg,image/png,image/webp,image/gif,.pdf,.doc,.docx" className="sr-only" onChange={e => {void upload(e.target.files); e.target.value = '';}} />
      </label>
    </div>
    {files.map(file => <a key={file.url} href={file.url} target="_blank" rel="noopener noreferrer" className="block truncate text-brand-600 underline">{file.name}</a>)}
    {!files.length && <p className="text-slate-500">Sin adjuntos. Imágenes, PDF o Word; hasta 5 archivos de 10 MB.</p>}
    {error && <p role="alert" className="text-red-600">{error}</p>}
  </section>;
}
