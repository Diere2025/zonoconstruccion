export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { categorizationSku, warehouseCategoryConfig, warehouseProductKey, WAREHOUSE_CATEGORY_SETTING_ID } from '@/lib/warehouseCategoryConfig';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const knownAdminEmails = new Set(['diego.boveda@gmail.com', 'caroibarra.93@gmail.com']);

function serverClient() {
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Falta configurar el acceso al servidor.');
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function response(data: unknown, status = 200) {
  const result = NextResponse.json(data, { status });
  result.headers.set('Cache-Control', 'no-store, max-age=0');
  return result;
}

async function access(request: NextRequest) {
  const client = serverClient();
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { client, user: null, canEdit: false };
  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user) return { client, user: null, canEdit: false };
  if (user.email && knownAdminEmails.has(user.email.toLowerCase())) return { client, user, canEdit: true };
  const { data: seller, error: sellerError } = await client.from('sellers').select('role, roles').eq('id', user.id).maybeSingle();
  if (sellerError) throw sellerError;
  const roles = [seller?.role, ...(Array.isArray(seller?.roles) ? seller.roles : [])];
  return { client, user, canEdit: roles.includes('admin') || roles.includes('logistica') };
}

export async function GET(request: NextRequest) {
  try {
    const { client, user, canEdit } = await access(request);
    if (!user) return response({ error: 'Iniciá sesión para consultar las categorías.' }, 401);
    if (!canEdit) return response({ error: 'Solo administración o logística pueden consultar esta configuración.' }, 403);
    const { data, error } = await client.from('site_settings').select('value').eq('id', WAREHOUSE_CATEGORY_SETTING_ID).maybeSingle();
    if (error) throw error;
    const stored = data?.value ? (typeof data.value === 'string' ? JSON.parse(data.value) : data.value) : null;
    const config = warehouseCategoryConfig(stored);
    if (request.nextUrl.searchParams.get('products') !== '1') return response({ ...config, canEdit });
    const names = new Map<string, string>();
    // The pasted grid uses SKU labels, not catalog display names. Only active
    // products with a SKU belong in the printing categorization editor.
    for (let start = 0; start < 5000; start += 1000) {
      const { data: products, error: productsError } = await client.from('products')
        .select('sku,name').eq('is_active', true).order('sku').range(start, start + 999);
      if (productsError) throw productsError;
      for (const product of products || []) {
        const sku = categorizationSku(product);
        if (!sku) continue;
        const skuKey = warehouseProductKey(sku);
        names.set(skuKey, sku);
        // Carry over categories saved under the old descriptive catalog name.
        const oldNameKey = warehouseProductKey(String(product.name || ''));
        if (!config.assignments[skuKey] && config.assignments[oldNameKey]) config.assignments[skuKey] = config.assignments[oldNameKey];
      }
      if (!products || products.length < 1000) break;
    }
    return response({ ...config, products: [...names.values()].sort((a, b) => a.localeCompare(b, 'es')), canEdit });
  } catch (error) {
    console.error('[WarehouseCategoryConfig] Error de lectura:', error);
    return response({ error: 'No se pudieron consultar las categorías.' }, 500);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { client, user, canEdit } = await access(request);
    if (!user) return response({ error: 'Iniciá sesión para guardar las categorías.' }, 401);
    if (!canEdit) return response({ error: 'Solo administración o logística pueden modificar las categorías.' }, 403);
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
    const { error } = await client.from('site_settings').upsert({
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
