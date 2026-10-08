import { getMPPaymentDayBounds } from './mpPaymentDate';
export type IncomeRow={account_id:string|null;account_name?:string|null;amount:number|string;received_at:string};
export type AccountIncome={id:string;name:string;periodAmount:number;monthAmount:number;dailyAverage:number;date40:string|null;date50:string|null;monthEnd:string;asOf:string};
export function monthWindow(asOf:string){
 const bounds=getMPPaymentDayBounds(asOf);if(!bounds)throw new Error('Fecha inválida');
 const start=asOf.slice(0,7)+'-01';const next=new Date(`${start}T03:00:00Z`);next.setUTCMonth(next.getUTCMonth()+1);
 const monthEnd=new Date(next.getTime()-86400000).toISOString().slice(0,10);
 return {start,end:asOf,startIso:getMPPaymentDayBounds(start)!.startIso,endExclusiveIso:bounds.endExclusiveIso,monthEnd,days:Number(asOf.slice(8,10))};
}
export function summarizeAccountIncome(period:IncomeRow[],monthly:IncomeRow[],accounts:Array<{id:string;name:string;alias?:string}>,asOf:string):AccountIncome[]{
 const window=monthWindow(asOf);const totals=new Map<string,{id:string;name:string;periodAmount:number;monthAmount:number}>();
 for(const account of accounts)totals.set(account.id,{id:account.id,name:account.alias||account.name,periodAmount:0,monthAmount:0});
 const add=(row:IncomeRow,key:'periodAmount'|'monthAmount')=>{
   const matched=accounts.find(a=>a.id===row.account_id)||accounts.find(a=>[a.name,a.alias].some(n=>n&&n.toLowerCase()===(row.account_name||'').toLowerCase()));
   const id=matched?.id||row.account_id||row.account_name||'sin-cuenta';
   if(!totals.has(id))totals.set(id,{id,name:matched?.alias||matched?.name||row.account_name||id,periodAmount:0,monthAmount:0});
   const amount=Number(row.amount);if(Number.isFinite(amount)&&amount>0)totals.get(id)![key]+=Math.round(amount*100);
 };
 period.forEach(row=>add(row,'periodAmount'));monthly.forEach(row=>add(row,'monthAmount'));
 return [...totals.values()].map(row=>{
   const monthAmount=row.monthAmount/100,dailyAverage=monthAmount/window.days;
   const project=(target:number)=>{if(monthAmount>=target)return asOf;if(dailyAverage<=0)return null;return new Date(Date.parse(window.endExclusiveIso)-86400000+Math.ceil((target-monthAmount)/dailyAverage)*86400000).toISOString().slice(0,10);};
   return {...row,periodAmount:row.periodAmount/100,monthAmount,dailyAverage,date40:project(40000000),date50:project(50000000),monthEnd:window.monthEnd,asOf};
 });
}
export const crossedIncomeThresholds=(amount:number)=>[10000000,20000000,30000000,40000000].filter(threshold=>amount>=threshold);
