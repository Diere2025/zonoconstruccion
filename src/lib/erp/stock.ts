import { SupabaseClient } from '@supabase/supabase-js';

export type StockTransactionType = 'Ajuste' | 'Compra' | 'Reserva Pedido' | 'Cancelacion Pedido' | 'Entrega' | 'Produccion Ingreso' | 'Produccion Consumo';

export interface StockTransactionInput {
  productId: string;
  quantity: number;
  type: StockTransactionType;
  referenceId?: string;
  userId?: string;
}

/**
 * Registra una transacción de inventario en la base de datos.
 * La actualización de los niveles en la tabla `products` se realiza automáticamente
 * a través de un trigger de base de datos PostgreSQL para garantizar la consistencia.
 */
export async function createStockTransaction(
  supabase: SupabaseClient,
  transaction: StockTransactionInput
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('inventory_transactions')
    .insert({
      product_id: transaction.productId,
      quantity: transaction.quantity,
      type: transaction.type,
      reference_id: transaction.referenceId,
      user_id: transaction.userId
    });

  if (error) {
    console.error('Error creating stock transaction:', error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Registra múltiples transacciones de inventario en lote (útil para ítems de un pedido).
 */
export async function createBulkStockTransactions(
  supabase: SupabaseClient,
  transactions: StockTransactionInput[]
): Promise<{ success: boolean; error?: string }> {
  if (transactions.length === 0) return { success: true };

  const { error } = await supabase
    .from('inventory_transactions')
    .insert(
      transactions.map(t => ({
        product_id: t.productId,
        quantity: t.quantity,
        type: t.type,
        reference_id: t.referenceId,
        user_id: t.userId
      }))
    );

  if (error) {
    console.error('Error creating bulk stock transactions:', error);
    return { success: false, error: error.message };
  }

  return { success: true };
}
