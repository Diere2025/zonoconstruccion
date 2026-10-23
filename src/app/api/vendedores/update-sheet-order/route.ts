import { NextRequest, NextResponse } from 'next/server';
import {
  updateOrderInSellerSheet,
  cancelOrderInAllSheets,
  getOrderStatusInSellerSheet,
  isSellerOrderNotYetProcessed,
  normalizeSellerNameForSheet,
  syncOrderModificationToOperationalSheets,
  prepareOrderModificationCodes,
  SELLER_SHEET_CONFIG,
  SheetOrderPayload
} from '@/lib/googleSheets';
import { createClient } from '@supabase/supabase-js';
import { finishOrderModificationNotice } from '@/lib/orderModificationNotices';

export const runtime = 'edge';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ckvbyfgsbjbfaqotmeld.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

export async function POST(req: NextRequest) {
  let resolvedLegacyCode = '';
  let noticeId: string | undefined;
  const noticeResults: Record<string, {success?: boolean; skipped?: boolean; message?: string}> = {};
  try {
    const body = await req.json();
    const { action, sellerId, legacyCode, orderId, order, logisticsObservation, cancelReason, sheetStatus } = body as {
      action?: 'update' | 'cancel';
      sellerId: string;
      legacyCode: string;
      orderId?: string;
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

    if (action === 'cancel') {
      const cancellationSync = await cancelOrderInAllSheets(sellerId, legacyCode, cancelReason);
      return NextResponse.json({
        synced: Object.values(cancellationSync).every(result => result.success),
        code: legacyCode,
        cancellationSync
      });
    }

    const config = SELLER_SHEET_CONFIG[sellerId];
    if (!config || !config.enabled) {
      return NextResponse.json({
        synced: false,
        message: 'La sincronización de planilla no está habilitada para este vendedor'
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

    // La UI puede reintentar con el código anterior si perdió la respuesta
    // después de asignar una continuación. Recuperar siempre la identidad del ERP.
    const lookup = supabaseAdmin.from('orders').select('id,legacy_code');
    const { data: dbOrder, error: lookupError } = await (orderId
      ? lookup.eq('id', orderId)
      : lookup.eq('legacy_code', legacyCode)).maybeSingle();
    if (lookupError) throw lookupError;
    if (!dbOrder) return NextResponse.json({synced: false, message: 'No se encontró el pedido en el ERP'}, {status: 404});
    resolvedLegacyCode = dbOrder.legacy_code || legacyCode;
    noticeId = typeof body.modificationId === 'string' ? body.modificationId : crypto.randomUUID();
    const monitor = await supabaseAdmin.rpc('start_order_modification_notice', {
      p_id:noticeId,p_order:dbOrder.id,p_code:resolvedLegacyCode,p_notify:body.notifyLogistics === true,
      p_details:{clientName:order.clientName,sellerName:order.sellerName,items:(order.items || []).map(item=>({name:item.name,quantity:item.quantity})),
        changes:Array.isArray(body.changes) ? body.changes.filter((change: unknown)=>typeof change==='string') : [],observation:logisticsObservation || ''}
    });
    if (monitor.error) throw new Error(`No se pudo registrar el seguimiento de la modificación: ${monitor.error.message}`);

    // Procedencia por defecto si viene vacía
    if (!order.source || order.source.trim() === '') {
      order.source = 'Publicidad Meta';
    }

    // Los pedidos con estado "No está" todavía no fueron tomados por Logística.
    // Sólo se actualiza la planilla de la vendedora y se conserva su estado.
    const currentSellerStatus = await getOrderStatusInSellerSheet(
      config.spreadsheetId,
      config.sheetName,
      resolvedLegacyCode
    );
    const operationalSyncSkipped = isSellerOrderNotYetProcessed(currentSellerStatus);
    if (operationalSyncSkipped) {
      noticeResults.central = {skipped:true};
      noticeResults.deliveriesCurrent = {skipped:true};
    }

    resolvedLegacyCode = await prepareOrderModificationCodes(config.spreadsheetId, config.sheetName,
      resolvedLegacyCode, order, async code => {
        const { error } = await supabaseAdmin.from('orders').update({legacy_code: code}).eq('id', dbOrder.id);
        if (error) throw error;
        resolvedLegacyCode = code;
      });

    // 1. Sincronizar con Central y Entregas Actual sólo cuando Logística ya procesó el pedido.
    const operationalSync = operationalSyncSkipped
      ? undefined
      : await syncOrderModificationToOperationalSheets(
          resolvedLegacyCode,
          order,
          logisticsObservation
        );
    if (operationalSync) Object.assign(noticeResults,operationalSync);

    // 2. Si aplicó el cambio en Central -> '🔹 Pasado'; "No está" se conserva.
    const sellerStatus = operationalSyncSkipped
      ? currentSellerStatus!
      : (operationalSync?.central.success ? '🔹 Pasado' : (sheetStatus || 'Modificado'));

    // 3. Actualizar planilla de la vendedora con el estado correspondiente
    const result = await updateOrderInSellerSheet(
      config.spreadsheetId,
      config.sheetName,
      resolvedLegacyCode,
      order,
      logisticsObservation,
      sellerStatus
    );
    noticeResults.seller = result;
    const failures = Object.entries(noticeResults).filter(([,value])=>!value.success && !value.skipped)
      .map(([key,value])=>`${key}: ${value.message || 'No se completó la actualización'}`);
    const modificationNotice = await finishOrderModificationNotice(supabaseAdmin,noticeId!,resolvedLegacyCode,noticeResults,failures);

    if (!result.success) {
      return NextResponse.json(
        { synced: false, code: resolvedLegacyCode, operationalSync, modificationNotice, message: result.message || 'Código no encontrado en la planilla' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      synced: operationalSyncSkipped || !!(operationalSync?.central.success && operationalSync?.deliveriesCurrent.success),
      code: resolvedLegacyCode,
      rowNumber: result.rowNumber,
      operationalSync,
      operationalSyncSkipped,
      modificationNotice
    });
  } catch (err: any) {
    console.error('[update-sheet-order POST] Error:', err);
    let modificationNotice;
    if (noticeId) {
      try {
        modificationNotice = await finishOrderModificationNotice(supabaseAdmin,noticeId,resolvedLegacyCode,noticeResults,[err.message || 'Error de sincronización']);
      } catch {
        modificationNotice = {managed:true,sent:false,pending:true,error:'El seguimiento quedó pendiente; el worker revisará la modificación interrumpida.'};
      }
    }
    return NextResponse.json(
      { synced: false, code: resolvedLegacyCode || undefined, modificationNotice, error: err.message || 'Error al actualizar el pedido en la planilla' },
      { status: 500 }
    );
  }
}
