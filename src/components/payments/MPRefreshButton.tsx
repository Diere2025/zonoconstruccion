'use client';
import {useEffect,useRef,useState} from 'react';
import {RefreshCw} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import {createAuthenticatedRequester} from '@/lib/authenticatedRequest';
const request=createAuthenticatedRequester(supabase);
type Read={id:string;status:string;message:string;account_name?:string};
export default function MPRefreshButton({accountId='ALL',onComplete}:{accountId?:string;onComplete?:()=>void}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');const mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 async function refresh(){if(busy)return;setBusy(true);setMessage('Solicitando lectura…');try{
  const initial=await request('/api/mp-refresh',{method:'POST',body:JSON.stringify({action:'request',accountId})});let rows:Read[]=initial.data;const names=new Map(rows.map(r=>[r.id,r.account_name]));const until=Date.now()+95000;
  while(rows.some(r=>['queued','reading'].includes(r.status))&&Date.now()<until&&mounted.current){setMessage('Verificando en Mercado Pago…');await new Promise(resolve=>setTimeout(resolve,2000));if(!mounted.current)return;const result=await request('/api/mp-refresh?ids='+rows.map(r=>r.id).join(','));rows=result.data;}
  if(!mounted.current)return;
  setMessage(rows.map(r=>(names.get(r.id)?names.get(r.id)+': ':'')+(['queued','reading'].includes(r.status)?'El monitor no respondió a tiempo':r.message)).join(' · '));
  if(rows.some(r=>r.status==='completed'))onComplete?.();
 }catch(e){if(mounted.current)setMessage((e as Error).message);}finally{if(mounted.current)setBusy(false);}}
 return <div className="flex flex-col gap-1 max-w-sm"><button type="button" onClick={refresh} disabled={busy} className="flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800 disabled:opacity-60"><RefreshCw className={'h-4 w-4 '+(busy?'animate-spin':'')}/>{busy?'Verificando…':'Verificar pagos ahora'}</button>{message&&<span role="status" className="text-xs text-slate-600">{message}</span>}</div>;
}
