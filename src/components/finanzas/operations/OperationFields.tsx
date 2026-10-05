import AdaptiveSelect from "@/components/ui/AdaptiveSelect";
import type { OperationInput } from '@/lib/financialOperations/types';

export type EmployeeOption = {id:string;full_name:string;base_salary:number;person_id?:string};
export type PurchaseOption = {id:string;supplier_id:string;invoice_number:string;total_amount:number;paid_amount:number;currency:string};
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
export function SupplierFields({value,onChange,suppliers,purchases}:{value:OperationInput;onChange:(value:OperationInput)=>void;suppliers:Array<{id:string;name:string}>;purchases:PurchaseOption[]}) {
  const allocations=value.allocations || [];
  const update=(id:string,amount:string)=>onChange({...value,allocations:[...allocations.filter(a=>a.purchase_id!==id),...(amount && Number(amount)>0?[{purchase_id:id,amount}]:[])]});
  const visible=purchases.filter(p=>p.supplier_id===value.supplier_id);
  const remainder=Number(value.amount || 0)-allocations.reduce((sum,a)=>sum+Number(a.amount),0);
  const eventual=value.detail.supplier_kind==='eventual';
  return <div className="space-y-3">
    <label className="block text-xs font-semibold">Tipo de pago<AdaptiveSelect aria-label="Tipo de pago a proveedor" className={fieldClass} value={eventual?'eventual':'registered'} onChange={e=>onChange({...value,supplier_id:undefined,allocations:[],detail:{...value.detail,supplier_kind:e.target.value as 'registered'|'eventual',supplier_name:''}})}>
      <option value="registered">Proveedor registrado · facturas o anticipo</option><option value="eventual">Compra eventual · sin alta de proveedor</option>
    </AdaptiveSelect></label>
    {eventual ? <div className="space-y-2">
      <label className="block text-xs font-semibold">Comercio / proveedor (opcional)<input aria-label="Comercio de la compra eventual" className={fieldClass} maxLength={240} placeholder="Ej.: ferretería" value={value.detail.supplier_name || ''} onChange={e=>onChange({...value,detail:{...value.detail,supplier_name:e.target.value}})}/></label>
      <p className="text-xs text-slate-600">Detallá el producto comprado en el detalle de la operación. Se registra el egreso sin crear proveedor, cuenta corriente ni anticipo.</p>
    </div> : <>
    <label className="block text-xs font-semibold">Proveedor<AdaptiveSelect aria-label="Proveedor de la operación" className={fieldClass} required value={value.supplier_id || ''} onChange={e=>onChange({...value,supplier_id:e.target.value,allocations:[]})}>
      <option value="">Seleccionar proveedor</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
    </AdaptiveSelect></label>
    {value.supplier_id && <div className="space-y-2"><p className="text-xs text-slate-600">Distribución del pago. Dejá sin imputar el importe que corresponde a un anticipo.</p>
      {visible.map(p=><label className="flex flex-wrap items-center justify-between gap-2 text-xs" key={p.id}>
        <span>{p.invoice_number} · {p.currency} · pendiente {Number(p.total_amount-p.paid_amount).toLocaleString('es-AR')}</span>
        <input aria-label={`Imputar a ${p.invoice_number}`} className={`${fieldClass} max-w-40`} type="number" min="0" step="0.01" value={allocations.find(a=>a.purchase_id===p.id)?.amount || ''} onChange={e=>update(p.id,e.target.value)}/>
      </label>)}
      {!visible.length && <p className="text-xs text-slate-500">Sin documentos pendientes: el pago quedará como anticipo.</p>}
      <p className={`text-sm font-semibold ${remainder<0?'text-red-600':'text-slate-700'}`}>Anticipo sin imputar: {remainder.toLocaleString('es-AR',{minimumFractionDigits:2})}</p>
    </div>}
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
