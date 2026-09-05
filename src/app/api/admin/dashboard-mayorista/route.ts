export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ckvbyfgsbjbfaqotmeld.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from') || null;
    const to = searchParams.get('to') || null;

    const { data, error } = await supabaseAdmin.rpc('get_wholesale_dashboard_metrics', {
      p_start_date: from,
      p_end_date: to
    });

    if (error) {
      console.error('Error calling get_wholesale_dashboard_metrics:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data
    });
  } catch (err: any) {
    console.error('Exception in dashboard-mayorista API:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
