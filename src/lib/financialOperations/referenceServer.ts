import type { SupabaseClient } from '@supabase/supabase-js';
import { movementCode, movementHref, supplierApplications, type ApplicationReference, type CodedMovement } from './references';
async function all<T>(query: {range:(start:number,end:number)=>PromiseLike<{data:T[]|null;error:unknown}>}): Promise<T[]> {
  const rows:T[]=[];
  for(let offset=0;;offset+=500){const {data,error}=await query.range(offset,offset+499);if(error)throw error;rows.push(...(data||[]));if(!data||data.length<500)return rows;}
}
function one<T>(value:T|T[]|null):T|undefined{return Array.isArray(value)?value[0]:value??undefined;}
export async function supplierReferenceData(db: SupabaseClient, supplierId: string) {
  const [payments,purchases]=await Promise.all([
    all(db.from('supplier_payments').select('*').eq('supplier_id',supplierId).order('id')),
    all(db.from('supplier_purchases').select('id,invoice_number,document_type').eq('supplier_id',supplierId).order('id'))
  ]);
  const allocations:Array<{payment_id:string;purchase_id:string;amount:number|string}>=[],movements:CodedMovement[]=[];
  for(let i=0;i<payments.length;i+=100){
    const chunk=payments.slice(i,i+100);
    try{allocations.push(...await all(db.from('supplier_payment_allocations').select('payment_id,purchase_id,amount').in('payment_id',chunk.map(p=>p.id)).order('id')));}catch(error){const e=error as {code?:string;message?:string};if(!['42P01','PGRST205'].includes(e.code||'')||!e.message?.includes('supplier_payment_allocations'))throw error;}
    const ids=chunk.map(p=>p.cash_transaction_id).filter(Boolean);
    if(ids.length)movements.push(...await all(db.from('cash_transactions').select('*').in('id',ids).order('id')));
  }
  // Direct legacy links remain visible when the payment predates allocation rows.
  const allocated=new Set(allocations.map(a=>a.payment_id));
  for(const p of payments)if(!allocated.has(p.id)&&p.purchase_id)allocations.push({payment_id:p.id,purchase_id:p.purchase_id,amount:p.amount});
  return {payments,movements,...supplierApplications(allocations,payments,purchases,movements)};
}
export async function movementApplications(db: SupabaseClient, rows: Array<CodedMovement & {operation_id?: string | null}>) {
  const result=new Map<string,ApplicationReference[]>();
  for(let i=0;i<rows.length;i+=100){
    const chunk=rows.slice(i,i+100), ids=chunk.map(t=>t.id);
    const [payments,clients]=await Promise.all([
      all(db.from('supplier_payments').select('id,cash_transaction_id,purchase_id,amount,reversed_at').in('cash_transaction_id',ids).order('id')),
      all(db.from('client_payments').select('id,cash_transaction_id,reversed_at,amount,orders(id,legacy_code)').in('cash_transaction_id',ids).order('id'))
    ]);
    const rawAllocations=payments.length?await all(db.from('supplier_payment_allocations').select('payment_id,purchase_id,amount,supplier_purchases(id,invoice_number,document_type)').in('payment_id',payments.map(p=>p.id)).order('id')):[];
    const allocations=rawAllocations.map(a=>({...a,supplier_purchases:one(a.supplier_purchases)}));
    const allocated=new Set(allocations.map(a=>a.payment_id));
    const legacy=payments.filter(p=>p.purchase_id&&!allocated.has(p.id));
    if(legacy.length){const purchases=await all(db.from('supplier_purchases').select('id,invoice_number,document_type').in('id',legacy.map(p=>p.purchase_id)).order('id'));for(const p of legacy)allocations.push({payment_id:p.id,purchase_id:p.purchase_id,amount:p.amount,supplier_purchases:purchases.find(d=>d.id===p.purchase_id)});}
    const refs=supplierApplications(allocations,payments,allocations.flatMap(a=>a.supplier_purchases?[a.supplier_purchases]:[]),chunk);
    for(const p of payments)if(p.cash_transaction_id)result.set(p.cash_transaction_id,[...(result.get(p.cash_transaction_id)||[]),...(refs.byPayment.get(p.id)||[])]);
    for(const p of clients){const order=one(p.orders);if(!p.reversed_at&&order){const list=result.get(p.cash_transaction_id)||[];list.push({id:order.id,code:order.legacy_code||order.id,kind:'Pedido',href:`/admin/finanzas?tab=flow&order=${order.id}`,amount:Number(p.amount)});result.set(p.cash_transaction_id,list);}}
    const ops=chunk.map(t=>t.operation_id).filter(Boolean);
    if(ops.length){const vouchers=await all(db.from('operation_vouchers').select('operation_id,voucher_id,treasury_vouchers(id,reference)').in('operation_id',ops).order('operation_id').order('voucher_id'));
      for(const t of chunk)for(const v of vouchers){const voucher=one(v.treasury_vouchers);if(v.operation_id===t.operation_id&&voucher){const list=result.get(t.id)||[];list.push({id:v.voucher_id,code:voucher.reference||v.voucher_id,kind:'Comprobante',href:`/admin/comprobantes-tesoreria?voucher=${v.voucher_id}`});result.set(t.id,list);}}}
  }
  return result;
}
export async function voucherMovementReferences(db: SupabaseClient, voucherIds: string[]) {
  const result=new Map<string,ApplicationReference[]>();
  for(let i=0;i<voucherIds.length;i+=100){
    let links;
    try{links=await all(db.from('operation_vouchers').select('operation_id,voucher_id').in('voucher_id',voucherIds.slice(i,i+100)).order('operation_id').order('voucher_id'));}catch(error){const e=error as {code?:string;message?:string};if(['42P01','PGRST205'].includes(e.code||'')&&e.message?.includes('operation_vouchers'))return result;throw error;}
    const ops=[...new Set(links.map(l=>l.operation_id))];
    if(!ops.length)continue;
    const rows=await all(db.from('cash_transactions').select('*').in('operation_id',ops).order('id'));
    for(const link of links)result.set(link.voucher_id,[...(result.get(link.voucher_id)||[]),...rows.filter(t=>t.operation_id===link.operation_id).map(t=>({id:t.id,code:movementCode(t),kind:t.type==='ingreso'?'Cobro':'Pago',href:movementHref(t.id)}))]);
  }
  return result;
}
