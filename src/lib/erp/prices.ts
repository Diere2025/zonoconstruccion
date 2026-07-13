import { SupabaseClient } from '@supabase/supabase-js';

export interface CalculatedPrice {
  productId: string;
  price: number;
  cost: number;
  fixed: boolean;
  baseCost: number;
  markupUsed: number;
  supplierDiscount: number;
  sku?: string;
}

/**
 * Calcula el precio dinámico y costo de un solo producto basándose en el proveedor principal,
 * la lista de precios activa de fábrica y el rol del vendedor (minorista/mayorista).
 */
export async function calculateProductPrice(
  supabase: SupabaseClient,
  productId: string,
  sellerType: 'minorista' | 'mayorista' = 'minorista'
): Promise<CalculatedPrice> {
  // 1. Obtener datos básicos del producto
  const { data: product, error: prodError } = await supabase
    .from('products')
    .select('id, price, fixed_price, markup_percentage, markup_wholesale_percentage, sku')
    .eq('id', productId)
    .single();

  if (prodError || !product) {
    throw new Error(`Producto no encontrado: ${productId}`);
  }

  const fallbackPrice: CalculatedPrice = {
    productId,
    price: product.price || 0,
    cost: 0,
    fixed: true,
    baseCost: 0,
    markupUsed: 0,
    supplierDiscount: 0,
    sku: product.sku
  };

  // Si tiene precio fijo manual, no calculamos costos dinámicos
  if (product.fixed_price) {
    return fallbackPrice;
  }

  // 2. Obtener el proveedor principal
  const { data: relation } = await supabase
    .from('product_supplier_relations')
    .select('supplier_id')
    .eq('product_id', productId)
    .eq('is_primary', true)
    .maybeSingle();

  if (!relation) return fallbackPrice;

  // 3. Obtener descuento del proveedor, su lista activa y el tipo de cambio
  const [supplierRes, activeListRes, usdRateRes] = await Promise.all([
    supabase
      .from('suppliers')
      .select('base_discount_percentage')
      .eq('id', relation.supplier_id)
      .single(),
    supabase
      .from('price_lists')
      .select('id, currency')
      .eq('supplier_id', relation.supplier_id)
      .eq('is_active', true)
      .maybeSingle(),
    supabase
      .from('site_settings')
      .select('value')
      .eq('id', 'usd_exchange_rate')
      .maybeSingle()
  ]);

  const supplier = supplierRes.data;
  const activeList = activeListRes.data;
  const usdRate = Number(usdRateRes?.data?.value) || 1465;

  if (!supplier || !activeList) return fallbackPrice;

  // 4. Buscar costo en la lista de precios
  const { data: listItem } = await supabase
    .from('price_list_items')
    .select('list_cost, discount, discount_type, taxes, final_cost')
    .eq('price_list_id', activeList.id)
    .eq('sku', product.sku)
    .maybeSingle();

  if (!listItem) return fallbackPrice;

  // 5. Aplicar fórmulas
  const baseDiscount = supplier.base_discount_percentage || 0;
  let finalCostFromList = Number(listItem.final_cost) || 0;
  let baseCostFromList = Number(listItem.list_cost) || 0;

  // Convertir a ARS si la lista de precios está en USD
  if (activeList.currency === 'USD') {
    finalCostFromList = finalCostFromList * usdRate;
    baseCostFromList = baseCostFromList * usdRate;
  }
  
  // Costo final aplicando el descuento de proveedor a nivel general
  const cost = finalCostFromList * (1 - baseDiscount / 100);

  // Elegir recargo comercial por rol
  const markup = sellerType === 'mayorista' 
    ? (Number(product.markup_wholesale_percentage) || 0)
    : (Number(product.markup_percentage) || 0);

  const price = cost * (1 + markup / 100);

  return {
    productId,
    price: Math.round(price * 100) / 100, // Redondear a 2 decimales
    cost: Math.round(cost * 100) / 100,
    fixed: false,
    baseCost: baseCostFromList,
    markupUsed: markup,
    supplierDiscount: baseDiscount,
    sku: product.sku
  };
}

/**
 * Calcula en lote los precios de múltiples productos de forma altamente optimizada
 * evitando el problema de consulta N+1.
 */
export async function calculateBulkPrices(
  supabase: SupabaseClient,
  productsOrIds: string[] | any[],
  sellerType: 'minorista' | 'mayorista' = 'minorista'
): Promise<Record<string, CalculatedPrice>> {
  if (productsOrIds.length === 0) return {};

  let products: any[] = [];
  if (typeof productsOrIds[0] === 'object') {
    products = productsOrIds;
  } else {
    // 1. Cargar productos
    const { data, error } = await supabase
      .from('products')
      .select('id, price, fixed_price, markup_percentage, markup_wholesale_percentage, sku')
      .in('id', productsOrIds);

    if (error || !data) {
      throw new Error('Error al cargar productos para cálculo de precios.');
    }
    products = data;
  }

  const results: Record<string, CalculatedPrice> = {};
  const dynamicProductIds: string[] = [];
  const productMap = new Map<string, any>();

  // Procesar fijos directamente
  for (const product of products) {
    productMap.set(product.id, product);
    if (product.fixed_price || !product.sku) {
      results[product.id] = {
        productId: product.id,
        price: product.price || 0,
        cost: 0,
        fixed: true,
        baseCost: 0,
        markupUsed: 0,
        supplierDiscount: 0,
        sku: product.sku
      };
    } else {
      dynamicProductIds.push(product.id);
    }
  }

  if (dynamicProductIds.length === 0) return results;

  // 2. Obtener relaciones de proveedor principal
  const { data: relations } = await supabase
    .from('product_supplier_relations')
    .select('product_id, supplier_id')
    .in('product_id', dynamicProductIds)
    .eq('is_primary', true);

  if (!relations || relations.length === 0) {
    // Si no hay relaciones, los productos dinámicos quedan en fallback
    for (const id of dynamicProductIds) {
      const p = productMap.get(id);
      results[id] = {
        productId: id,
        price: p.price || 0,
        cost: 0,
        fixed: true,
        baseCost: 0,
        markupUsed: 0,
        supplierDiscount: 0,
        sku: p.sku
      };
    }
    return results;
  }

  const supplierIds = Array.from(new Set(relations.map(r => r.supplier_id)));
  const relationMap = new Map<string, string>(); // product_id -> supplier_id
  for (const r of relations) {
    relationMap.set(r.product_id, r.supplier_id);
  }

  // 3. Cargar proveedores, listas activas y tipo de cambio simultáneamente
  const [suppliersRes, priceListsRes, usdRateRes] = await Promise.all([
    supabase.from('suppliers').select('id, base_discount_percentage').in('id', supplierIds),
    supabase.from('price_lists').select('id, supplier_id, currency').in('supplier_id', supplierIds).eq('is_active', true),
    supabase.from('site_settings').select('value').eq('id', 'usd_exchange_rate').maybeSingle()
  ]);

  const suppliers = suppliersRes.data || [];
  const priceLists = priceListsRes.data || [];
  const usdRate = Number(usdRateRes?.data?.value) || 1465;

  const supplierMap = new Map<string, number>(); // supplier_id -> discount
  for (const s of suppliers) {
    supplierMap.set(s.id, Number(s.base_discount_percentage) || 0);
  }

  const activeListMap = new Map<string, { id: string; currency: string }>(); // supplier_id -> activeList
  for (const pl of priceLists) {
    activeListMap.set(pl.supplier_id, { id: pl.id, currency: pl.currency || 'ARS' });
  }

  // Identificar qué listas de precios e ítems consultar
  const listIds = priceLists.map(pl => pl.id);
  const skus = products.filter(p => dynamicProductIds.includes(p.id)).map(p => p.sku).filter(Boolean) as string[];

  let listItems: any[] = [];
  if (listIds.length > 0 && skus.length > 0) {
    const { data } = await supabase
      .from('price_list_items')
      .select('price_list_id, sku, list_cost, discount, discount_type, taxes, final_cost')
      .in('price_list_id', listIds)
      .in('sku', skus);
    listItems = data || [];
  }

  // Indexar ítems por list_id + sku
  const itemMap = new Map<string, any>(); // "listId_sku" -> item
  for (const item of listItems) {
    itemMap.set(`${item.price_list_id}_${item.sku}`, item);
  }

  // 4. Calcular precio final para cada producto dinámico
  for (const id of dynamicProductIds) {
    const p = productMap.get(id);
    const supplierId = relationMap.get(id);
    const activeListInfo = supplierId ? activeListMap.get(supplierId) : null;
    const listId = activeListInfo?.id;
    const item = listId && p.sku ? itemMap.get(`${listId}_${p.sku}`) : null;

    if (!supplierId || !listId || !item) {
      // Fallback si falta alguna información relacional
      results[id] = {
        productId: id,
        price: p.price || 0,
        cost: 0,
        fixed: true,
        baseCost: 0,
        markupUsed: 0,
        supplierDiscount: 0,
        sku: p.sku
      };
      continue;
    }

    const baseDiscount = supplierMap.get(supplierId) || 0;
    let finalCostFromList = Number(item.final_cost) || 0;
    let baseCostFromList = Number(item.list_cost) || 0;

    // Convertir a ARS si la lista de precios está en USD
    if (activeListInfo?.currency === 'USD') {
      finalCostFromList = finalCostFromList * usdRate;
      baseCostFromList = baseCostFromList * usdRate;
    }

    const cost = finalCostFromList * (1 - baseDiscount / 100);

    const markup = sellerType === 'mayorista'
      ? (Number(p.markup_wholesale_percentage) || 0)
      : (Number(p.markup_percentage) || 0);

    const price = cost * (1 + markup / 100);

    results[id] = {
      productId: id,
      price: Math.round(price * 100) / 100,
      cost: Math.round(cost * 100) / 100,
      fixed: false,
      baseCost: baseCostFromList,
      markupUsed: markup,
      supplierDiscount: baseDiscount,
      sku: p.sku
    };
  }

  return results;
}
