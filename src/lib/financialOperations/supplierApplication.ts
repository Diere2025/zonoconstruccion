import type {OperationInput} from './types';
import type {FinancialConcept} from '@/lib/financialConcepts';
import {selectCommonMovement} from './commonMovement';
import {guidedOptions} from '@/lib/financialClassification/guided';

/** Change the application form, preserving the same cash movement and its money. */
export function supplierApplicationInput(value:OperationInput,concepts:FinancialConcept[],suppliers:Array<{id:string;name:string}>):OperationInput{
 if(value.operation_type!=='general'||value.direction!=='egreso')throw new Error('Elegí un egreso general para aplicar a proveedor.');
 const concept=concepts.find(c=>c.id===value.financial_concept_id);
 const matched=concept&&guidedOptions([concept])[0]?.group==='Pago a proveedor'?selectCommonMovement(value,concept,suppliers,[]):null;
 return {...value,operation_type:'supplier_payment',supplier_id:matched?.supplier_id,allocations:[],
  financial_concept_id:matched?.financial_concept_id,category:matched?.category||'Proveedores',sub_category:matched?.sub_category||'',efe_category:matched?.efe_category||'Pago a proveedores',
  detail:{...value.detail,supplier_kind:'registered',supplier_allocation_mode:'documents'}};
}
