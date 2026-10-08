import SupplierDocuments from "./SupplierDocuments";
import SupplierPicker from './SupplierPicker';
import type {SupplierOption} from '@/lib/financialOperations/supplierFrequency';
import AdaptiveSelect from "@/components/ui/AdaptiveSelect";
import type { OperationInput } from '@/lib/financialOperations/types';

export type EmployeeOption = {id:string;full_name:string;base_salary:number;person_id?:string};
export type PurchaseOption = {id:string;supplier_id:string;invoice_number:string;total_amount:number;paid_amount:number;currency:string;created_at?:string;status?:string;purchase_date?:string;document_type?:string;editable_allocation_amount?:string;purchase_order_id?:string;purchase_reception_id?:string;purchase_orders?:{oc_code:string}|null;purchase_receptions?:{delivery_slip_number:string|null;reception_date?:string;purchase_orders?:{oc_code:string}|null}|null};
export function purchaseLabel(p:PurchaseOption){const reception=p.purchase_receptions;const order=p.purchase_orders?.oc_code||reception?.purchase_orders?.oc_code;return [reception?`Recepción ${reception.delivery_slip_number||'sin número de remito'}`:p.invoice_number,order?(/^OC/i.test(order)?order:`OC ${order}`):null,reception&&p.invoice_number?p.invoice_number:null].filter(Boolean).join(" · ");}
export const fieldClass = 'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:ring-2 focus:ring-brand-500/20';
export function PersonnelFields({value,onChange,employees,onManage}:{value:OperationInput;onChange:(value:OperationInput)=>void;employees:EmployeeOption[];onManage?:()=>void}) {
  const detail = (patch:Partial<OperationInput['detail']>)=>onChange({...value,detail:{...value.detail,...patch}});
  return <div className="grid gap-3 sm:grid-cols-2">
    <label className="text-xs font-semibold">Concepto de personal<AdaptiveSelect aria-label="Concepto de personal" className={fieldClass} value={value.detail.payroll_kind || 'salary'} onChange={e=>detail({payroll_kind:e.target.value})}>
      <option value="salary">Sueldo</option><option value="advance">Adelanto</option><option value="temporary">Eventual</option><option value="agreement">Acuerdo</option>
    </AdaptiveSelect></label>
    <label className="text-xs font-semibold">Período<input aria-label="Período laboral" className={fieldClass} type="month" required value={value.detail.period || ''} onChange={e=>detail({period:e.target.value})}/></label>
    <label className="text-xs font-semibold">Empleado o eventual<AdaptiveSelect aria-label="Empleado" required className={fieldClass} value={value.employee_id || ''} onChange={e=>onChange({...value,employee_id:e.target.value,person_id:employees.find(row=>row.id===e.target.value)?.person_id,detail:{...value.detail,beneficiary:''}})}>
      <option value="">Seleccionar persona habilitada</option>{employees.map(row=><option key={row.id} value={row.id}>{row.full_name}</option>)}
    </AdaptiveSelect></label>
    {onManage&&<button type="button" onClick={onManage} className="self-end rounded-lg border border-slate-200 px-3 py-2 text-xs">Alta / habilitar personal</button>}
    {value.detail.payroll_kind==='salary' && value.employee_id && Number(employees.find(e=>e.id===value.employee_id)?.base_salary)>0 && <button type="button" className="self-end rounded-lg border border-slate-200 px-3 py-2 text-xs" onClick={()=>onChange({...value,amount:String(employees.find(e=>e.id===value.employee_id)?.base_salary || '')})}>Usar sueldo base como importe</button>}
  </div>;
}
export function SupplierFields({value,onChange,suppliers,purchases,currency}:{value:OperationInput;onChange:(value:OperationInput)=>void;suppliers:SupplierOption[];purchases:PurchaseOption[];currency?:string}) {
  const eventual=value.detail.supplier_kind==='eventual';
  return <div className="space-y-3">
    <label className="block text-xs font-semibold">Tipo de pago<AdaptiveSelect aria-label="Tipo de pago a proveedor" className={fieldClass} value={eventual?'eventual':'registered'} onChange={e=>{const detail={...value.detail};delete detail.supplier_allocation_mode;onChange({...value,supplier_id:undefined,allocations:[],detail:{...detail,supplier_kind:e.target.value as 'registered'|'eventual',supplier_name:'',...(e.target.value==='registered'?{supplier_allocation_mode:'oldest_first' as const}:{})}});}}>
      <option value="registered">Proveedor registrado · recepción, documento o anticipo</option><option value="eventual">Compra eventual · sin alta de proveedor</option>
    </AdaptiveSelect></label>
    {eventual ? <div className="space-y-2">
      <label className="block text-xs font-semibold">Comercio / proveedor (opcional)<input aria-label="Comercio de la compra eventual" className={fieldClass} maxLength={240} placeholder="Ej.: ferretería" value={value.detail.supplier_name || ''} onChange={e=>onChange({...value,detail:{...value.detail,supplier_name:e.target.value}})}/></label>
      <p className="text-xs text-slate-600">Podés detallar el producto comprado en el detalle de la operación. Se registra el egreso sin crear proveedor, cuenta corriente ni anticipo.</p>
    </div> : <>
    <SupplierPicker suppliers={suppliers} value={value.supplier_id||''} onChange={id=>onChange({...value,supplier_id:id,allocations:[]})}/>
    {value.supplier_id&&<SupplierDocuments key={value.supplier_id} value={value} onChange={onChange} purchases={purchases.filter(p=>p.supplier_id===value.supplier_id)} currency={currency} supplierName={suppliers.find(s=>s.id===value.supplier_id)?.name||'Proveedor'}/>}

    </>}
  </div>;
}
export function TaxFields({value,onChange}:{value:OperationInput;onChange:(value:OperationInput)=>void}) {
  const detail=(patch:Partial<OperationInput['detail']>)=>onChange({...value,detail:{...value.detail,...patch}});
  return <div className="grid gap-3 sm:grid-cols-2">
    <label className="text-xs font-semibold">Organismo<input className={fieldClass} required value={value.detail.organism || ''} onChange={e=>detail({organism:e.target.value})}/></label>
    <label className="text-xs font-semibold">Período<input className={fieldClass} type="month" required value={value.detail.period || ''} onChange={e=>detail({period:e.target.value})}/></label>
    <label className="text-xs font-semibold">Cuota / referencia<input className={fieldClass} value={value.detail.reference || ''} onChange={e=>detail({reference:e.target.value})}/></label>
  </div>;
}
