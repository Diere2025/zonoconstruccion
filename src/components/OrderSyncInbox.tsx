"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, X, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Job = {
  kind: 'create' | 'cancel';
  id: string; order_id: string; customer_name: string; code: string | null;
  status: 'awaiting_items' | 'pending' | 'processing' | 'completed' | 'attention';
  message: string | null; read_at: string | null; created_at: string;
};
const fields = 'id,order_id,customer_name,code,kind,status,message,read_at,created_at';

export function OrderSyncInbox() {
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState('');
  const previousResults = useRef('');
  const refresh = useCallback(async () => {
    // Sellers see their orders; administrators can review the team's alerts.
    const { data, error } = await supabase.from('order_sync_jobs').select(fields)
      .or('read_at.is.null,status.in.(pending,processing,awaiting_items)')
      .order('created_at', { ascending: false }).limit(100);
    if (error) setError('No se pudo actualizar la bandeja. Volveremos a intentar.');
    else {
      const next = (data || []) as Job[];
      const signature = next.map(j => `${j.id}:${j.code}:${j.status}`).join('|');
      if (signature !== previousResults.current) window.dispatchEvent(new Event('order-sync-finished'));
      previousResults.current = signature;
      setJobs(next); setError('');
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 15000);
    const onRefresh = () => void refresh();
    window.addEventListener('order-sync-updated', onRefresh);
    window.addEventListener('focus', onRefresh);
    return () => { clearInterval(timer); window.removeEventListener('order-sync-updated', onRefresh); window.removeEventListener('focus', onRefresh); };
  }, [refresh]);
  const alerts = jobs.filter(j => j.status === 'attention' && !j.read_at).length;
  const pending = jobs.filter(j => ['pending','processing','awaiting_items'].includes(j.status)).length;
  return (
    <>
      <button type="button" onClick={() => {setOpen(true); void refresh();}}
        className="fixed bottom-5 right-5 z-[45] flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 shadow-lg">
        <Bell className="h-4 w-4" /> Bandeja de pedidos
        {alerts > 0 && <span className="rounded-full bg-rose-600 px-2 text-white">{alerts}</span>}
        {pending > 0 && <span className="rounded-full bg-blue-100 px-2 text-blue-800">{pending} pendientes</span>}
        {error && <AlertTriangle className="h-4 w-4 text-amber-600" aria-label="Bandeja sin actualizar" />}
      </button>
      {open && (
        <div className="fixed inset-0 z-[80] flex justify-end bg-slate-950/40" onClick={() => setOpen(false)}>
          <section role="dialog" aria-modal="true" aria-labelledby="sync-inbox-title" onClick={e => e.stopPropagation()}
            className="flex h-full w-full max-w-lg flex-col bg-white shadow-2xl">
            <header className="flex items-center justify-between border-b p-5">
              <div><h2 id="sync-inbox-title" className="font-bold text-slate-900">Bandeja de pedidos</h2>
                <p className="mt-1 text-xs text-slate-500">Planillas, avisos y comprobantes en segundo plano</p></div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar bandeja"><X className="h-5 w-5" /></button>
            </header>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {error && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{error}</p>}
              {!jobs.length && !error && <p className="py-10 text-center text-sm text-slate-500">No hay avisos pendientes.</p>}
              {jobs.map(job => {
                const busy = ['pending','processing','awaiting_items'].includes(job.status);
                const failed = job.status === 'attention';
                return <article key={job.id} className={`rounded-2xl border p-4 ${failed ? 'border-amber-200 bg-amber-50' : 'border-slate-200'}`}>
                  <div className="flex items-center gap-2 font-bold text-slate-800">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin text-blue-600" /> : failed ? <AlertTriangle className="h-4 w-4 text-amber-600" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                    {job.code || `Pedido ${job.order_id.slice(0,8)}`}
                  </div>
                  <p className="mt-1 text-sm font-semibold text-slate-700">{job.kind === 'cancel' ? 'Anulación · ' : ''}{job.customer_name}</p>
                  <p className="mt-2 whitespace-pre-line text-sm text-slate-600">{busy ? (job.kind === 'cancel' ? 'Anulado en ERP. Actualizando planillas y aviso…' : job.status === 'processing' ? 'Sincronizando planillas y avisos…' : 'Guardado en ERP. Esperando sincronización…') : job.message}</p>
                  <p className="mt-2 text-xs text-slate-400">{new Date(job.created_at).toLocaleString('es-AR')}</p>
                  {!busy && !job.read_at && <button type="button" className="mt-3 text-xs font-bold text-blue-700" onClick={async () => {
                    const {error} = await supabase.rpc('mark_order_sync_read', {job_id:job.id});
                    if (error) setError('No se pudo marcar el aviso como leído.'); else void refresh();
                  }}>Marcar como leído</button>}
                </article>;
              })}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
