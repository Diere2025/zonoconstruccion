import {validDate,nextDate} from '@/lib/paymentPlanning/model';
import {carrierCommercialProfile,type CarrierRecord} from '@/lib/carrierIdentity';
import {rateAmount} from './tariffs';
export type LoadPlan={runNumber:number;zone:string;routeUrl:string;plannedKm:number|null;plannedOrders:number|null;expectedMinutes?:number|null;departure?:string;ordersDerived?:boolean};
export type DispatchPlan={deliveryDate:string;carrierId:string;driverName?:string;vehicle:string;companion:string;router:string;departure:string;expectedReturn:string;expectedMinutes:number|null;loads:LoadPlan[];notes:string;tariffId:string|null;agreedAmount:number|null};
export type ActualLoad={runNumber:number;departure:string;arrival:string;arrivalNextDay:boolean};
export type DispatchExtra={id:string;kind:'pickup'|'errand'|'parcel'|'waiting'|'km_adjustment'|'other';label:string;amount:number;reference:string;km:number|null;unitPrice:number|null;runNumber:number|null;orderCode:string};
export type DispatchActual={loads:ActualLoad[];km:number|null;notes:string;extras?:DispatchExtra[]};
const fail=(message:string):never=>{throw Object.assign(new Error(message),{status:400});};
const text=(v:unknown,max=200)=>{const s=String(v??'').trim();if(s.length>max)fail('El texto supera el largo permitido.');return s;};
export function planningNumber(v:unknown,max=100000):number|null{if(v===''||v===null||v===undefined)return null;const n=typeof v==='number'?v:Number(String(v).replace(',','.'));if(!Number.isFinite(n)||n<0||n>max)fail('Ingresá un valor numérico válido y positivo.');return n;}
const time=(v:unknown)=>{const s=text(v);if(s&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(s))fail('Ingresá el horario en HH:mm de 24 horas.');return s;};
export function validateDispatchExtras(input:unknown,runs:number[]=[1]):DispatchExtra[]{
 if(input===undefined)return [];
 if(!Array.isArray(input)||input.length>20)fail('Revisá los extras del servicio: máximo veinte.');
 const ids=new Set<string>();
 return (input as any[]).map((r:any)=>{
  const id=text(r.id),kind=r.kind,label=text(r.label,300),reference=text(r.reference,500),orderCode=text(r.orderCode,100).toUpperCase();
  if(!/^[0-9a-f-]{36}$/i.test(id)||ids.has(id))fail('Los extras necesitan identificadores únicos.');ids.add(id);
  if(!['pickup','errand','parcel','waiting','km_adjustment','other'].includes(kind)||!label)fail('Cada extra necesita tipo, motivo e importe válidos.');
  const km=planningNumber(r.km,10000),unitPrice=planningNumber(r.unitPrice,1000000),runNumber=planningNumber(r.runNumber,8);
  if(runNumber!==null&&(!Number.isInteger(runNumber)||!runs.includes(runNumber)))fail('La carga del extra no corresponde al LOG.');
  const amount=kind==='km_adjustment'?(km??0)*(unitPrice??0):planningNumber(r.amount,100000000);
  if(amount===null||amount<=0||amount>100000000||kind==='km_adjustment'&&(!km||!unitPrice))fail('Confirmá un importe positivo o los kilómetros y su valor.');
  return {id,kind,label,reference,orderCode,km:kind==='km_adjustment'?km:null,unitPrice:kind==='km_adjustment'?unitPrice:null,runNumber,amount:Math.round(amount!*100)/100};
 });
}
export function validateDispatchPlan(input:any):DispatchPlan{
 if(!validDate(input?.deliveryDate))fail('La fecha de entrega no es válida.');
 if(!/^[0-9a-f-]{36}$/i.test(input.carrierId||''))fail('Seleccioná un fletero del catálogo.');
 const vehicle=text(input.vehicle);if(!vehicle)fail('Indicá el vehículo.');
 if(!Array.isArray(input.loads)||input.loads.length<1||input.loads.length>8)fail('Agregá entre una y ocho cargas.');
 const runs=new Set<number>();const loads=input.loads.map((r:any)=>{const runNumber=Number(r.runNumber);if(!Number.isInteger(runNumber)||runNumber<1||runNumber>8||runs.has(runNumber))fail('Los números de carga deben ser únicos.');runs.add(runNumber);const zone=text(r.zone);const routeUrl=text(r.routeUrl,1000);if(routeUrl){let url;try{url=new URL(routeUrl);}catch{fail('El enlace de recorrido no es válido.');}if(!['https:','http:'].includes(url!.protocol))fail('El enlace debe ser HTTP o HTTPS.');}const plannedOrders=planningNumber(r.plannedOrders,1000);if(plannedOrders!==null&&!Number.isInteger(plannedOrders))fail('La cantidad de pedidos debe ser entera.');return {runNumber,zone,routeUrl,plannedKm:planningNumber(r.plannedKm,10000),plannedOrders,expectedMinutes:planningNumber(r.expectedMinutes,2880),departure:time(r.departure)};});
 const agreedAmount=planningNumber(input.agreedAmount,100000000);if(agreedAmount===0)fail('Una tarifa en cero debe quedar pendiente hasta confirmar el importe.');
 return {deliveryDate:input.deliveryDate,carrierId:input.carrierId,driverName:text(input.driverName),vehicle,companion:text(input.companion),router:/^pablo$/i.test(text(input.router))?'Pablo Jara':text(input.router),departure:time(input.departure),expectedReturn:time(input.expectedReturn),expectedMinutes:planningNumber(input.expectedMinutes,2880),loads,notes:text(input.notes,3000),tariffId:input.tariffId?text(input.tariffId):null,agreedAmount};
}
export function validateDispatchActual(input:any,closing=false,runs:number[]=[1]):DispatchActual{const raw=Array.isArray(input?.loads)?input.loads:input?.departure?[{runNumber:1,...input}]:[];if(raw.length>8)fail('Hay demasiadas cargas realizadas.');const unique=new Set<number>();const loads:ActualLoad[]=raw.map((load:any)=>{const runNumber=Number(load.runNumber);if(!runs.includes(runNumber)||unique.has(runNumber))fail('La carga realizada no corresponde al plan.');unique.add(runNumber);const departure=time(load.departure),arrival=time(load.arrival),arrivalNextDay=load.arrivalNextDay===true||!!(departure&&arrival&&arrival<departure);return {runNumber,departure,arrival,arrivalNextDay};});const km=planningNumber(input?.km,10000);if(closing&&(km===null||runs.some(run=>!loads.some(l=>l.runNumber===run&&l.departure&&l.arrival))))fail('Para cerrar, completá salida y regreso de cada carga y los kilómetros realizados.');return {loads,km,notes:text(input?.notes,3000),extras:validateDispatchExtras(input?.extras,runs)};}
export function loadEffectiveMinutes(load:ActualLoad){if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(load.departure)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(load.arrival))return null;const minutes=(s:string)=>Number(s.slice(0,2))*60+Number(s.slice(3));const result=minutes(load.arrival)-minutes(load.departure)+(load.arrivalNextDay||load.arrival<load.departure?1440:0);return result<0?null:result;}
export function effectiveMinutes(actual:DispatchActual){if(!actual.loads?.length)return null;const values=actual.loads.map(loadEffectiveMinutes);return values.every(v=>v!==null)?values.reduce<number>((n,v)=>n+v!,0):null;}
export function sourceDuration(value:unknown):number|null{const s=String(value||'').trim().toLowerCase();const hh=s.match(/(\d+)\s*(?:hs?|horas?)\b/),mm=s.match(/(\d+)\s*(?:min(?:utos)?|m)\b/),clock=s.match(/^(\d{1,2}):(\d{2})$/);return clock?Number(clock[1])*60+Number(clock[2]):hh||mm?Number(hh?.[1]||0)*60+Number(mm?.[1]||0):null;}
export function plannedKm(plan:DispatchPlan){return plan.loads.every(l=>l.plannedKm!==null)?plan.loads.reduce((n,l)=>n+l.plannedKm!,0):null;}
export function tariffApplies(rate:any,carrier:CarrierRecord,date:string,area:string){return rate.active!==false&&rate.effective_from<=date&&(!rate.effective_to||date<=rate.effective_to)&&rate.zone_variant===area&&(rate.carrier_id===carrier.id||rate.company_key&&rate.company_key===carrierCommercialProfile(carrier.name)?.company_key);}
export function rateSnapshot(rate:any){return {id:rate.id,label:rate.label,effectiveFrom:rate.effective_from,effectiveTo:rate.effective_to,carrierId:rate.carrier_id,companyKey:rate.company_key,zoneVariant:rate.zone_variant,...rate.terms};}
export function estimateDispatchFee(plan:DispatchPlan,terms:any){if(plan.agreedAmount!==null)return {amount:plan.agreedAmount,basis:'agreed',review:[]};if(!terms||!terms.baseDay)return {amount:null,basis:'pending',review:['Tarifa por viaje pendiente de acordar.']};const km=plannedKm(plan);let amount=Number(terms.baseDay);const review:string[]=[];
 // The companion is charged separately once for the whole LOG, when present.
 if(plan.companion&&!/sin acompa/i.test(plan.companion)){if(terms.companion===null||terms.companion===undefined)review.push('Importe del acompañante pendiente de confirmar.');else amount+=Number(terms.companion);}
 if(terms.extraKm>0){if(km===null||terms.includedKm===null||terms.includedKm===undefined)review.push('Kilómetros previstos o base incluidos pendientes.');else amount+=Math.max(0,km-Number(terms.includedKm))*Number(terms.extraKm);}
 if(terms.hour>0||terms.extraHour>0)review.push('La tarifa horaria requiere acordar el total por viaje.');if(terms.bonus>0)review.push('Plus sujeto a confirmación; no incluido.');if(terms.includesTolls!==true)review.push('Peajes no incluidos o pendientes de confirmar.');return {amount:Math.round(amount*100)/100,basis:'estimated',review};}
export function nextDeliveryDay(today:string){let day=nextDate(today);if(new Date(day+'T12:00:00Z').getUTCDay()===0)day=nextDate(day);return day;}
export function loadingMessage(plan:DispatchPlan,carrierName:string){const [y,m,d]=plan.deliveryDate.split('-');return `Hola ${carrierName}. La carga del ${d}/${m}/${y} está prevista${plan.departure?' a las '+plan.departure+' hs':''}. Vehículo: ${plan.vehicle}. ${plan.loads.map(l=>'R'+l.runNumber+': '+l.zone).join(' · ')}.`;}
export function maximumLogNumber(values:unknown[]){return values.reduce<number>((max,value)=>{const m=String(value||'').trim().match(/^LOG_REC_(\d+)[A-Z]?$/i);return m?Math.max(max,Number(m[1])):max;},0);}
export function normalizeImportedTerms(v:unknown[]){return {baseDay:rateAmount(v[1]),hour:rateAmount(v[2]),extraHour:rateAmount(v[3]),extraKm:rateAmount(v[4]),companion:rateAmount(v[5]),includedKm:rateAmount(v[6]),bonus:rateAmount(v[7]),includesTolls:/^s[ií]$/i.test(String(v[9]||''))?true:/^no$/i.test(String(v[9]||''))?false:null};}
