import { NextRequest, NextResponse } from 'next/server';
import { georefResults, georefUrl } from '@/lib/georef';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  const kind = request.nextUrl.searchParams.get('kind') || '';
  let url: URL;
  try { url = georefUrl(kind, request.nextUrl.searchParams.get('q') || '', request.nextUrl.searchParams.get('province') || ''); }
  catch { return NextResponse.json({ error: 'La búsqueda geográfica no es válida.' }, { status: 400 }); }
  try {
    const result = await fetch(url, { next: { revalidate: 86400 }, signal: AbortSignal.timeout(6000) });
    if (!result.ok) throw new Error('GEOREF_UNAVAILABLE');
    return NextResponse.json({ results: georefResults(kind, await result.json()) }, { headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' } });
  } catch {
    return NextResponse.json({ error: 'La búsqueda no está disponible. Podés completar los datos manualmente.' }, { status: 503 });
  }
}
