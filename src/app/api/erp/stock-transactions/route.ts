import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'edge';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { transactions } = body;

    if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
      return NextResponse.json({ success: true, count: 0 });
    }

    const rowsToInsert = transactions.map((t: any) => ({
      product_id: t.productId || t.product_id,
      quantity: t.quantity,
      type: t.type,
      reference_id: t.referenceId || t.reference_id,
      user_id: t.userId || t.user_id
    }));

    const { data, error } = await supabaseAdmin
      .from('inventory_transactions')
      .insert(rowsToInsert)
      .select();

    if (error) {
      console.error('[API stock-transactions] Error inserting:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, count: data?.length || rowsToInsert.length });
  } catch (err: any) {
    console.error('[API stock-transactions] Exception:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal server error' }, { status: 500 });
  }
}
