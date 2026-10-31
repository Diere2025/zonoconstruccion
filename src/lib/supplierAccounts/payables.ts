import { isAccountDate, isUuid, openingAmount } from '../supplierAccount';
export type PayableItem={item_key:string;purchase_id:string;bill_id:string|null;installment_number:number;reference:string|null;document_type:string;document_condition:string;entry_date:string;due_date:string|null;currency:string;amount:number|string;document_total:number|string;cash_applied:number|string;credit_applied:number|string;included:boolean;pending_amount:number|string|null;needs_allocation:boolean};
const cents=(value:number|string)=>{const number=Number(value);if(!Number.isFinite(number))throw new Error('La partida contiene un importe inválido. Revisá su documento de origen.');return Math.round(number*100);};
export function payableSummary(items:PayableItem[],day:string){
 if(!isAccountDate(day))throw new Error('Fecha de vencimientos inválida.');
 const totals={ARS:{pending:0,overdue:0,dueToday:0,noDueDate:0,unassigned:0},USD:{pending:0,overdue:0,dueToday:0,noDueDate:0,unassigned:0}};
 const documents=new Map<string,{total:number;settled:number;parts:number;currency:'ARS'|'USD';unassigned:boolean}>();
 for(const item of items){if(!item.included)continue;if(!['ARS','USD'].includes(item.currency))throw new Error('Moneda de partida no soportada.');
  const currency=item.currency as 'ARS'|'USD',total=cents(item.document_total),settled=cents(item.cash_applied)+cents(item.credit_applied);
  const prior=documents.get(item.purchase_id);documents.set(item.purchase_id,{total,settled,parts:(prior?.parts||0)+cents(item.amount),currency,unassigned:(prior?.unassigned||false)||item.needs_allocation});
  if(item.pending_amount===null)continue;
  const pending=cents(item.pending_amount);
  if(!item.due_date)totals[currency].noDueDate+=pending;
  else if(item.due_date<day)totals[currency].overdue+=pending;
  else if(item.due_date===day)totals[currency].dueToday+=pending;
 }
 const inconsistencies:string[]=[];
 for(const [id,doc] of documents){const pending=Math.max(0,doc.total-doc.settled);totals[doc.currency].pending+=pending;if(doc.unassigned)totals[doc.currency].unassigned+=pending;if(doc.parts!==doc.total)inconsistencies.push(id);}
 for(const currency of ['ARS','USD'] as const)for(const key of Object.keys(totals[currency]) as Array<keyof typeof totals.ARS>)totals[currency][key]/=100;
 return {totals,inconsistencies};
}
export function validateBillSchedule(body:unknown){
 const value=body as {requestId:string;billId:string;signature:string;reason:string;installments:Array<{dueDate:string;amount:unknown}>};
 if(!value||!isUuid(value.requestId)||!isUuid(value.billId)||typeof value.signature!=='string'||!/^[a-f0-9]{32}$/.test(value.signature)||typeof value.reason!=='string'||value.reason.trim().length<3||value.reason.length>2000||!Array.isArray(value.installments)||value.installments.length>60)throw new Error('Completá el plan y el motivo del cambio.');
 const installments=value.installments.map(item=>{if(!item||!isAccountDate(item.dueDate))throw new Error('Fecha de cuota inválida.');const amount=openingAmount(item.amount);if(amount<=0)throw new Error('El importe de cada cuota debe ser positivo.');return {dueDate:item.dueDate,amount:amount.toFixed(2)};});
 return {requestId:value.requestId,payload:{billId:value.billId,signature:value.signature,reason:value.reason.trim(),installments}};
}
