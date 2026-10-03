export const operationLabels = {
  general: 'Movimiento general', supplier_payment: 'Pago a proveedor', customer_collection: 'Cobro de cliente',
  payroll_payment: 'Pago al personal', operating_expense: 'Gasto o servicio', tax_payment: 'Impuesto o carga',
  internal_transfer: 'Transferencia entre cuentas',
  custody_fund: 'Fondo a rendir', currency_exchange: 'Cambio de moneda', financing: 'Préstamo o financiación',
  partner_equity: 'Aporte o retiro de socio', asset_trade: 'Compra o venta de bien', cash_count: 'Apertura, arqueo o ajuste',
} as const;
export type OperationType = keyof typeof operationLabels;
export type OperationInput = {
  operation_type: OperationType; effective_date: string; account_id: string; destination_account_id?: string;
  direction: 'ingreso' | 'egreso'; amount: string; payment_method_id: string;
  concept: string; category: string; sub_category?: string; efe_category?: string; financial_concept_id?: string;
  cost_center_id?: string; route_sheet_id?: string; notes?: string; employee_id?: string;person_id?:string;
  supplier_id?: string; order_id?: string; client_payment_id?: string;
  allocations?: Array<{purchase_id: string; amount: string}>;
  detail: { period?: string; payroll_kind?: string; beneficiary?: string; reference?: string; organism?: string };
  voucher_ids?: string[];
};
export type OperationSummary = { id: string; operation_type: OperationType; version: number; status: string; detail: OperationInput['detail'] };
export type OperationTarget = { transaction_id: string; operation_id?: string; expected_version?: number; expected_transaction?: Record<string, unknown> };

export function inferOperationType(tx: { category: string; type: string; employee_id?: string | null;
  supplier_payments?: unknown[]; client_payments?: unknown[]; notes?: string | null;financial_operations?:OperationSummary|null }): OperationType {
  if(tx.financial_operations)return tx.financial_operations.operation_type;
  if (tx.notes?.includes('TRF-GROUP:')) return 'internal_transfer';
  if (tx.supplier_payments?.length || tx.category === 'Proveedores') return 'supplier_payment';
  if (tx.client_payments?.length || (tx.category === 'Recaudación' && tx.type === 'ingreso')) return 'customer_collection';
  if (tx.employee_id || tx.category === 'Sueldos') return 'payroll_payment';
  if (tx.category === 'Impuestos' || tx.category === 'IIGG') return 'tax_payment';
  return tx.type === 'egreso' ? 'operating_expense' : 'general';
}
