import type {FinancialConcept} from '@/lib/financialConcepts';
import {normalizeFinancialText} from '@/lib/financialConcepts';
import {guidedOptions} from '@/lib/financialClassification/guided';
import type {OperationInput} from './types';

type Person={id:string;full_name:string;person_id?:string};
type Supplier={id:string;name:string};
// Match an existing entity only when the normalized name identifies one record.
// Ambiguous or missing names stay empty for deliberate selection in the form.
export function selectCommonMovement(value:OperationInput,c:FinancialConcept,suppliers:Supplier[],employees:Person[]):OperationInput {
 const option=guidedOptions([c])[0];
 if(!option)throw new Error('La clasificación ya no está habilitada.');
 const name=c.classification?.person||option.detail||c.concept;
 const unique=<T,>(rows:T[],label:(row:T)=>string)=>{const found=rows.filter(row=>normalizeFinancialText(label(row))===normalizeFinancialText(name));return found.length===1?found[0]:undefined;};
 let operation_type:OperationInput['operation_type']='general';
 let detail:OperationInput['detail']={};
 let supplier_id:string|undefined,employee_id:string|undefined,person_id:string|undefined;
 if(option.group==='Pago a proveedor'&&c.movement_type==='Egreso'){
  operation_type='supplier_payment';supplier_id=unique(suppliers,s=>s.name)?.id;
  detail={supplier_allocation_mode:'oldest_first'};
 }else if(option.group==='Pago al personal'&&c.movement_type==='Egreso'){
  operation_type='payroll_payment';const person=unique(employees,e=>e.full_name);employee_id=person?.id;person_id=person?.person_id;
  detail={period:value.effective_date.slice(0,7),payroll_kind:option.concept==='Eventual'?'temporary':'salary'};
 }else if(option.group==='Cobros de clientes'&&c.movement_type==='Ingreso')operation_type='customer_collection';
 else if(option.group==='Impuestos'&&c.movement_type==='Egreso'){operation_type='tax_payment';detail={period:value.effective_date.slice(0,7),organism:name};}
 return {...value,operation_type,financial_concept_id:c.id,concept:c.concept,category:c.category,sub_category:c.sub_category,efe_category:c.efe_category,
  direction:operation_type==='customer_collection'||c.movement_type==='Ingreso'?'ingreso':'egreso',
  supplier_id,employee_id,person_id,order_id:undefined,client_id:undefined,client_payment_id:undefined,
  destination_account_id:undefined,cost_center_id:undefined,route_sheet_id:undefined,allocations:[],detail};
}
