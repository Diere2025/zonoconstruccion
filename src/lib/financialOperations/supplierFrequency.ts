import {treasuryToday} from '../treasuryTransactionTime';

export type SupplierOption={id:string;name:string;recent_payment_count?:number;recent_last_payment?:string};
export function supplierFrequencyWindow(now=new Date()){
 const today=treasuryToday(now),[year,month,day]=today.split('-').map(Number);
 const target=new Date(Date.UTC(year,month-4,1));
 const lastDay=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();
 target.setUTCDate(Math.min(day,lastDay));
 return {start:`${target.toISOString().slice(0,10)}T00:00:00-03:00`,end:`${today}T23:59:59.999-03:00`};
}
export function withSupplierFrequency(suppliers:SupplierOption[],payments:Array<{supplier_id:string;created_at:string}>):SupplierOption[]{
 const counts=new Map<string,{count:number;last:string}>();
 for(const payment of payments){const prior=counts.get(payment.supplier_id);counts.set(payment.supplier_id,{count:(prior?.count||0)+1,last:prior&&prior.last>payment.created_at?prior.last:payment.created_at});}
 return suppliers.map(s=>({...s,recent_payment_count:counts.get(s.id)?.count||0,recent_last_payment:counts.get(s.id)?.last}));
}
export function frequentSuppliers(suppliers:SupplierOption[]){
 return [...suppliers].filter(s=>(s.recent_payment_count||0)>0).sort((a,b)=>(b.recent_payment_count||0)-(a.recent_payment_count||0)||(b.recent_last_payment||'').localeCompare(a.recent_last_payment||'')||a.name.localeCompare(b.name,'es')||a.id.localeCompare(b.id)).slice(0,8).map(s=>s.id);
}
export type SupplierPreferences={frequent:string[];hidden:string[]};
export function supplierPreferences(saved:unknown,suppliers:SupplierOption[]):SupplierPreferences{
 const p=saved as Partial<SupplierPreferences>|null;
 if(p&&Array.isArray(p.frequent)&&Array.isArray(p.hidden))return {frequent:p.frequent.filter((id):id is string=>typeof id==='string'),hidden:p.hidden.filter((id):id is string=>typeof id==='string')};
 return {frequent:frequentSuppliers(suppliers),hidden:[]};
}
