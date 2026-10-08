"use client";
import AdaptiveSelect from "@/components/ui/AdaptiveSelect";
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { createAuthenticatedRequester } from '@/lib/authenticatedRequest';
import { operationLabels,type OperationInput,type OperationType,type OperationTarget } from '@/lib/financialOperations/types';
import { validateOperation } from '@/lib/financialOperations/validation';
import { transferDefaults } from '@/lib/financialOperations/transferDefaults';
import {prepareOperationForm} from '@/lib/financialOperations/formDefaults';
import AccountPicker from './AccountPicker';
import SelectionModal from './SelectionModal';
import OperationAttachments,{uploadOperationAttachments} from './OperationAttachments';
import MissingVoucherModal from './MissingVoucherModal';
import {needsSupplierVoucher} from '@/lib/financialOperations/voucherStatus';
import type {SupplierOption} from '@/lib/financialOperations/supplierFrequency';
import { treasuryToday } from '@/lib/treasuryTransactionTime';
import type { FinancialConcept } from '@/lib/financialConcepts';
import { fieldClass,PersonnelFields,SupplierFields,TaxFields,type EmployeeOption,type PurchaseOption } from './OperationFields';
import {isSpecialType} from '@/lib/financialOperations/specialized';
import SpecialOperationEditor from './SpecialOperationEditor';
import PeopleManager,{type Person} from './PeopleManager';

const request=createAuthenticatedRequester(supabase);
type Account={id:string;name:string;currency:string;is_active:boolean;is_custody?:boolean};
type Receipt={id:string;amount:number;currency:string;cash_transaction_id:string|null;status:string;reversed_at:string|null};
type Order={id:string;legacy_code:string|null;customer_name:string;total_amount:number;client_payments?:Receipt[]};
type Helpers={financialAccounts:Account[];employees:EmployeeOption[];suppliers:SupplierOption[];
  pendingPurchases:PurchaseOption[];costCenters:Array<{id:string;name:string}>;routeSheets:Array<{id:string;run_number:number;delivery_date:string}>;people?:Array<Person&{financial_people_concepts:Array<{concept_id:string}>}>};
type Options={paymentMethods:Array<{id:string;name:string}>;concepts:FinancialConcept[];conceptTypes:Array<{financial_concept_id:string;operation_type:OperationType}>;
 vouchers:Array<{id:string;reference:string|null;counterparty:string|null;voucher_date:string}>};
type Snapshot={transaction:Record<string,unknown>;operation:{id:string;version:number;status:string}|null;planning:boolean;payload:OperationInput;purchases:PurchaseOption[];order:Order|null};
type Props={kind:OperationType;payrollKind?:string;transactionId?:string;sourceAccountId?:string;duplicate?:boolean;mode?:'save'|'link';onClose:()=>void;onSaved:()=>void;requestOverride?:typeof request;preview?:boolean;realDataPreview?:boolean;readOnly?:boolean};
function defaults(kind:OperationType,payrollKind?:string):OperationInput {
 return {operation_type:kind,effective_date:treasuryToday(),account_id:'',direction:kind==='customer_collection'?'ingreso':'egreso',amount:'',payment_method_id:'',concept:'',
  category:kind==='supplier_payment'?'Proveedores':kind==='customer_collection'?'Cobranza':kind==='payroll_payment'?'Sueldos':kind==='tax_payment'?'Impuestos':kind==='internal_transfer'?'Movimiento de cuentas':'Gastos Operativos',
  detail:kind==='payroll_payment'?{period:treasuryToday().slice(0,7),payroll_kind:payrollKind || 'salary'}:kind==='tax_payment'?{period:treasuryToday().slice(0,7)}:kind==='supplier_payment'?{supplier_allocation_mode:'oldest_first'}:{},allocations:[],voucher_ids:[]};
}
export default function OperationEditor(props:Props){
 if(isSpecialType(props.kind))return <SpecialOperationEditor {...props} kind={props.kind}/>;
 return <CoreEditor {...props}/>;
}
function CoreEditor({kind,payrollKind,transactionId,sourceAccountId,duplicate=false,mode='save',onClose,onSaved,requestOverride,preview=false,realDataPreview=false,readOnly=false}:Props) {
 const api=requestOverride || request;
 const [value,setValue]=useState<OperationInput>(()=>defaults(kind,payrollKind));
 const [helpers,setHelpers]=useState<Helpers|null>(null),[options,setOptions]=useState<Options|null>(null);
 const [target,setTarget]=useState<OperationTarget|undefined>(),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [query,setQuery]=useState(''),[orders,setOrders]=useState<Order[]>([]),[chosenOrder,setChosenOrder]=useState<Order|null>(null);
 const [extraPurchases,setExtraPurchases]=useState<PurchaseOption[]>([]),[blocked,setBlocked]=useState('');
 const pending=useRef<{signature:string;key:string}|null>(null);
 const [files,setFiles]=useState<File[]>([]),[choosingOrder,setChoosingOrder]=useState(false),[searchingOrders,setSearchingOrders]=useState(false),[orderSearchError,setOrderSearchError]=useState('');
 const [missingVoucher,setMissingVoucher]=useState(false);
 const dialog=useRef<HTMLDivElement>(null);
 const [managingPeople,setManagingPeople]=useState(false);
 async function refreshPeople(){try{const h=await api('/api/admin/finanzas-data?action=init');setHelpers(h);}catch(e){setError(e instanceof Error?e.message:'No se pudo actualizar personal.');}}
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null;
  dialog.current?.focus();
  const key=(event:KeyboardEvent)=>{
   if(event.target instanceof Element&&event.target.closest('dialog[open]'))return;
   if(event.key==='Escape' && !busy){event.preventDefault();onClose();}
   if(event.key==='Tab'){
    const elements=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]') || []);
    const first=elements[0],last=elements[elements.length-1];
    if(event.shiftKey && (document.activeElement===first || document.activeElement===dialog.current)){event.preventDefault();last?.focus();}
    else if(!event.shiftKey && (document.activeElement===last || document.activeElement===dialog.current)){event.preventDefault();first?.focus();}
   }
  };
  document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);previous?.focus();};
 },[busy,onClose]);
 useEffect(()=>{
  let active=true;
  (async()=>{
   try {
    const [h,o,s]=await Promise.all([api('/api/admin/finanzas-data?action=init'),api('/api/admin/financial-operations'),
      transactionId?api(`/api/admin/financial-operations?transaction_id=${transactionId}`):Promise.resolve(null)]);
    if(!active)return;
    setHelpers(h);setOptions(o);
    if(s){
      const snapshot=s as Snapshot;
      if(snapshot.transaction.treasury_settlement_id)setBlocked('Este movimiento se corrige desde Rendiciones.');
      else if(snapshot.planning)setBlocked('Desconciliá este movimiento desde Planificación antes de corregirlo.');
      else if(snapshot.operation?.status==='cancelled' || snapshot.transaction.reversal_of_transaction_id)setBlocked('Esta operación está anulada y conserva su compensación.');
      else if(snapshot.transaction.register_id)setBlocked('Este movimiento se corrige desde la caja de vendedores.');
      setValue({...snapshot.payload,detail:{...snapshot.payload.detail,...(snapshot.payload.operation_type==='supplier_payment'&&snapshot.payload.detail?.supplier_kind!=='eventual'?{supplier_allocation_mode:duplicate?'oldest_first':snapshot.payload.detail?.supplier_allocation_mode||'documents'}:{})},operation_type:mode==='link'?kind:snapshot.payload.operation_type,
        ...(duplicate?{effective_date:treasuryToday(),order_id:undefined,client_payment_id:undefined,allocations:[],voucher_ids:[],route_sheet_id:undefined}: {})});
      if(!duplicate)setTarget({transaction_id:String(snapshot.transaction.id),operation_id:snapshot.operation?.id,expected_version:snapshot.operation?.version,expected_transaction:snapshot.transaction});
      setExtraPurchases(snapshot.purchases || []);setChosenOrder(duplicate?null:snapshot.order);
    } else {
      const available=h.financialAccounts.filter((a:Account)=>a.is_active&&!a.is_custody);
      const account=available.find((a:Account)=>a.currency==='ARS') || available[0];
      setValue(v=>({...v,account_id:account?.id || '',...(kind==='internal_transfer'?transferDefaults(available,sourceAccountId):{})}));
    }
   }catch(e){if(active)setError(e instanceof Error?e.message:'No se pudo abrir el formulario.');}
   finally{if(active)setLoading(false);}
  })();return()=>{active=false;};
 },[kind,payrollKind,transactionId,sourceAccountId,duplicate,mode,api]);
 useEffect(()=>{
  setOrders([]);setOrderSearchError('');setSearchingOrders(false);
  if(!choosingOrder||query.trim().length<3)return;
  setSearchingOrders(true);
  let active=true;
  const timer=setTimeout(()=>{api(`/api/admin/finanzas-data?action=search-collection-orders&q=${encodeURIComponent(query)}`)
    .then(data=>{if(active)setOrders(data.pendingOrders || []);}).catch(e=>{if(active)setOrderSearchError(e.message);}).finally(()=>{if(active)setSearchingOrders(false);});},300);
  return()=>{active=false;clearTimeout(timer);};
 },[query,api,choosingOrder]);
 const change=(patch:Partial<OperationInput>)=>{setError('');setValue(v=>({...v,...patch}));};
 const account=helpers?.financialAccounts.find(a=>a.id===value.account_id);
 const isTransfer=value.operation_type==='internal_transfer';
 const purchases=[...extraPurchases,...(helpers?.pendingPurchases || [])].filter((p,i,rows)=>rows.findIndex(x=>x.id===p.id)===i && p.currency===account?.currency);
 async function submit(e?:React.FormEvent,allowWithoutVoucher=false){
  e?.preventDefault();setError('');
  if(busy)return;
  if(readOnly){setError('Para guardar operaciones reales falta activar la migración 136.');return;}
  try {
   let prepared=prepareOperationForm(value,options?.paymentMethods || []);
   if(prepared.operation_type==='payroll_payment'&&!prepared.employee_id)throw new Error('Seleccioná un empleado o eventual habilitado. Podés darlo de alta desde este formulario.');
   validateOperation(files.length?{...prepared,voucher_ids:[...(prepared.voucher_ids||[]),"00000000-0000-0000-0000-000000000001"]}:prepared);
   if(needsSupplierVoucher(prepared,files.length)&&!allowWithoutVoucher){setMissingVoucher(true);return;}
   prepared={...prepared,confirm_without_voucher:needsSupplierVoucher(prepared,files.length)&&allowWithoutVoucher};
   setBusy(true);
   if(files.length){const id=await uploadOperationAttachments(files,{...prepared,currency:account?.currency||'ARS'},preview);prepared={...prepared,voucher_ids:[...(prepared.voucher_ids||[]),id]};setValue(v=>({...v,voucher_ids:prepared.voucher_ids}));setOptions(old=>old?{...old,vouchers:[...old.vouchers,{id,reference:files.map(f=>f.name).join(', '),counterparty:null,voucher_date:prepared.effective_date}]}:old);setFiles([]);}
   if(prepared.voucher_ids?.length)setMissingVoucher(false);
   const payload={action:mode,payload:prepared,target};const signature=JSON.stringify(payload);
   if(!pending.current || pending.current.signature!==signature)pending.current={signature,key:crypto.randomUUID()};
   setBusy(true);await api('/api/admin/financial-operations',{method:'POST',body:JSON.stringify({...payload,key:pending.current.key})});
   onClose();onSaved();
  }catch(e){setError(e instanceof Error?e.message:'No se pudo guardar.');}finally{setBusy(false);}
 }
 return <div ref={dialog} tabIndex={-1} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-3" role="dialog" aria-modal="true" aria-label={mode==='link'?'Vincular movimiento':operationLabels[value.operation_type]}>
  <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
   <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">{mode==='link'?'Vincular movimiento':operationLabels[value.operation_type]}</h2><button type="button" disabled={busy} onClick={onClose} className="rounded-lg px-3 py-2 text-sm">Cerrar</button></div>
   {preview && <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Vista local · {realDataPreview?'datos reales en consulta':'datos de ejemplo'}. Guardar solo registra una simulación en esta pantalla.</p>}
   {readOnly && <p className="mb-3 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">Formulario integrado con datos reales. Podés revisar y completar los campos; guardar requiere activar la migración pendiente.</p>}
   {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
   {loading?<p className="py-6 text-sm">Cargando datos actuales…</p>:blocked?<div className="space-y-3"><p className="text-sm">{blocked}</p>{!blocked.includes('anulada') && <a className="text-sm text-brand-700 underline" href={blocked.includes('Rendiciones')?'/admin/rendiciones':blocked.includes('vendedores')?'/vendedores/caja':'/admin/finanzas/planificacion'}>Abrir módulo de origen</a>}</div>:helpers && options?<form onSubmit={submit}><fieldset disabled={busy} className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2">
     <label className="text-xs font-semibold">Fecha<input className={fieldClass} type="date" required disabled={mode==='link'} value={value.effective_date} onChange={e=>change({effective_date:e.target.value})}/></label>
     <AccountPicker label={isTransfer?'Cuenta origen':'Cuenta'} accounts={helpers.financialAccounts.filter(a=>a.is_active&&!a.is_custody)} value={value.account_id} disabled={mode==='link'||busy} onChange={id=>change({account_id:id,allocations:[],client_payment_id:undefined})}/>
     {isTransfer&&<AccountPicker label="Cuenta destino" accounts={helpers.financialAccounts.filter(a=>a.is_active&&!a.is_custody&&a.id!==value.account_id&&a.currency===account?.currency)} value={value.destination_account_id||''} disabled={busy} onChange={id=>change({destination_account_id:id})}/>}
     {value.operation_type==='general' && <label className="text-xs font-semibold">Dirección<AdaptiveSelect searchLabel="Dirección" className={fieldClass} disabled={mode==='link'} value={value.direction} onChange={e=>change({direction:e.target.value as OperationInput['direction']})}><option value="ingreso">Ingreso</option><option value="egreso">Egreso</option></AdaptiveSelect></label>}
     <label className="text-xs font-semibold">Importe {account?.currency}<input className={fieldClass} type="number" required min="0.01" step="0.01" disabled={mode==='link'} value={value.amount} onChange={e=>change({amount:e.target.value,client_payment_id:undefined})}/></label>
    </div>
    {value.operation_type==='supplier_payment' && <SupplierFields value={value} onChange={setValue} suppliers={helpers.suppliers} purchases={purchases} currency={account?.currency}/>}
    {value.operation_type==='payroll_payment' && <PersonnelFields value={value} onChange={setValue} employees={helpers.employees} onManage={preview?undefined:()=>setManagingPeople(true)}/>}
    {value.operation_type==='tax_payment' && <TaxFields value={value} onChange={setValue}/>}
    {value.operation_type==='customer_collection'&&<div className="space-y-2"><span className="text-xs font-semibold">Pedido o cliente</span><div className="flex gap-2"><button type="button" disabled={busy} className={fieldClass+' text-left'} onClick={()=>{setChoosingOrder(true);setQuery('');setOrders([]);}}>{chosenOrder?(chosenOrder.legacy_code||chosenOrder.id.slice(0,8))+' · '+chosenOrder.customer_name:'Seleccionar pedido o cliente'}</button>{chosenOrder&&<button type="button" disabled={busy} className="rounded border px-3 text-xs" onClick={()=>{setChosenOrder(null);change({order_id:undefined,client_payment_id:undefined});}}>Quitar</button>}</div>{value.client_payment_id&&<div className="flex justify-between text-xs"><span>Cobro existente vinculado</span><button type="button" onClick={()=>change({client_payment_id:undefined})}>Quitar vínculo</button></div>}</div>}
    <label className="block text-xs font-semibold">Detalle{['supplier_payment','customer_collection','payroll_payment'].includes(value.operation_type)?' (opcional)':''}<input aria-label="Detalle" className={fieldClass} required={!['supplier_payment','customer_collection','payroll_payment'].includes(value.operation_type)} minLength={2} maxLength={240} value={value.concept} onChange={e=>change({concept:e.target.value})}/></label>
    <label className="block text-xs font-semibold">Observaciones<textarea className={`${fieldClass} h-20 py-2`} value={value.notes || ''} maxLength={4000} onChange={e=>change({notes:e.target.value})}/></label>
    {value.operation_type==='general' && <details className="rounded-lg border border-slate-200 p-3"><summary className="text-sm">Clasificación y referencias</summary><p className="mt-2 text-xs text-slate-500">Categoría y subcategoría agrupan el movimiento en informes; EFE lo ubica en el estado de flujo de efectivo. Centro de costo y hoja de ruta lo relacionan con su actividad.</p><div className="mt-3 grid gap-3 sm:grid-cols-2">
      <label className="text-xs font-semibold">Categoría<input className={fieldClass} required list="operation-categories" value={value.category} onChange={e=>change({category:e.target.value,financial_concept_id:undefined})}/><datalist id="operation-categories">{[...new Set(options.concepts.map(c=>c.category))].map(c=><option key={c} value={c}/>)}</datalist></label>
      <label className="text-xs font-semibold">Subcategoría<input className={fieldClass} value={value.sub_category || ''} onChange={e=>change({sub_category:e.target.value,financial_concept_id:undefined})}/></label>
      <label className="text-xs font-semibold">Clasificación EFE<input className={fieldClass} value={value.efe_category || ''} onChange={e=>change({efe_category:e.target.value,financial_concept_id:undefined})}/></label>
      <label className="text-xs font-semibold">Centro de costo<AdaptiveSelect searchLabel="Centro de costo" className={fieldClass} value={value.cost_center_id || ''} onChange={e=>change({cost_center_id:e.target.value})}><option value="">Sin asignar</option>{helpers.costCenters.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</AdaptiveSelect></label>
      <label className="text-xs font-semibold">Hoja de ruta<AdaptiveSelect searchLabel="Hoja de ruta" className={fieldClass} value={value.route_sheet_id || ''} onChange={e=>change({route_sheet_id:e.target.value})}><option value="">Sin asignar</option>{helpers.routeSheets.map(r=><option key={r.id} value={r.id}>#{r.run_number} · {r.delivery_date}</option>)}</AdaptiveSelect></label>
      <label className="text-xs font-semibold">Beneficiario / referencia<input className={fieldClass} value={value.detail.reference || ''} onChange={e=>change({detail:{...value.detail,reference:e.target.value}})}/></label>
    </div></details>}
    <OperationAttachments files={files} onFilesChange={setFiles} ids={value.voucher_ids||[]} labels={options.vouchers} disabled={busy} onRemove={id=>change({voucher_ids:(value.voucher_ids||[]).filter(v=>v!==id)})}/>
    {value.operation_type==='internal_transfer' && <p className="text-sm text-slate-600">Se registrará una salida de {value.amount || '0'} {account?.currency} y una entrada del mismo importe en la cuenta destino.</p>}
    <div className="flex justify-end gap-2"><button type="button" disabled={busy} onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">Cerrar</button><button disabled={busy || readOnly} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{readOnly?'Guardado pendiente de migración':busy?'Guardando…':mode==='link'?'Confirmar vinculación':'Guardar operación'}</button></div>
   </fieldset></form>:null}
  </div>
  {missingVoucher&&<MissingVoucherModal files={files} onFilesChange={setFiles} busy={busy} error={error} onClose={()=>setMissingVoucher(false)} onSave={without=>{void submit(undefined,without);}}/>}
  {choosingOrder&&<SelectionModal title="Seleccionar pedido o cliente" onClose={()=>setChoosingOrder(false)}><input autoFocus aria-label="Buscar pedido o cliente" className={fieldClass} placeholder="Código de pedido o nombre (al menos 3 caracteres)" value={query} onChange={e=>setQuery(e.target.value)}/>{orderSearchError&&<p role="alert" className="mt-3 text-sm text-red-700">{orderSearchError}</p>}{searchingOrders?<p className="mt-3 text-sm">Buscando…</p>:query.trim().length>=3&&!orders.length&&!orderSearchError?<p className="mt-3 text-sm">Sin coincidencias.</p>:null}<div className="mt-3 space-y-2">{orders.map(o=><button key={o.id} type="button" className="block w-full rounded-lg border p-3 text-left text-sm" onClick={()=>{setChosenOrder(o);change({order_id:o.id,client_payment_id:undefined});setChoosingOrder(false);setOrders([]);setQuery('');}}>{o.legacy_code||o.id.slice(0,8)} · {o.customer_name}</button>)}</div>{chosenOrder&&<div className="mt-4 space-y-2"><p className="text-sm font-semibold">Cobros registrados de {chosenOrder.legacy_code}</p>{chosenOrder.client_payments?.filter(p=>!p.cash_transaction_id&&!p.reversed_at&&p.status==='Aprobado'&&p.currency===account?.currency).map(p=><button key={p.id} type="button" className="block w-full rounded-lg border p-2 text-left text-xs" onClick={()=>{change({client_payment_id:p.id,amount:String(p.amount)});setChoosingOrder(false);}}>Vincular cobro existente: {p.currency} {Number(p.amount).toLocaleString('es-AR')}</button>)}</div>}</SelectionModal>}
  {managingPeople&&<PeopleManager onClose={()=>setManagingPeople(false)} onChanged={()=>{void refreshPeople();}}/>}
 </div>;
}
