"use client";
import AdaptiveSelect from "@/components/ui/AdaptiveSelect";
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import OperationEditor from '@/components/finanzas/operations/OperationEditor';
import {operationLabels,type OperationInput,type OperationType} from '@/lib/financialOperations/types';
import {treasuryToday} from '@/lib/treasuryTransactionTime';
import {supabase} from '@/lib/supabase';
import {createAuthenticatedRequester} from '@/lib/authenticatedRequest';
import {buildSpecialPlan,type SpecialInput,type Resources} from '@/lib/financialOperations/specialized';
const realRequest=createAuthenticatedRequester(supabase);
type Account={id:string;name:string;currency:string;is_active:boolean};
type Movement={id:string;concept:string|null;type:string;amount:number|string;currency:string;created_at:string;financial_account_id:string|null;financial_accounts?:{name:string}|null;category:string;notes?:string|null};
type Helpers={financialAccounts:Account[];suppliers:Array<{id:string;name:string}>;employees:unknown[];pendingPurchases:unknown[]};
type Line={id:string;concept:string;type:string;amount:string;account_id:string;operation_type:OperationType;created_at?:string};
function lastMonth(){const day=new Date();day.setDate(day.getDate()-30);return treasuryToday(day);}
export default function Preview(){
 const [kind,setKind]=useState<OperationType|null>(null),[lines,setLines]=useState<Line[]>([]);
 const special=useRef<Resources|null>(null);
 const simulatedLines=useRef<Line[]>([]);
 const recordLines=(rows:Line[])=>{simulatedLines.current=[...rows,...simulatedLines.current];setLines(simulatedLines.current);};
 const simulatedCut=useCallback(async(url:string)=>{const data=await realRequest(url),parsed=new URL(url,'http://localhost'),id=parsed.searchParams.get('account_id'),cutoff=Date.parse(parsed.searchParams.get('cutoff')||'');const included=simulatedLines.current.filter(l=>l.account_id===id&&l.created_at&&Date.parse(l.created_at)<=cutoff);const delta=included.reduce((sum,l)=>sum+(l.type==='ingreso'?1:-1)*Math.round(Number(l.amount)*100),0);return {...data,balance:((Math.round(Number(data.balance)*100)+delta)/100).toFixed(2),fingerprint:data.fingerprint+':'+included.map(l=>l.id).join(','),has_history:data.has_history||simulatedLines.current.some(l=>l.account_id===id)};},[]);
 const [helpers,setHelpers]=useState<Helpers|null>(null),[movements,setMovements]=useState<Movement[]>([]);
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const [start,setStart]=useState(lastMonth),[end,setEnd]=useState(treasuryToday());
 const [query,setQuery]=useState(''),[account,setAccount]=useState('all'),[page,setPage]=useState(1);
 useEffect(()=>{
  let active=true;setLoading(true);setError('');setPage(1);
  Promise.all([realRequest('/api/admin/finanzas-data?action=init'),realRequest(`/api/admin/finanzas-data?action=transactions&startDate=${start}&endDate=${end}`)])
   .then(([data,result])=>{if(active){setHelpers(data);setMovements(result.transactions || []);}})
   .catch(e=>{if(active){setError(e instanceof Error?e.message:'No se pudieron consultar los datos reales.');setMovements([]);}})
   .finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[start,end,retry]);
 const api=useCallback(async(url:string,init?:RequestInit)=>{
  if(init && (init.method || 'GET').toUpperCase()!=='GET'){
   if(init.method==='POST'&&url==='/api/admin/special-financial-operations'){
    const body=JSON.parse(String(init.body)) as {action:string;payload:SpecialInput};if(body.action!=='save'||!special.current)throw new Error('Solo se simulan altas; ninguna anulación se envía a la base.');
    const p=body.payload,r=special.current;
    let cut;if(p.operation_type==='cash_count'){const c=r.counts.find(c=>c.id===p.resource_id);const cutoff=p.action==='adjust'?c?.cutoff:p.cutoff;if(!cutoff)throw new Error('Elegí el corte.');cut=await simulatedCut(`/api/admin/special-financial-operations?account_id=${p.account_id}&cutoff=${encodeURIComponent(cutoff)}`);}
    const plan=buildSpecialPlan(p,r,cut),id=crypto.randomUUID();
    if(plan.fund){const f=plan.fund;if(f.create)r.funds.push({id,custodian:f.create.custodian,purpose:f.create.purpose,account_id:f.create.account_id,currency:f.create.currency,balance:f.balance_delta,pending:f.pending_delta,version:1,status:'open'});else r.funds=r.funds.map(old=>old.id!==f.id?old:{...old,balance:(Number(old.balance)+Number(f.balance_delta)).toFixed(2),pending:(Number(old.pending)+Number(f.pending_delta)).toFixed(2),version:old.version+1,status:f.close?'closed':'open'});}
    if(plan.loan){const l=plan.loan;if(l.create)r.loans.push({id,counterparty:l.create.counterparty,reference:l.create.reference,currency:l.create.currency,side:l.create.side as 'borrower'|'lender',capital:l.capital_delta,version:1});else r.loans=r.loans.map(old=>old.id!==l.id?old:{...old,capital:(Number(old.capital)+Number(l.capital_delta)).toFixed(2),version:old.version+1});}
    if(plan.count){const c=plan.count;if(c.id)r.counts=r.counts.map(old=>old.id!==c.id?old:{...old,status:c.status,version:old.version+1});else r.counts.push({id,account_id:c.account_id,cutoff:c.cutoff,expected:c.expected,counted:c.counted,fingerprint:c.fingerprint,status:c.status,version:1});}
    recordLines(plan.lines.map(l=>({id:crypto.randomUUID(),concept:p.concept,type:l.direction,amount:l.amount,account_id:l.account_id,operation_type:p.operation_type,created_at:plan.count?.cutoff||`${p.effective_date}T12:00:00-03:00`})));return {result:{status:'simulated',operation_id:id}};
   }
   if(init.method!=='POST' || url!=='/api/admin/financial-operations')throw new Error('La vista local solo permite consultar datos y simular operaciones.');
   const {payload}=JSON.parse(String(init.body)) as {payload:OperationInput};
   const line={id:crypto.randomUUID(),concept:payload.concept,type:payload.direction,amount:payload.amount,account_id:payload.account_id,operation_type:payload.operation_type,created_at:`${payload.effective_date}T12:00:00-03:00`};
   const result=payload.operation_type==='internal_transfer'?[{...line,type:'egreso'},{...line,id:crypto.randomUUID(),type:'ingreso',account_id:payload.destination_account_id!}]:[line];
   recordLines(result);return {result:{status:'simulated'}};
  }
  if(url.includes('action=init') && helpers)return helpers;
  if(url.startsWith('/api/admin/special-financial-operations?account_id='))return simulatedCut(url);
  if(url==='/api/admin/special-financial-operations'){
   if(!special.current){const data=await realRequest(url);special.current={accounts:helpers?.financialAccounts||data.accounts||[],funds:data.funds||[],loans:data.loans||[],counts:data.counts||[]};}
   return {available:true,...special.current,operations:[]};
  }
  return realRequest(url==='/api/admin/financial-operations'?`${url}?preview=real`:url);
 },[helpers,simulatedCut]);
 const filtered=useMemo(()=>movements.filter(row=> (account==='all' || row.financial_account_id===account) && (!query.trim() || `${row.concept || ''} ${row.category} ${row.notes || ''} ${row.financial_accounts?.name || ''}`.toLocaleLowerCase('es').includes(query.trim().toLocaleLowerCase('es')))),[movements,query,account]);
 const count=Math.max(1,Math.ceil(filtered.length/50)),currentPage=Math.min(page,count);
 const tableRows=filtered.slice((currentPage-1)*50,currentPage*50);
 const accounts=helpers?.financialAccounts || [];
 return <main className="mx-auto w-full max-w-7xl space-y-5 p-6">
  <div><p className="text-xs font-semibold uppercase text-brand-700">Vista local · consulta de datos reales</p><h1 className="mt-1 text-2xl font-bold text-slate-900">Movimientos y formularios</h1><p className="mt-2 text-sm text-slate-600">Proveedores, cuentas, personal, documentos y movimientos del sistema. Las cargas de prueba se simulan en esta pantalla y desaparecen al recargar; no cambian saldos ni documentos reales.</p><a href="/admin/finanzas" className="mt-2 inline-block text-sm text-brand-700 underline">Abrir Movimientos del sistema</a></div>
  {error && <div role="alert" className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p>{error}</p><a className="mr-4 underline" href="/admin/finanzas">Ingresar con mi sesión administrativa</a><button className="underline" onClick={()=>setRetry(n=>n+1)}>Reintentar</button></div>}
  {helpers && <p className="text-sm text-slate-600">{helpers.suppliers.length} proveedores · {accounts.length} cuentas · {helpers.employees.length} empleados activos · {helpers.pendingPurchases.length} documentos de compra pendientes</p>}
  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(operationLabels).map(([type,label])=><button key={type} disabled={!helpers || loading || Boolean(error)} onClick={()=>setKind(type as OperationType)} className="rounded-xl border border-slate-200 bg-white p-4 text-left font-semibold text-slate-800 shadow-sm hover:border-brand-500 hover:bg-brand-50 disabled:opacity-50">{label}</button>)}</div>
  {lines.length>0 && <section className="rounded-xl border border-amber-200 bg-amber-50 p-4"><h2 className="font-semibold">Pruebas simuladas · sin guardar en el sistema</h2><ul className="mt-2 space-y-1 text-sm">{lines.map(line=><li key={line.id}>{line.type} · {line.concept} · {accounts.find(a=>a.id===line.account_id)?.name} · {Number(line.amount).toLocaleString('es-AR')} {accounts.find(a=>a.id===line.account_id)?.currency}</li>)}</ul></section>}
  <section className="rounded-xl border bg-white p-4"><h2 className="font-semibold">Movimientos reales · {filtered.length.toLocaleString('es-AR')} registros en el período</h2>
   <div className="my-3 flex flex-wrap gap-3 text-sm"><label>Desde <input aria-label="Desde" type="date" value={start} max={end} onChange={e=>setStart(e.target.value)} className="rounded border p-2"/></label><label>Hasta <input aria-label="Hasta" type="date" value={end} min={start} onChange={e=>setEnd(e.target.value)} className="rounded border p-2"/></label><input aria-label="Buscar movimiento" placeholder="Buscar concepto, categoría o cuenta" value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}} className="min-w-64 rounded border p-2"/><AdaptiveSelect aria-label="Filtrar cuenta" value={account} onChange={e=>{setAccount(e.target.value);setPage(1);}} className="rounded border p-2"><option value="all">Todas las cuentas</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</AdaptiveSelect><button onClick={()=>setRetry(n=>n+1)} className="rounded border px-3">Actualizar</button></div>
   {loading?<p className="py-4 text-sm text-slate-500">Consultando datos reales…</p>:!error && !tableRows.length?<p className="py-4 text-sm text-slate-500">Sin movimientos para estos filtros.</p>:!error && <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Fecha</th><th className="p-2">Tipo</th><th className="p-2">Detalle</th><th className="p-2">Categoría</th><th className="p-2">Cuenta</th><th className="p-2 text-right">Importe</th></tr></thead><tbody>{tableRows.map(row=><tr key={row.id} className="border-t"><td className="whitespace-nowrap p-2">{treasuryToday(new Date(row.created_at))}</td><td className="p-2">{row.type}</td><td className="p-2">{row.concept || '—'}</td><td className="p-2">{row.category}</td><td className="p-2">{row.financial_accounts?.name || 'Caja de vendedores'}</td><td className="whitespace-nowrap p-2 text-right">{Number(row.amount).toLocaleString('es-AR',{minimumFractionDigits:2})} {row.currency}</td></tr>)}</tbody></table></div>}
   {!loading && !error && <div className="mt-3 flex items-center justify-end gap-3 text-sm"><button disabled={currentPage<=1} onClick={()=>setPage(currentPage-1)} className="rounded border px-3 py-1 disabled:opacity-40">Anterior</button><span>{currentPage} / {count}</span><button disabled={currentPage>=count} onClick={()=>setPage(currentPage+1)} className="rounded border px-3 py-1 disabled:opacity-40">Siguiente</button></div>}
  </section>
  {kind && <OperationEditor kind={kind} preview realDataPreview requestOverride={api} onClose={()=>setKind(null)} onSaved={()=>{}}/>}
 </main>;
}
