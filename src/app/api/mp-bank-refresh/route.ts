import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {financialContext} from '@/lib/financialOperations/server';
export const runtime='edge';export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store, max-age=0'}});
const validId=(value:unknown)=>typeof value==='string'&&/^[0-9a-f-]{36}$/i.test(value);
function monitor(request:Request,body:any){
 if(request.headers.get('x-webhook-token')!==(process.env.MP_WEBHOOK_SECRET||'mpchecker_secret_key_123'))return null;
 const u=new URL(body.url);if(u.protocol!=='https:'||!['www.mercadopago.com.ar','mercadopago.com.ar'].includes(u.hostname))throw Error('Origen inválido');
 const channel=u.pathname.replace(/\/$/,'')==='/activities'?'activity':u.pathname.replace(/\/$/,'')==='/banking/movements'?'banking':null;if(!channel)throw Error('Canal inválido');
 if(body.channel!==channel)throw Error('La pestaña no corresponde al canal');
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw Error('Monitor no configurado');
 return {channel,db:createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})};
}
export async function POST(request:Request){try{
 const body=await request.json();
 if(['poll','complete'].includes(body.action)){
  const context=monitor(request,body);if(!context)return reply({error:'Token inválido'},401);
  const accounts=await context.db.from('mp_accounts').select('id,name,alias').eq('is_active',true);if(accounts.error)throw accounts.error;
  const value=String(body.account||'').trim().toLowerCase();const matches=(accounts.data||[]).filter(a=>[a.id,a.name,a.alias].some(v=>v&&v.toLowerCase()===value));if(matches.length!==1)throw Error('Cuenta inválida');
  if(body.action==='complete'&&(!validId(body.id)||typeof body.ok!=='boolean'))throw Error('Resultado inválido');
  const result=await context.db.rpc(body.action==='poll'?'poll_mp_capture_refresh':'complete_mp_capture_refresh',body.action==='poll'?{p_account:matches[0].id,p_channel:context.channel}:{p_account:matches[0].id,p_channel:context.channel,p_id:body.id,p_ok:body.ok,p_message:String(body.message||'Lectura terminada')});if(result.error)throw result.error;
  return reply({success:true,data:result.data});
 }
 const {db,actor}=await financialContext(request,true);if(body.action!=='request'||!['activity','banking'].includes(body.channel))throw Error('Solicitud inválida');
 const from=String(body.from||'2026-10-01'),to=String(body.to||new Date().toLocaleDateString('en-CA',{timeZone:'America/Argentina/Buenos_Aires'}));
 if(!/^2026-\d{2}-\d{2}$/.test(from)||!/^2026-\d{2}-\d{2}$/.test(to)||from<'2026-09-30'||to<from||(Date.parse(to)-Date.parse(from))/86400000>31)throw Error('Seleccioná un período válido de hasta 31 días');
 const accounts=await db.from('mp_accounts').select('id,name,alias').eq('is_active',true);if(accounts.error)throw accounts.error;
 const value=String(body.accountId||'').toLowerCase();const selected=(accounts.data||[]).filter(a=>[a.id,a.name,a.alias].some(v=>v&&v.toLowerCase()===value));if(selected.length!==1)throw Error('Elegí una cuenta configurada');
 const r=await db.rpc('request_mp_capture_refresh',{p_account:selected[0].id,p_channel:body.channel,p_user:actor,p_history:body.history===true,p_from:from,p_to:to});if(r.error)throw r.error;
 return reply({success:true,data:[{...r.data,account_name:(selected[0].alias||selected[0].name)+(body.channel==='activity'?' · Actividad':' · Movimientos')}]});
 }catch(error){return reply({error:(error as Error).message||'No se pudo actualizar'},(error as {status?:number}).status||400);}}
export async function GET(request:Request){try{
 const {db}=await financialContext(request,true);const ids=(new URL(request.url).searchParams.get('ids')||'').split(',');if(!ids.length||ids.length>4||ids.some(id=>!validId(id)))throw Error('Solicitud inválida');
 const result=await db.from('mp_capture_refresh_requests').select('id,account_id,channel,status,message,created_at,history').in('id',ids);if(result.error)throw result.error;
 return reply({success:true,data:(result.data||[]).map(r=>['queued','reading'].includes(r.status)&&Date.now()-Date.parse(r.created_at)>(r.history?900000:120000)?{...r,status:'expired',message:'La pestaña de Mercado Pago no respondió a tiempo'}:r)});
 }catch(error){return reply({error:(error as Error).message||'No se pudo consultar'},(error as {status?:number}).status||400);}}
