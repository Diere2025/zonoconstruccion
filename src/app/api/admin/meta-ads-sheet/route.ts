export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ckvbyfgsbjbfaqotmeld.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy';
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

const SHEET_ID = '1q5n2GWzQTQQKrqWLApBV1s8TurN8sk5PIBnYQmitNSE';

function parseCSV(text: string): string[][] {
  const lines: string[][] = [];
  let row: string[] = [];
  let inQuotes = false;
  let currentStr = '';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentStr += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(currentStr.trim());
      currentStr = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      row.push(currentStr.trim());
      if (row.some(cell => cell.length > 0)) {
        lines.push(row);
      }
      row = [];
      currentStr = '';
    } else {
      currentStr += char;
    }
  }
  if (currentStr.length > 0 || row.length > 0) {
    row.push(currentStr.trim());
    if (row.some(cell => cell.length > 0)) {
      lines.push(row);
    }
  }
  return lines;
}

function parseSpanishNumber(str: any): number {
  if (!str) return 0;
  const clean = String(str).replace(/[\$\s%]/g, '').replace(/\./g, '').replace(/,/g, '.');
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

function formatToISO(dateStr: string): string | null {
  if (!dateStr) return null;
  const parts = dateStr.trim().split('/');
  if (parts.length === 3) {
    const dd = parts[0].padStart(2, '0');
    const mm = parts[1].padStart(2, '0');
    const yyyy = parts[2];
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

function categorizeCampaign(campaign: string): string {
  const lower = campaign.toLowerCase();
  if (lower.includes('termo') || lower.includes('cooper') || lower.includes('universal')) {
    return 'Termotanques';
  }
  if (lower.includes('tanque') || lower.includes('aquafort') || lower.includes('rotoplas') || lower.includes('tricapa')) {
    return 'Tanques';
  }
  if (lower.includes('biofort') || lower.includes('biodigestor') || lower.includes('bio auto') || lower.includes('bios')) {
    return 'Biodigestores';
  }
  if (lower.includes('meps') || lower.includes('equilibrio')) {
    return 'MEPS';
  }
  if (lower.includes('ingletadora') || lower.includes('daewoo') || lower.includes('herramienta') || lower.includes('escalera') || lower.includes('omaha') || lower.includes('gl16') || lower.includes('cargador') || lower.includes('cat')) {
    return 'Herramientas';
  }
  if (lower.includes('calefactor') || lower.includes('sirena') || lower.includes('flowater') || lower.includes('sillón') || lower.includes('sillon') || lower.includes('colombraro')) {
    return 'Hogar';
  }
  if (lower.includes('latex') || lower.includes('látex')) {
    return 'Pinturas';
  }
  return 'Otros';
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tab = searchParams.get('tab') || 'live';
    
    // Default to current month if not provided
    const now = new Date();
    const defaultFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const defaultTo = now.toISOString().split('T')[0];

    const dateFrom = searchParams.get('dateFrom') || defaultFrom;
    const dateTo = searchParams.get('dateTo') || defaultTo;

    if (tab === 'live') {
      // 1. Fetch live today metrics from 'MSG-Hoy'
      const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent('MSG-Hoy')}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Error al leer planilla de Google Sheets: HTTP ${res.status}`);
      
      const csvText = await res.text();
      const rows = parseCSV(csvText);

      const liveCampaigns: any[] = [];
      let totalMessages = 0;
      let totalSpendUsd = 0;
      let totalSpendArs = 0;
      let totalBudgetArs = 0;

      rows.forEach((r, idx) => {
        if (idx < 2) return;
        const status = r[0] || '';
        const accountName = r[1] || '';
        const campaignName = r[2] || '';
        if (!campaignName || !status) return;

        const messages = parseSpanishNumber(r[3]);
        const costPerActionUsd = parseSpanishNumber(r[4]);
        const frequency = parseSpanishNumber(r[5]);
        const ctr = r[6] || '';
        const cpm = r[7] || '';
        const campaignId = r[8] || '';
        const spendUsd = parseSpanishNumber(r[9]);
        const dailyBudgetUsd = parseSpanishNumber(r[10]);
        const commercialOffer = r[11] || '';
        const product = r[12] || '';
        const phoneLine = r[13] || '';
        const spendArs = parseSpanishNumber(r[14]);
        const cprArs = parseSpanishNumber(r[15]);
        const budgetArs = parseSpanishNumber(r[16]);

        totalMessages += messages;
        totalSpendUsd += spendUsd;
        totalSpendArs += spendArs;
        totalBudgetArs += budgetArs;

        liveCampaigns.push({
          status,
          accountName,
          campaignName,
          campaignId,
          messages,
          costPerActionUsd,
          spendUsd,
          dailyBudgetUsd,
          commercialOffer,
          product,
          phoneLine,
          spendArs,
          cprArs,
          budgetArs,
          ctr,
          cpm,
          frequency,
          budgetConsumedPercent: budgetArs > 0 ? Math.round((spendArs / budgetArs) * 100) : 0
        });
      });

      const avgCprArs = totalMessages > 0 ? (totalSpendArs / totalMessages) : 0;
      const pacingPercent = totalBudgetArs > 0 ? Math.round((totalSpendArs / totalBudgetArs) * 100) : 0;

      return NextResponse.json({
        tab: 'live',
        updatedAt: new Date().toISOString(),
        summary: {
          totalMessages,
          totalSpendUsd,
          totalSpendArs,
          totalBudgetArs,
          avgCprArs,
          pacingPercent,
          activeCampaignsCount: liveCampaigns.length
        },
        campaigns: liveCampaigns
      });
    }

    if (tab === 'history') {
      // 2. Fetch historical metrics from 'CálculoParaEERR'
      const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent('CálculoParaEERR')}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Error al leer histórico de Google Sheets: HTTP ${res.status}`);

      const csvText = await res.text();
      const rows = parseCSV(csvText);

      const parsedHistory: any[] = [];
      let totalMessages = 0;
      let totalSpendUsd = 0;
      let totalSpendArs = 0;
      let totalFeeArs = 0;
      let totalImpressions = 0;
      let totalReach = 0;

      rows.forEach((r, idx) => {
        if (idx < 1) return;
        const dateStr = r[0] || '';
        const account = r[1] || '';
        const campaign = r[2] || '';
        if (!dateStr || !campaign || dateStr.includes('date_start')) return;

        const isoDate = formatToISO(dateStr);
        if (!isoDate) return;

        // Apply strict date range filter
        if (isoDate < dateFrom || isoDate > dateTo) return;

        const messages = parseSpanishNumber(r[3]);
        const comments = parseSpanishNumber(r[4]);
        const ctr = r[5] || '';
        const cprUsd = parseSpanishNumber(r[6]);
        const spendUsd = parseSpanishNumber(r[7]);
        const reactions = parseSpanishNumber(r[8]);
        const reach = parseSpanishNumber(r[9]);
        const impressions = parseSpanishNumber(r[10]);
        const frequency = parseSpanishNumber(r[11]);
        const cpm = r[12] || '';
        const feePercent = r[13] || '';
        const exchangeRate = parseSpanishNumber(r[14]);
        const spendArs = parseSpanishNumber(r[16]);
        const feeArs = parseSpanishNumber(r[17]);
        const totalInvestmentArs = spendArs + feeArs;

        totalMessages += messages;
        totalSpendUsd += spendUsd;
        totalSpendArs += spendArs;
        totalFeeArs += feeArs;
        totalImpressions += impressions;
        totalReach += reach;

        // Extract line from campaign name if present e.g. [4592]
        const lineMatch = campaign.match(/\[(\d+)\]/);
        const phoneLine = lineMatch ? lineMatch[1] : '';

        // Extract category using accurate categorization logic
        const category = categorizeCampaign(campaign);

        parsedHistory.push({
          date: dateStr,
          dateObj: `${isoDate}T12:00:00.000Z`,
          isoDate,
          account,
          campaign,
          category,
          phoneLine,
          messages,
          comments,
          reactions,
          ctr,
          cprUsd,
          spendUsd,
          reach,
          impressions,
          frequency,
          cpm,
          feePercent,
          exchangeRate,
          spendArs,
          feeArs,
          totalInvestmentArs,
          cprArs: messages > 0 ? Math.round(totalInvestmentArs / messages) : 0
        });
      });

      // Sort chronological descending
      parsedHistory.sort((a, b) => (b.isoDate || '').localeCompare(a.isoDate || ''));

      // Query ERP Orders for the EXACT date range with full pagination
      let erpOrders: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      try {
        while (hasMore) {
          const { data, error } = await supabaseAdmin
            .from('orders')
            .select('total_amount, status, order_date')
            .gte('order_date', dateFrom)
            .lte('order_date', dateTo)
            .neq('status', 'Cancelado')
            .range(page * pageSize, (page + 1) * pageSize - 1);

          if (error) {
            console.error('Error fetching ERP orders for ROAS:', error);
            break;
          }

          if (data && data.length > 0) {
            erpOrders = [...erpOrders, ...data];
            if (data.length < pageSize) {
              hasMore = false;
            } else {
              page++;
            }
          } else {
            hasMore = false;
          }
        }
      } catch (err) {
        console.error('Error fetching ERP orders for ROAS:', err);
      }

      const erpOrdersCount = erpOrders.length;
      const erpRevenueArs = erpOrders.reduce((acc, o) => acc + (Number(o.total_amount) || 0), 0);

      const totalInvestmentArs = totalSpendArs + totalFeeArs;
      const roas = totalInvestmentArs > 0 ? (erpRevenueArs / totalInvestmentArs) : 0;
      const cac = erpOrdersCount > 0 ? Math.round(totalInvestmentArs / erpOrdersCount) : 0;
      const avgCprArs = totalMessages > 0 ? Math.round(totalInvestmentArs / totalMessages) : 0;
      const conversionRate = totalMessages > 0 ? ((erpOrdersCount / totalMessages) * 100).toFixed(1) : '0';

      return NextResponse.json({
        tab: 'history',
        dateFrom,
        dateTo,
        summary: {
          totalMessages,
          totalSpendUsd,
          totalSpendArs,
          totalFeeArs,
          totalInvestmentArs,
          totalImpressions,
          totalReach,
          avgCprArs,
          erpRevenueArs,
          erpOrdersCount,
          roas: Number(roas.toFixed(2)),
          cac,
          conversionRate
        },
        records: parsedHistory
      });
    }

    return NextResponse.json({ error: 'Tab not supported' }, { status: 400 });
  } catch (err: any) {
    console.error('Error in meta-ads-sheet route:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
