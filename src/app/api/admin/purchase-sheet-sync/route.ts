export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {requirePurchaseOperator} from '@/lib/purchaseAccess';
import {isAccountDate,isUuid} from '@/lib/supplierAccount';
import {processSupplierSheetJob,withPurchaseSheetLease} from '@/lib/supplierAccounts/sheetSync';
import {
  contrastAndSyncPurchaseSheet,
  DEFAULT_SINCE_DATE,
  syncErpPurchaseOrdersToSheet,
} from '@/lib/erp/purchaseSheetSync';

export async function GET(req: NextRequest) {
  try {
    const denied=await requirePurchaseOperator(req);if(denied)return NextResponse.json({error:denied.error},{status:denied.status});
    const sinceDate = req.nextUrl.searchParams.get('since') || DEFAULT_SINCE_DATE;
    if(!isAccountDate(sinceDate))return NextResponse.json({error:'Fecha inválida.'},{status:400});
    const summary = await contrastAndSyncPurchaseSheet({
      sinceDate,
      execute: false,
    });
    return NextResponse.json(summary);
  } catch (error: any) {
    console.error('[purchase-sheet-sync][GET] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Error al contrastar la planilla de órdenes de compra y recepciones.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const denied=await requirePurchaseOperator(req);if(denied)return NextResponse.json({error:denied.error},{status:denied.status});
    const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
    const body = await req.json().catch(() => ({}));

    if (body?.action === 'push_orders') {
      const poIds = Array.isArray(body.poIds) ? body.poIds : body.poId ? [body.poId] : [];
      if(!poIds.length||poIds.length>100||poIds.some((id:unknown)=>!isUuid(id)))return NextResponse.json({error:'Elegí hasta 100 OCs válidas.'},{status:400});
      const result = await withPurchaseSheetLease(db,()=>syncErpPurchaseOrdersToSheet(poIds));
      return NextResponse.json({ ok: true, ...result });
    }

    if (body?.action === 'push_reception') {
      const receptionId = String(body.receptionId || '').trim();
      if(!isUuid(receptionId))return NextResponse.json({error:'Recepción inválida.'},{status:400});
      const result = await processSupplierSheetJob(db,receptionId,true);
      return NextResponse.json({ ok: true, ...result });
    }

    const sinceDate = body?.sinceDate || DEFAULT_SINCE_DATE;
    if(!isAccountDate(sinceDate))return NextResponse.json({error:'Fecha inválida.'},{status:400});
    const summary = await withPurchaseSheetLease(db,()=>contrastAndSyncPurchaseSheet({
      sinceDate,
      execute: true,
    }));
    return NextResponse.json(summary);
  } catch (error: any) {
    console.error('[purchase-sheet-sync][POST] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Error al sincronizar la planilla de órdenes de compra y recepciones.' },
      { status: 500 }
    );
  }
}
