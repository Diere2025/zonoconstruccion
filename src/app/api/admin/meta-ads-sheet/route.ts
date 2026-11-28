export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchSpreadsheetCsv } from '@/lib/googleSheets';
import { zonoAccounts } from '@/lib/metaZonoBalance.mjs';

const ZONO_ARS_FEE_RATE = 0.05;

function argentinaTodayISO(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => parts.find(p => p.type === t)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function isoToArDate(isoDate: string): string {
  const parts = isoDate.split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : isoDate;
}

async function fetchZonoDailyCampaignInsights(
  account: { id: string; name: string },
  dateFrom: string,
  dateTo: string,
  token: string,
  version: string
): Promise<any[]> {
  const rows: any[] = [];
  let url: URL | null = new URL(`https://graph.facebook.com/${version}/${account.id}/insights`);
  url.searchParams.set('fields', 'date_start,campaign_name,spend,actions,impressions,reach,frequency,ctr,cpm');
  url.searchParams.set('level', 'campaign');
  url.searchParams.set('time_increment', '1');
  url.searchParams.set('time_range', JSON.stringify({ since: dateFrom, until: dateTo }));
  url.searchParams.set('limit', '500');

  const seen = new Set<string>();
  let pages = 0;
  while (url && pages < 20) {
    if (url.origin !== 'https://graph.facebook.com' || seen.has(url.href)) break;
    seen.add(url.href);
    const headers: Record<string, string> = {};
    if (!url.searchParams.has('access_token')) {
      headers.Authorization = `Bearer ${token}`;
    }
    const res = await fetch(url, {
      cache: 'no-store',
      headers,
      signal: AbortSignal.timeout(15000),
    });
    const body: any = await res.json().catch(() => null);
    if (!res.ok || !body || body.error || !Array.isArray(body.data)) {
      throw new Error(`Meta API (${account.name}): ${body?.error?.message || `HTTP ${res.status}`}`);
    }
    rows.push(...body.data);
    pages += 1;
    url = body.paging?.next ? new URL(body.paging.next) : null;
  }
  return rows;
}

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
    
    // Default to current month in Argentina timezone if not provided
    const defaultTo = argentinaTodayISO();
    const defaultFrom = `${defaultTo.slice(0, 7)}-01`;

    const dateFrom = searchParams.get('dateFrom') || defaultFrom;
    const dateTo = searchParams.get('dateTo') || defaultTo;

    if (tab === 'live') {
      // 1. Fetch live today metrics from 'MSG-Hoy'
      const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent('MSG-Hoy')}`;
      const csvText = await fetchSpreadsheetCsv(url);
      const rows = parseCSV(csvText);

      const liveCampaigns: any[] = [];
      let totalMessages = 0;
      let totalSpendUsd = 0;
      let totalSpendArs = 0;
      let totalBudgetArs = 0;

      rows.forEach((r, idx) => {
        if (idx < 2) return;
        const rawStatus = (r[0] || '').trim().toUpperCase();
        const accountName = r[1] || '';
        const campaignName = r[2] || '';
        if (!campaignName) return;

        let status = 'ACTIVE';
        if (rawStatus === 'PAUSED' || rawStatus === 'PAUSADA' || rawStatus === 'OFF' || rawStatus === 'INACTIVE' || rawStatus === 'DESACTIVADA') {
          status = 'PAUSED';
        } else if (rawStatus === 'ARCHIVED' || rawStatus === 'DELETED') {
          status = 'ARCHIVED';
        } else if (rawStatus === 'ACTIVE' || rawStatus === 'ACTIVA' || rawStatus === 'ON') {
          status = 'ACTIVE';
        } else {
          status = rawStatus || 'ACTIVE';
        }

        // Secondary check from campaign title naming tags
        if (campaignName.toLowerCase().includes('estado:off') || campaignName.toLowerCase().includes('[pausada]')) {
          status = 'PAUSED';
        }

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
      const activeCampaignsCount = liveCampaigns.filter(c => c.status === 'ACTIVE').length;
      const pausedCampaignsCount = liveCampaigns.filter(c => c.status === 'PAUSED').length;

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
          activeCampaignsCount,
          pausedCampaignsCount,
          totalCampaignsCount: liveCampaigns.length
        },
        campaigns: liveCampaigns
      });
    }

    if (tab === 'history') {
      // 2. Fetch historical metrics from 'CálculoParaEERR'
      const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent('CálculoParaEERR')}`;
      const csvText = await fetchSpreadsheetCsv(url);
      const rows = parseCSV(csvText);

      const parsedHistory: any[] = [];
      const dailyMap: Record<string, any> = {};
      const categoryMap: Record<string, { name: string; totalInvestment: number; messages: number; spendUsd: number }> = {};

      let totalMessages = 0;
      let totalSpendUsd = 0;
      let totalSpendArs = 0;
      let totalSpendArsNative = 0;
      let totalFeeArs = 0;
      let totalImpressions = 0;
      let totalReach = 0;
      const sheetAccountDays = new Set<string>();

      const addRecord = (rec: {
        isoDate: string;
        dateStr: string;
        account: string;
        currency: 'USD' | 'ARS';
        campaign: string;
        messages: number;
        comments: number;
        reactions: number;
        ctr: string;
        cprUsd: number;
        spendUsd: number;
        reach: number;
        impressions: number;
        frequency: number;
        cpm: string;
        feePercent: string;
        exchangeRate: number;
        spendArs: number;
        feeArs: number;
      }) => {
        const totalInvestmentArs = rec.spendArs + rec.feeArs;
        totalMessages += rec.messages;
        totalSpendUsd += rec.spendUsd;
        totalSpendArs += rec.spendArs;
        if (rec.currency === 'ARS') totalSpendArsNative += rec.spendArs;
        totalFeeArs += rec.feeArs;
        totalImpressions += rec.impressions;
        totalReach += rec.reach;

        const lineMatch = rec.campaign.match(/\[([\d|]+)\]/);
        const phoneLine = lineMatch ? lineMatch[1].replaceAll('|', ' / ') : '';
        const category = categorizeCampaign(rec.campaign);

        if (!dailyMap[rec.isoDate]) {
          dailyMap[rec.isoDate] = {
            isoDate: rec.isoDate,
            dateStr: rec.dateStr,
            spendArs: 0,
            feeArs: 0,
            totalInvestmentArs: 0,
            spendUsd: 0,
            messages: 0,
            impressions: 0,
            reach: 0,
            categories: {},
            accounts: {},
          };
        }
        const day = dailyMap[rec.isoDate];
        day.spendArs += rec.spendArs;
        day.feeArs += rec.feeArs;
        day.totalInvestmentArs += totalInvestmentArs;
        day.spendUsd += rec.spendUsd;
        day.messages += rec.messages;
        day.impressions += rec.impressions;
        day.reach += rec.reach;

        if (!day.categories[category]) {
          day.categories[category] = { totalInvestmentArs: 0, messages: 0 };
        }
        day.categories[category].totalInvestmentArs += totalInvestmentArs;
        day.categories[category].messages += rec.messages;

        const accKey = rec.account || 'S731.04';
        if (!day.accounts[accKey]) {
          day.accounts[accKey] = { totalInvestmentArs: 0, messages: 0 };
        }
        day.accounts[accKey].totalInvestmentArs += totalInvestmentArs;
        day.accounts[accKey].messages += rec.messages;

        if (!categoryMap[category]) {
          categoryMap[category] = { name: category, totalInvestment: 0, messages: 0, spendUsd: 0 };
        }
        categoryMap[category].totalInvestment += totalInvestmentArs;
        categoryMap[category].messages += rec.messages;
        categoryMap[category].spendUsd += rec.spendUsd;

        parsedHistory.push({
          date: rec.dateStr,
          dateObj: `${rec.isoDate}T12:00:00.000Z`,
          isoDate: rec.isoDate,
          account: accKey,
          currency: rec.currency,
          campaign: rec.campaign,
          category,
          phoneLine,
          messages: rec.messages,
          comments: rec.comments,
          reactions: rec.reactions,
          ctr: rec.ctr,
          cprUsd: rec.cprUsd,
          spendUsd: rec.spendUsd,
          reach: rec.reach,
          impressions: rec.impressions,
          frequency: rec.frequency,
          cpm: rec.cpm,
          feePercent: rec.feePercent,
          exchangeRate: rec.exchangeRate,
          spendArs: rec.spendArs,
          feeArs: rec.feeArs,
          totalInvestmentArs,
          cprArs: rec.messages > 0 ? Math.round(totalInvestmentArs / rec.messages) : 0,
        });
      };

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

        sheetAccountDays.add(`${account.trim().toUpperCase()}|${isoDate}`);

        addRecord({
          isoDate,
          dateStr,
          account,
          currency: 'USD',
          campaign,
          messages: parseSpanishNumber(r[3]),
          comments: parseSpanishNumber(r[4]),
          ctr: r[5] || '',
          cprUsd: parseSpanishNumber(r[6]),
          spendUsd: parseSpanishNumber(r[7]),
          reactions: parseSpanishNumber(r[8]),
          reach: parseSpanishNumber(r[9]),
          impressions: parseSpanishNumber(r[10]),
          frequency: parseSpanishNumber(r[11]),
          cpm: r[12] || '',
          feePercent: r[13] || '',
          exchangeRate: parseSpanishNumber(r[14]),
          spendArs: parseSpanishNumber(r[16]),
          feeArs: parseSpanishNumber(r[17]),
        });
      });

      // Also fetch ARS accounts (1-ZONO, 2-ZONO) daily campaign insights from Meta Graph API
      const zonoWarnings: string[] = [];
      const zonoToken = process.env.META_ZONO_ACCESS_TOKEN;
      if (zonoToken) {
        const zonoVersion = process.env.META_ZONO_API_VERSION || 'v24.0';
        const settled = await Promise.allSettled(
          zonoAccounts.map(acc => fetchZonoDailyCampaignInsights(acc, dateFrom, dateTo, zonoToken, zonoVersion))
        );
        settled.forEach((result, index) => {
          const acc = zonoAccounts[index];
          if (result.status === 'rejected') {
            const msg = result.reason instanceof Error ? result.reason.message : `No se pudo leer ${acc.name}`;
            zonoWarnings.push(msg);
            return;
          }
          for (const row of result.value) {
            const isoDate = String(row.date_start || '').trim();
            if (!isoDate || isoDate < dateFrom || isoDate > dateTo) continue;
            // Avoid double-counting if the spreadsheet ever includes this ARS account for this day
            if (sheetAccountDays.has(`${acc.name.toUpperCase()}|${isoDate}`)) continue;

            const spendArs = Number(row.spend || 0);
            const actions: Array<{ action_type?: string; value?: string | number }> = Array.isArray(row.actions) ? row.actions : [];
            const messages = Number(
              actions.find(a => a.action_type === 'onsite_conversion.messaging_conversation_started_7d')?.value || 0
            );
            const comments = Number(actions.find(a => a.action_type === 'comment')?.value || 0);
            const reactions = Number(actions.find(a => a.action_type === 'post_reaction')?.value || 0);
            const impressions = Number(row.impressions || 0);
            const reach = Number(row.reach || 0);
            const frequency = Number(row.frequency || 0);
            if (spendArs <= 0 && messages <= 0 && impressions <= 0) continue;

            const feeArs = Math.round(spendArs * ZONO_ARS_FEE_RATE * 100) / 100;
            const ctrVal = Number(row.ctr || 0);
            const cpmVal = Number(row.cpm || 0);

            addRecord({
              isoDate,
              dateStr: isoToArDate(isoDate),
              account: acc.name,
              currency: 'ARS',
              campaign: String(row.campaign_name || ''),
              messages,
              comments,
              reactions,
              ctr: ctrVal > 0 ? `${ctrVal.toFixed(2)}%` : '',
              cprUsd: 0,
              spendUsd: 0,
              reach,
              impressions,
              frequency,
              cpm: cpmVal > 0 ? `$ ${Math.round(cpmVal).toLocaleString('es-AR')}` : '',
              feePercent: '5%',
              exchangeRate: 0,
              spendArs,
              feeArs,
            });
          }
        });
      }

      // Sort chronological descending
      parsedHistory.sort((a, b) => (b.isoDate || '').localeCompare(a.isoDate || ''));

      // Query daily ERP Order totals for the EXACT date range via SQL RPC
      const erpDayMap: Record<string, { revenue: number; count: number }> = {};

      try {
        const { data, error } = await supabaseAdmin.rpc('get_daily_orders_totals', {
          p_from: dateFrom,
          p_to: dateTo,
        });

        if (error) {
          console.error('Error fetching ERP orders for ROAS:', error);
        } else {
          for (const row of (data || []) as Array<{ order_date: string; revenue: number | string; orders_count: number }>) {
            if (!row.order_date) continue;
            erpDayMap[row.order_date] = {
              revenue: Number(row.revenue) || 0,
              count: Number(row.orders_count) || 0,
            };
          }
        }
      } catch (err) {
        console.error('Error fetching ERP orders for ROAS:', err);
      }

      // Build daily timeline list
      const dailyTimeline = Object.keys(dailyMap).sort().map(isoDate => {
        const d = dailyMap[isoDate];
        const erp = erpDayMap[isoDate] || { revenue: 0, count: 0 };
        const cpr = d.messages > 0 ? Math.round(d.totalInvestmentArs / d.messages) : 0;
        const roas = d.totalInvestmentArs > 0 ? Number((erp.revenue / d.totalInvestmentArs).toFixed(2)) : 0;

        return {
          isoDate,
          dateStr: d.dateStr,
          totalInvestmentArs: d.totalInvestmentArs,
          spendUsd: d.spendUsd,
          messages: d.messages,
          cprArs: cpr,
          impressions: d.impressions,
          reach: d.reach,
          erpRevenue: erp.revenue,
          erpOrdersCount: erp.count,
          roas,
          categories: d.categories,
          accounts: d.accounts,
        };
      });

      const erpDayValues = Object.values(erpDayMap);
      const erpOrdersCount = erpDayValues.reduce((acc, d) => acc + d.count, 0);
      const erpRevenueArs = erpDayValues.reduce((acc, d) => acc + d.revenue, 0);

      const totalInvestmentArs = totalSpendArs + totalFeeArs;
      const roas = totalInvestmentArs > 0 ? (erpRevenueArs / totalInvestmentArs) : 0;
      const cac = erpOrdersCount > 0 ? Math.round(totalInvestmentArs / erpOrdersCount) : 0;
      const avgCprArs = totalMessages > 0 ? Math.round(totalInvestmentArs / totalMessages) : 0;
      const conversionRate = totalMessages > 0 ? ((erpOrdersCount / totalMessages) * 100).toFixed(1) : '0';

      const categoriesList = Object.values(categoryMap).map(c => ({
        ...c,
        cprArs: c.messages > 0 ? Math.round(c.totalInvestment / c.messages) : 0
      })).sort((a, b) => b.totalInvestment - a.totalInvestment);

      return NextResponse.json({
        tab: 'history',
        dateFrom,
        dateTo,
        zonoWarnings: zonoWarnings.length ? zonoWarnings : undefined,
        summary: {
          totalMessages,
          totalSpendUsd,
          totalSpendArs,
          totalSpendArsNative,
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
        categories: categoriesList,
        dailyTimeline,
        records: parsedHistory
      });
    }

    return NextResponse.json({ error: 'Tab not supported' }, { status: 400 });
  } catch (err: any) {
    console.error('Error in meta-ads-sheet route:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
