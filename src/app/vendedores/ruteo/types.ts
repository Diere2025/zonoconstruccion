import { CashRegister, Locality, Order, ClientPayment } from "@/types";

export interface Carrier {
  id: string;
  name: string;
  vehicle_description?: string;
  plate_number?: string;
  phone?: string;
  is_active: boolean;
}

export interface Vehicle {
  id: string;
  carrier_id: string | null;
  vehicle_type: string;
  plate_number: string;
  max_weight_kg?: number | null;
  max_volume_m3?: number | null;
  max_speed_kmh?: number | null;
  is_active: boolean;
  created_at?: string;
}

export interface Zone {
  id: string;
  name: string;
  is_active: boolean;
  color?: string | null;
}

export interface CarrierRate {
  id: string;
  carrier_id: string;
  name: string;
  daily_rate: number;
  hourly_rate?: number | null;
  overtime_hourly_rate?: number | null;
  assistant_rate?: number | null;
  base_kms: number;
  extra_km_rate: number;
  includes_tolls: boolean;
  logistics_zone_id?: string | null;
  logistics_zone_ids?: string[] | null;
  start_date: string;
  end_date?: string | null;
  is_active: boolean;
  created_at?: string;
  zones?: Zone | null;
}

export interface RouteSheet {
  id: string;
  carrier_id: string;
  delivery_date: string;
  run_number: number;
  status: "Borrador" | "En Viaje" | "Cerrada";
  total_theoretical_cash: number;
  total_reconciled_cash: number;
  notes?: string;
  created_at?: string;
  updated_at?: string;
  carriers?: Carrier;
  code?: string;
  
  // Flete Liquidation fields
  carrier_rate_id?: string | null;
  actual_hours?: number;
  actual_overtime_hours?: number;
  actual_kms?: number;
  has_assistant?: boolean;
  tolls_amount?: number;
  carrier_cost_calculated?: number;
  carrier_payout_status?: "Pendiente" | "Liquidado";
  carrier_payout_transaction_id?: string | null;
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
  real_delivery_date?: string | null;
  run_number: number;
  delivery_order: number;
  status: "pendiente_ruteo" | "ruteado" | "en_recorrido" | "entregado" | "fallido";
  notes?: string;
  created_at?: string;
  route_sheet_id?: string;
  communication_status?: string;
  orders?: RouteOrder;
  encomiendas?: Encomienda;
  carriers?: Carrier;
  route_sheets?: RouteSheet;
}

export interface RouteOrder {
  id: string;
  client_id: string;
  customer_name: string;
  locality: string;
  address: string;
  google_maps_link?: string;
  freight_type: string;
  total_amount: number;
  payment_status: string;
  payment_approved?: boolean;
  payment_method_id?: string;
  max_delivery_date?: string;
  order_date?: string;
  legacy_code?: string;
  delivery_notes?: string;
  delivery_detail?: string;
  logistics_zone_id?: string;
  totals?: {
    subtotal?: number;
    freight?: number;
    tax?: number;
    payment_surcharges?: number;
    total?: number;
    has_deposit?: boolean;
    deposit_amount?: number;
    deposit_receipt_url?: string;
    pending_balance?: number;
  };
  zones?: {
    name: string;
    color?: string | null;
    delivery_times?: {
      category: string;
    } | null;
  };
  clients?: {
    phone_primary?: string;
    phone_secondary?: string;
    is_wholesale?: boolean;
  };
  channel?: string;
  order_items: {
    id: string;
    product_id?: string | null;
    product_name: string;
    quantity: number;
    unit_price?: number;
    sku?: string;
  }[];
}

export interface PaymentMethod {
  id: string;
  name: string;
  surcharge_percentage: number;
  is_active: boolean;
  is_default: boolean;
  installments: number;
}

export interface DraftPayment {
  payment_method_id: string;
  amount: number;
  notes: string;
}

export interface ReconciliationDraft extends ClientPayment {
  payment_methods?: { name: string } | null;
  orders?: RouteOrder | null;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  stock_current: number;
  price: number;
  parent_id?: string | null;
}

export interface OrderHistoryEntry {
  id: string;
  order_id: string;
  changed_by_id: string;
  changed_by_name: string;
  changed_at: string;
  change_reason: string;
  original_data: {
    customer_name: string;
    address: string;
    locality: string;
    google_maps_link?: string;
    delivery_notes?: string;
    delivery_detail?: string;
    total_amount: number;
    items: {
      product_id: string | null;
      product_name: string;
      quantity: number;
      unit_price: number;
    }[];
  };
  modified_data: {
    customer_name: string;
    address: string;
    locality: string;
    google_maps_link?: string;
    delivery_notes?: string;
    delivery_detail?: string;
    total_amount: number;
    items: {
      product_id: string | null;
      product_name: string;
      quantity: number;
      unit_price: number;
    }[];
  };
  created_at?: string;
}

