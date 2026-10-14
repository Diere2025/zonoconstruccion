import {createClient} from '@supabase/supabase-js';
import {fetchSpreadsheetValues} from '@/lib/googleSheets';
import {canonicalCarrierOptions,resolveCarrierIdentity} from '@/lib/carrierIdentity';
import {parseTariffRows} from './tariffs';
import {SOURCE_IDS,sheetDate} from './model';
import {validDate} from '@/lib/paymentPlanning/model';
import {sameSettlementCarrier} from './settlementIdentity';
import {carrierPlanningDefaults} from './planningDefaults';
import {tariffDisplayName} from './planningPresentation';
import {approveLiquidation,closureMessage} from './liquidation';
import {planningCarrierName} from './planningCorrections';
import {validateDispatchPlan,validateDispatchActual,rateSnapshot,estimateDispatchFee,tariffApplies,maximumLogNumber,normalizeImportedTerms,planningNumber,sourceDuration} from './planning';
export const tariffSpreadsheet='1_En98ou78s8DL8KWO2qt641PyQ5Y-XtElHOp-Q8iL-g';
export const planningDatabase=()=>createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
const error=(message:string,status=400)=>Object.assign(new Error(message),{status});
export async function planningAccess(request:Request,write=false){
 const db=planningDatabase(),token=request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];if(!token)throw error('La sesión venció. Volvé a ingresar.',401);
 const auth=await db.auth.getUser(token);const user=auth.data.user;if(auth.error||!user)throw error('La sesión venció. Volvé a ingresar.',401);
 let profile=await db.from('sellers').select('role,roles,is_active').eq('id',user.id).maybeSingle();if(profile.error)throw error('No se pudieron verificar los permisos.',503);if(!profile.data&&user.email){profile=await db.from('sellers').select('role,roles,is_active').ilike('email',user.email.toLowerCase().replace(/[%_]/g,'\\$&')).maybeSingle();if(profile.error)throw error('No se pudieron verificar los permisos.',503);}
 const roles=[profile.data?.role,...(profile.data?.roles||[])];const active=profile.data?.is_active!==false;
 const admin=active&&(roles.includes('admin')||['diego.boveda@gmail.com','caroibarra.93@gmail.com'].includes((user.email||'').toLowerCase()));
 const canWrite=active&&(admin||roles.includes('logistica'));const canRead=canWrite||active&&roles.includes('administracion');
 if(!canRead||write&&!canWrite)throw error('No tenés permiso para esta acción de logística.',403);return {db,actor:user.id,canWrite,admin};
}
export async function planningRows(query:any){const rows:any[]=[];for(let i=0;;i+=500){const result=await query.range(i,i+499);if(result.error)throw result.error;rows.push(...result.data);if(result.data.length<500)return rows;}}
export async function planningCatalog(db:any){const rows=await planningRows(db.from('carriers').select('id,name,is_active').order('name'));return canonicalCarrierOptions(rows);}
export async function planningPreferences(db:any){
 const [history,profiles]=await Promise.all([
  planningRows(db.from('logistics_dispatch_plans').select('carrier_id,status,planned').order('created_at',{ascending:false})),
  planningRows(db.from('sellers').select('id,full_name,role,roles,is_active').eq('is_active',true).order('full_name'))
 ]);
 const recipients=profiles.filter(p=>/^laura\s+guerra$/i.test(p.full_name)&&(p.role==='administracion'||p.roles?.includes('administracion')));
 return {defaults:carrierPlanningDefaults(history),paymentRecipient:recipients.length===1?{id:recipients[0].id,name:recipients[0].full_name}:null,routers:profiles.filter(p=>p.role==='logistica'||p.roles?.includes('logistica')).map(p=>({id:p.id,name:p.full_name}))};
}
const sourceNumber=(v:unknown)=>{const s=String(v||'').trim().replace(/\s*km$/i,'').replace(',','.');return /^\d+(\.\d+)?$/.test(s)?Number(s):null;};
const sourceTime=(v:unknown)=>{const m=String(v||'').match(/^(\d{1,2}):(\d{2})$/);return m?m[1].padStart(2,'0')+':'+m[2]:'';};
export async function sourcePlans(db:any,from:string,to:string){
 const [rows,carriers]=await Promise.all([fetchSpreadsheetValues(SOURCE_IDS.follow,"'Seguimiento'!A2:AC2093"),planningCatalog(db)]);
 return rows.flatMap((v,row)=>{const date=sheetDate(v[0]),code=String(v[1]||'').trim().toUpperCase();if(!date||date<from||date>to||!/^LOG_REC_\d+[A-Z]?$/.test(code))return [];const carrier=resolveCarrierIdentity(String(v[2]||''),carriers);const kms=[v[8],v[9],v[10]].map(sourceNumber),count=Math.max(1,kms.findLastIndex(n=>n!==null)+1),counts=String(v[17]||'').split('/').map(sourceNumber),urls=String(v[18]||'').split(/\s+--\s+|\n/);return [{code,row:row+2,carrierName:planningCarrierName(String(v[2]||'')),carrierState:carrier.state,planned:{deliveryDate:date,carrierId:carrier.carrier?.id||'',vehicle:String(v[4]||''),companion:/sin acompa/i.test(String(v[3]))?'':String(v[3]||''),router:/^pablo$/i.test(String(v[5]||'').trim())?'Pablo Jara':String(v[5]||''),departure:sourceTime(v[6]),expectedReturn:'',expectedMinutes:null,loads:Array.from({length:count},(_,i)=>({runNumber:i+1,zone:count===1?String(v[16]||''):'',routeUrl:urls[i]||'',plannedKm:kms[i],plannedOrders:counts.length===count?counts[i]:null,departure:i===0?sourceTime(v[6]):'',expectedMinutes:sourceDuration(String(v[12]||'').split('/')[i])})),notes:'',tariffId:null,agreedAmount:null},actual:{loads:count===1?[{runNumber:1,departure:sourceTime(v[20]),arrival:sourceTime(v[21])||sourceTime(v[13]),arrivalNextDay:false}]:[],km:sourceNumber(v[25])??sourceNumber(v[15]),notes:count>1?'Los horarios históricos corresponden al total del LOG; falta separarlos por carga.':''},legacy:{values:v,row:row+2,spreadsheetId:SOURCE_IDS.follow},review:[...(count>1?['Confirmar zona, enlace y horarios reales de cada carga. Zona general de origen: '+String(v[16]||'Sin dato')+'.']:[]),...(sourceNumber(v[25])!==null&&sourceNumber(v[15])!==null&&sourceNumber(v[25])!==sourceNumber(v[15])?['Los kilómetros de P y Z difieren; revisar el total.']:[])]}];});
}
export async function previewTariffs(db:any){const [values,carriers]=await Promise.all([fetchSpreadsheetValues(tariffSpreadsheet,"'TarifaVehicular'!A2:J999"),planningCatalog(db)]);return parseTariffRows(values.map((values,i)=>({row:i+2,values})),carriers).filter(r=>r.periodMonth||r.current).map(r=>({...r,effectiveFrom:r.periodMonth?r.periodMonth+'-01':null,terms:normalizeImportedTerms(values[r.sourceRow-2]),importable:!!(r.periodMonth&&(r.carrierId||r.companyKey))}));}
export async function createSourceFloor(){
 const [tracking,summary,cash]=await Promise.all([fetchSpreadsheetValues(SOURCE_IDS.follow,"'Seguimiento'!B2:B2093"),fetchSpreadsheetValues(SOURCE_IDS.logistics,"'ResumenCostoPorEntregas'!A2:A10000"),fetchSpreadsheetValues(SOURCE_IDS.cash,"'Caja'!A2:A12000")]);return maximumLogNumber([...tracking,...summary,...cash].map(r=>r[0]));
}
export async function savePlanning(db:any,actor:string,body:any){
 const planned=validateDispatchPlan(body.planned),status=String(body.status||'planned');if(!['planned','in_progress','completed','cancelled'].includes(status))throw error('Estado inválido.');
 const actual=validateDispatchActual(body.actual,status==='completed',planned.loads.map(l=>l.runNumber));const catalog=await planningCatalog(db),carrier=catalog.find(c=>c.id===planned.carrierId);if(!carrier)throw error('El fletero no está activo o tiene una identidad duplicada.');
 let old:any=null;if(body.dispatchId){const r=await db.from('logistics_dispatch_plans').select('*').eq('dispatch_id',body.dispatchId).single();if(r.error)throw r.error;old=r.data;if(!Number.isInteger(body.version)||body.version!==old.version)throw error('Otra persona modificó esta salida. Actualizá antes de guardar.',409);if(old.planned.carrierId!==planned.carrierId||old.planned.deliveryDate!==planned.deliveryDate)throw error('Fecha y fletero del LOG no se cambian.');}
 const areas=new Set(planned.loads.map(l=>/la\s+plata|z[aá]rate/i.test(l.zone)?'lp_zarate':'regular'));
 let tariffSnapshot:any=null;if(planned.tariffId){let rate:any;if(old?.tariff_snapshot?.id===planned.tariffId){tariffSnapshot=old.tariff_snapshot;rate={effective_from:tariffSnapshot.effectiveFrom,effective_to:tariffSnapshot.effectiveTo,carrier_id:tariffSnapshot.carrierId,company_key:tariffSnapshot.companyKey,zone_variant:tariffSnapshot.zoneVariant};}else{const r=await db.from('logistics_carrier_tariffs').select('*').eq('id',planned.tariffId).single();if(r.error)throw r.error;rate=r.data;tariffSnapshot=rateSnapshot(rate);}const area=planned.loads.some(l=>l.zone.trim())?(areas.has('lp_zarate')?'lp_zarate':'regular'):rate.zone_variant;if(!tariffApplies(rate,carrier,planned.deliveryDate,area)&&!(area==='lp_zarate'&&tariffApplies(rate,carrier,planned.deliveryDate,'la_plata')))throw error('La tarifa no corresponde a la fecha, fletero o zona.');}
 const estimate=estimateDispatchFee(planned,tariffSnapshot);
 let sourceCode:string|null=null,legacy:any=null;if(!body.dispatchId&&body.sourceCode){const source=await sourcePlans(db,planned.deliveryDate,planned.deliveryDate),matches=source.filter(s=>s.code===body.sourceCode);if(matches.length!==1)throw error('El LOG de la planilla es inexistente o ambiguo.');const match=matches[0];if(match.planned.carrierId!==planned.carrierId)throw error('El LOG de la planilla corresponde a otro fletero.');const existing=await db.from('logistics_dispatches').select('delivery_date,carrier_name').eq('code',match.code).maybeSingle();if(existing.error)throw existing.error;if(existing.data&&(existing.data.delivery_date!==planned.deliveryDate||!sameSettlementCarrier(existing.data.carrier_name,carrier.name)))throw error('El LOG existente tiene otra fecha o fletero.');sourceCode=match.code;legacy=match.legacy;}
 if(!body.dispatchId&&!/^[0-9a-f-]{36}$/i.test(body.requestKey||''))throw error('Falta la identificación de la solicitud.');
 const floor=body.dispatchId||sourceCode?0:await createSourceFloor();
 const payload={dispatchId:body.dispatchId||null,version:body.version,requestKey:body.requestKey,sourceCode,planned,actual,status,tariffSnapshot,estimate,legacy};
 let taskArgs:any={};
 if(body.sendToAdministration){const row={dispatch_id:body.dispatchId,status,planned,actual,tariff_snapshot:tariffSnapshot,logistics_dispatches:{code:old?((await db.from('logistics_dispatches').select('code').eq('id',body.dispatchId).single()).data?.code):sourceCode,carrier_name:carrier.name}};const fee=approveLiquidation(row,{basis:planned.agreedAmount!==null?'agreed':'calculated',base:planned.agreedAmount,additions:[],notes:actual.notes});taskArgs={p_fee:fee,p_summary:closureMessage(row,fee)};}
 const result=await db.rpc(body.sendToAdministration?'save_logistics_plan_with_payment_task':'save_logistics_dispatch_plan',{p_actor:actor,p_payload:payload,p_floor:floor,...taskArgs});if(result.error)throw error(result.error.message,result.error.code==='40001'?409:400);return result.data;
}
export async function confirmPlanningTask(db:any,actor:string,body:any){
 const r=await db.from('logistics_dispatch_plans').select('*,logistics_dispatches(code,carrier_name)').eq('dispatch_id',body.dispatchId).single();if(r.error)throw r.error;
 if(r.data.version!==body.version)throw error('La salida cambió. Actualizá.',409);
 const fee=approveLiquidation(r.data,body);
 const result=await db.rpc('confirm_logistics_payment_task',{p_actor:actor,p_dispatch:body.dispatchId,p_version:body.version,p_fee:fee,p_summary:closureMessage(r.data,fee)});if(result.error)throw result.error;return result.data;
}
export async function importTariffs(db:any,actor:string,selected:number[]){if(!Array.isArray(selected)||selected.length>250||!selected.length)throw error('Seleccioná las tarifas a importar.');const fresh=await previewTariffs(db);const rows=fresh.filter(r=>selected.includes(r.sourceRow));if(rows.length!==new Set(selected).size||rows.some(r=>!r.importable))throw error('Hay tarifas sin fletero o empresa identificados.');const data=await Promise.all(rows.map(async r=>{const input=JSON.stringify([r.periodMonth,r.zoneVariant,r.terms,r.carrierId,r.companyKey]),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(input))),n=>n.toString(16).padStart(2,'0')).join('');return {label:r.label,carrier_id:r.carrierId,company_key:r.companyKey,zone_variant:r.zoneVariant,effective_from:r.effectiveFrom,terms:r.terms,source_key:tariffSpreadsheet+':'+hash,created_by:actor};}));const saved=await db.from('logistics_carrier_tariffs').upsert(data,{onConflict:'source_key',ignoreDuplicates:true});if(saved.error)throw saved.error;return {imported:rows.length};}
export function planningPeriod(from:string,to:string){if(!validDate(from)||!validDate(to)||from>to||Date.parse(to)-Date.parse(from)>93*86400000)throw error('Elegí un período de hasta 93 días.');}
export async function saveTariff(db:any,actor:string,body:any){
 if(!validDate(body.effectiveFrom)||body.effectiveTo&&(!validDate(body.effectiveTo)||body.effectiveTo<body.effectiveFrom))throw error('Completá la descripción y vigencia de la tarifa.');
 const companyKey=['gyv','gavaplast'].includes(body.companyKey)?body.companyKey:null;const carrierId=body.carrierId||null;if(companyKey&&carrierId||!companyKey&&!carrierId)throw error('Seleccioná un fletero o una empresa.');if(carrierId&&!(await planningCatalog(db)).some(c=>c.id===carrierId))throw error('Fletero inválido.');if(!['regular','la_plata','lp_zarate'].includes(body.zoneVariant))throw error('Zona tarifaria inválida.');
 const terms:Record<string,any>=Object.fromEntries(['baseDay','hour','extraHour','extraKm','companion','includedKm','bonus'].map(key=>[key,planningNumber(body.terms?.[key],100000000)]));terms.includedMinutes=planningNumber(body.terms?.includedMinutes,2880);terms.includesTolls=body.terms?.includesTolls===true?true:body.terms?.includesTolls===false?false:null;
 const catalog=await planningCatalog(db),label=tariffDisplayName({carrier_id:carrierId,company_key:companyKey,effective_from:body.effectiveFrom},catalog);
 if(body.supersedesTariffId){const old=await db.from('logistics_carrier_tariffs').select('id').eq('id',body.supersedesTariffId).single();if(old.error)throw old.error;}
 const result=await db.from('logistics_carrier_tariffs').insert({label,...(body.supersedesTariffId?{supersedes_tariff_id:body.supersedesTariffId}:{}),carrier_id:carrierId,company_key:companyKey,zone_variant:body.zoneVariant,effective_from:body.effectiveFrom,effective_to:body.effectiveTo||null,terms,created_by:actor}).select('id').single();if(result.error)throw result.error;return result.data;
}
