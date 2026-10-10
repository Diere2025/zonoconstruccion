import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
export const runtime='edge';export const dynamic='force-dynamic';
function dbClient(){const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw Error('Monitor no configurado');return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});}
async function actor(db:ReturnType<typeof dbClient>,request:Request){
 const token=request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];if(!token)return null;
 const {data:{user},error}=await db.auth.getUser(token);if(error||!user)return null;
 const seller=await db.from('sellers').select('role,roles').eq('id',user.id).maybeSingle();if(seller.error)return null;
 const roles=[seller.data?.role,...(Array.isArray(seller.data?.roles)?seller.data.roles:[])];
 if(!roles.some(r=>['admin','administracion','logistica','fletero','seller'].includes(r))&&!['diego.boveda@gmail.com','caroibarra.93@gmail.com'].includes((user.email||'').toLowerCase()))return null;
 return user;
}
export async function POST(request:Request){try{
 const db=dbClient(),body=await request.json();
 if(body.action==='poll'||body.action==='complete'){
  if(request.headers.get('x-webhook-token')!==(process.env.MP_WEBHOOK_SECRET||'mpchecker_secret_key_123'))return NextResponse.json({error:'Token inválido'},{status:401});
  const origin=new URL(body.url);if(origin.protocol!=='https:'||!['mercadopago.com.ar','www.mercadopago.com.ar'].includes(origin.hostname)||origin.pathname.replace(/\/$/,'')!=='/activities')return NextResponse.json({error:'Monitor inválido'},{status:400});
  const accounts=await db.from('mp_accounts').select('id,name,alias').eq('is_active',true);if(accounts.error)throw accounts.error;
  const value=String(body.account||'').toLowerCase().trim();const matches=(accounts.data||[]).filter(a=>[a.id,a.name,a.alias].some(v=>v&&v.toLowerCase()===value));if(matches.length!==1)return NextResponse.json({error:'Cuenta inválida'},{status:400});
  const account=matches[0].id;
  if(body.action==='complete'&&(!/^[0-9a-f-]{36}$/i.test(body.id||'')||typeof body.ok!=='boolean'))return NextResponse.json({error:'Resultado inválido'},{status:400});
  const result=await db.rpc(body.action==='poll'?'poll_mp_refresh':'complete_mp_refresh',body.action==='poll'?{p_account:account}:{p_account:account,p_id:body.id,p_ok:body.ok,p_message:String(body.message||'Lectura terminada')});if(result.error)throw result.error;
  return NextResponse.json({success:true,data:result.data});
 }
 const user=await actor(db,request);if(!user)return NextResponse.json({error:'Acceso denegado'},{status:403});
 if(body.action!=='request')return NextResponse.json({error:'Acción inválida'},{status:400});
 const accounts=await db.from('mp_accounts').select('id,name,alias').eq('is_active',true);if(accounts.error)throw accounts.error;
 const value=String(body.accountId||'ALL').trim().toLowerCase();const selected=(accounts.data||[]).filter(a=>value==='all'||[a.id,a.name,a.alias].some(v=>v&&v.toLowerCase()===value));if(!selected.length)return NextResponse.json({error:'Cuenta inválida'},{status:400});
 const rows=[];for(const account of selected){const r=await db.rpc('request_mp_refresh',{p_account:account.id,p_user:user.id});if(r.error)throw r.error;rows.push({...r.data,account_name:account.alias||account.name});}
 return NextResponse.json({success:true,data:rows});
 }catch(e){return NextResponse.json({error:(e as Error).message||'No se pudo solicitar la lectura'},{status:400});}}
export async function GET(request:Request){try{
 const db=dbClient();if(!await actor(db,request))return NextResponse.json({error:'Acceso denegado'},{status:403});
 const ids=(new URL(request.url).searchParams.get('ids')||'').split(',');if(ids.length>20||ids.some(id=>!/^[0-9a-f-]{36}$/i.test(id)))return NextResponse.json({error:'Solicitud inválida'},{status:400});
 const result=await db.from('mp_refresh_requests').select('id,account_id,status,message,created_at,completed_at').in('id',ids);if(result.error)throw result.error;
 const data=(result.data||[]).map(r=>['queued','reading'].includes(r.status)&&Date.now()-Date.parse(r.created_at)>90000?{...r,status:'expired',message:'El monitor no respondió a tiempo'}:r);
 return NextResponse.json({success:true,data});
 }catch(e){return NextResponse.json({error:(e as Error).message||'No se pudo consultar la lectura'},{status:400});}}
