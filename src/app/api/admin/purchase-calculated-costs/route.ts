import { NextResponse } from 'next/server';
import { requirePurchaseOperator } from '@/lib/purchaseAccess';
import { readCosts } from '@/lib/costs/server';
import { Result } from '@/lib/costs/model';
export const runtime='edge';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
  const denied=await requirePurchaseOperator(request);
  if(denied)return NextResponse.json({error:denied.error},{status:denied.status});
  try {
    const state=await readCosts();
    return NextResponse.json({updatedAt:state.updatedAt,current:(state.current||[]).map((p:Result)=>({id:p.id,equivalentIds:p.equivalentIds,name:p.name,material:p.material}))});
  } catch(error) {
    return NextResponse.json({error:error instanceof Error?error.message:'No se pudieron leer los costos calculados.'},{status:500});
  }
}
