import {carrierCommercialProfile} from '@/lib/carrierIdentity';
type Row=Record<string,any>;
export function noveltyOwner(row:Row){return row.company_key?'company:'+row.company_key:'carrier:'+row.carrier_id;}
export function planOwner(plan:Row){const header=Array.isArray(plan.logistics_dispatches)?plan.logistics_dispatches[0]:plan.logistics_dispatches;const company=carrierCommercialProfile(header?.carrier_name||'')?.company_key;return company?'company:'+company:'carrier:'+plan.carrier_id;}
export function noveltyBalances(novelties:Row[],terms:Row[]):Row[]{return novelties.map(n=>{const applied=[...(n.logistics_freight_novelty_applications||[]).filter((a:Row)=>!terms.some(t=>t.dispatch_id===a.dispatch_id)).map((a:Row)=>({dispatchId:a.dispatch_id,amount:Number(a.amount)})),...terms.flatMap(t=>(t.deductions||[]).filter((d:Row)=>d.noveltyId===n.id).map((d:Row)=>({dispatchId:t.dispatch_id,amount:Number(d.amount)})))];const consumed=applied.reduce((s:number,a:Row)=>s+a.amount,0);return {...n,applied,remainingAmount:Math.round((Number(n.amount)-consumed)*100)/100};});}
export function validateNovelty(input:Row){
 const amount=Number(input.amount),date=String(input.originDate||''),label=String(input.label||'').trim(),reference=String(input.reference||'').trim();
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date||!Number.isFinite(amount)||amount<=0||amount>100000000||Math.round(amount*100)!==amount*100||!label||label.length>300||reference.length>500)throw new Error('Completá fecha, importe y motivo válidos. La referencia es opcional y admite hasta 500 caracteres.');
 if(!['shortage','advance','installment','other'].includes(input.kind))throw new Error('Tipo de novedad inválido.');
 if((!!input.carrierId)===(!!input.companyKey)||input.companyKey&&!['gyv','gavaplast'].includes(input.companyKey))throw new Error('Elegí un responsable: fletero o empresa.');
 return {carrier_id:input.carrierId||null,company_key:input.companyKey||null,origin_date:date,source_dispatch_id:input.sourceDispatchId||null,kind:input.kind,label,reference,amount};
}
export function validateNoveltyDeductions(plan:Row,deductions:Row[],novelties:Row[],otherTerms:Row[]){
 const balances=noveltyBalances(novelties.map(n=>({...n,logistics_freight_novelty_applications:(n.logistics_freight_novelty_applications||[]).filter((a:Row)=>a.dispatch_id!==plan.dispatch_id)})),otherTerms.filter(t=>t.dispatch_id!==plan.dispatch_id)),seen=new Set<string>();
 for(const d of deductions.filter(d=>d.noveltyId)){
  const n=balances.find(n=>n.id===d.noveltyId);
  if(!n||seen.has(n.id)||n.status==='cancelled'||noveltyOwner(n)!==planOwner(plan)||d.kind!=='offset'||Number(d.amount)>n.remainingAmount)throw new Error('La novedad no corresponde al responsable o supera el saldo disponible.');
  seen.add(n.id);
 }
}
