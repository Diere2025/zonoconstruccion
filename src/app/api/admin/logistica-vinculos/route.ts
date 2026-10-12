import {NextResponse} from 'next/server';
import {dispatchAccess,prepareDispatchSync,readDispatches,dispatchDetail} from '@/lib/logisticsDispatch/server';
import {treasuryToday} from '@/lib/treasuryTransactionTime';
export const runtime='edge';export const dynamic='force-dynamic';
const reply=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'no-store'}});
const failure=(e:unknown)=>{const x=e as {status?:number;message?:string;code?:string};return reply({error:['42P01','PGRST205'].includes(x.code||'')?'Falta habilitar los vínculos de logística.':x.message||'No se pudo consultar la vinculación.'},x.status||400);};
export async function GET(request:Request){try{
 const {db}=await dispatchAccess(request),url=new URL(request.url),from=url.searchParams.get('from')||'2026-09-01',to=url.searchParams.get('to')||treasuryToday(),code=url.searchParams.get('delivery');
 if(code)return reply(await dispatchDetail(db,code));
 if(url.searchParams.get('action')==='preview'){const p=await prepareDispatchSync(db,from,to);return reply({hash:p.hash,summary:p.summary,issues:p.payload.issues,from,to});}
 return reply({...await readDispatches(db,from,to),from,to});
}catch(e){return failure(e);}}
export async function POST(request:Request){try{
 const {db,actor}=await dispatchAccess(request),body=await request.json();
 if(body.action!=='sync'||typeof body.hash!=='string')return reply({error:'Primero revisá la vista previa.'},400);
 const prepared=await prepareDispatchSync(db,body.from,body.to);
 if(prepared.hash!==body.hash)return reply({error:'Los datos cambiaron. Volvé a preparar la vinculación.'},409);
 const r=await db.rpc('sync_logistics_dispatch_links',{p_actor:actor,p_payload:prepared.payload});if(r.error)throw r.error;
 return reply({summary:r.data});
}catch(e){return failure(e);}}
