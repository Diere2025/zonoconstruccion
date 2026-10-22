import {financialContext} from '@/lib/financialOperations/server';
import {allRows} from '@/lib/paymentPlanning/server';
import {reconcileReserve,type ReserveRow,type ReserveBankRow} from '@/lib/mpReserve/reconcile';
import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {reserveConfigurations,type ReserveId} from '@/lib/mpReserve/config';
export const runtime='edge';export const dynamic='force-dynamic';
const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request:Request){
 if(request.headers.get('x-webhook-token')!==(process.env.MP_WEBHOOK_SECRET||'mpchecker_secret_key_123'))return reply({success:false,error:'Token inválido'},401);
 try{
  const text=await request.text();if(text.length>524288)throw Error('Captura demasiado grande');const body=JSON.parse(text),url=new URL(body.url);
  const match=url.pathname.match(/^\/savings\/movements\/([0-9a-f-]{36})\/?$/i);
  const config=match?reserveConfigurations[match[1] as ReserveId]:undefined;
  if(body.type!=='RESERVE_WEB_CAPTURE'||url.protocol!=='https:'||!['mercadopago.com.ar','www.mercadopago.com.ar'].includes(url.hostname)||!config)throw Error('Origen de reserva inválido');
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY,host=process.env.NEXT_PUBLIC_SUPABASE_URL;if(!key||!host)throw Error('Captura no configurada');
  const db=createClient(host,key,{auth:{persistSession:false,autoRefreshToken:false}}),accounts=await db.from('mp_accounts').select('id,name,alias').eq('is_active',true);if(accounts.error)throw accounts.error;
  const value=String(body.account||'').trim().toLowerCase(),matches=(accounts.data||[]).filter(a=>[a.id,a.name,a.alias].some(v=>v&&v.toLowerCase()===value));
  if(matches.length!==1||matches[0].id!==config.mpAccountId)throw Error('La reserva no corresponde a la cuenta seleccionada');
  const result=await db.rpc('capture_mp_reserve_web',{p_mp:matches[0].id,p_reserve:match![1],p_rows:body.rows});if(result.error)throw result.error;
  return reply({success:true,...result.data});
 }catch(e){return reply({success:false,error:(e as Error).message},400);}
}

export async function GET(request:Request){try{const {db}=await financialContext(request);const reserveId=new URL(request.url).searchParams.get('reserve_id')||'000101a7-1f12-4102-9d9e-871da7f7b326';const config=reserveConfigurations[reserveId as ReserveId];if(!config)throw Error('Reserva no configurada');const rows=await allRows<ReserveRow>(db.from('mp_reserve_web_rows').select('id,occurred_at,amount,kind,description').eq('mp_account_id',config.mpAccountId).eq('reserve_id',reserveId).order('id'));
 const bank=await allRows<ReserveBankRow>(db.from('mp_bank_web_rows').select('id,operation_id,occurred_at,amount,description,operation_kind').eq('mp_account_id',config.mpAccountId).order('id'));return reply(reconcileReserve(rows,bank,config));}catch(e){return reply({error:(e as {message?:string}).message||'No se pudo consultar reserva'},(e as {status?:number}).status||400);}}
