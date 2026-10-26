'use client';
import {useEffect,useRef,useState} from 'react';
import ErpDateInput from '@/components/ui/ErpDateInput';
import {treasuryToday} from '@/lib/treasuryTransactionTime';
type Row=Record<string,any>;
const field='mt-1 w-full rounded-lg border px-3 py-2 text-sm';
const money=(n:number)=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(n);
export default function FreightRefundEditor({row,accounts,onRequest,onSaved}:{row:Row;accounts:Row[];onRequest:(q:string,b?:Row)=>Promise<any>;onSaved:()=>Promise<void>}){
 const [options,setOptions]=useState<Row[]>([]),[paymentId,setPaymentId]=useState(''),[date,setDate]=useState(treasuryToday()),[accountId,setAccountId]=useState(''),[amount,setAmount]=useState(''),[reason,setReason]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const pending=useRef<{signature:string;key:string}|null>(null);
 useEffect(()=>{let active=true;onRequest('?action=refund-options&dispatchId='+row.dispatch_id).then(r=>{if(active)setOptions(r.payments);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[onRequest,row.dispatch_id]);
 const selected=options.find(p=>p.id===paymentId);
 return <form className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4" onSubmit={async e=>{e.preventDefault();if(!selected||busy)return;setBusy(true);setError('');try{const input={action:'refund-freight-payment',dispatchId:row.dispatch_id,paymentId,termsVersion:row.settlementTerms?.version||0,transactionSnapshot:selected.transaction,date,accountId,amount,reason};const signature=JSON.stringify(input);if(pending.current?.signature!==signature)pending.current={signature,key:crypto.randomUUID()};await onRequest('',{...input,requestKey:pending.current.key});await onSaved();}catch(e:any){setError(e.message);}finally{setBusy(false);}}}>
  <h3 className="font-semibold">Registrar reintegro de flete</h3><p className="text-sm">Registrá únicamente dinero efectivamente devuelto. Se creará un ingreso en la cuenta seleccionada, vinculado al pago original y a este LOG. El saldo se actualizará con lo abonado neto; el costo del servicio conserva su valor confirmado.</p>
  {loading?<p className="text-sm">Buscando pagos del LOG…</p>:!options.length?<p className="text-sm">No hay pagos activos con importe pendiente de devolver.</p>:<fieldset disabled={busy} className="space-y-3">
   <label className="block text-sm">Pago original<select required aria-label="Pago original del reintegro" className={field} value={paymentId} onChange={e=>{setPaymentId(e.target.value);setAmount('');}}><option value="">Seleccionar pago</option>{options.map(p=><option key={p.id} value={p.id}>{p.code} · Disponible para devolver: {money(p.available)}</option>)}</select></label>
   <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Fecha de devolución<ErpDateInput aria-label="Fecha de devolución" className={field} type="date" required value={date} onChange={e=>setDate(e.target.value)}/></label><label className="text-sm">Cuenta que recibe el dinero<select aria-label="Cuenta del reintegro" required className={field} value={accountId} onChange={e=>setAccountId(e.target.value)}><option value="">Seleccionar cuenta</option>{accounts.filter(a=>a.currency==='ARS'&&a.is_active&&!a.is_custody).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label></div>
   <label className="block text-sm">Importe devuelto<input aria-label="Importe del reintegro" className={field} type="number" required min="0.01" max={selected?.available} step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
   <label className="block text-sm">Motivo de la devolución<textarea aria-label="Motivo del reintegro" required minLength={3} maxLength={500} className={field} value={reason} onChange={e=>setReason(e.target.value)}/></label>
   <button disabled={!selected} className="rounded-lg bg-emerald-700 px-4 py-2 text-white">{busy?'Registrando…':'Registrar ingreso por reintegro'}</button>
  </fieldset>}{error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
 </form>;
}
