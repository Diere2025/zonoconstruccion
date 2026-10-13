export type DispatchOption={code:string;delivery_date:string;carrier_name:string};
export function deliveredSourceOnly(source:unknown){if(source&&source!=='entregados')throw new Error('Las rendiciones se generan desde Entregados. Entregando ya no se importa.');}
export function assignedDispatchCode(sourceCode:string,existingCode:string,requested:unknown,options:DispatchOption[],known?:DispatchOption|null,date?:string):string{
 const code=String(sourceCode||existingCode||requested||'').trim().toUpperCase();
 if(!/^LOG_REC_\d+[A-Z]?$/.test(code))throw new Error('Asigná un código de logística válido antes de generar la rendición.');
 if((sourceCode||existingCode)&&requested&&String(requested).trim().toUpperCase()!==code)throw new Error('La logística cambió. Volvé a leer Entregados.');
 if(known&&known.delivery_date!==date)throw new Error('La logística seleccionada pertenece a otra fecha.');
 if(known&&!options.some(o=>o.code===code)&&!sourceCode&&!existingCode)throw new Error('La logística seleccionada no corresponde al fletero de este recorrido.');
 return code;
}

type DeliveryGroup={key:string;carrierName:string;deliveryDate:string;runNumber:number;dispatchCode:string;orders:Array<{orderCode:string;sourceRow?:number}>;totalAmount:number};
export function mergeDeliveredGroups<T extends DeliveryGroup>(groups:T[],identity:(name:string)=>string,total:(orders:T['orders'])=>number):Array<T&{sourceIssue?:string}>{
 const buckets=new Map<string,T[]>();for(const group of groups){const key=identity(group.carrierName)+'|'+group.deliveryDate+'|R'+group.runNumber;buckets.set(key,[...(buckets.get(key)||[]),group]);}
 return [...buckets].flatMap<T & {sourceIssue?:string}>(([key,items])=>{const codes=[...new Set(items.map(g=>g.dispatchCode).filter(Boolean))];if(codes.length>1)return items.map(g=>({...g,sourceIssue:'Un mismo fletero, fecha y número de carga tiene varios LOG. Revisá Entregados antes de generar.'}));
 const orders=new Map<string,T['orders'][number]>();for(const group of items)for(const order of group.orders){const previous=orders.get(order.orderCode.toUpperCase());if(!previous||(order.sourceRow||0)>=(previous.sourceRow||0))orders.set(order.orderCode.toUpperCase(),order);}
 const mergedOrders=[...orders.values()] as T['orders'];return [{...items[0],key,dispatchCode:codes[0]||'',orders:mergedOrders,totalAmount:total(mergedOrders)}];});
}

type StoredAssignment={code:string;date:string;carrierName:string;orderCode:string};
export function applyStoredDispatchAssignments(rows:string[][],links:StoredAssignment[],dateOf:(value:unknown)=>string|null,sameCarrier:(a:string,b:string)=>boolean){
 const assignedRows:number[]=[];let header='';
 const values=rows.map((row,index)=>{const date=dateOf(row[1]);if(!date){if(row[0])header=String(row[0]);return row;}if(/^LOG_REC_\d+[A-Z]?$/i.test(String(row[92]||'').trim()))return row;
 const orderCodes=String(row[0]||'').toUpperCase().split(/[/,]/).map(c=>c.trim()).filter(Boolean),name=String(row[79]||header);
 const matching=links.filter(l=>l.date===date&&orderCodes.includes(l.orderCode.toUpperCase())&&sameCarrier(l.carrierName,name));
 const codes=[...new Set(matching.map(l=>l.code))];if(codes.length!==1||!orderCodes.every(c=>matching.some(l=>l.orderCode.toUpperCase()===c)))return row;
 const copy=[...row];copy[92]=codes[0];assignedRows.push(index+3);return copy;});
 return {values,assignedRows};
}
