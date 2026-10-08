import { NextResponse } from 'next/server';
import { syncCosts } from '@/lib/costs/server';
export const dynamic='force-dynamic';
export const runtime='edge';
export async function POST(request:Request){
  const secret=process.env.COST_SYNC_SECRET;
  if(!secret||request.headers.get('authorization')!==`Bearer ${secret}`)return NextResponse.json({error:'No autorizado'},{status:401});
  try{return NextResponse.json(await syncCosts());}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Falló la actualización'},{status:500});}
}
