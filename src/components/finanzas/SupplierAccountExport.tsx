'use client';

import {useMemo,useState} from 'react';
import {supabase} from '@/lib/supabase';
import {createAuthenticatedRequester} from '@/lib/authenticatedRequest';
import {buildSupplierAccountReport,type SupplierReportFilters} from '@/lib/supplierAccounts/report';
import SelectionModal from './operations/SelectionModal';

export default function SupplierAccountExport({params,filters,disabled}:{
  params:string; filters:SupplierReportFilters; disabled:boolean;
}){
  const api=useMemo(()=>createAuthenticatedRequester(supabase),[]);
  const [busy,setBusy]=useState(false);
  const [destination,setDestination]=useState<string|null>(null);
  const [error,setError]=useState('');
  const [sheetError,setSheetError]=useState('');
  const [sheetUrl,setSheetUrl]=useState('');

  async function download(format:'excel'|'pdf'){
    setError('');
    setSheetUrl('');
    setBusy(true);
    try {
      const [{downloadSupplierReport},data]=await Promise.all([
        import('@/lib/supplierAccounts/downloadReport'),api('/api/admin/supplier-accounts?'+params),
      ]);
      await downloadSupplierReport(buildSupplierAccountReport(data,filters),format);
    } catch(e){setError((e as Error).message);}
    finally {setBusy(false);}
  }

  async function exportSheets(){
    setSheetError('');
    setSheetUrl('');
    setBusy(true);
    try {
      const {url}=await api('/api/admin/supplier-accounts',{method:'POST',body:JSON.stringify({
        action:'exportSheets',spreadsheetUrl:destination,filters:Object.fromEntries(new URLSearchParams(params)),
      })});
      setSheetUrl(url);
      setDestination(null);
    } catch(e){setSheetError((e as Error).message);}
    finally {setBusy(false);}
  }

  const button='rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-40';
  return <div>
    <div className="flex flex-wrap gap-2" role="group" aria-label="Exportar cuentas corrientes">
      <button type="button" className={button} disabled={disabled||busy} onClick={()=>void download('excel')}>Excel</button>
      <button type="button" className={button} disabled={disabled||busy} onClick={()=>{setSheetError('');setDestination('');}}>Google Sheets</button>
      <button type="button" className={button} disabled={disabled||busy} onClick={()=>void download('pdf')}>PDF</button>
    </div>
    {busy&&destination===null&&<p role="status" className="mt-2 text-xs text-slate-500">Preparando exportación…</p>}
    {error&&<p role="alert" className="mt-2 text-xs text-rose-700">{error}</p>}
    {sheetUrl&&<a href={sheetUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-brand-700 underline">Abrir pestaña exportada</a>}
    {destination!==null&&<SelectionModal title="Exportar a Google Sheets" onClose={()=>setDestination(null)} disabled={busy}>
      <form onSubmit={event=>{event.preventDefault();void exportSheets();}} className="space-y-3">
        <p className="text-sm text-slate-600">Pegá el enlace de una planilla editable por la cuenta de Google del ERP. El informe se guarda en una pestaña nueva.</p>
        <label className="block text-sm">Enlace de la planilla
          <input type="url" required disabled={busy} value={destination} onChange={event=>setDestination(event.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/…" className="mt-1 w-full rounded-lg border px-3 py-2"/>
        </label>
        {sheetError&&<p role="alert" className="text-sm text-rose-700">{sheetError}</p>}
        <button type="submit" disabled={busy} className="rounded-lg bg-brand-600 px-3 py-2 text-sm text-white disabled:opacity-40">{busy?'Exportando…':'Crear pestaña'}</button>
      </form>
    </SelectionModal>}
  </div>;
}
