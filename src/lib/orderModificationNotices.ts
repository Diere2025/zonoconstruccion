import type { SupabaseClient } from '@supabase/supabase-js';
import { splitOrderCodes } from './orderSync';

type Notice = {
  id: string; lease: string; original_code: string; code: string; new_codes: string[];
  failures: string[]; telegram_error: string; ticket_id?: string; ticket_number?: number;
  details: { clientName?: string; sellerName?: string; changes?: string[]; observation?: string;
    items?: Array<{name: string; quantity: number}> };
  results: Record<string, {success?: boolean; skipped?: boolean; message?: string}>;
};
export type ModificationNoticeResult = { managed: true; sent: boolean; pending: boolean; ticketId?: string; error?: string };
const escape = (value: unknown) => String(value ?? '').slice(0,250).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

export function buildOrderModificationNotice(notice: Notice): string {
  const failed = notice.failures.length > 0 || !!notice.telegram_error;
  const title = failed ? '🚨 MODIFICACIÓN CON FALLAS' : notice.new_codes.length ? '⚠️ NUEVO CÓDIGO POR MODIFICACIÓN' : '📝 PEDIDO MODIFICADO';
  const lines = [`<b>${title}</b>`, `Pedido original: <b>${escape(notice.original_code)}</b>`,
    `Cliente: ${escape(notice.details.clientName)}`, `Vendedora: ${escape(notice.details.sellerName)}`];
  const codes = splitOrderCodes(notice.code);
  for (const code of notice.new_codes) {
    const index = codes.indexOf(code);
    lines.push('', `Se generó el pedido <b>${escape(code)}</b> por la modificación del pedido <b>${escape(notice.original_code)}</b>, al superar los 12 productos por código.`);
    for (const item of (notice.details.items || []).slice(index*12,(index+1)*12)) {
      lines.push(`• ${escape(item.quantity)} × ${escape(item.name)}`);
    }
  }
  if (notice.new_codes.length) {
    lines.push('', '<b>Entregar juntos:</b>');
    for (const code of codes) lines.push(`${escape(code)}: VA CON EL PEDIDO ${escape(codes.filter(other=>other!==code).join(' / '))}`);
  } else {
    for (const change of (notice.details.changes || []).slice(0,12)) lines.push(`• ${escape(change)}`);
  }
  if (notice.details.observation) lines.push('', `Observación: ${escape(notice.details.observation)}`);
  const statusStart = lines.length;
  lines.push('');
  for (const [key,label] of [['seller','Vendedora'],['central','Central'],['deliveriesCurrent','Entregas Actual']]) {
    const result = notice.results[key];
    lines.push(result?.skipped ? `ℹ️ ${label}: todavía no corresponde el pase a Logística`
      : result?.success ? `✅ ${label}: actualizado` : `❌ ${label}: ${escape(result?.message || 'sin confirmación')}`);
  }
  for (const failure of notice.failures.slice(0,4)) lines.push(`❌ ${escape(failure)}`);
  if (notice.telegram_error) lines.push(`❌ Falló un envío anterior a Telegram: ${escape(notice.telegram_error)}`);
  if (notice.ticket_id) lines.push('', `🎫 Ticket ${notice.ticket_number ? `#${notice.ticket_number}` : escape(notice.ticket_id)} asignado a Diego para revisar en Incidencias.`);
  if (failed) lines.push('<b>Verificar ERP y planillas antes de preparar o completar la entrega.</b>');
  const tail = lines.slice(statusStart).join('\n');
  const head: string[] = [];
  for (const line of lines.slice(0,statusStart)) {
    if ([...head,line,tail].join('\n').length>3800) {head.push('… Detalle completo disponible en el ERP.');break;}
    head.push(line);
  }
  return [...head,tail].join('\n');
}

async function rpc(db: SupabaseClient, name: string, args: Record<string, unknown>) {
  const {data,error} = await db.rpc(name,args);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data;
}

/** Envío con lease y ticket persistentes; el worker del minuto reintenta los pendientes. */
export async function processOrderModificationNotice(db: SupabaseClient, id?: string): Promise<ModificationNoticeResult> {
  let claimed: Notice | undefined;
  try {
    claimed = (await rpc(db,'claim_order_modification_notice',{p_id:id || null}))?.[0];
    if (!claimed) {
      if (id) {
        const {data,error} = await db.from('order_modification_notices')
          .select('sent_at,ticket_id,state,notify_requested,new_codes,failures,telegram_error').eq('id',id).maybeSingle();
        if (error) throw new Error(error.message);
        if (data) return {managed:true,sent:!!data.sent_at,ticketId:data.ticket_id || undefined,
          pending:!data.sent_at && (data.state==='processing' || data.notify_requested || data.new_codes.length>0 || data.failures.length>0 || !!data.telegram_error)};
      }
      return {managed:true,sent:false,pending:false};
    }
    const notice = await rpc(db,'prepare_order_modification_ticket',{p_id:claimed.id}) as Notice;
    const token = process.env.LOGISTICS_TELEGRAM_BOT_TOKEN?.trim();
    if (!token) throw new Error('Falta configurar el bot de modificaciones de Telegram.');
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(15000),
      body:JSON.stringify({chat_id:process.env.LOGISTICS_TELEGRAM_CHAT_ID?.trim() || '-1002086594506',
        text:buildOrderModificationNotice(notice),parse_mode:'HTML'})
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.description || 'Telegram no confirmó el envío.');
    await rpc(db,'complete_order_modification_notice',{p_id:claimed.id,p_lease:claimed.lease,p_sent:true,p_error:'',p_message:payload.result?.message_id || null});
    return {managed:true,sent:true,pending:false,ticketId:notice.ticket_id};
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo procesar el aviso de modificación.';
    let ticketId: string | undefined;
    if (claimed) {
      try {
        await rpc(db,'complete_order_modification_notice',{p_id:claimed.id,p_lease:claimed.lease,p_sent:false,p_error:message});
        const notice = await rpc(db,'prepare_order_modification_ticket',{p_id:claimed.id}) as Notice;
        ticketId = notice.ticket_id;
      } catch { /* El registro durable queda pendiente para el siguiente ciclo. */ }
    }
    console.error('[OrderModificationNotice]',message);
    return {managed:true,sent:false,pending:true,error:message,ticketId};
  }
}

export async function finishOrderModificationNotice(db: SupabaseClient, id: string, code: string,
  results: Notice['results'], failures: string[]): Promise<ModificationNoticeResult> {
  await rpc(db,'finish_order_modification_notice',{p_id:id,p_code:code,p_results:results,p_failures:failures});
  return processOrderModificationNotice(db,id);
}
