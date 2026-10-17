export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { contrastAndSyncPurchaseSheet, DEFAULT_SINCE_DATE } from '@/lib/erp/purchaseSheetSync';

export async function GET(req: NextRequest) {
  try {
    const sinceDate = req.nextUrl.searchParams.get('since') || DEFAULT_SINCE_DATE;
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
    const body = await req.json().catch(() => ({}));
    const sinceDate = body?.sinceDate || DEFAULT_SINCE_DATE;
    const summary = await contrastAndSyncPurchaseSheet({
      sinceDate,
      execute: true,
    });
    return NextResponse.json(summary);
  } catch (error: any) {
    console.error('[purchase-sheet-sync][POST] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Error al sincronizar la planilla de órdenes de compra y recepciones.' },
      { status: 500 }
    );
  }
}
