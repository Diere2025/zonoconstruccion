'use client';
import {useEffect,useState} from 'react';
import {createAuthenticatedRequester} from '@/lib/authenticatedRequest';
import {supabase} from '@/lib/supabase';
import type {StatementEntry} from '@/lib/bankStatements/model';
import StatementOrderLinkPanel from '../statements/StatementOrderLinkPanel';
import OperationEditor from './OperationEditor';
const api=createAuthenticatedRequester(supabase);
export default function CollectionOrderLinkModal({transactionId,code,onClose,onSaved}:{transactionId:string;code:string;onClose:()=>void;onSaved:()=>void}) {
 const [source,setSource]=useState<{bank:boolean;batch?:string;entry?:StatementEntry}|null>(null),[error,setError]=useState('');
 useEffect(()=>{let live=true;api(`/api/admin/bank-statements?action=movement-order&transaction=${transactionId}`).then(value=>{if(live)setSource(value);}).catch(cause=>{if(live)setError(cause.message);});return()=>{live=false;};},[transactionId]);
 if(source&&!source.bank)return <OperationEditor kind="customer_collection" transactionId={transactionId} mode="link" onClose={onClose} onSaved={onSaved}/>;
 return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-3" role="dialog" aria-modal="true" aria-label="Vincular pedido"><div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-5 shadow-xl"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Vincular pedido · {code}</h2><button autoFocus type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={onClose}>Cerrar</button></div>{error?<p role="alert" className="mt-4 text-sm text-red-700">{error}</p>:!source?<p className="mt-4 text-sm">Cargando pedido…</p>:source.batch&&source.entry?<StatementOrderLinkPanel batch={source.batch} entry={source.entry} available onSaved={async()=>{onSaved();onClose();}}/>:null}</div></div>;
}
