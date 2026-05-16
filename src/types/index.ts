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
  payment_method_id: string;
  freight_type: string;
  status: string;
  total_amount: number;
  created_at?: string;
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
