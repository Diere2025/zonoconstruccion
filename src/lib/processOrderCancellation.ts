import { SupabaseClient } from '@supabase/supabase-js';
import { cancelOrderInAllSheets } from '@/lib/googleSheets';

export async function processOrderCancellation(
  db: SupabaseClient, origin: string,
  job: {order_id:string; seller_id:string; payload:{reason?:string}},
  order: {legacy_code?:string | null; customer_name?:string},
  skipSheets = false
) {
  const warnings: string[] = [];
  const completedSteps: string[] = [];
  const code = order.legacy_code || '';
  const reason = job.payload.reason || 'Anulado desde ERP';
  let cancellationSync;
  if (skipSheets) {
    cancellationSync = { skipped: true };
  } else if (code) {
    cancellationSync = await cancelOrderInAllSheets(job.seller_id, code, reason);
    for (const [key,label] of [['seller','Planilla de la vendedora'],['central','Central'],
      ['cancelledSheet','Cancelados'],['deliveriesCurrent','Entregas Actual']] as const) {
      if (!cancellationSync[key].success) warnings.push(`${label}: ${cancellationSync[key].message || 'No se pudo anular'}`);
    }
    if (cancellationSync.cancelledSheet.success) completedSteps.push('✅ Registrado en Cancelados de Logística.');
    if (cancellationSync.deliveriesCurrent.success) completedSteps.push('✅ Retirado de Entregas Actual.');
  } else {
    const creation = await db.from('order_sync_jobs').select('status,message').eq('order_id',job.order_id).eq('kind','create').maybeSingle();
    if (creation.error || creation.data?.status === 'attention' || !creation.data) {
      warnings.push('El pedido no tiene código confirmado. Revisá si llegó a escribirse en las planillas antes de la anulación.');
    }
  }
  let telegramSent = false;
  try {
    const response = await fetch(new URL('/api/vendedores/telegram-notify', origin), {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({type:'cancellation', legacyCode:code, message:[
        `🚨 **PEDIDO ANULADO: ${code || job.order_id.slice(0,8)}**`,
        order.customer_name ? `Cliente: ${order.customer_name}` : '',
        `❌ **Motivo de Anulación:** ${reason}`,
        ...completedSteps,
        warnings.length ? `⚠️ Revisar sincronización:\n${warnings.join('\n')}` : ''
      ].filter(Boolean).join('\n')})
    });
    const data = await response.json();
    telegramSent = response.ok && !!data.ok;
    if (!telegramSent) warnings.push(`Telegram anulación: ${data.error || data.description || 'No se pudo enviar'}`);
  } catch {
    warnings.push('Telegram anulación: error de conexión');
  }
  return {code, warnings, result:{cancellationSync,telegramSent},
    message:skipSheets ? 'Pedido mayorista anulado en el ERP y aviso enviado.' : code ? 'Anulación registrada en Cancelados, retirada de Entregas Actual y avisada.' : 'Pedido anulado antes de su carga en planillas. Aviso enviado.'};
}
