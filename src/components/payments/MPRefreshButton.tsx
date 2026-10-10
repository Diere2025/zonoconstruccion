'use client';
import {useEffect,useRef,useState} from 'react';
import {RefreshCw} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import {createAuthenticatedRequester} from '@/lib/authenticatedRequest';
import {readMPRefresh} from '@/lib/mpRefreshClient';
const request=createAuthenticatedRequester(supabase);
export default function MPRefreshButton({accountId='ALL',onComplete}:{accountId?:string;onComplete?:()=>void}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');const abort=useRef<AbortController|null>(null);
 useEffect(()=>()=>{abort.current?.abort();},[]);
 async function refresh(){if(busy)return;const controller=new AbortController();abort.current=controller;setBusy(true);
  try{const rows=await readMPRefresh(request,accountId,text=>{if(!controller.signal.aborted)setMessage(text);},{signal:controller.signal});if(!controller.signal.aborted&&rows.some(r=>r.status==='completed'))onComplete?.();}
  catch(e){if(!controller.signal.aborted)setMessage((e as Error).message);}
  finally{if(!controller.signal.aborted)setBusy(false);}
 }
 return <div className="flex flex-col gap-1 max-w-sm"><button type="button" onClick={refresh} disabled={busy} className="flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800 disabled:opacity-60"><RefreshCw className={'h-4 w-4 '+(busy?'animate-spin':'')}/>{busy?'Verificando…':'Verificar pagos ahora'}</button>{message&&<span role="status" className="text-xs text-slate-600">{message}</span>}</div>;
}
