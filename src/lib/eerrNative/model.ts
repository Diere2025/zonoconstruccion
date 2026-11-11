// Monetary calculations use cents. Every displayed total is the sum of its daily rows.
export const expenseCategories = ['Insumo de Producto','Insumo GLP','Publicidad','Publicidad (Fee)','IVA + IIBB','Costo Financiera','Alquileres','Sueldos','Honorarios','Servicio de Flete','Costos MercadoPago','Gastos Operativos','Vehículos','Eventuales','Gasto Peajes','Otros Ingresos y Egresos','Pérdida Extraordinaria','IIGG','Impuestos'] as const;
export type ExpenseCategory = typeof expenseCategories[number];
export type Provision = {amount:number;status:'estimated'|'confirmed';note:string};
export type Provisions = Partial<Record<ExpenseCategory,Provision>>;
export function provisionFieldErrors(value:unknown):Partial<Record<keyof Provision,string>> {
 const v=(value&&typeof value==='object'?value:{}) as Provision,errors:Partial<Record<keyof Provision,string>>={};
 if(typeof v.amount!=='number'||!Number.isFinite(v.amount))errors.amount='Completá el importe mensual.';
 else if(v.amount<0||v.amount>1e12||Math.abs(v.amount*100-Math.round(v.amount*100))>0.01)errors.amount='Ingresá un importe entre 0 y 1.000.000.000.000, con hasta dos decimales.';
 if(!['estimated','confirmed'].includes(v.status))errors.status='Elegí Estimado o Confirmado.';
 if(typeof v.note!=='string'||!v.note.trim())errors.note='Completá el fundamento de esta precarga.';
 else if(v.note.length>500)errors.note='El fundamento admite hasta 500 caracteres.';
 return errors;
}
export type Movement = {id:string;day:string;code:string;concept:string;category:string;type:string;amount:number;personal:number;currency:string;businessUnit:string;reversed:boolean};
export type ExcludedMovement = Pick<Movement, 'id' | 'day' | 'code' | 'concept' | 'category' | 'amount'> & { reason: string };
export type Sale = {id:string;code:string;day:string;sales:number;freightCharged:number;surchargesCharged:number;cost:number|null;knownCost:number;exchange:boolean;status:string};
export function localToday(now=new Date()) {return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function localYesterday(now = new Date()) {
 const day = new Date(localToday(now) + 'T00:00:00Z');
 day.setUTCDate(day.getUTCDate() - 1);
 return day.toISOString().slice(0, 10);
}
export function displayDate(day:string) {return day.split('-').reverse().join('/');}
export function period(month:string,latestDay=localYesterday(),until?:string) {
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||month<'2020-01'||month>latestDay.slice(0,7))throw new Error('Elegí un mes entre 01/2020 y '+latestDay.slice(5,7)+'/'+latestDay.slice(0,4)+'.');
 const [year,m]=month.split('-').map(Number),length=new Date(Date.UTC(year,m,0)).getUTCDate();
 const start=month+'-01',end=month+'-'+String(length).padStart(2,'0'),maximum=end<latestDay?end:latestDay;
 if(until!==undefined&&(!/^\d{4}-\d{2}-\d{2}$/.test(until)||until<start||until>maximum))throw new Error('La fecha de corte debe pertenecer al mes seleccionado y no superar '+displayDate(maximum)+'.');
 const cutoff=until??maximum;
 const days=Array.from({length:Number(cutoff.slice(-2))},(_,i)=>month+'-'+String(i+1).padStart(2,'0'));
 return {month,start,end,cutoff,length,days};
}
export function validateProvisions(value:unknown):Provisions {
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Precarga inválida.');
 const out:Provisions={};
 for(const [key,p] of Object.entries(value)) {
  if(!(expenseCategories as readonly string[]).includes(key)||!p||typeof p!=='object'||Array.isArray(p))throw new Error('Rubro de precarga inválido.');
  const v=p as Provision;
  const errors=Object.values(provisionFieldErrors(v));if(errors.length)throw new Error(key+': '+errors.join(' '));
  out[key as ExpenseCategory]={amount:v.amount,status:v.status,note:v.note.trim()};
 }
 return out;
}
const cents=(x:number)=>{if(!Number.isFinite(x))throw new Error('Importe inválido en la fuente.');return Math.round(x*100);};
const excluded=new Set(['Recaudación','Cobranza','Proveedores','Proveedores (Deuda)','Movimiento de cuentas','Fondos a rendir','Extracciones','Socios','1.Inicial Caja','Compra de dólares','Compra de maquinaria','Compra de rodado','Compra de muebles y equipos','Deuda Bancaria','Deuda bancaria']);
export function buildReport(month:string,sales:Sale[],movements:Movement[],provisions:Provisions,latestDay=localYesterday(),until?:string) {
 const p=period(month,latestDay,until),daily=new Map(p.days.map(day=>[day,{day,revenue:0,cardSurcharges:0,cmv:0,expenses:0,otherIncome:0,missingCosts:0}]));
 const entries:{day:string;kind:string;category:string;amount:number;reference:string;source:string;note:string}[]=[];
 const issues:{reference:string;reason:string}[]=[],excludedMovements:ExcludedMovement[]=[];
 for(const s of sales){const d=daily.get(s.day);if(!d)continue;if(s.exchange){issues.push({reference:s.code,reason:'Cambio pendiente de conciliación: excluido de ventas y CMV.'});continue;}
  const cardSurcharges=cents(s.surchargesCharged);
  const revenue=cents(s.sales)+cents(s.freightCharged)+cardSurcharges;
  d.revenue+=revenue;
  d.cardSurcharges+=cardSurcharges;
  entries.push({day:s.day,kind:'income',category:'Ventas entregadas',amount:revenue/100,reference:s.code,source:'Pedido entregado',note:'Productos netos + flete cobrado + recargos'});
  if(s.cost===null){d.missingCosts++;issues.push({reference:s.code,reason:'CMV incompleto. El resultado final no se calcula; no se asume costo cero.'});}
  const cost=cents(s.cost??s.knownCost);d.cmv+=cost;entries.push({day:s.day,kind:'cost',category:'CMV identificado',amount:cost/100,reference:s.code,source:'Motor de costos (estimación actual)',note:s.status});
 }
 const excludedExpenseByProvision:Record<string,number>={};
 for(const original of movements){
  // Hipergas is the GLP supplier. Only ordinary supplier payments are mapped;
  // explicit debt, transfers and custody categories retain their own treatment.
  const isHipergas=original.concept.trim().toLocaleLowerCase('es-AR')==='hipergas';
  const isAdvertisingFee=original.category==='Publicidad'&&/^publicidad\s*-\s*fee\b/i.test(original.concept.trim());
  const isMpInterest = /^(?:anulación:\s*)?mp - intereses ganados$/i.test(original.concept.trim());
  const category = isMpInterest && original.category === 'Inversiones' ? 'Intereses ganados'
   : isHipergas && original.category === 'Proveedores' ? 'Insumo GLP'
   : isAdvertisingFee ? 'Publicidad (Fee)' : original.category;
  const m = { ...original, category };
  const d=daily.get(m.day);if(!d)continue;
  const skip = (reason: string) => excludedMovements.push({
   id: m.id, day: m.day, code: m.code, concept: m.concept, category: m.category, amount: m.amount, reason,
  });
  if(m.reversed){skip('Anulación u original anulado');continue;}
  const legacyMpInterest = isMpInterest && m.category === 'Intereses ganados' && m.businessUnit === 'Mov. Financiero';
  if(m.businessUnit&&m.businessUnit.toUpperCase()!=='ZONO'&&!legacyMpInterest){skip('Otra unidad de negocio');continue;}
  if(excluded.has(m.category)){skip('Movimiento patrimonial, pago de compra o cobro ya representado en ventas');continue;}
  if(m.currency!=='ARS'){issues.push({reference:m.code,reason:'Moneda distinta de ARS: requiere conversión documentada.'});continue;}
  if(!['ingreso','egreso'].includes(m.type)||!m.businessUnit){issues.push({reference:m.code,reason:'Falta confirmar tipo o unidad de negocio.'});continue;}
  if(m.personal<0||m.personal>m.amount)throw new Error('Asignación personal inválida.');
  const amount=cents(m.amount)-cents(m.personal);
  if (m.category === 'Intereses ganados') {
   if (m.type !== 'ingreso') {
    issues.push({reference:m.code,reason:'Intereses ganados: verificá el tipo de movimiento.'});
    skip('Intereses ganados con tipo de movimiento pendiente de revisión');
    continue;
   }
   d.otherIncome += amount;
   entries.push({day:m.day,kind:'other-income',category:m.category,amount:amount/100,reference:m.code,source:'Movimiento financiero (fecha de caja)',note:m.concept});
   continue;
  }
  if(m.category==='Inversiones'){
   if(m.type==='ingreso')issues.push({reference:m.code,reason:'Inversiones: distinguir rendimiento de devolución de capital antes de incluirlo.'});
   skip('Inversión pendiente de separar capital y rendimiento');
   continue;
  }
  if(!(expenseCategories as readonly string[]).includes(m.category)){issues.push({reference:m.code,reason:'Categoría sin correspondencia con el EERR: '+(m.category||'Sin clasificar')});continue;}
  const signed=m.type==='egreso'?amount:-amount;
  if(provisions[m.category as ExpenseCategory]){excludedExpenseByProvision[m.category]=(excludedExpenseByProvision[m.category]||0)+signed;skip('Reemplazado por precarga mensual de este rubro');continue;}
  d.expenses+=signed;entries.push({day:m.day,kind:'expense',category:m.category,amount:signed/100,reference:m.code,source:'Movimiento financiero (fecha de caja)',note:m.concept+(m.personal?' · parte personal excluida':'')});
 }
 for(const [category,v] of Object.entries(provisions)){
  const total=cents(v.amount),base=Math.floor(total/p.length),remainder=total%p.length;
  p.days.forEach((day,i)=>{const amount=base+(i<remainder?1:0);daily.get(day)!.expenses+=amount;entries.push({day,kind:'expense',category,amount:amount/100,reference:'Precarga '+month.slice(5)+'/'+month.slice(0,4),source:v.status==='estimated'?'Precarga estimada':'Precarga confirmada',note:v.note});});
 }
 const days=[...daily.values()].map(d=>({day:d.day,revenue:d.revenue/100,cardSurcharges:d.cardSurcharges/100,cmv:d.cmv/100,expenses:d.expenses/100,otherIncome:d.otherIncome/100,missingCosts:d.missingCosts,result:d.missingCosts?null:(d.revenue+d.otherIncome-d.cmv-d.expenses)/100}));
 const sum=(key:'revenue'|'cmv'|'expenses'|'otherIncome')=>[...daily.values()].reduce((n,d)=>n+d[key],0);
 const missing=days.reduce((n,d)=>n+d.missingCosts,0),hasIssues=missing>0||issues.length>0;
 const identifiedBalance=(sum('revenue')+sum('otherIncome')-sum('cmv')-sum('expenses'))/100;
 const totals={revenue:sum('revenue')/100,cmv:sum('cmv')/100,expenses:sum('expenses')/100,otherIncome:sum('otherIncome')/100,result:hasIssues?null:identifiedBalance,identifiedBalance};
 const groups=(expenseCategories as readonly string[]).map(category=>({category,amount:entries.filter(e=>e.kind==='expense'&&e.category===category).reduce((n,e)=>n+cents(e.amount),0)/100,mode:provisions[category as ExpenseCategory]?'Precarga (reemplaza movimientos)':'Movimientos de caja',replaced:(excludedExpenseByProvision[category]||0)/100}));
 return {period:p,totals,days,groups,entries,issues,excludedMovements,missingCosts:missing,status:hasIssues?'incomplete':'provisional',notices:['Resultado gerencial provisional: los gastos sin precarga se imputan por fecha de caja, no por devengamiento.','El CMV usa materiales/compra actuales; no es un costo histórico cerrado. Sus fuentes sincronizadas aún pueden depender de planillas.','Las precargas reemplazan el rubro completo y se distribuyen por días calendario, hasta el día de corte.','Sueldos, cargas, publicidad, fee, gas, impuestos y gastos pendientes deben revisarse aun si el rubro figura en cero. No es un cierre contable.']};
}

/** Chart values retain identified amounts even when the full result is pending. */
export function dailyProgress(days:{day:string;revenue:number;cmv:number;expenses:number;otherIncome:number;missingCosts:number}[]) {
 let cumulative=0;
 return days.map(d=>{const identified=cents(d.revenue)+cents(d.otherIncome)-cents(d.cmv)-cents(d.expenses);cumulative+=identified;return {...d,totalCosts:(cents(d.cmv)+cents(d.expenses))/100,identifiedResult:identified/100,cumulativeResult:cumulative/100};});
}
