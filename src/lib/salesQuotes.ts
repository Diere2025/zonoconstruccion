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

export async function saveSalesQuote(input: SalesQuoteInput) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('La sesión venció. Volvé a ingresar.');
  if (!input.items.length) throw new Error('Agregá al menos un producto al presupuesto.');

  const { data: quote, error: quoteError } = await supabase
    .from('sales_quotes')
    .insert({
      seller_id: userData.user.id,
      client_id: input.clientId || null,
      channel: input.channel,
      status: input.status || 'draft',
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
    })
    .select('id, quote_number, status')
    .single();
  if (quoteError) throw quoteError;

  const { error: itemsError } = await supabase.from('sales_quote_items').insert(
    input.items.map((item, index) => ({
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
    }))
  );
  if (itemsError) {
    await supabase.from('sales_quotes').delete().eq('id', quote.id);
    throw itemsError;
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
