import {movementCode,movementHref} from '@/lib/financialOperations/references';
import {movementApplications} from '@/lib/financialOperations/referenceServer';
import {requireSupplierVoucherConfirmation} from '@/lib/financialOperations/voucherStatus';
import { NextResponse } from 'next/server';
import { financialContext,financialMutationContext } from '@/lib/financialOperations/server';
import { isUuid, OperationError, validateOperation } from '@/lib/financialOperations/validation';
import {prepareOperationForm} from '@/lib/financialOperations/formDefaults';
import {specialTypes} from '@/lib/financialOperations/specialized';
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

function failure(error: unknown) {
  const code = (error as {code?:string})?.code;
  const status = error instanceof OperationError ? error.status : code === '42501' ? 403
    : ['40001','23505'].includes(code || '') ? 409 : ['42P01','42703','PGRST202','PGRST205'].includes(code || '') ? 503 : 400;
  const message = status === 503 && !(error instanceof OperationError) ? 'Falta habilitar el núcleo de operaciones financieras en la base.'
    : error instanceof Error ? error.message : (error as {message?:string})?.message || 'No se pudo guardar la operación.';
  return NextResponse.json({error:message},{status,headers:{'Cache-Control':'no-store'}});
}
export async function GET(request: Request) {
  try {
    const {db} = await financialContext(request);
    const url = new URL(request.url), id = url.searchParams.get('transaction_id');
    const orderId=url.searchParams.get('order_id');
    if(orderId){
      if(!isUuid(orderId))throw new OperationError('Pedido inválido.');
      const order=await db.from('orders').select('id,legacy_code,customer_name,total_amount').eq('id',orderId).single();if(order.error)throw order.error;
      const payments=[];
      for(let offset=0;;offset+=500){const page=await db.from('client_payments').select('*').eq('order_id',orderId).order('id').range(offset,offset+499);if(page.error)throw page.error;payments.push(...(page.data||[]));if(!page.data||page.data.length<500)break;}
      const ids=[...new Set(payments.map(p=>p.cash_transaction_id).filter(Boolean))];
      const movements:Array<{id:string;type:string;movement_code?:string|null}>=[];
      for(let i=0;i<ids.length;i+=100){const page=await db.from('cash_transactions').select('*').in('id',ids.slice(i,i+100));if(page.error)throw page.error;movements.push(...(page.data||[]));}
      return NextResponse.json({order:order.data,applications:payments.filter(p=>!p.reversed_at&&p.status==='Aprobado').map(p=>{const tx=movements.find(t=>t.id===p.cash_transaction_id);return {id:p.id,code:tx?movementCode(tx):`REC-${p.id.toUpperCase()}`,kind:tx?'Cobro':'Recibo',href:tx?movementHref(tx.id):'',amount:Number(p.amount)};})},{headers:{'Cache-Control':'no-store'}});
    }
    const purchaseId=url.searchParams.get('purchase_id');
    if(purchaseId){
      if(!isUuid(purchaseId))throw new OperationError('Compra inválida.');
      const payments=[];
      for(let offset=0;;offset+=500){
        const result=await db.from('supplier_payment_allocations').select('amount,payment:supplier_payments(id,cash_transaction_id,amount,currency,created_at,notes,reversed_at,payment_methods(name))').eq('purchase_id',purchaseId).order('payment_id').range(offset,offset+499);
        if(result.error && offset===0 && ['42P01','PGRST205'].includes(result.error.code) && /supplier_payment_allocations/.test(result.error.message)){
          const legacy=await db.from('supplier_payments').select('id,cash_transaction_id,amount,currency,created_at,notes,payment_methods(name)').eq('purchase_id',purchaseId).order('created_at');
          if(legacy.error)throw legacy.error;
          payments.push(...(legacy.data||[]));break;
        }
        if(result.error)throw result.error;
        for(const row of result.data || []){
          const payment=Array.isArray(row.payment)?row.payment[0]:row.payment;
          if(payment)payments.push({...payment,total_payment_amount:payment.amount,amount:row.amount});
        }
        if(!result.data || result.data.length<500)break;
      }
      const ids=[...new Set(payments.map(p=>p.cash_transaction_id).filter(Boolean))];
      const movements=[];
      for(let i=0;i<ids.length;i+=100){const result=await db.from('cash_transactions').select('*').in('id',ids.slice(i,i+100));if(result.error)throw result.error;movements.push(...(result.data||[]));}
      for(const p of payments){const tx=movements.find(t=>t.id===p.cash_transaction_id);Object.assign(p,{code:tx?movementCode(tx):`PAG-${p.id.toUpperCase()}`,href:tx?movementHref(tx.id):''});}
      payments.sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)));
      return NextResponse.json({payments},{headers:{'Cache-Control':'no-store'}});
    }
    if (id) {
      if (!isUuid(id)) throw new OperationError('Movimiento inválido.');
      const result = await db.rpc('financial_operation_snapshot',{p_transaction_id:id});
      if (result.error) throw result.error;
      const snapshot = result.data;
      snapshot.applications=(await movementApplications(db,[snapshot.transaction])).get(id)||[];
      snapshot.code=movementCode(snapshot.transaction);
      snapshot.payload.person_id=snapshot.operation?.person_id || undefined;
      const receipt=snapshot.payload.operation_type==='customer_collection'?await db.from('client_payments').select('client_id,order_id,id').eq('cash_transaction_id',id).is('reversed_at',null).order('order_id',{nullsFirst:false}).limit(1).maybeSingle():{data:null,error:null};
      if(receipt.error)throw receipt.error;
      if(snapshot.payload.operation_type==='customer_collection'&&receipt.data){snapshot.payload.client_id=receipt.data.client_id;snapshot.payload.order_id=receipt.data.order_id||undefined;snapshot.payload.client_payment_id=receipt.data.order_id?receipt.data.id:undefined;}
      const client=snapshot.payload.client_id?await db.from('clients').select('id,business_name').eq('id',snapshot.payload.client_id).single():{data:null,error:null};
      if(client.error)throw client.error;
      const purchaseIds = (snapshot.payload.allocations || []).map((row:{purchase_id:string})=>row.purchase_id);
      const [purchases,order] = await Promise.all([
        purchaseIds.length ? db.from('supplier_purchases').select('id,supplier_id,invoice_number,total_amount,paid_amount,currency,created_at,purchase_date,document_type,purchase_order_id,purchase_reception_id,purchase_orders(oc_code),purchase_receptions(delivery_slip_number,reception_date,purchase_orders(oc_code))').in('id',purchaseIds) : Promise.resolve({data:[],error:null}),
        snapshot.payload.order_id ? db.from('orders').select('id,legacy_code,customer_name,total_amount,client_payments(id,amount,currency,status,cash_transaction_id,reversed_at)').eq('id',snapshot.payload.order_id).single() : Promise.resolve({data:null,error:null})
      ]);
      if (purchases.error || order.error) throw purchases.error || order.error;
      return NextResponse.json({...snapshot,purchases:(purchases.data||[]).map(p=>({...p,editable_allocation_amount:snapshot.payload.allocations?.find((a:{purchase_id:string;amount:string})=>a.purchase_id===p.id)?.amount||'0'})),order:order.data,client:client.data},{headers:{'Cache-Control':'no-store'}});
    }
    const [methods,vouchers,conceptTypes] = await Promise.all([
      db.from('payment_methods').select('id,name').order('name'),
      db.from('treasury_vouchers').select('id,reference,counterparty,voucher_date,amount,currency').order('voucher_date',{ascending:false}).limit(100),
      (async()=>{
        const data=[];
        for(let offset=0;;offset+=500){
          const page=await db.from('financial_concept_operation_types').select('financial_concept_id,operation_type').order('financial_concept_id').order('operation_type').range(offset,offset+499);
          if(page.error)return {data:null,error:page.error};
          data.push(...(page.data||[]));
          if(!page.data||page.data.length<500)return {data,error:null};
        }
      })()
    ]);
    if(methods.error || vouchers.error)throw methods.error || vouchers.error;
    const legacyPreview=url.searchParams.get('preview')==='real' && conceptTypes.error && ['42P01','PGRST205'].includes(conceptTypes.error.code) && /financial_concept_operation_types/.test(conceptTypes.error.message);
    if(conceptTypes.error && !legacyPreview)throw conceptTypes.error;
    const concepts = [];
    for(let offset=0;;offset+=500) {
      const page=await db.from('financial_concepts').select('*').eq('is_active',true).order('concept').order('id').range(offset,offset+499);
      if(page.error)throw page.error;
      concepts.push(...(page.data || []));
      if(!page.data || page.data.length<500)break;
    }
    const inferredTypes=concepts.map(c=>({financial_concept_id:c.id,operation_type:
      ['Proveedores','Proveedores (Deuda)','Insumo de Producto'].includes(c.category)?'supplier_payment':c.category==='Sueldos'?'payroll_payment':['Recaudación','Cobranza'].includes(c.category) && c.sub_category!=='Cambio Entregas'?'customer_collection':['Impuestos','IIGG'].includes(c.category)?'tax_payment':c.category==='Movimiento de cuentas'?'internal_transfer':c.movement_type==='Egreso'?'operating_expense':'general'}));
    const disabledConcepts=new Set<string>();
    for(let offset=0;;offset+=500){const page=await db.from('financial_people_concepts').select('concept_id,person:financial_people(is_active)').order('id').range(offset,offset+499);if(page.error)throw page.error;for(const link of page.data||[]){const person=Array.isArray(link.person)?link.person[0]:link.person;if(person&&!person.is_active)disabledConcepts.add(link.concept_id);}if((page.data||[]).length<500)break;}
    return NextResponse.json({paymentMethods:methods.data,vouchers:vouchers.data,concepts:concepts.filter(c=>!disabledConcepts.has(c.id)),conceptTypes:legacyPreview?inferredTypes:conceptTypes.data},{headers:{'Cache-Control':'no-store'}});
  } catch(error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body || !['save','cancel','link'].includes(body.action) || !isUuid(body.key)) throw new OperationError('Solicitud inválida.');
    const {db,actor} = await (body.action==='cancel'?financialContext(request,true):financialMutationContext(request));
    if (body.action !== 'cancel') {
      if(specialTypes.includes(body.payload?.operation_type))throw new OperationError('Usá el formulario específico de esta familia.');
      if(body.payload&&typeof body.payload==='object'&&typeof body.payload.concept==='string'&&body.payload.detail&&typeof body.payload.detail==='object'&&!Array.isArray(body.payload.detail)){
        let methods:Array<{id:string;name:string}>=[];
        if(!body.payload.payment_method_id||body.payload.operation_type==='internal_transfer'){
          const result=await db.from('payment_methods').select('id,name').order('id');
          if(result.error)throw result.error;
          methods=result.data||[];
        }
        body.payload=prepareOperationForm(body.payload,methods);
      }
      validateOperation(body.payload);
      requireSupplierVoucherConfirmation(body.payload);
    }
    if (body.target && (!isUuid(body.target.transaction_id)
      || (body.target.operation_id && !isUuid(body.target.operation_id))
      || (body.target.expected_version !== undefined && (!Number.isInteger(body.target.expected_version) || body.target.expected_version < 1)))) throw new OperationError('Referencia de edición inválida.');
    if (body.action !== 'save' && !body.target) throw new OperationError('Elegí el movimiento.');
    if (body.action === 'cancel' && (typeof body.reason !== 'string' || body.reason.trim().length < 3 || body.reason.length > 1000)) throw new OperationError('Indicá el motivo de anulación.');
    if(body.action==='cancel'&&body.target.operation_id){
      const op=await db.from('financial_operations').select('operation_type').eq('id',body.target.operation_id).single();if(op.error)throw op.error;
      if(specialTypes.includes(op.data.operation_type)){
        if(!Number.isInteger(body.target.expected_version))throw new OperationError('Actualizá la operación antes de anularla.');
        const cancelled=await db.rpc('cancel_special_financial_operation',{p_actor:actor,p_key:body.key,p_operation:body.target.operation_id,p_version:body.target.expected_version,p_reason:body.reason});if(cancelled.error)throw cancelled.error;
        return NextResponse.json({result:cancelled.data},{headers:{'Cache-Control':'no-store'}});
      }
    }
    const {data,error} = await db.rpc(body.action==='cancel'?'mutate_financial_operation':'save_financial_operation',{
      p_actor:actor,p_key:body.key,p_action:body.action,p_payload:body.payload || {},p_target:body.target || {},p_reason:body.reason || ''
    });
    if (error) throw error;
    return NextResponse.json({result:data},{headers:{'Cache-Control':'no-store'}});
  } catch(error) { return failure(error); }
}
