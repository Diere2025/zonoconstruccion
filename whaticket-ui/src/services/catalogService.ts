import { api } from './api';
import { Budget, BudgetMetrics } from '../types';

export interface CatalogProduct {
  id: string;
  name: string;
  sku?: string;
  price: number;
  category?: string;
  is_active?: boolean;
}

export interface VisualOptionAddon {
  id: string;
  name: string;
  productId: string;
  defaultSelected?: boolean;
}

export interface VisualComboItem {
  productId: string;
  quantity: number;
  customPrice?: number;
  basePrice?: number;
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
}

export interface VisualItemOption {
  id: string;
  label: string;
  description?: string;
  badge?: string;
  imageUrl?: string;
  isActive: boolean;
  price?: number;
  productId?: string;
  allowCiego?: boolean;
  ciegoProductId?: string;
  isCombo?: boolean;
  comboItems?: VisualComboItem[];
  recommendedBaseCm?: number;
  addons?: VisualOptionAddon[];
}

export interface VisualSubGroup {
  id: string;
  name: string;
  description?: string;
  badgeColor?: string;
  imageUrl?: string;
  isActive: boolean;
  items: VisualItemOption[];
}

export interface VisualFamily {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  imageUrl?: string;
  isActive: boolean;
  subgroups: VisualSubGroup[];
}

export interface VisualCatalogConfig {
  version: number;
  updatedAt: string;
  families: VisualFamily[];
}

const SUPABASE_URL = 'https://ckvbyfgsbjbfaqotmeld.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNrdmJ5ZmdzYmpiZmFxb3RtZWxkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3OTYwODQsImV4cCI6MjA4OTM3MjA4NH0.G3UdgjMi9lzCYFxhlv0O-9CASU11apkTzkKFAmCOCPw';

let cachedProducts: CatalogProduct[] | null = null;
let cachedTree: VisualCatalogConfig | null = null;

export async function fetchCatalogProducts(): Promise<CatalogProduct[]> {
  if (cachedProducts && cachedProducts.length > 0) {
    return cachedProducts;
  }

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/products?select=id,name,sku,price,category,is_active&is_active=is.true&order=name.asc&limit=2000`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      }
    );
    if (!res.ok) throw new Error('Error al consultar productos de Supabase');
    const data: CatalogProduct[] = await res.json();
    cachedProducts = data;
    return data;
  } catch (err) {
    console.error('Error fetching Supabase products:', err);
    return cachedProducts || [];
  }
}

export async function fetchVisualCatalogTree(products: CatalogProduct[]): Promise<VisualCatalogConfig> {
  if (cachedTree) {
    return cachedTree;
  }

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/site_settings?id=eq.visual_selector_tree&select=id,value`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      }
    );

    if (res.ok) {
      const data = await res.json();
      if (data && data[0]?.value) {
        const parsed: VisualCatalogConfig = JSON.parse(data[0].value);
        if (parsed.families && parsed.families.length > 0) {
          cachedTree = parsed;
          return parsed;
        }
      }
    }
  } catch (err) {
    console.error('Error fetching Supabase visual tree:', err);
  }

  return generateFallbackTree(products);
}

function generateFallbackTree(products: CatalogProduct[]): VisualCatalogConfig {
  const tanques = products.filter((p) => p.category?.toLowerCase().includes('tanque') || p.name.toLowerCase().includes('tanque'));
  const termotanques = products.filter((p) => p.category?.toLowerCase().includes('termo') || p.name.toLowerCase().includes('termo'));
  const biodigestores = products.filter((p) => p.category?.toLowerCase().includes('bio') || p.name.toLowerCase().includes('biodigestor'));
  const pinturas = products.filter((p) => p.category?.toLowerCase().includes('pintur') || p.name.toLowerCase().includes('latex'));

  const toItems = (list: CatalogProduct[]) =>
    list.slice(0, 25).map((p) => ({
      id: p.id,
      label: p.name,
      isActive: true,
      productId: p.id,
      price: p.price,
    }));

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    families: [
      {
        id: 'tanques',
        name: 'Tanques de Agua',
        isActive: true,
        subgroups: [
          {
            id: 'tanques_destacados',
            name: 'Tanques y Cisternas',
            isActive: true,
            items: toItems(tanques),
          },
        ],
      },
      {
        id: 'termotanques',
        name: 'Termotanques Solares',
        isActive: true,
        subgroups: [
          {
            id: 'termotanques_equipos',
            name: 'Equipos Solares',
            isActive: true,
            items: toItems(termotanques),
          },
        ],
      },
      {
        id: 'biodigestores',
        name: 'Biodigestores',
        isActive: true,
        subgroups: [
          {
            id: 'biodigestores_sistemas',
            name: 'Sistemas Cloacales',
            isActive: true,
            items: toItems(biodigestores),
          },
        ],
      },
      {
        id: 'pinturas',
        name: 'Pinturas e Impermeabilizantes',
        isActive: true,
        subgroups: [
          {
            id: 'pinturas_linea',
            name: 'Látex y Membranas',
            isActive: true,
            items: toItems(pinturas),
          },
        ],
      },
    ],
  };
}

export async function createBudget(data: {
  code?: string;
  ticketId?: number | null;
  contactId: number;
  total: number;
  subtotal: number;
  discount?: number;
  shippingCost?: number;
  paymentMethod?: string;
  items: any[];
  summaryText?: string;
  notes?: string;
}): Promise<Budget> {
  const res = await api.post<Budget>('/budgets', data);
  return res.data;
}

export async function fetchBudgets(params?: {
  searchParam?: string;
  pageNumber?: number;
  status?: string;
  userId?: number | string;
  startDate?: string;
  endDate?: string;
}): Promise<{
  budgets: Budget[];
  count: number;
  hasMore: boolean;
  metrics: BudgetMetrics;
}> {
  const res = await api.get('/budgets', { params });
  return res.data;
}

export async function fetchTicketBudgets(ticketId?: number, contactId?: number): Promise<Budget[]> {
  const id = ticketId || 0;
  const res = await api.get<Budget[]>(`/budgets/ticket/${id}`, {
    params: { contactId },
  });
  return res.data;
}

export async function updateBudgetStatus(
  budgetId: number,
  status: 'open' | 'pending' | 'won' | 'lost',
  notes?: string
): Promise<Budget> {
  const res = await api.put<Budget>(`/budgets/${budgetId}/status`, { status, notes });
  return res.data;
}

export async function deleteBudget(budgetId: number): Promise<void> {
  await api.delete(`/budgets/${budgetId}`);
}

export function findRecommendedBase(
  products: CatalogProduct[],
  recommendedBaseCm?: number
): CatalogProduct | undefined {
  if (!recommendedBaseCm) return undefined;
  const cmStr = `${recommendedBaseCm}`;

  const bases = products.filter((p) => {
    if (p.is_active === false) return false;
    const text = `${p.name} ${p.sku || ''}`.toLowerCase();
    return text.includes('base') && text.includes('hierro') && text.includes(cmStr);
  });

  return bases[0];
}

export function findFlotanteProduct(products: CatalogProduct[]): CatalogProduct | undefined {
  return (
    products.find((p) => {
      if (p.is_active === false) return false;
      const text = `${p.name} ${p.sku || ''}`.toLowerCase();
      return text.includes('flotante') && text.includes('eco');
    }) ||
    products.find((p) => {
      if (p.is_active === false) return false;
      const text = `${p.name} ${p.sku || ''}`.toLowerCase();
      return text.includes('flotante');
    })
  );
}
