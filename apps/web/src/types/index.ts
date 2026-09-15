export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  image_url: string;
  category: string;
  sku?: string;
  brand?: string;
  dimensions?: string;
  is_featured?: boolean;
  is_on_sale?: boolean;
  is_active?: boolean;
  upsell_ids?: string[];
  tags?: string[];
  settings?: any;
  created_at?: string;
  stock_current?: number;
  stock_physical?: number;
  stock_reserved?: number;
  is_discontinued?: boolean;
  parent_id?: string | null;
  variant_type?: string;
  fixed_price?: boolean;
  markup_percentage?: number | null;
  markup_wholesale_percentage?: number | null;
  production_type?: 'comprado' | 'fabricado' | 'ensamblado';
  is_insumo?: boolean;
  insumo_use?: 'fabricacion' | 'ensamblado' | 'ensamblado_venta';
  labor_cost?: number;
  overhead_cost?: number;
  cost_price?: number;
  is_generic?: boolean;
  mapped_real_product_id?: string | null;
}

export interface CartItem extends Product {
  quantity: number;
}

export interface Seller {
  id: string; // auth.users id
  email: string;
  full_name: string;
  commission_rate: number;
  is_active: boolean;
  enabled_categories: string[];
  created_at?: string;
}

export interface PaymentMethod {
  id: string;
  name: string;
  surcharge_percentage: number;
  installments: number;
  is_active: boolean;
  created_at?: string;
}

export interface Locality {
  id: string;
  name: string;
  zone_id: string;
  is_active: boolean;
  created_at?: string;
}

export interface Order {
  id: string;
  seller_id: string;
  initial_delivery_date: string;
  max_delivery_date: string;
  order_date: string;
  customer_name: string;
  locality: string;
  address: string;
  google_maps_link?: string;
  whaticket_link?: string;
  payment_method_id: string;
  freight_type: string;
  status: string;
  total_amount: number;
  created_at?: string;
  clients?: any;
  hold_reason?: string;
  hold_product_id?: string;
  category?: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  created_at?: string;
}

export interface FAQ {
  id: string;
  question: string;
  answer: string;
  category: string;
  created_at?: string;
}

export interface Zone {
  id: string;
  name: string;
  is_active: boolean;
  created_at?: string;
}

export interface ZoneDeliveryRule {
  id: string;
  zone_id: string;
  product_category: string;
  delivery_time: string;
  created_at?: string;
}

// =========================================================================
// Módulos ERP Financieros y Operativos
// =========================================================================

export interface CashRegister {
  id: string;
  opened_by: string;
  opened_at: string;
  closed_by?: string;
  closed_at?: string;
  initial_balance_ars: number;
  expected_balance_ars: number;
  actual_balance_ars?: number;
  initial_balance_usd: number;
  expected_balance_usd: number;
  actual_balance_usd?: number;
  status: 'Abierta' | 'Cerrada';
  notes?: string;
  created_at?: string;
}

export interface CostCenter {
  id: string;
  name: string;
  code: string;
  description?: string;
  is_active: boolean;
  created_at?: string;
}

export interface Carrier {
  id: string;
  name: string;
  vehicle_description?: string;
  plate_number?: string;
  phone?: string;
  is_active: boolean;
  created_at?: string;
}

export interface RouteSheet {
  id: string;
  carrier_id: string;
  delivery_date: string;
  run_number: number;
  status: 'Borrador' | 'En Viaje' | 'Cerrada';
  total_theoretical_cash: number;
  total_reconciled_cash: number;
  notes?: string;
  created_at?: string;
  updated_at?: string;
  carriers?: Carrier;
  code?: string;
}

export interface Encomienda {
  id: string;
  code: string;
  type: string;
  client_name?: string;
  client_phone?: string;
  description: string;
  locality: string;
  address: string;
  google_maps_link?: string;
  purchase_order_id?: string;
  invoice_number?: string;
  notes?: string;
  delivery_date: string;
  supplier_id?: string;
  payment_amount?: number;
  attachment_url?: string;
  receipt_notes?: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  purchase?: {
    id: string;
    invoice_number: string;
    supplier?: {
      name: string;
    };
  };
  supplier?: {
    id: string;
    name: string;
  };
}

export interface Delivery {
  id: string;
  order_id?: string | null;
  encomienda_id?: string | null;
  carrier_id?: string;
  delivery_date: string;
  run_number: number;
  delivery_order: number;
  status: 'pendiente_ruteo' | 'ruteado' | 'en_recorrido' | 'entregado' | 'fallido';
  notes?: string;
  updated_at?: string;
  created_at?: string;
  orders?: Order;
  encomiendas?: Encomienda;
  carriers?: Carrier;
  route_sheet_id?: string;
  real_delivery_date?: string;
  logistics_contact?: string;
  predominant_zone?: string;
  companion?: string;
  driver_hours?: string;
  companion_hours?: string;
  failure_reason?: string;
}

export interface CashTransaction {
  id: string;
  register_id: string;
  type: 'ingreso' | 'egreso';
  category: 'cobro_pedido' | 'pago_proveedor' | 'retiro_caja' | 'ingreso_capital' | 'gasto_general' | 'ajuste_arqueo' | 'devolucion_reembolso';
  concept?: string;
  cost_center_id?: string;
  amount: number;
  currency: 'ARS' | 'USD';
  exchange_rate?: number;
  payment_method_id: string;
  reference_id?: string;
  notes?: string;
  created_by: string;
  created_at?: string;
  payment_methods?: { name: string };
  cost_centers?: CostCenter;
}

export interface ClientPayment {
  id: string;
  client_id: string;
  order_id?: string;
  amount: number;
  currency: 'ARS' | 'USD';
  exchange_rate?: number;
  payment_method_id: string;
  cash_transaction_id?: string;
  receipt_url?: string;
  notes?: string;
  created_by: string;
  created_at?: string;
  status?: 'Borrador' | 'Pendiente' | 'Aprobado';
  route_sheet_id?: string;
}

export interface SupplierPurchase {
  id: string;
  supplier_id: string;
  invoice_number: string;
  purchase_date?: string;
  due_date?: string;
  total_amount: number;
  paid_amount: number;
  currency: 'ARS' | 'USD';
  status: 'Pendiente' | 'Parcial' | 'Pagado' | 'Anulado';
  cost_center_id?: string;
  notes?: string;
  created_by: string;
  created_at?: string;
  supplier?: { name: string };
  cost_centers?: CostCenter;
}

export interface SupplierPurchaseItem {
  id: string;
  purchase_id: string;
  product_id: string;
  quantity: number;
  unit_cost: number;
  created_at?: string;
}

export interface SupplierPayment {
  id: string;
  supplier_id: string;
  purchase_id?: string;
  amount: number;
  currency: 'ARS' | 'USD';
  payment_method_id: string;
  cash_transaction_id?: string;
  notes?: string;
  created_by: string;
  created_at?: string;
}

export interface ProductCostAlert {
  id: string;
  product_id: string;
  purchase_id: string;
  catalog_cost: number;
  purchase_cost: number;
  status: 'Pendiente' | 'Ignorada' | 'Actualizada';
  created_by?: string;
  resolved_at?: string;
  created_at?: string;
}

export interface ReturnExchange {
  id: string;
  order_id: string;
  type: 'devolucion' | 'cambio' | 'garantia';
  status: 'Pendiente' | 'Aprobado' | 'Rechazado' | 'Completado';
  reason: string;
  refund_amount?: number;
  exchange_amount?: number;
  difference_amount?: number;
  created_by: string;
  created_at?: string;
}

export interface ReturnItem {
  id: string;
  return_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  restock_action: 'reingreso_stock' | 'descarte_defectuoso';
}

export interface ExchangeItem {
  id: string;
  return_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
}

export interface WarrantyClaim {
  id: string;
  return_id: string;
  product_id: string;
  supplier_id: string;
  serial_number?: string;
  issue_description: string;
  customer_resolution: 'pendiente' | 'reemplazo_entregado' | 'nota_credito_emitida' | 'rechazado';
  supplier_claim_status: 'no_reclamado' | 'enviado_a_fabrica' | 'aprobado_por_proveedor' | 'rechazado_por_proveedor';
  notes?: string;
  updated_at?: string;
  created_at?: string;
}
