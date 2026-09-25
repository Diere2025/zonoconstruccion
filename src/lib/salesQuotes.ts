import { supabase } from '@/lib/supabase';

export type SalesQuoteChannel = 'minorista' | 'mayorista';
export type SalesQuoteStatus = 'draft' | 'sent' | 'follow_up' | 'accepted' | 'rejected' | 'expired' | 'converted';

export interface SalesQuoteItemInput {
  productId?: string | null;
  productName: string;
  sku?: string;
  variant?: string;
  quantity: number;
  listUnitPrice?: number;
  unitPrice: number;
  discountPercentage?: number;
  subtotal?: number;
  metadata?: Record<string, unknown>;
}

export interface SalesQuoteInput {
  channel: SalesQuoteChannel;
  clientId?: string | null;
  customerName?: string;
  customerPhone?: string;
  subtotal: number;
  discountType?: 'percentage' | 'fixed' | null;
  discountValue?: number;
  discountAmount?: number;
  freightAmount?: number;
  taxAmount?: number;
  totalAmount: number;
  paymentMethodId?: string | null;
  commercialConditions?: Record<string, unknown>;
  notes?: string;
  validUntil?: string;
  status?: SalesQuoteStatus;
  items: SalesQuoteItemInput[];
}

export async function saveSalesQuote(input: SalesQuoteInput, quoteId?: string) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('La sesión venció. Volvé a ingresar.');
  if (!input.items.length) throw new Error('Agregá al menos un producto al presupuesto.');

  const quoteValues = {
      client_id: input.clientId || null,
      channel: input.channel,
      customer_name: input.customerName?.trim() || null,
      customer_phone: input.customerPhone?.trim() || null,
      subtotal: input.subtotal || 0,
      discount_type: input.discountType || null,
      discount_value: input.discountValue || 0,
      discount_amount: input.discountAmount || 0,
      freight_amount: input.freightAmount || 0,
      tax_amount: input.taxAmount || 0,
      total_amount: input.totalAmount || 0,
      payment_method_id: input.paymentMethodId || null,
      commercial_conditions: input.commercialConditions || {},
      notes: input.notes?.trim() || null,
      valid_until: input.validUntil || null
    };
  const query = quoteId
    ? supabase.from('sales_quotes').update(quoteValues).eq('id', quoteId).is('converted_order_id', null)
    : supabase.from('sales_quotes').insert({ ...quoteValues, seller_id: userData.user.id, status: input.status || 'draft' });
  const { data: quote, error: quoteError } = await query.select('id, quote_number, status').single();
  if (quoteError) throw quoteError;

  const itemsToSave = input.items.map((item, index) => ({
      quote_id: quote.id,
      product_id: item.productId || null,
      product_name: item.productName,
      sku: item.sku || null,
      variant: item.variant || null,
      quantity: item.quantity,
      list_unit_price: item.listUnitPrice ?? item.unitPrice,
      unit_price: item.unitPrice,
      discount_percentage: item.discountPercentage || 0,
      subtotal: item.subtotal ?? item.unitPrice * item.quantity,
      metadata: item.metadata || {},
      sort_order: index
    }));
  const { data: oldItems, error: oldItemsError } = quoteId
    ? await supabase.from('sales_quote_items').select('id').eq('quote_id', quote.id).order('sort_order')
    : { data: [], error: null };
  if (oldItemsError) throw oldItemsError;
  const existingCount = Math.min(oldItems?.length || 0, itemsToSave.length);
  const { error: itemsError } = existingCount
    ? await supabase.from('sales_quote_items').upsert(itemsToSave.slice(0, existingCount).map((item, index) => ({ ...item, id: oldItems![index].id })), { onConflict: 'id' })
    : { error: null };
  if (itemsError) {
    if (!quoteId) await supabase.from('sales_quotes').delete().eq('id', quote.id);
    throw itemsError;
  }
  if (itemsToSave.length > existingCount) {
    const { error: insertError } = await supabase.from('sales_quote_items').insert(itemsToSave.slice(existingCount));
    if (insertError) {
      if (!quoteId) await supabase.from('sales_quotes').delete().eq('id', quote.id);
      throw insertError;
    }
  }
  if (quoteId && (oldItems?.length || 0) > itemsToSave.length) {
    const idsToDelete = oldItems!.slice(itemsToSave.length).map(item => item.id);
    const { error: deleteError } = await supabase.from('sales_quote_items').delete().in('id', idsToDelete);
    if (deleteError) throw deleteError;
  }
  return quote;
}

export async function updateSalesQuoteStatus(quoteId: string, status: SalesQuoteStatus, convertedOrderId?: string) {
  const changes: Record<string, unknown> = { status };
  if (convertedOrderId) changes.converted_order_id = convertedOrderId;
  const { error } = await supabase.from('sales_quotes').update(changes).eq('id', quoteId);
  if (error) throw error;
}

export function defaultQuoteValidity(): string {
  const date = new Date();
  date.setDate(date.getDate() + 5);
  return date.toISOString().slice(0, 10);
}
