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
  return createBulkStockTransactions(supabase, [transaction]);
}

/**
 * Registra múltiples transacciones de inventario en lote (útil para ítems de un pedido).
 */
export async function createBulkStockTransactions(
  supabase: SupabaseClient,
  transactions: StockTransactionInput[]
): Promise<{ success: boolean; error?: string }> {
  if (transactions.length === 0) return { success: true };

  // 1. Intentar registrar a través de API segura del servidor para evitar bloqueos por RLS en clientes
  try {
    const res = await fetch('/api/erp/stock-transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactions })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        return { success: true };
      }
    }
  } catch (apiErr) {
    console.warn('API /api/erp/stock-transactions no disponible, probando inserción directa:', apiErr);
  }

  // 2. Fallback: Inserción directa con el cliente
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
    console.warn('Advertencia al registrar transacciones de stock en cliente:', error);
    return { success: false, error: error.message };
  }

  return { success: true };
}
