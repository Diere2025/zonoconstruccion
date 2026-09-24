import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isExpressFreight, processSheetOrder, sendExpressOrderAlert, sendRouteFormationAlert } from '@/lib/processSheetOrder';
import { processOrderCancellation } from '@/lib/processOrderCancellation';
import { processOrderReactivation } from '@/lib/processOrderReactivation';
import { sendPersonalOrderAlert } from '@/lib/personalOrderTelegram';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: config, error: configError } = await db.from('order_sync_worker_config').select('secret').eq('id', true).single();
  if (configError || !config || req.headers.get('authorization') !== `Bearer ${config.secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const started = Date.now();
  let processed = 0;
  // pg_net owns this request: closing the seller's browser cannot cancel it.
  while (Date.now() - started < 80000 && processed < 10) {
    const { data: jobs, error } = await db.rpc('claim_order_sync_job', {worker_version:2});
    if (error) return NextResponse.json({ error: 'No se pudo leer la cola' }, { status: 500 });
    const job = jobs?.[0];
    if (!job) break;
    const warnings: string[] = [];
    let result: Record<string, any> = {};
    let successMessage = 'Planillas y avisos procesados correctamente.';
    let confirmedCode = job.code;
    try {
      const current = await db.from('orders').select('status,legacy_code,customer_name,channel').eq('id',job.order_id).single();
      if (current.error || !current.data) throw new Error('No se pudo consultar el estado actual del pedido');
      if (job.kind === 'cancel' && current.data.status !== 'Cancelado' && current.data.status !== 'Anulado') {
        result = { skipped: true, reason: 'El pedido ya no está anulado' };
        successMessage = 'Anulación omitida: el pedido fue reactivado.';
      } else if (job.kind === 'cancel') {
        const cancellation = await processOrderCancellation(db, req.url, job, current.data, current.data.channel === 'mayorista');
        result = cancellation.result;
        warnings.push(...cancellation.warnings);
        successMessage = cancellation.message;
        confirmedCode = cancellation.code || null;
      } else if (job.kind === 'reactivate') {
        result = await processOrderReactivation(db, job.order_id, job.seller_id);
        confirmedCode = result.code || current.data.legacy_code || null;
        successMessage = result.skipped ? result.reason : 'Pedido reactivado en Central y Entregas Actual; retirado de Cancelados.';
      } else if (current.data.status === 'Cancelado') {
        result = {skipped:true, reason:'cancelled'};
        successMessage = 'Carga omitida: el pedido fue anulado antes de sincronizar.';
      } else {
      if (current.data.channel === 'mayorista') {
        confirmedCode = current.data.legacy_code || job.order_id.slice(0, 8);
        const origin = new URL(req.url).origin;
        const formationAlert = await sendRouteFormationAlert(origin, confirmedCode, job.payload.order, null);
        const expressAlert = isExpressFreight(job.payload.order.freightType)
          ? await sendExpressOrderAlert(origin, confirmedCode, job.payload.order)
          : { attempted: false, sent: false };
        result = { synced: true, code: confirmedCode, sheetsSkipped: true, formationAlert, expressAlert };
        successMessage = 'Pedido mayorista procesado en el ERP y avisos enviados.';
      } else {
      const response = await processSheetOrder(new NextRequest(new URL('/api/vendedores/create-sheet-order', req.url), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sellerId: job.seller_id, order: job.payload.order, syncOperational: true })
      }), async code => {
        confirmedCode = code;
        const orderUpdate = await db.from('orders').update({ legacy_code: code }).eq('id', job.order_id);
        if (orderUpdate.error) throw new Error(`La planilla se cargó (${code}), pero no se pudo guardar el código en el ERP: ${orderUpdate.error.message}`);
        const progress = await db.from('order_sync_jobs').update({ code }).eq('id', job.id);
        if (progress.error) throw new Error('La planilla se cargó pero no se pudo registrar el progreso. Revisar antes de reintentar.');
      });
      result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Falló la carga en planillas');
      if (!result.synced) warnings.push(result.message || 'El vendedor no tiene una planilla habilitada.');
      const sync = result.operationalSync;
      if (result.synced && !result.operationalSyncSucceeded) {
        for (const [key, label] of [['central','Central'], ['deliveriesCurrent','Entregas Actual'], ['sellerStatusSync','Estado de la vendedora'], ['centralStatusSync','Estado de Central']]) {
          if (!sync?.[key]?.success) warnings.push(`${label}: ${sync?.[key]?.message || 'No se completó'}`);
        }
      }
      }
      for (const [key, label] of [['formationAlert','Telegram recorridos'], ['expressAlert','Telegram Express']]) {
        if (result[key]?.attempted && !result[key]?.sent) warnings.push(`${label}: ${result[key].message || 'No se pudo enviar'}`);
      }
      const telegramNotifications = ['formationAlert', 'expressAlert'].flatMap(key => {
        const alert = result[key];
        return alert?.sent && alert?.messageId && alert?.chatId
          ? [{ type: key, messageId: alert.messageId, chatId: String(alert.chatId) }]
          : [];
      });
      let receiptResult: Record<string, any> | null = null;
      if (job.payload.receipts?.receipts?.length) {
        const receipts = await fetch(new URL('/api/vendedores/telegram-notify', req.url), {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...job.payload.receipts, legacyCode: result.code || job.order_id.slice(0,8) })
        });
        receiptResult = await receipts.json();
        if (!receipts.ok || !receiptResult?.ok) warnings.push('Telegram comprobantes: no se pudo enviar.');
      }
      if (telegramNotifications.length || receiptResult?.ok) {
        const { data: order } = await db.from('orders').select('totals').eq('id',job.order_id).single();
        if (order) {
          const receiptUrls = new Set(job.payload.receipts?.receipts?.map((r: { url: string }) => r.url) || []);
          const receiptMessageIds: number[] = Array.isArray(receiptResult?.messageIds)
            ? receiptResult.messageIds
            : (receiptResult?.messageId ? [receiptResult.messageId] : []);
          let receiptIndex = 0;
          const paymentsBreakdown = (order.totals?.payments_breakdown || []).map((payment: {receipt_url?: string}) => {
            if (!receiptResult?.ok || !payment.receipt_url || !receiptUrls.has(payment.receipt_url)) return payment;
            const messageId = receiptMessageIds[receiptIndex] || receiptMessageIds[0];
            receiptIndex++;
            return {
              ...payment,
              telegram_sent: true,
              telegram_message_id: messageId,
              telegram_chat_id: receiptResult.chatId ? String(receiptResult.chatId) : undefined
            };
          });
          const updated = await db.from('orders').update({ totals: {
            ...order.totals,
            telegram_notifications: [
              ...(Array.isArray(order.totals?.telegram_notifications) ? order.totals.telegram_notifications : []),
              ...telegramNotifications
            ],
            payments_breakdown: paymentsBreakdown
          }}).eq('id',job.order_id);
          if (updated.error) warnings.push('Avisos enviados, pero no se pudieron guardar sus identificadores en el ERP.');
        }
      }
      }
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : 'Error de sincronización');
    }
    if (job.kind === 'create') {
      try {
        const personalAlert = await sendPersonalOrderAlert(db, job.order_id, confirmedCode, job.created_at);
        result.personalAlert = personalAlert;
        if (personalAlert.attempted && !personalAlert.sent) {
          warnings.push(`Telegram nuevos pedidos: ${personalAlert.message || 'No se pudo enviar'}`);
        }
        if (personalAlert.sent && personalAlert.messageId && personalAlert.chatId) {
          const { data: order } = await db.from('orders').select('totals').eq('id', job.order_id).single();
          if (order) {
            const notifications = Array.isArray(order.totals?.telegram_notifications)
              ? order.totals.telegram_notifications : [];
            const savedAlert = await db.from('orders').update({ totals: {
              ...order.totals,
              telegram_notifications: [...notifications, {
                type: 'newOrderAlert', messageId: personalAlert.messageId, chatId: personalAlert.chatId
              }]
            }}).eq('id', job.order_id);
            if (savedAlert.error) warnings.push('Aviso de nuevo pedido enviado, pero no se pudo guardar su identificador en el ERP.');
          }
        }
      } catch (error) {
        warnings.push(`Telegram nuevos pedidos: ${error instanceof Error ? error.message : 'Error inesperado'}`);
      }
    }
    const saved = await db.from('order_sync_jobs').update({
      status: warnings.length ? 'attention' : 'completed', result, code:confirmedCode,
      message: warnings.length ? warnings.join('\n') : successMessage,
      finished_at: new Date().toISOString()
    }).eq('id', job.id);
    // Leave processing in place on persistence failure; stale recovery surfaces it without replaying writes.
    if (saved.error) return NextResponse.json({ error: 'No se pudo registrar el resultado' }, { status: 500 });
    processed++;
  }
  return NextResponse.json({ processed });
}
