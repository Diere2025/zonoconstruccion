import {treasuryToday} from '../treasuryTransactionTime';
import type {OperationInput} from './types';
export type SupplierDocument={id:string;supplier_id:string;currency:string;total_amount:number;paid_amount:number;purchase_date?:string;created_at?:string;status?:string;document_type?:string;editable_allocation_amount?:string};
export function supplierDocumentPending(p:SupplierDocument){return Math.max(0,Math.round(Number(p.total_amount)*100)-Math.round(Number(p.paid_amount)*100)+Math.round(Number(p.editable_allocation_amount||0)*100))/100;}
export function payableSupplierDocuments<T extends SupplierDocument>(purchases:T[],supplierId:string,currency:string) {
 return purchases.filter(p=>p.supplier_id===supplierId&&p.currency===currency&&p.status!=='Anulado'&&p.document_type!=='Nota de Crédito'&&supplierDocumentPending(p)>0);
}
// Preview only. Posting recomputes the distribution with locked database rows.
const documentDay=(value:string)=>value.includes('T')?treasuryToday(new Date(value)):value.slice(0,10);
export function oldestSupplierAllocations(purchases:SupplierDocument[],supplierId:string,currency:string,amount:string,date:string):NonNullable<OperationInput['allocations']> {
 let remaining=Math.round(Number(amount||0)*100);
 if(!Number.isFinite(remaining)||remaining<=0)return [];
 const rows=payableSupplierDocuments(purchases,supplierId,currency).filter(p=>documentDay(p.purchase_date||p.created_at||'')<=date)
  .sort((a,b)=>(a.purchase_date||a.created_at||'').localeCompare(b.purchase_date||b.created_at||'')||(a.created_at||'').localeCompare(b.created_at||'')||a.id.localeCompare(b.id));
 const allocations:NonNullable<OperationInput['allocations']>=[];
 for(const p of rows){if(remaining<=0)break;const paid=Math.min(remaining,Math.round(supplierDocumentPending(p)*100));if(paid>0){allocations.push({purchase_id:p.id,amount:(paid/100).toFixed(2)});remaining-=paid;}}
 return allocations;
}
