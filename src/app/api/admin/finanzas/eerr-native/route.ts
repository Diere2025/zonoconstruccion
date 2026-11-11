import {NextResponse} from 'next/server';
import {requireFinanceAdmin} from '@/lib/financeAdminAccess';
import {costDatabase} from '@/lib/costs/server';
import {GET as marginReport} from '../../rentabilidad-diaria/route';
import {partnerAssignments} from '@/lib/financialOperations/partnerReporting';
import {readBatches} from '@/lib/financialOperations/readBatches';
import {buildReport,displayDate,localToday,localYesterday,period,validateProvisions,type Movement,type Sale} from '@/lib/eerrNative/model';
export const runtime='edge';
export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(request:Request){
 const denied=await requireFinanceAdmin(request);if(denied)return reply({error:denied.error},denied.status);
 try{
  const url=new URL(request.url),latestDay=localYesterday();
  const p=period(url.searchParams.get('month')||'',latestDay,url.searchParams.get('until')??undefined);const db=costDatabase();
  const marginUrl=new URL(request.url);marginUrl.searchParams.set('from',p.start);marginUrl.searchParams.set('to',p.cutoff);marginUrl.searchParams.set('mode','historical');
  const [marginResponse,config]=await Promise.all([marginReport(new Request(marginUrl,{headers:request.headers})),db.from('eerr_monthly_provisions').select('provisions,version,updated_at').eq('month',p.start).maybeSingle()]);
  const margin=await marginResponse.json();if(!marginResponse.ok)throw new Error(margin.error||'No se pudo leer rentabilidad.');
  const missingMigration=!!config.error&&['42P01','PGRST205'].includes(config.error.code);if(config.error&&!missingMigration)throw new Error(config.error.message);
  const raw:any[]=[];
  const next=new Date(Date.parse(p.cutoff+'T12:00:00Z')+86400000).toISOString().slice(0,10);
  for(let offset=0;;offset+=500){const r=await db.from('cash_transactions').select('id,movement_code,created_at,concept,category,type,amount,currency,business_unit,reversal_of_transaction_id').gte('created_at',p.start+'T00:00:00-03:00').lt('created_at',next+'T00:00:00-03:00').order('id').range(offset,offset+499);if(r.error)throw new Error(r.error.message);raw.push(...r.data);if(r.data.length<500)break;}
  const reversed=new Set<string>();await readBatches(raw.map(r=>r.id),async ids=>{for(let offset=0;;offset+=500){const r=await db.from('cash_transactions').select('id,reversal_of_transaction_id').in('reversal_of_transaction_id',ids).order('id').range(offset,offset+499);if(r.error)throw new Error(r.error.message);r.data.forEach(x=>reversed.add(x.reversal_of_transaction_id));if(r.data.length<500)break;}});
  const assignments=await partnerAssignments(db,raw.map(r=>r.id));
  const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'});
  const movements:Movement[]=raw.map(r=>({id:r.id,code:r.movement_code||r.id,day:fmt.format(new Date(r.created_at)),concept:r.concept||'',category:r.category||'',type:r.type,amount:Number(r.amount),personal:(assignments.get(r.id)||[]).reduce((n,a)=>n+a.amount,0),currency:r.currency||'',businessUnit:r.business_unit||'',reversed:!!r.reversal_of_transaction_id||reversed.has(r.id)}));
  const provisions=validateProvisions(config.data?.provisions||{});const report=buildReport(p.month,margin.orders as Sale[],movements,provisions,latestDay,p.cutoff);
  const allExclusions=(margin.exclusions||[]) as {code:string;reason:string;scope:string;affectsResult?:boolean}[];
  const exclusions=allExclusions.filter(e=>e.affectsResult!==false);
  const omittedOrders=allExclusions.filter(e=>e.affectsResult===false);
  // A missing or conflicting delivery date must not silently yield a complete result.
  if(exclusions.length){report.issues.push(...exclusions.map(e=>({reference:e.code,reason:e.reason.replace(/\b\d{4}-\d{2}-\d{2}\b/g,displayDate)})));report.status='incomplete';report.totals.result=null;}
  return reply({...report,omittedOrders,provisions,version:config.data?.version||0,canSave:!missingMigration,costUpdatedAt:margin.updatedAt,generatedAt:new Date().toISOString(),migrationNotice:missingMigration?'Falta habilitar la precarga mensual en la base de datos.':null});
 }catch(e){return reply({error:e instanceof Error?e.message:'No se pudo calcular el EERR nativo.'},400);}
}
export async function PUT(request:Request){
 const denied=await requireFinanceAdmin(request);if(denied)return reply({error:denied.error},denied.status);
 try{const body=await request.json(),p=period(body.month,localToday()),provisions=validateProvisions(body.provisions);if(!Number.isSafeInteger(body.version)||body.version<0)throw new Error('Versión inválida.');
  const db=costDatabase(),token=request.headers.get('authorization')!.replace(/^Bearer\s+/i,'');const auth=await db.auth.getUser(token);if(auth.error||!auth.data.user)return reply({error:'La sesión venció.'},401);
  const r=await db.rpc('save_eerr_provisions',{p_actor:auth.data.user.id,p_month:p.start,p_version:body.version,p_provisions:provisions});if(r.error)return reply({error:r.error.message},r.error.code==='40001'?409:400);
  return reply({saved:true,version:r.data.version});
 }catch(e){return reply({error:e instanceof Error?e.message:'No se pudo guardar la precarga.'},400);}
}
