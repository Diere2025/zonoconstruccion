import { getMPPaymentDayBounds, isMPPaymentOnDay } from './mpPaymentDate';
export type IncomeRow={account_id:string|null;account_name?:string|null;amount:number|string;received_at:string;is_internal?:boolean|null};
export type AccountIncome={id:string;name:string;periodAmount:number;monthAmount:number;todayCustomerAmount:number;isActive:boolean;dailyAverage:number;date40:string|null;date50:string|null;monthEnd:string;asOf:string};
export function monthWindow(asOf:string){
 const bounds=getMPPaymentDayBounds(asOf);if(!bounds)throw new Error('Fecha inválida');
 const start=asOf.slice(0,7)+'-01';const next=new Date(`${start}T03:00:00Z`);next.setUTCMonth(next.getUTCMonth()+1);
 const monthEnd=new Date(next.getTime()-86400000).toISOString().slice(0,10);
 return {start,end:asOf,startIso:getMPPaymentDayBounds(start)!.startIso,endExclusiveIso:bounds.endExclusiveIso,monthEnd,days:Number(asOf.slice(8,10))};
}
export function projectIncomeThresholdDate(account: Pick<AccountIncome, 'asOf'|'monthAmount'|'dailyAverage'>, target: number) {
 if(account.monthAmount>=target)return account.asOf;
 if(account.dailyAverage<=0)return null;
 const date = new Date(account.asOf + 'T00:00:00Z');
 date.setUTCDate(date.getUTCDate() + Math.ceil((target-account.monthAmount)/account.dailyAverage));
 if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() > 9999) return '9999-12-31';
 return date.toISOString().slice(0,10);
}
export function summarizeAccountIncome(period:IncomeRow[],monthly:IncomeRow[],accounts:Array<{id:string;name:string;alias?:string|null;is_active?:boolean|null}>,asOf:string):AccountIncome[]{
 const window=monthWindow(asOf);const totals=new Map<string,Pick<AccountIncome,'id'|'name'|'periodAmount'|'monthAmount'|'todayCustomerAmount'|'isActive'>>();
 for(const account of accounts)totals.set(account.id,{id:account.id,name:account.alias||account.name,periodAmount:0,monthAmount:0,todayCustomerAmount:0,isActive:account.is_active!==false});
 const add=(row:IncomeRow,key:'periodAmount'|'monthAmount')=>{
   const matched=accounts.find(a=>a.id===row.account_id)||accounts.find(a=>[a.name,a.alias].some(n=>n&&n.toLowerCase()===(row.account_name||'').toLowerCase()));
   const id=matched?.id||row.account_id||row.account_name||'sin-cuenta';
   if(!totals.has(id))totals.set(id,{id,name:row.account_name||id,periodAmount:0,monthAmount:0,todayCustomerAmount:0,isActive:false});
   const amount=Number(row.amount);
   if(!Number.isFinite(amount)||amount<=0)return;
   const cents=Math.round(amount*100), total=totals.get(id)!;
   total[key]+=cents;
   if(key==='monthAmount'&&!row.is_internal&&isMPPaymentOnDay(row.received_at,asOf))total.todayCustomerAmount+=cents;
 };
 period.forEach(row=>add(row,'periodAmount'));monthly.forEach(row=>add(row,'monthAmount'));
 return [...totals.values()].map(row=>{
   const monthAmount=row.monthAmount/100,dailyAverage=monthAmount/window.days;
   const projection={monthAmount,dailyAverage,asOf};
   return {...row,...projection,periodAmount:row.periodAmount/100,todayCustomerAmount:row.todayCustomerAmount/100,date40:projectIncomeThresholdDate(projection,40000000),date50:projectIncomeThresholdDate(projection,50000000),monthEnd:window.monthEnd};
 });
}
export const crossedIncomeThresholds=(amount:number)=>[10000000,20000000,30000000,40000000].filter(threshold=>amount>=threshold);
