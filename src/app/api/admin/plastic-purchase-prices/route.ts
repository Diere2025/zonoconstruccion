import { NextResponse } from 'next/server';
import { requirePurchaseOperator } from '@/lib/purchaseAccess';
import { getGoogleAccessToken } from '@/lib/googleSheets';
import { COST_SOURCES } from '@/lib/costs/sources';
import { plasticPriceSheets, plasticPriceSupplier, readPlasticPurchasePrices } from '@/lib/plasticPurchasePrices';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const denied = await requirePurchaseOperator(request);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });
  const supplier = plasticPriceSupplier(new URL(request.url).searchParams.get('supplier') || '');
  if (!supplier) return NextResponse.json({ error: 'Proveedor inválido.' }, { status: 400 });

  try {
    const token = await getGoogleAccessToken();
    const range = encodeURIComponent(`'${plasticPriceSheets[supplier]}'!1:120`);
    const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${COST_SOURCES.purchases}/values/${range}?valueRenderOption=UNFORMATTED_VALUE`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('No se pudo leer el historial de precios.');
    const { values } = await response.json();
    return NextResponse.json(readPlasticPurchasePrices(values || [], supplier), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'No se pudieron cargar los precios en USD.' }, { status: 502 });
  }
}
