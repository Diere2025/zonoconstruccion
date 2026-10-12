export type DailyAccount={id:string;name:string;currency:string;is_active:boolean};
export type DailyMovement={id:string;financial_account_id:string|null;currency:string|null;created_at:string;type:string;amount:string|number};
export type AccountDay={date:string;balances:Record<string,number>};
export type DailyBalanceReport={from:string;to:string;accounts:DailyAccount[];opening:Record<string,number>;days:AccountDay[]};
const dayFormatter=new Intl.DateTimeFormat('en',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'});
export function argentinaDay(value:string|Date){const parts=Object.fromEntries(dayFormatter.formatToParts(new Date(value)).map(p=>[p.type,p.value]));return `${parts.year}-${parts.month}-${parts.day}`;}
export function calendarDays(from:string,to:string){
 const valid=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
 if(!valid(from)||!valid(to)||to<from)throw Error('Seleccioná un período válido.');
 const length=Math.round((Date.parse(to+'T12:00:00Z')-Date.parse(from+'T12:00:00Z'))/86400000)+1;
 if(length>366)throw Error('Elegí un período de hasta 366 días.');
 return Array.from({length},(_,i)=>new Date(Date.parse(from+'T12:00:00Z')+i*86400000).toISOString().slice(0,10));
}
export function dailyBalances(accounts:DailyAccount[],movements:DailyMovement[],from:string,to:string):DailyBalanceReport {
 const dates=calendarDays(from,to),boxes=[...accounts],opening:Record<string,number>={},changes=new Map<string,Record<string,number>>(),ids=new Set(boxes.map(a=>a.id));
 for(const movement of movements){if(movement.financial_account_id)continue;const id='unassigned:'+(movement.currency||'ARS');if(!ids.has(id)){boxes.push({id,name:'Efectivo sin caja asignada',currency:movement.currency||'ARS',is_active:true});ids.add(id);}}
 for(const account of boxes)opening[account.id]=0;
 for(const movement of movements){const id=movement.financial_account_id||'unassigned:'+(movement.currency||'ARS');if(!ids.has(id))continue;const date=argentinaDay(movement.created_at);if(date>to)continue;
  const amount=Number(movement.amount);if(!Number.isFinite(amount)||!['ingreso','egreso'].includes(movement.type))throw Error('Un movimiento tiene un importe o tipo inválido.');
  const signed=Math.round(amount*100)*(movement.type==='ingreso'?1:-1);
  if(date<from){opening[id]+=signed;continue;}
  const day=changes.get(date)||{};day[id]=(day[id]||0)+signed;changes.set(date,day);
 }
 const balances={...opening};const days=dates.map(date=>{for(const [id,value]of Object.entries(changes.get(date)||{}))balances[id]+=value;return{date,balances:{...balances}};});
 return{from,to,accounts:boxes,opening,days};
}
export function selectedBalance(values:Record<string,number>,accounts:DailyAccount[],currency:string){return accounts.filter(a=>a.currency===currency).reduce((sum,a)=>sum+(values[a.id]||0),0);}
