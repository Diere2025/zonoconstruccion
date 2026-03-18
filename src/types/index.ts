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
  created_at?: string;
}

export interface CartItem extends Product {
  quantity: number;
}
