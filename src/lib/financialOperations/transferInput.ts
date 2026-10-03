import type {OperationInput} from './types';
import {OperationError} from './validation';

// Legacy cash rows require a method FK; it is technical metadata for a transfer.
export function prepareTransfer(input:OperationInput,methods:Array<{id:string;name:string}>):OperationInput {
 if(input.operation_type!=='internal_transfer')return input;
 const method=methods.find(m=>m.name.trim().toLowerCase()==='transferencia');
 if(!method)throw new OperationError('Falta configurar el medio técnico Transferencia.');
 return {...input,payment_method_id:method.id,direction:'egreso',category:'Movimiento de cuentas',
  sub_category:'Movimiento de cuentas',efe_category:'Fondos a Rendir / Movimientos',
  financial_concept_id:undefined,cost_center_id:undefined,route_sheet_id:undefined,
  employee_id:undefined,person_id:undefined,supplier_id:undefined,order_id:undefined,client_payment_id:undefined,
  detail:{},allocations:[]};
}
