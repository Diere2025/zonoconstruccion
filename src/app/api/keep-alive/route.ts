import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Force dynamic execution to prevent caching by Next.js or Vercel CDN
export const dynamic = 'force-dynamic';
export const runtime = 'edge';

export async function GET() {
  const start = Date.now();
  try {
    // A lightweight select query on the phone_lines table to keep Postgres warm
    const { data, error } = await supabase
      .from('phone_lines')
      .select('id')
      .limit(1);

    if (error) {
      throw error;
    }

    const duration = Date.now() - start;
    return NextResponse.json({
      status: 'success',
      message: 'Database is awake and active',
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    console.error('[KeepAlive] Failed to ping database:', err);
    return NextResponse.json({
      status: 'error',
      message: err.message || 'Error connecting to database',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
