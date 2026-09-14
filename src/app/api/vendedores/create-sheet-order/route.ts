import { NextRequest, NextResponse } from 'next/server';
import {
  appendOrderToSellerSheet,
  getNextAvailableSheetCode,
  normalizeSellerNameForSheet,
  SELLER_SHEET_CONFIG,
  SheetOrderPayload
} from '@/lib/googleSheets';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'edge';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ckvbyfgsbjbfaqotmeld.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

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

    // Ensure sellerName is correctly set to the real seller name from the database
    if (!order.sellerName || order.sellerName === 'Vendedor' || (sellerId !== '381df0d1-183f-4ccb-aaf2-8147c76159a9' && order.sellerName === 'Diego Bóveda')) {
      try {
        const { data: sRow } = await supabaseAdmin
          .from('sellers')
          .select('full_name')
          .eq('id', sellerId)
          .maybeSingle();
        if (sRow?.full_name) {
          order.sellerName = sRow.full_name;
        }
      } catch (sErr) {
        console.warn('Could not lookup seller name in create-sheet-order:', sErr);
      }
    }

    order.sellerName = normalizeSellerNameForSheet(order.sellerName);

    // Asegurar que el estado en planilla siempre sea '🔸 Validado' salvo que esté 'En Espera'
    if (order.status !== 'En Espera') {
      order.status = '🔸 Validado';
    }

    // Procedencia por defecto si viene vacía
    if (!order.source || order.source.trim() === '') {
      order.source = 'Publicidad Meta';
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
