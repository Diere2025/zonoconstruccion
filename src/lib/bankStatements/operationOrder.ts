import type {StatementEntry} from './model';
// Entries belong to one account-scoped statement. This is a reference to the
// collection link; it never creates an order link on a fee or changes money.
export function withOperationOrder(entries:StatementEntry[]):StatementEntry[]{
 const groups=new Map<string,Map<string,{code:string;entry_id:string}>>();
 for(const entry of entries){if(!entry.related_operation_id||!entry.order_link||entry.order_link.stale||entry.activity_context?.kind==='reserve_transfer')continue;const orders=groups.get(entry.related_operation_id)||new Map();orders.set(entry.order_link.order_id,{code:entry.order_link.code,entry_id:entry.id});groups.set(entry.related_operation_id,orders);}
 return entries.map(entry=>{const orders=entry.related_operation_id?groups.get(entry.related_operation_id):null;if(!orders?.size||entry.activity_context?.kind==='reserve_transfer')return {...entry,operation_order:null};return {...entry,operation_order:orders.size===1?{...([...orders.values()][0]),ambiguous:false}:{code:null,entry_id:null,ambiguous:true}};});
}
