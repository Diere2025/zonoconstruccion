export const runtime = 'edge';
export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ckvbyfgsbjbfaqotmeld.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

// GET /api/admin/scheduled-prices - List all scheduled price updates and apply due ones
export async function GET() {
  try {
    // 1. Automatically apply any pending price updates whose effective_date <= CURRENT_DATE
    let appliedCount = 0;
    try {
      const { data: count, error: rpcError } = await supabaseAdmin.rpc('apply_scheduled_price_updates');
      if (!rpcError && typeof count === 'number') {
        appliedCount = count;
      }
    } catch (e) {
      console.warn('Could not execute apply_scheduled_price_updates RPC:', e);
    }

    // 2. Fetch scheduled updates (ordered with pending first, then by effective_date)
    const { data: updates, error } = await supabaseAdmin
      .from('scheduled_price_updates')
      .select(`
        id,
        product_id,
        product_name,
        sku,
        price,
        effective_date,
        status,
        applied_at,
        notes,
        created_at,
        products (
          id,
          name,
          sku,
          price,
          brand,
          category,
          is_active
        )
      `)
      .order('effective_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      appliedCount,
      updates: updates || []
    });
  } catch (error: any) {
    console.error('Error fetching scheduled prices:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Error al obtener precios programados' },
      { status: 500 }
    );
  }
}

// POST /api/admin/scheduled-prices - Schedule new price update(s)
export async function POST(req: Request) {
  try {
    const body = await req.json();
    let rawItems: Array<{
      product_id?: string;
      product_name?: string;
      sku?: string;
      price: number;
      effective_date: string;
      notes?: string;
    }> = [];

    if (Array.isArray(body.items)) {
      rawItems = body.items;
    } else if (body.item) {
      rawItems = [body.item];
    } else if (body.price && body.effective_date && (body.product_id || body.product_name)) {
      rawItems = [body];
    }

    if (rawItems.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No se enviaron ítems para programar.' },
        { status: 400 }
      );
    }

    // Si algún ítem tiene product_id pero no product_name, buscar en BD
    const missingProductIds = rawItems.filter(i => i.product_id && !i.product_name).map(i => i.product_id as string);
    const productMap = new Map<string, { name: string; sku: string | null }>();
    if (missingProductIds.length > 0) {
      const { data: dbProducts } = await supabaseAdmin
        .from('products')
        .select('id, name, sku')
        .in('id', missingProductIds);
      if (dbProducts) {
        for (const p of dbProducts) {
          productMap.set(p.id, { name: p.name, sku: p.sku });
        }
      }
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const recordsToInsert: any[] = [];
    const immediateProductUpdates: Array<{ id: string; price: number }> = [];

    for (const item of rawItems) {
      const price = Number(item.price);
      let productName = item.product_name;
      let sku = item.sku;

      if (!productName && item.product_id && productMap.has(item.product_id)) {
        const found = productMap.get(item.product_id)!;
        productName = found.name;
        if (!sku) sku = found.sku || undefined;
      }

      if (!productName || isNaN(price) || price <= 0 || !item.effective_date) {
        continue;
      }

      const isImmediate = item.effective_date <= todayStr;

      recordsToInsert.push({
        product_id: item.product_id || null,
        product_name: productName.trim(),
        sku: sku ? sku.trim() : null,
        price,
        effective_date: item.effective_date,
        status: isImmediate ? 'applied' : 'pending',
        applied_at: isImmediate ? new Date().toISOString() : null,
        notes: item.notes || null
      });

      if (isImmediate && item.product_id) {
        immediateProductUpdates.push({ id: item.product_id, price });
      }
    }

    if (recordsToInsert.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Ningún ítem contiene datos válidos (nombre, precio > 0, fecha de vigencia).' },
        { status: 400 }
      );
    }

    // Cancelar/reemplazar actualizaciones previas en estado 'pending' para el mismo producto y fecha
    for (const rec of recordsToInsert) {
      if (rec.product_id) {
        await supabaseAdmin
          .from('scheduled_price_updates')
          .delete()
          .eq('product_id', rec.product_id)
          .eq('effective_date', rec.effective_date)
          .eq('status', 'pending');
      } else {
        await supabaseAdmin
          .from('scheduled_price_updates')
          .delete()
          .eq('product_name', rec.product_name)
          .eq('effective_date', rec.effective_date)
          .eq('status', 'pending');
      }
    }

    // Insert scheduled updates
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('scheduled_price_updates')
      .insert(recordsToInsert)
      .select('id, product_name, price, effective_date, status');

    if (insertError) throw insertError;

    // Apply immediate updates if effective_date <= today
    for (const prod of immediateProductUpdates) {
      await supabaseAdmin
        .from('products')
        .update({ price: prod.price })
        .eq('id', prod.id);
    }

    return NextResponse.json({
      success: true,
      count: inserted?.length || 0,
      inserted: inserted || []
    });
  } catch (error: any) {
    console.error('Error creating scheduled price:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Error al programar precios' },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/scheduled-prices - Cancel a scheduled price update
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Falta el ID del precio programado.' },
        { status: 400 }
      );
    }

    // Delete or cancel the record
    const { error } = await supabaseAdmin
      .from('scheduled_price_updates')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true, message: 'Programación eliminada con éxito.' });
  } catch (error: any) {
    console.error('Error cancelling scheduled price:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Error al cancelar precio programado' },
      { status: 500 }
    );
  }
}
