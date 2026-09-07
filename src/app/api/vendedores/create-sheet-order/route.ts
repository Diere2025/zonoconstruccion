import { NextRequest, NextResponse } from 'next/server';
import { appendOrderToSellerSheet, getNextAvailableSheetCode, SheetOrderPayload } from '@/lib/googleSheets';

export const runtime = 'edge';

// Seller spreadsheet configuration
const SELLER_SHEET_CONFIG: Record<string, { spreadsheetId: string; sheetName: string; enabled: boolean }> = {
  // Diego Bóveda
  '381df0d1-183f-4ccb-aaf2-8147c76159a9': {
    spreadsheetId: '1ccs1yPtwSSUf6dcA5XpxhpvPaWmHfJ0zsCfyJvEBvtg',
    sheetName: 'Pendientes',
    enabled: true
  },
  // Jazmín Sánchez
  '13430e05-b61a-4a3f-9fc3-152d377c4b0c': {
    spreadsheetId: '16DPcJEdrTMYvNSaUKQo9ODKClqe1VHLlKOX6O_sELRw',
    sheetName: 'Pendientes',
    enabled: true
  }
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sellerId = searchParams.get('sellerId');

    if (!sellerId) {
      return NextResponse.json({ error: 'sellerId is required' }, { status: 400 });
    }

    const config = SELLER_SHEET_CONFIG[sellerId];
    if (!config || !config.enabled) {
      return NextResponse.json({ synced: false, message: 'No sheet sync configured for this seller' });
    }

    const result = await getNextAvailableSheetCode(config.spreadsheetId, config.sheetName);
    return NextResponse.json({
      synced: true,
      code: result.code,
      rowNumber: result.rowNumber
    });
  } catch (err: any) {
    console.error('[create-sheet-order GET] Error:', err);
    return NextResponse.json({ error: err.message || 'Error checking next sheet code' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sellerId, order } = body as { sellerId: string; order: SheetOrderPayload };

    if (!sellerId || !order) {
      return NextResponse.json({ error: 'sellerId and order are required' }, { status: 400 });
    }

    const config = SELLER_SHEET_CONFIG[sellerId];
    if (!config || !config.enabled) {
      return NextResponse.json({
        synced: false,
        message: 'Sheet sync is not enabled for this seller'
      });
    }

    const result = await appendOrderToSellerSheet(
      config.spreadsheetId,
      config.sheetName,
      order
    );

    return NextResponse.json({
      synced: true,
      code: result.code,
      rowNumber: result.rowNumber
    });
  } catch (err: any) {
    console.error('[create-sheet-order POST] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Error writing order to Google Sheet' },
      { status: 500 }
    );
  }
}
