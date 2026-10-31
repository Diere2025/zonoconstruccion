import {isAccountDate,isUuid,openingAmount} from '../supplierAccount';
export type OpeningLine={reference:string;currency:'ARS'|'USD';amount:string;condition:'facturado'|'por_remito'|'sin_detalle';documentDate:string;dueDate:string;evidence:string};
export function validateOpeningDetail(body:{supplierId:unknown;requestId:unknown;signature:unknown;reason:unknown;items:unknown}){
 if(!isUuid(body.supplierId)||!isUuid(body.requestId)||typeof body.signature!=='string'||!/^[a-f0-9]{32}$/.test(body.signature)||typeof body.reason!=='string'||body.reason.trim().length<3||body.reason.length>2000||!Array.isArray(body.items)||body.items.length>500)throw new Error('Completá el motivo y elegí hasta 500 partidas.');
 const items=body.items.map((item:OpeningLine)=>{
  if(!item||typeof item.reference!=='string'||!item.reference.trim()||item.reference.length>200||typeof item.evidence!=='string'||item.evidence.trim().length<3||item.evidence.length>2000||!['ARS','USD'].includes(item.currency)||!['facturado','por_remito','sin_detalle'].includes(item.condition))throw new Error('Cada partida requiere referencia, moneda y respaldo.');
  if((item.documentDate!==''&&!isAccountDate(item.documentDate))||(item.dueDate!==''&&!isAccountDate(item.dueDate)))throw new Error('Fecha de partida inválida.');
  const amount=openingAmount(item.amount);if(amount===0||Math.abs(amount)>=1e12)throw new Error('El importe de cada partida debe ser distinto de cero.');
  return {...item,reference:item.reference.trim(),evidence:item.evidence.trim(),amount:amount.toFixed(2)};
 });
 return {supplierId:body.supplierId,signature:body.signature,reason:body.reason.trim(),items};
}
