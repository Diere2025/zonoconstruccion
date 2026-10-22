import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {verifyFinanzasToken} from '@/lib/finanzasPro/firebaseAuth';
export const runtime='edge';export const dynamic='force-dynamic';
const origins=new Set(['https://finanzaspro-2-b28cb.web.app','https://finanzaspro-2-b28cb.firebaseapp.com','http://localhost:5173','http://127.0.0.1:5173']);
function headers(request:Request){const origin=request.headers.get('origin')||'';return {'Cache-Control':'no-store','Vary':'Origin',...(origins.has(origin)?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, PATCH, OPTIONS'}:{})};}
const reply=(request:Request,value:unknown,status=200)=>NextResponse.json(value,{status,headers:headers(request)});
export async function OPTIONS(request:Request){return new Response(null,{status:origins.has(request.headers.get('origin')||'')?204:403,headers:headers(request)});}
async function context(request:Request){
 const origin=request.headers.get('origin');if(origin&&!origins.has(origin))throw Error('Origen no permitido');
 const token=request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];if(!token)throw Error('Sesión requerida');
 const actor=await verifyFinanzasToken(token);
 const host=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!host||!key)throw Error('Integración no configurada');
 const source=createClient(host,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const config=await source.from('finanzaspro_sync_config').select('destination_url,destination_key,enabled,firebase_project').eq('id',true).single();if(config.error||!config.data?.enabled)throw Error('La sincronización todavía no está habilitada');
 if(actor.aud!==config.data.firebase_project)throw Error('Sesión inválida');
 return {actor:actor.sub,db:createClient(config.data.destination_url,config.data.destination_key,{auth:{persistSession:false,autoRefreshToken:false}})};
}
function failure(request:Request,error:unknown){const message=error instanceof Error?error.message:'No se pudo completar la revisión';return reply(request,{error:message},/sesión|Sesión|Origen/.test(message)?401:/cambió|asociados|existe/.test(message)?409:400);}
export async function GET(request:Request){try{
 const {db}=await context(request);const inbox=await db.from('zono_extraction_inbox').select('*').order('updated_at',{ascending:false}).limit(500);if(inbox.error)throw inbox.error;
 const movements: {id:string;fecha:string;caja:string;categoria:string;concepto:string;tipo:string;monto:number;firebase_id:string|null}[]=[];for(let start=0;;start+=1000){const page=await db.from('movimientos').select('id,fecha,caja,categoria,concepto,tipo,monto,firebase_id').gte('fecha','2026-09-28').order('id').range(start,start+999);if(page.error)throw page.error;movements.push(...(page.data||[]));if((page.data||[]).length<1000)break;}
 const boxes=await db.from('cajas').select('nombre,moneda').order('nombre');if(boxes.error)throw boxes.error;
 const boxCurrencies=new Map((boxes.data||[]).map(b=>[b.nombre,b.moneda||'ARS']));
 const items=(inbox.data||[]).map(row=>({...row,candidates:movements.filter(m=>boxCurrencies.get(m.caja)===row.payload.currency&&Math.round(Number(m.monto)*100)===Math.round(Number(row.payload.amount)*100)&&Math.abs(Date.parse(m.fecha)-Date.parse(row.payload.date))<=2*86400000).map(m=>({...m,match_reason:m.fecha===row.payload.date?'Mismo importe, moneda y fecha; confirmar relación':'Mismo importe y moneda, fecha cercana; confirmar relación'}))}));
 return reply(request,{items,movements,from:'2026-10-01',fetchedAt:new Date().toISOString()});
 }catch(error){return failure(request,error);}}
export async function PATCH(request:Request){try{
 const {db,actor}=await context(request);const raw=await request.text();if(raw.length>12000)throw Error('Solicitud demasiado grande');const body=JSON.parse(raw);
 if(typeof body.source!=='string'||! /^[0-9a-f-]{36}$/i.test(body.source)||!Number.isSafeInteger(body.revision)||body.revision<1||!['approve','link','dismiss'].includes(body.action))throw Error('Solicitud inválida');
 const result=await db.rpc('review_zono_extraction',{p_source:body.source,p_revision:body.revision,p_action:body.action,p_data:body.data||{},p_actor:actor});if(result.error)throw new Error(result.error.message);return reply(request,result.data);
 }catch(error){return failure(request,error);}}
