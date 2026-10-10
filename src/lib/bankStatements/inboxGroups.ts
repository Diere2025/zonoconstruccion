import type {InboxCapture} from './inbox';
export type InboxView='operations'|'types'|'list';
const dayFormat=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'});
export function inboxDay(value:string){const parts=dayFormat.formatToParts(new Date(value));return ['year','month','day'].map(type=>parts.find(p=>p.type===type)?.value).join('-');}
export function operationOrders<T extends InboxCapture>(rows:T[]):T[]{
 const groups=new Map<string,Set<string>>();
 for(const row of rows){if(!row.operation_id||row.operation_kind==='reserve_transfer')continue;const codes=groups.get(row.operation_id)||new Set<string>();const code=row.order_code||row.mp_payments?.order_code;if(code)codes.add(code.trim());groups.set(row.operation_id,codes);}
 return rows.map(row=>{const codes=groups.get(row.operation_id);if(row.operation_kind==='reserve_transfer'||!codes?.size)return row;if(codes.size!==1)return {...row,order_ambiguous:true};const code=[...codes][0];return {...row,order_code:code,order_from_operation:!row.order_code&&!row.mp_payments?.order_code};});
}
export function inboxType(row:InboxCapture){
 const description=row.description.toLocaleLowerCase('es');
 if(row.operation_kind==='reserve_transfer')return 'Reservas';
 if(/retenci|impuesto/.test(description))return 'Retenciones e impuestos';
 if(/costo|comisi/.test(description))return 'Costos y comisiones';
 if(/rendimiento|intereses ganados|inversi/.test(description)&&Number(row.amount)>0)return 'Rendimientos';
 if(/^(cobro|ingreso de dinero|dinero recibido)/.test(description)&&Number(row.amount)>0)return 'Cobranzas';
 if(/transferencia|movimiento (general|de cuentas)/.test(description))return 'Transferencias';
 if(Number(row.amount)<0)return 'Pagos y retiros';
 return 'Otros ingresos';
}
export function inboxGroups(rows:InboxCapture[],view:InboxView){
 const days=new Map<string,Map<string,InboxCapture[]>>();
 for(const row of rows){const day=inboxDay(row.occurred_at),key=view==='types'?inboxType(row):row.operation_id||row.id;const groups=days.get(day)||new Map<string,InboxCapture[]>();groups.set(key,[...(groups.get(key)||[]),row]);days.set(day,groups);}
 return [...days].sort(([a],[b])=>b.localeCompare(a)).map(([day,groups])=>({day,label:day.slice(8)+'/'+day.slice(5,7)+'/'+day.slice(0,4),groups:[...groups].map(([key,items])=>({key:day+':'+key,label:view==='types'?key:'Operación '+key,items}))}));
}
