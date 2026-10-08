import { NextResponse } from 'next/server';
import { requireFinanceAdmin } from '@/lib/financeAdminAccess';
import { costDatabase, readCosts, syncCosts } from '@/lib/costs/server';
import { today, validateSetting } from '@/lib/costs/model';
export const dynamic='force-dynamic';
export const runtime='edge';
export async function GET(request:Request){
  const denied=await requireFinanceAdmin(request);if(denied)return NextResponse.json({error:denied.error},{status:denied.status});
  try{const db=costDatabase();const url=new URL(request.url);const code=url.searchParams.get('purchases');if(code){const r=await db.from('cost_purchase_events').select('data').eq('code',code).eq('active',true).order('purchase_date',{ascending:false}).limit(500);if(r.error)throw new Error(r.error.message);const state=await readCosts(db);const quotes=(state.supplierQuotes||[]).filter((q:{code:string})=>q.code===code);return NextResponse.json({purchases:[...r.data.map(p=>p.data),...quotes].sort((a,b)=>b.date.localeCompare(a.date))});}return NextResponse.json(await readCosts(db));}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'No se pudo leer costos'},{status:500});}
}
export async function POST(request:Request){
  const denied=await requireFinanceAdmin(request);if(denied)return NextResponse.json({error:denied.error},{status:denied.status});
  try{
    const body=await request.json();const db=costDatabase();
    if(body.action==='sync')return NextResponse.json(await syncCosts(db));
    if(body.action==='setting'){
      const setting=validateSetting(body.setting);if(setting.effective>today())throw new Error('La fecha de vigencia no puede estar en el futuro.');
      const state=await readCosts(db);if(setting.code!=='GLOBAL'&&!state.current?.some((p:{code:string})=>p.code===setting.code))throw new Error('Producto desconocido.');
      const r=await db.from('cost_settings').upsert({code:setting.code,effective:setting.effective,data:setting},{onConflict:'code,effective'});if(r.error)throw new Error(r.error.message);
      return NextResponse.json(await syncCosts(db));
    }
    if(body.action==='acknowledge') {if(typeof body.id!=='string'||!/^[0-9a-f-]{36}$/i.test(body.id))throw new Error('Alerta inválida.');const r=await db.from('cost_alerts').update({acknowledged_at:new Date().toISOString()}).eq('id',body.id);if(r.error)throw new Error(r.error.message);return NextResponse.json({success:true});}
    return NextResponse.json({error:'Acción inválida'},{status:400});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'No se pudo actualizar costos'},{status:500});}
}
