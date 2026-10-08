import type {OperationInput,OperationSummary} from './types';
import {OperationError} from './validation';
export function needsSupplierVoucher(input:OperationInput,queuedFiles=0){return input.operation_type==='supplier_payment'&&!input.voucher_ids?.length&&queuedFiles===0;}
export function requireSupplierVoucherConfirmation(input:OperationInput){
 if(input.confirm_without_voucher!==undefined&&typeof input.confirm_without_voucher!=='boolean')throw new OperationError('Confirmación de comprobante inválida.');
 if(needsSupplierVoucher(input)&&input.confirm_without_voucher!==true)throw new OperationError('Confirmá si querés guardar el pago sin comprobante.');
}
export function supplierVoucherPending(tx:{financial_operations?:OperationSummary|null;reversal_of_transaction_id?:string|null}){
 const op=tx.financial_operations;
 return op?.operation_type==='supplier_payment'&&op.status==='posted'&&!tx.reversal_of_transaction_id&&Array.isArray(op.operation_vouchers)&&op.operation_vouchers.length===0;
}
