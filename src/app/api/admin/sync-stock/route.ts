export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { compareStockSheet, syncStockFromSheet } from '@/lib/erp/stockSheetSync';

export async function GET() {
  try {
    return NextResponse.json(await compareStockSheet());
  } catch (error: any) {
    console.error('Error in sync-stock GET:', error);
    return NextResponse.json({ error: error.message || 'Error interno al procesar comparación.' }, { status: 500 });
  }
}

export async function POST() {
  try {
    return NextResponse.json(await syncStockFromSheet());
  } catch (error: any) {
    console.error('Error in sync-stock POST:', error);
    return NextResponse.json({ error: error.message || 'Error interno al sincronizar el stock.' }, { status: 500 });
  }
}
