import { operationLabels, type OperationInput } from './types';
import { OperationError } from './validation';
import { prepareTransfer } from './transferInput';

// Existing ledgers still require a method FK, although movements do not ask for it.
export function movementMethod(methods: Array<{id:string;name:string}>, current?:string) {
  if (current && methods.some(m=>m.id===current)) return current;
  const method=methods.find(m=>m.name.trim().toLowerCase()==='transferencia');
  if (!method) throw new OperationError('Falta configurar el medio técnico Transferencia.');
  return method.id;
}
export function prepareMovement(input:OperationInput, methods:Array<{id:string;name:string}>) {
  const value={...input,payment_method_id:movementMethod(methods,input.payment_method_id)};
  if(value.operation_type==='internal_transfer')return prepareTransfer(value,methods);
  const category={supplier_payment:'Proveedores',customer_collection:'Cobranza',payroll_payment:'Sueldos',operating_expense:'Gastos Operativos'}[value.operation_type as 'supplier_payment'];
  if(!category)return value;
  return {...value,category,financial_concept_id:undefined,
    concept:value.concept.trim() || (value.operation_type==='operating_expense'?'':operationLabels[value.operation_type]),
    efe_category:value.operation_type==='supplier_payment'?'Pago a proveedores':value.efe_category};
}
