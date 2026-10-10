import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
export const runtime='edge';export const dynamic='force-dynamic';
export async function POST(request:Request){
 const secret=process.env.MP_WEBHOOK_SECRET||'mpchecker_secret_key_123';if(request.headers.get('x-webhook-token')!==secret)return NextResponse.json({success:false,error:'Token inválido'},{status:401});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)return NextResponse.json({success:false,error:'Captura bancaria no configurada'},{status:503});
 try{
  const text=await request.text();if(text.length>524288)return NextResponse.json({success:false,error:'Captura demasiado grande'},{status:413});const body=JSON.parse(text),activity=body.type==='BANK_ACTIVITY_CAPTURE';if(!activity&&body.type!=='BANK_WEB_CAPTURE')throw Error('Tipo de captura inválido');
  const origin=new URL(body.url);if(origin.protocol!=='https:'||!['mercadopago.com.ar','www.mercadopago.com.ar'].includes(origin.hostname)||!(activity?origin.pathname.replace(/\/$/,'')==='/activities':['/banking/movements','/balance/reports/movements'].includes(origin.pathname)))throw Error('Origen inválido');
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});const accounts=await db.from('mp_accounts').select('id,name,alias').eq('is_active',true);if(accounts.error)throw accounts.error;const account=String(body.account||'').trim().toLowerCase(),matching=(accounts.data||[]).filter(a=>[a.id,a.name,a.alias].some(v=>v&&String(v).toLowerCase()===account));if(matching.length!==1)throw Error('Cuenta de captura no reconocida');
  const {data,error}=await db.rpc(activity?'capture_mp_bank_activity':'capture_mp_bank_web',{p_mp:matching[0].id,p_rows:body.rows});if(error)throw error;return NextResponse.json({success:true,...data});
 }catch(error){return NextResponse.json({success:false,error:(error as {message?:string}).message||'No se pudo guardar la captura'},{status:400});}
}
