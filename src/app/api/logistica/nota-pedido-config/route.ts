export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type User } from '@supabase/supabase-js';
import { DEFAULT_ORDER_NOTE_RATES } from '@/lib/logisticsOrderNotes';
import { categorizationSku, warehouseCategoryConfig, warehouseProductKey, WAREHOUSE_CATEGORY_SETTING_ID } from '@/lib/warehouseCategoryConfig';

const SETTING_ID = 'logistics_payway_rates';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const knownAdminEmails = new Set(['diego.boveda@gmail.com', 'caroibarra.93@gmail.com']);

function response(data: unknown, status = 200) {
  const result = NextResponse.json(data, { status });
  result.headers.set('Cache-Control', 'no-store, max-age=0');
  return result;
}

function adminClient() {
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Falta configurar el acceso al servidor.');
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function authenticatedUser(request: NextRequest): Promise<User | null> {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;
  const { data: { user }, error } = await adminClient().auth.getUser(token);
  return error ? null : user;
}

async function mayEdit(user: User, includeLogistics = false): Promise<boolean> {
  if (user.email && knownAdminEmails.has(user.email.toLowerCase())) return true;
  const { data: seller, error } = await adminClient()
    .from('sellers')
    .select('role, roles')
    .eq('id', user.id)
    .maybeSingle();
  if (error) throw error;
  const roles = [seller?.role, ...(Array.isArray(seller?.roles) ? seller.roles : [])];
  return roles.includes('admin') || (includeLogistics && roles.includes('logistica'));
}

function isWarehouseCategoryRequest(request: NextRequest) {
  return request.nextUrl.searchParams.get('section') === 'warehouse-categories';
}

async function getWarehouseCategories(request: NextRequest) {
  try {
    const user = await authenticatedUser(request);
    if (!user) return response({ error: 'Iniciá sesión para consultar las categorías.' }, 401);
    if (!await mayEdit(user, true)) return response({ error: 'Solo administración o logística pueden consultar esta configuración.' }, 403);
    const client = adminClient();
    const { data, error } = await client.from('site_settings').select('value').eq('id', WAREHOUSE_CATEGORY_SETTING_ID).maybeSingle();
    if (error) throw error;
    const stored = data?.value ? (typeof data.value === 'string' ? JSON.parse(data.value) : data.value) : null;
    const config = warehouseCategoryConfig(stored);
    if (request.nextUrl.searchParams.get('products') !== '1') return response({ ...config, canEdit: true });
    const names = new Map<string, string>();
    for (let start = 0; start < 5000; start += 1000) {
      const { data: products, error: productsError } = await client.from('products')
        .select('sku,name').eq('is_active', true).order('sku').range(start, start + 999);
      if (productsError) throw productsError;
      for (const product of products || []) {
        const sku = categorizationSku(product);
        if (!sku) continue;
        const skuKey = warehouseProductKey(sku);
        names.set(skuKey, sku);
        const oldNameKey = warehouseProductKey(String(product.name || ''));
        if (!config.assignments[skuKey] && config.assignments[oldNameKey]) config.assignments[skuKey] = config.assignments[oldNameKey];
      }
      if (!products || products.length < 1000) break;
    }
    return response({ ...config, products: [...names.values()].sort((a, b) => a.localeCompare(b, 'es')), canEdit: true });
  } catch (error) {
    console.error('[WarehouseCategoryConfig] Error de lectura:', error);
    return response({ error: 'No se pudieron consultar las categorías.' }, 500);
  }
}

async function saveWarehouseCategories(request: NextRequest) {
  try {
    const user = await authenticatedUser(request);
    if (!user) return response({ error: 'Iniciá sesión para guardar las categorías.' }, 401);
    if (!await mayEdit(user, true)) return response({ error: 'Solo administración o logística pueden modificar las categorías.' }, 403);
    const body = await request.json() as { categories?: unknown; assignments?: unknown };
    if (!Array.isArray(body.categories) || body.categories.length < 1 || body.categories.length > 50 ||
      body.categories.some(category => typeof category !== 'string' || !category.trim() || category.trim().length > 80) ||
      !body.assignments || typeof body.assignments !== 'object' || Array.isArray(body.assignments) || Object.keys(body.assignments).length > 3000) {
      return response({ error: 'La configuración de categorías no es válida.' }, 400);
    }
    const categoryNames = body.categories.map(category => (category as string).trim());
    if (new Set(categoryNames.map(category => category.toLocaleLowerCase('es'))).size !== categoryNames.length || !categoryNames.includes('Sin categoría')) {
      return response({ error: 'Las categorías deben ser únicas e incluir «Sin categoría».' }, 400);
    }
    const validNames = new Set(categoryNames);
    if (Object.values(body.assignments).some(category => typeof category !== 'string' || !validNames.has(category.trim()))) {
      return response({ error: 'Hay productos asignados a una categoría inexistente.' }, 400);
    }
    const config = warehouseCategoryConfig(body);
    const { error } = await adminClient().from('site_settings').upsert({
      id: WAREHOUSE_CATEGORY_SETTING_ID,
      value: JSON.stringify(config),
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' });
    if (error) throw error;
    return response({ ...config, canEdit: true });
  } catch (error) {
    console.error('[WarehouseCategoryConfig] Error al guardar:', error);
    return response({ error: 'No se pudieron guardar las categorías.' }, 500);
  }
}

function validRates(value: unknown): value is number[] {
  return Array.isArray(value)
    && value.length === 5
    && value.every(rate => typeof rate === 'number' && Number.isFinite(rate) && rate >= 0 && rate <= 300);
}

function savedRates(value: unknown): number[] {
  const stored = value && typeof value === 'object' && 'rates' in value ? value.rates : null;
  if (Array.isArray(stored) && stored.length === 4) {
    const migrated = [...stored, DEFAULT_ORDER_NOTE_RATES[4]];
    if (validRates(migrated)) return migrated;
  }
  const rates = stored ?? [...DEFAULT_ORDER_NOTE_RATES];
  if (!validRates(rates)) throw new Error('La configuración de cuotas guardada no es válida.');
  return rates;
}

export async function GET(request: NextRequest) {
  if (isWarehouseCategoryRequest(request)) return getWarehouseCategories(request);
  try {
    const user = await authenticatedUser(request);
    if (!user) return response({ error: 'Iniciá sesión para consultar los recargos de cuotas.' }, 401);
    const client = adminClient();
    const canEditPromise = mayEdit(user).catch(roleError => {
      console.warn('[NotaPedidoConfig] No se pudo verificar permiso de edición:', roleError);
      return false;
    });
    const { data, error } = await client.from('site_settings').select('value').eq('id', SETTING_ID).maybeSingle();
    if (error) throw error;
    const saved = data?.value
      ? (typeof data.value === 'string' ? JSON.parse(data.value) : data.value)
      : null;
    const rates = savedRates(saved);
    const canEdit = await canEditPromise;
    return response({ rates, canEdit });
  } catch (error) {
    console.error('[NotaPedidoConfig] Error de lectura:', error);
    return response({ error: 'No se pudo cargar la configuración de cuotas.' }, 500);
  }
}

export async function PUT(request: NextRequest) {
  if (isWarehouseCategoryRequest(request)) return saveWarehouseCategories(request);
  try {
    const user = await authenticatedUser(request);
    if (!user) return response({ error: 'Iniciá sesión para guardar los recargos de cuotas.' }, 401);
    if (!await mayEdit(user)) return response({ error: 'Solo un administrador puede modificar los recargos de cuotas.' }, 403);

    const body = await request.json() as { rates?: unknown };
    if (!validRates(body.rates)) {
      return response({ error: 'Ingresá cinco recargos válidos entre 0% y 300%.' }, 400);
    }

    const { error } = await adminClient().from('site_settings').upsert({
      id: SETTING_ID,
      value: JSON.stringify({ rates: body.rates }),
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' });
    if (error) throw error;
    return response({ rates: body.rates, canEdit: true });
  } catch (error) {
    console.error('[NotaPedidoConfig] Error al guardar:', error);
    return response({ error: 'No se pudieron guardar los recargos de cuotas.' }, 500);
  }
}
