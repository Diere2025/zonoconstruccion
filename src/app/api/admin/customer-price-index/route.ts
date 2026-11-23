import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { customerPriceIndexApi, customerPriceIndexCsv, customerPriceIndexSeries, parseCustomerPriceIndex } from '@/lib/customerPriceIndex';
import { treasuryToday } from '@/lib/treasuryTransactionTime';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

async function officialRows(today: string) {
  try {
    const response = await fetch(customerPriceIndexApi, { signal: AbortSignal.timeout(4500), cache: 'no-store' });
    if (!response.ok) throw new Error('Datos Argentina no disponible.');
    return parseCustomerPriceIndex(await response.json(), today);
  } catch {
    const response = await fetch(customerPriceIndexCsv, { signal: AbortSignal.timeout(6000), cache: 'no-store' });
    if (!response.ok) throw new Error('Serie INDEC no disponible.');
    const rows = (await response.text()).split(/\r?\n/).flatMap(line => {
      const [code, , , period, index, , , region] = line.split(';');
      const area = region?.trim();
      return code === '0' && (area === 'Nacional' || area === 'Total nacional')
        ? [[`${period.slice(0, 4)}-${period.slice(4, 6)}-01`, Number(index.replace(',', '.'))]] : [];
    });
    return parseCustomerPriceIndex({ data: rows, meta: [{}, { field: { id: customerPriceIndexSeries } }] }, today);
  }
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return NextResponse.json({ error: 'Sesión requerida.' }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return NextResponse.json({ error: 'No se pudo consultar el IPC.' }, { status: 503 });
  const supabaseAdmin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });
  const seller = await supabaseAdmin.from('sellers').select('role').eq('id', user.id).maybeSingle();
  if (seller.data?.role !== 'admin') return NextResponse.json({ error: 'Acceso restringido.' }, { status: 403 });
  const { data, error: queryError } = await supabaseAdmin.from('customer_price_index')
    .select('month, refreshed_at').order('month', { ascending: false }).limit(1).maybeSingle();
  if (queryError) return NextResponse.json({ error: 'No se pudo consultar el IPC.' }, { status: 503 });
  if (data && Date.now() - Date.parse(data.refreshed_at) < 6 * 60 * 60_000) return NextResponse.json({ month: data.month });
  try {
    const rows = await officialRows(treasuryToday());
    if (data && rows.at(-1)!.month < data.month) return NextResponse.json({ month: data.month });
    const refreshed_at = new Date().toISOString();
    const { error: saveError } = await supabaseAdmin.from('customer_price_index').upsert(rows.map(row => ({ ...row, refreshed_at })));
    if (saveError) throw saveError;
    return NextResponse.json({ month: rows.at(-1)!.month });
  } catch {
    return data ? NextResponse.json({ month: data.month, stale: true })
      : NextResponse.json({ error: 'El IPC oficial no está disponible.' }, { status: 503 });
  }
}
