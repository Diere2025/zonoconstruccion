export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  image_url: string;
  category: string;
  sku?: string;
  created_at?: string;
}

export interface CartItem extends Product {
  quantity: number;
}
