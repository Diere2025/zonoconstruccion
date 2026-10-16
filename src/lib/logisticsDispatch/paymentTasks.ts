import {closureMessage,type Liquidation} from './liquidation';
type Row=Record<string,any>;
export type PaymentTask={id:string;dispatchId:string;assigneeId:string|null;assigneeName:string;title:string;summary:string;amount:number|null;status:'pending'|'completed';createdAt:string;completedAt?:string;movementId?:string};
export function paymentTask(row:Row,fee:Liquidation,recipient:Row|undefined):PaymentTask{
 if(row.status!=='completed'||fee.status!=='ready'||row.paymentState?.liquidated)throw new Error('La tarea requiere una salida cerrada con importe aprobado y pendiente de pago.');
 const header=Array.isArray(row.logistics_dispatches)?row.logistics_dispatches[0]:row.logistics_dispatches;
 return {id:crypto.randomUUID(),dispatchId:row.dispatch_id,assigneeId:recipient?.id||null,assigneeName:recipient?.name||'Administración · responsable pendiente',title:'Revisar y pagar flete · '+header.code,summary:closureMessage(row,fee),amount:fee.total,status:'pending',createdAt:new Date().toISOString()};
}
