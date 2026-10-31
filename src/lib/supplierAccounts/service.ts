import {isAccountDate,isUuid,openingAmount} from '../supplierAccount';
export function validateSupplierService(body:Record<string,unknown>){
 if(!isUuid(body.id)||!isUuid(body.requestId)||!isUuid(body.supplierId)||typeof body.reason!=='string'||body.reason.trim().length<3||body.reason.length>2000)throw new Error('Completá proveedor, comprobante y motivo.');
 const base={id:body.id,requestId:body.requestId,supplierId:body.supplierId,reason:body.reason.trim()};
 if(body.void===true){if(!Number.isSafeInteger(body.version)||Number(body.version)<1)throw new Error('Versión de comprobante inválida.');return {...base,void:true,version:body.version};}
 if(!['Factura','Nota de Débito','Nota de Crédito'].includes(String(body.type))||!['ARS','USD'].includes(String(body.currency))||!isAccountDate(body.date)||typeof body.dueDate!=='string'||body.dueDate!==''&&!isAccountDate(body.dueDate)||body.linkedPurchaseId!==''&&!isUuid(body.linkedPurchaseId))throw new Error('Tipo, moneda, fechas o documento relacionado inválidos.');
 for(const [key,min,max] of [['number',1,100],['description',3,2000],['evidence',3,2000]] as const)if(typeof body[key]!=='string'||body[key].trim().length<min||body[key].length>max)throw new Error('Completá número, descripción y respaldo.');
 if(!Array.isArray(body.lines)||!body.lines.length||body.lines.length>100)throw new Error('Ingresá entre 1 y 100 líneas de servicio.');
 let calculated=0;const lines=body.lines.map((line:{description:unknown;quantity:unknown;unitPrice:unknown;vat:unknown})=>{
  if(!line||typeof line.description!=='string'||!line.description.trim()||line.description.length>500||!['number','string'].includes(typeof line.quantity)||!['number','string'].includes(typeof line.vat))throw new Error('Línea de servicio inválida.');
  const quantity=Number(line.quantity),unitPrice=openingAmount(line.unitPrice),vat=Number(line.vat);
  if(!Number.isFinite(quantity)||quantity<=0||quantity>=1e9||Math.abs(quantity*1000-Math.round(quantity*1000))>0.001||unitPrice<0||unitPrice>=1e12||!Number.isFinite(vat)||vat<0||vat>100)throw new Error('Cantidad, precio o IVA inválidos.');
  const net=Math.round(quantity*unitPrice*100);calculated+=net+Math.round(net*vat/100);return {description:line.description.trim(),quantity:String(quantity),unitPrice:unitPrice.toFixed(2),vat:String(vat)};
 });
 const total=openingAmount(body.total);if(total<=0||total>=1e12||Math.round(total*100)!==calculated)throw new Error('Las líneas con IVA deben sumar exactamente el total declarado.');
 return {...base,type:body.type,currency:body.currency,date:body.date,dueDate:body.dueDate,linkedPurchaseId:body.linkedPurchaseId,number:String(body.number).trim(),description:String(body.description).trim(),evidence:String(body.evidence).trim(),lines,total:total.toFixed(2)};
}
