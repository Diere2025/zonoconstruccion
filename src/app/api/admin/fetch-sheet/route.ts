export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { fetchSpreadsheetCsv } from '@/lib/googleSheets';

async function handleFetchSheet(req: NextRequest) {
  try {
    let urlOrId: string | null = null;
    let gid: string | null = null;
    let sheet: string | null = null;

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      urlOrId = body.url || body.id || null;
      gid = body.gid ? String(body.gid) : null;
      sheet = body.sheet ? String(body.sheet) : null;
    } else {
      const searchParams = req.nextUrl.searchParams;
      urlOrId = searchParams.get('url') || searchParams.get('id');
      gid = searchParams.get('gid');
      sheet = searchParams.get('sheet');
    }

    if (!urlOrId) {
      return NextResponse.json(
        { error: 'Missing "url" or "id" parameter' },
        { status: 400 }
      );
    }

    // Basic safety check: only allow Google Sheets URLs or spreadsheet IDs
    if (urlOrId.includes('://') && !urlOrId.includes('docs.google.com/spreadsheets')) {
      return NextResponse.json(
        { error: 'Invalid URL domain. Only Google Sheets are allowed.' },
        { status: 400 }
      );
    }

    const csvData = await fetchSpreadsheetCsv(urlOrId, {
      gid: gid || undefined,
      sheet: sheet || undefined
    });

    return new NextResponse(csvData, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate'
      }
    });
  } catch (error: any) {
    console.error('[fetch-sheet API] Error fetching spreadsheet:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch spreadsheet' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return handleFetchSheet(req);
}

export async function POST(req: NextRequest) {
  return handleFetchSheet(req);
}
