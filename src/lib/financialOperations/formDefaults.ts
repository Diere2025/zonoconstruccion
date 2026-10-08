import {operationLabels,type OperationInput} from './types';
import {OperationError} from './validation';
import {prepareTransfer} from './transferInput';

type Method={id:string;name:string};
// Existing ledger tables require this FK. New forms do not ask for sales payment terms.
export function withInternalPaymentMethod<T extends {payment_method_id:string}>(input:T,methods:Method[]):T {
 if(input.payment_method_id)return input;
 const method=methods.find(m=>m.name.trim().toLowerCase()==='transferencia');
 if(!method)throw new OperationError('Falta configurar el medio interno Transferencia para registrar movimientos.');
 return {...input,payment_method_id:method.id};
}
export function prepareOperationForm(input:OperationInput,methods:Method[]):OperationInput {
 const p=prepareTransfer(withInternalPaymentMethod(input,methods),methods);
 const categories:Partial<Record<OperationInput['operation_type'],string>>={supplier_payment:'Proveedores',customer_collection:'Cobranza',payroll_payment:'Sueldos',operating_expense:'Gastos Operativos'};
 const category=categories[p.operation_type];
 if(!category)return p;
 const optional=['supplier_payment','customer_collection','payroll_payment'].includes(p.operation_type);
 const {beneficiary,reference,...detail}=p.detail;
 void beneficiary;void reference;
 return {...p,category,concept:optional&&!p.concept.trim()?operationLabels[p.operation_type]:p.concept,
  financial_concept_id:undefined,sub_category:undefined,cost_center_id:undefined,route_sheet_id:undefined,
  efe_category:p.operation_type==='supplier_payment'?'Pago a Proveedores':undefined,
  ...(p.operation_type==='operating_expense'?{person_id:undefined}:{}),
  ...(p.operation_type==='supplier_payment'&&p.detail.supplier_allocation_mode==='oldest_first'?{allocations:[]}:{}),
  detail};
}
