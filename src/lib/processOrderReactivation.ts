import { SupabaseClient } from '@supabase/supabase-js';
import { reactivateOrderInAllSheets, SheetOrderPayload } from '@/lib/googleSheets';

export async function processOrderReactivation(
  db: SupabaseClient, orderId: string, sellerId: string
) {
  const { data: order, error } = await db.from('orders').select('*').eq('id', orderId).single();
  if (error || !order) throw new Error('No se pudo consultar el pedido reactivado');
  if (order.status === 'Cancelado' || order.status === 'Anulado') {
    return { skipped: true, reason: 'El pedido volvió a estar anulado' };
  }
  if (order.channel === 'mayorista' && sellerId !== '3820a0fe-bb0a-4a84-ad85-79e49868cad7') {
    return { skipped: true, reason: 'Pedido mayorista sin planillas operativas' };
  }
  const code = String(order.legacy_code || '').trim();
  if (!code) throw new Error('El pedido no tiene código de planilla; revisar antes de reactivar');

  const [itemsResult, creationResult, sellerResult, clientResult, methodResult, mediumResult] = await Promise.all([
    db.from('order_items').select('product_name,quantity,unit_price').eq('order_id', orderId),
    db.from('order_sync_jobs').select('payload').eq('order_id', orderId).eq('kind', 'create').maybeSingle(),
    db.from('sellers').select('full_name').eq('id', sellerId).maybeSingle(),
    order.client_id ? db.from('clients').select('phone_primary,tax_id').eq('id', order.client_id).maybeSingle() : Promise.resolve({data:null}),
    order.payment_method_id ? db.from('payment_methods').select('name').eq('id', order.payment_method_id).maybeSingle() : Promise.resolve({data:null}),
    order.order_medium_id ? db.from('order_mediums').select('name').eq('id', order.order_medium_id).maybeSingle() : Promise.resolve({data:null})
  ]);
  if (itemsResult.error || !itemsResult.data?.length) throw new Error('No se pudieron consultar los productos del pedido');
  const previous = (creationResult.data?.payload?.order || {}) as SheetOrderPayload;
  const payments = order.totals?.payments_breakdown;
  const paidAmount = Array.isArray(payments)
    ? payments.reduce((sum: number, payment: {amount?:number}) => sum + Number(payment.amount || 0), 0)
    : Number(order.totals?.deposit_amount || 0);
  const sheetOrder: SheetOrderPayload = {
    ...previous,
    deliveryDate: order.initial_delivery_date || previous.deliveryDate,
    orderDate: order.order_date || previous.orderDate,
    maxDeliveryDate: order.max_delivery_date || previous.maxDeliveryDate,
    clientName: order.customer_name || previous.clientName || '',
    phonePrimary: clientResult.data?.phone_primary || previous.phonePrimary || '',
    whaticketLink: order.whaticket_link || previous.whaticketLink || '',
    deliveryNotes: [order.delivery_notes, order.delivery_detail].filter(Boolean).join(' / '),
    medium: mediumResult.data?.name || previous.medium || '',
    sellerName: sellerResult.data?.full_name || previous.sellerName || '',
    status: order.status,
    locality: order.locality || previous.locality || '',
    address: order.address || previous.address || '',
    mapsLink: order.google_maps_link || previous.mapsLink || '',
    category: order.category || previous.category || '',
    paymentMethod: methodResult.data?.name || previous.paymentMethod || '',
    identification: clientResult.data?.tax_id || previous.identification || '',
    paymentStatus: order.payment_status === 'Seniado' ? 'Señado'
      : order.payment_status === 'Abonado' ? 'Abonado' : 'No Abonado',
    depositOrPaidAmount: paidAmount,
    freightType: order.freight_type || previous.freightType || '',
    freightCost: Number(order.totals?.freight || 0),
    items: itemsResult.data.map(item => ({ name: item.product_name || '',
      quantity: Number(item.quantity), unitPrice: Number(item.unit_price) }))
  };
  const sheets = await reactivateOrderInAllSheets(sellerId, code, sheetOrder);
  if (!sheets.seller.success) throw new Error(`Planilla de la vendedora: ${sheets.seller.message || 'No se pudo actualizar'}`);
  return { code, sheets };
}
