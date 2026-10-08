import { NextResponse } from 'next/server';
import { requireFinanceAdmin } from '@/lib/financeAdminAccess';
import { readCosts, syncCosts } from '@/lib/costs/server';
export const runtime='edge';
export const dynamic='force-dynamic';

// Keep the existing Compras button, using the same authoritative engine as Costos.
export async function POST(request:Request){
  const denied=await requireFinanceAdmin(request);if(denied)return NextResponse.json({error:denied.error},{status:denied.status});
  try{const result=await syncCosts();if('busy' in result)return NextResponse.json({error:'Hay una actualización en curso.'},{status:409});return NextResponse.json({...result,sheetProductsCount:result.products,dbProductsCount:result.products,updatedCount:result.complete});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'No se pudieron actualizar costos.'},{status:500});}
}
export async function GET(request:Request){
  const denied=await requireFinanceAdmin(request);if(denied)return NextResponse.json({error:denied.error},{status:denied.status});
  try{const report=await readCosts();return NextResponse.json({updatedAt:report.updatedAt,lastError:report.lastError,products:report.current?.length||0});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'No se pudo consultar la actualización.'},{status:500});}
}
