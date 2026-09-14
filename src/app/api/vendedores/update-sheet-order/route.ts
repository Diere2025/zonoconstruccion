import { NextRequest, NextResponse } from 'next/server';
import {
  updateOrderInSellerSheet,
  cancelOrderInSellerSheet,
  normalizeSellerNameForSheet,
  SELLER_SHEET_CONFIG,
  SheetOrderPayload
} from '@/lib/googleSheets';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'edge';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ckvbyfgsbjbfaqotmeld.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, sellerId, legacyCode, order, logisticsObservation, cancelReason, sheetStatus } = body as {
      action?: 'update' | 'cancel';
      sellerId: string;
      legacyCode: string;
      order?: SheetOrderPayload;
      logisticsObservation?: string;
      cancelReason?: string;
      sheetStatus?: string;
    };

    if (!sellerId || !legacyCode) {
      return NextResponse.json(
        { error: 'sellerId y legacyCode son requeridos' },
        { status: 400 }
      );
    }

    const config = SELLER_SHEET_CONFIG[sellerId];
    if (!config || !config.enabled) {
      return NextResponse.json({
        synced: false,
        message: 'La sincronización de planilla no está habilitada para este vendedor'
      });
    }

    // Acción de anulación directa en la planilla
    if (action === 'cancel') {
      const cancelResult = await cancelOrderInSellerSheet(
        config.spreadsheetId,
        config.sheetName,
        legacyCode,
        cancelReason
      );

      if (!cancelResult.success) {
        return NextResponse.json(
          { synced: false, message: cancelResult.message || 'Código no encontrado en la planilla' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        synced: true,
        code: cancelResult.code,
        rowNumber: cancelResult.rowNumber
      });
    }

    if (!order) {
      return NextResponse.json(
        { error: 'order es requerido para actualizar' },
        { status: 400 }
      );
    }

    // Asegurar que sellerName corresponda con la base de datos si falta
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
        console.warn('Could not lookup seller name in update-sheet-order:', sErr);
      }
    }

    order.sellerName = normalizeSellerNameForSheet(order.sellerName);

    // Procedencia por defecto si viene vacía
    if (!order.source || order.source.trim() === '') {
      order.source = 'Publicidad Meta';
    }

    const result = await updateOrderInSellerSheet(
      config.spreadsheetId,
      config.sheetName,
      legacyCode,
      order,
      logisticsObservation,
      sheetStatus
    );

    if (!result.success) {
      return NextResponse.json(
        { synced: false, message: result.message || 'Código no encontrado en la planilla' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      synced: true,
      code: result.code,
      rowNumber: result.rowNumber
    });
  } catch (err: any) {
    console.error('[update-sheet-order POST] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Error al actualizar el pedido en la planilla' },
      { status: 500 }
    );
  }
}
