import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireFinanceAdmin } from '@/lib/financeAdminAccess';
import { isUuid } from '@/lib/supplierAccount';
import { validateSupplierImport, validateSupplierReview } from '@/lib/supplierAccounts/importValidation';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';
async function context(request: Request) {
  const denied = await requireFinanceAdmin(request);
  if (denied) return { response: NextResponse.json({ error: denied.error }, { status: denied.status }) };
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const token = request.headers.get('authorization')!.replace(/^Bearer\s+/i, '');
  const {data:{user},error} = await db.auth.getUser(token);
  if (error || !user) return { response: NextResponse.json({error:'La sesión venció.'},{status:401}) };
  return {db,actor:user.id};
}
function failure(error:unknown) {
  const e=error as {code?:string;message?:string};
  const missing=['42P01','42703','PGRST202','PGRST205'].includes(e.code||'');
  return NextResponse.json({error:missing?'Falta habilitar la revisión de proveedores (migraciones 243 y 244).':e.message||'No se pudo guardar la revisión.'},
    {status:missing?503:e.code==='42501'?403:['40001','23505'].includes(e.code||'')?409:400});
}
export async function GET(request:Request) {
  try {
    const ctx=await context(request);if(ctx.response)return ctx.response;
    const params=new URL(request.url).searchParams,batch=params.get('batchId'),row=params.get('rowId');
    if(row){
      if(!isUuid(row))throw new Error('Fila inválida.');
      const result=await ctx.db.from('supplier_import_events').select('id,actor_id,before_value,after_value,created_at').eq('row_id',row).order('created_at',{ascending:false}).limit(50);
      if(result.error)throw result.error;return NextResponse.json({events:result.data},{headers:{'Cache-Control':'no-store'}});
    }
    if(!batch){
      const result=await ctx.db.from('supplier_import_batches').select('*').order('created_at',{ascending:false}).limit(100);
      if(result.error)throw result.error;return NextResponse.json({batches:result.data},{headers:{'Cache-Control':'no-store'}});
    }
    const page=Number(params.get('page')||0);
    if(!isUuid(batch)||!Number.isInteger(page)||page<0||page>100000)throw new Error('Lote o página inválidos.');
    let query=ctx.db.from('supplier_import_rows').select('*,supplier_source_links(*)',{count:'exact'}).eq('batch_id',batch);
    const status=params.get('status');if(status){if(!['pending_evidence','invalid','ambiguous','excluded','to_import','linked'].includes(status))throw new Error('Estado inválido.');query=query.eq('status',status);}
    const result=await query.order('source_row').order('component').order('id').range(page*50,page*50+49);
    if(result.error)throw result.error;return NextResponse.json({rows:result.data,count:result.count},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return failure(error);}
}
export async function POST(request:Request) {
  try{
    const ctx=await context(request);if(ctx.response)return ctx.response;
    const text=await request.text();if(text.length>4_000_000)throw new Error('El archivo supera el tamaño permitido.');
    const body=JSON.parse(text);
    if(body.action==='stage'){
      const payload=validateSupplierImport(body.preview);
      const result=await ctx.db.rpc('stage_supplier_import',{p_actor:ctx.actor,p_payload:payload});
      if(result.error)throw result.error;return NextResponse.json({batchId:result.data},{headers:{'Cache-Control':'no-store'}});
    }
    if(body.action!=='review'||!isUuid(body.requestId))throw new Error('Acción inválida.');
    const payload=validateSupplierReview(body);
    const result=await ctx.db.rpc('review_supplier_import',{p_actor:ctx.actor,p_request:body.requestId,p_payload:payload});
    if(result.error)throw result.error;return NextResponse.json({row:result.data},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return failure(error);}
}
