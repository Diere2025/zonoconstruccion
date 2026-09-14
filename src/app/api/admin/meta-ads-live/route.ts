export const runtime = 'edge';
export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';

const DEFAULT_ACCOUNT_ID = 'act_1077861488005193';
const DEFAULT_EXCHANGE_RATE = 1704; // Dólar tarjeta/publicidad en Argentina con percepciones
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutos
const MIN_REFRESH_INTERVAL_MS = 25 * 1000; // 25 segundos cooldown para refresco forzado

interface CacheContainer {
  data: any;
  cachedAt: number;
}

let memoryCache: CacheContainer | null = null;
let lastMetaCallTime = 0;

function parseLineFromCampaign(name: string): string {
  const match = name.match(/\[([\d|]+)\]/);
  if (match && match[1]) {
    return match[1].replace('|', ' / ');
  }
  return '';
}

function parseOfferFromCampaign(name: string): string {
  const match = name.match(/\((.*?)\)/);
  if (match && match[1]) {
    return match[1].trim();
  }
  return name.replace(/Estado:on|Estado:off|\[.*?\]/gi, '').trim();
}

function categorizeOffer(offerOrName: string): string {
  const lower = offerOrName.toLowerCase();
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
  return 'Otros';
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get('force') === 'true' || searchParams.get('refresh') === 'true';
    const customExchangeRate = parseFloat(searchParams.get('exchangeRate') || '') || DEFAULT_EXCHANGE_RATE;

    const token = process.env.META_ACCESS_TOKEN;
    const accountId = process.env.META_AD_ACCOUNT_ID || DEFAULT_ACCOUNT_ID;

    if (!token) {
      return NextResponse.json(
        { error: 'META_ACCESS_TOKEN not configured in environment variables' },
        { status: 500 }
      );
    }

    const now = Date.now();
    const isCacheValid = memoryCache && (now - memoryCache.cachedAt < CACHE_TTL_MS);

    // Servir desde cache si es válido y no se forzó refresco
    if (isCacheValid && !forceRefresh) {
      return NextResponse.json({
        ...memoryCache!.data,
        isCached: true,
        cacheAgeSeconds: Math.round((now - memoryCache!.cachedAt) / 1000)
      });
    }

    // Cooldown check si fuerza refresco muy rápido para proteger la API
    if (forceRefresh && now - lastMetaCallTime < MIN_REFRESH_INTERVAL_MS && memoryCache) {
      return NextResponse.json({
        ...memoryCache.data,
        isCached: true,
        cooldownRemainingSeconds: Math.ceil((MIN_REFRESH_INTERVAL_MS - (now - lastMetaCallTime)) / 1000),
        message: 'Refresco en cooldown para cuidar la cuota de Meta Ads API'
      });
    }

    // =========================================================================
    // 2 Consultas Batch / Consolidadas a Meta Graph API
    // =========================================================================
    lastMetaCallTime = now;

    // Consulta 1: Todos los anuncios con campaña madre, presupuesto y creativos
    const adsUrl = `https://graph.facebook.com/v19.0/${accountId}/ads?fields=id,name,status,effective_status,campaign_id,campaign{id,name,daily_budget,budget_remaining,status,effective_status},adset_id,adset{id,name},creative{id,name,thumbnail_url,image_url,title,body}&effective_status=["ACTIVE","PAUSED"]&limit=150&access_token=${token}`;
    
    // Consulta 2: Insights de HOY a nivel anuncio
    const insightsUrl = `https://graph.facebook.com/v19.0/${accountId}/insights?level=ad&date_preset=today&fields=campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,actions,cost_per_action_type,frequency,impressions,cpm,ctr&limit=150&access_token=${token}`;

    const [adsResponse, insightsResponse] = await Promise.all([
      fetch(adsUrl, { cache: 'no-store' }),
      fetch(insightsUrl, { cache: 'no-store' })
    ]);

    const adsData = await adsResponse.json();
    const insightsData = await insightsResponse.json();

    if (adsData.error) {
      console.error('[Meta Ads Live API] Error fetching ads:', adsData.error);
      if (memoryCache) {
        return NextResponse.json({ ...memoryCache.data, isCached: true, apiError: adsData.error.message });
      }
      return NextResponse.json({ error: adsData.error.message }, { status: 500 });
    }

    if (insightsData.error) {
      console.error('[Meta Ads Live API] Error fetching insights:', insightsData.error);
      if (memoryCache) {
        return NextResponse.json({ ...memoryCache.data, isCached: true, apiError: insightsData.error.message });
      }
      return NextResponse.json({ error: insightsData.error.message }, { status: 500 });
    }

    // Mapa de métricas de hoy indexadas por ad_id
    const adInsightsMap: Record<string, any> = {};
    (insightsData.data || []).forEach((item: any) => {
      const msgs = item.actions?.find(
        (a: any) => a.action_type === 'onsite_conversion.messaging_conversation_started_7d'
      )?.value || 0;

      adInsightsMap[item.ad_id] = {
        spendUsd: parseFloat(item.spend || 0),
        messages: parseInt(msgs, 10),
        frequency: parseFloat(item.frequency || 0),
        impressions: parseInt(item.impressions || 0, 10),
        ctr: parseFloat(item.ctr || 0),
        cpm: parseFloat(item.cpm || 0)
      };
    });

    // Mapeo y agrupación de anuncios por campaña
    const campaignsMap: Record<string, any> = {};

    (adsData.data || []).forEach((ad: any) => {
      const camp = ad.campaign;
      if (!camp) return;

      const campId = camp.id;
      if (!campaignsMap[campId]) {
        const rawCampStatus = (camp.effective_status || camp.status || 'ACTIVE').toUpperCase();
        const isCampActive = rawCampStatus === 'ACTIVE';

        // Budget diario en Meta viene en centavos (ej: 14000 = $140 USD)
        const dailyBudgetRaw = parseFloat(camp.daily_budget || 0);
        const dailyBudgetUsd = dailyBudgetRaw > 0 ? (dailyBudgetRaw / 100) : 0;
        const budgetArs = Math.round(dailyBudgetUsd * customExchangeRate);

        const offer = parseOfferFromCampaign(camp.name);
        const line = parseLineFromCampaign(camp.name);
        const prod = categorizeOffer(offer);

        campaignsMap[campId] = {
          campaignId: campId,
          campaignName: camp.name,
          accountName: 'S731.04',
          status: isCampActive ? 'ACTIVE' : 'PAUSED',
          dailyBudgetUsd,
          budgetArs,
          commercialOffer: offer,
          product: prod,
          phoneLine: line,
          spendUsd: 0,
          spendArs: 0,
          messages: 0,
          impressions: 0,
          frequencySum: 0,
          adsCount: 0,
          ads: []
        };
      }

      const ins = adInsightsMap[ad.id] || {
        spendUsd: 0,
        messages: 0,
        frequency: 0,
        impressions: 0,
        ctr: 0,
        cpm: 0
      };

      const isAdActive = ad.effective_status === 'ACTIVE';
      const hasSpendToday = ins.spendUsd > 0;

      // Ignorar anuncios pausados históricos que no tuvieron consumo hoy
      if (!isAdActive && !hasSpendToday) {
        return;
      }

      const adSpendArs = Math.round(ins.spendUsd * customExchangeRate);
      const adCprUsd = ins.messages > 0 ? (ins.spendUsd / ins.messages) : 0;
      const adCprArs = ins.messages > 0 ? Math.round(adSpendArs / ins.messages) : 0;

      // Diagnóstico y alertas a nivel anuncio individual
      const adAlerts: string[] = [];

      if (ins.spendUsd >= 5 && ins.messages === 0) {
        adAlerts.push('🛑 Gasto sin mensajes');
      } else if (ins.spendUsd >= 6 && adCprUsd > 3.50) {
        adAlerts.push(`🚨 CPR Alto (US$ ${adCprUsd.toFixed(2)})`);
      } else if (ins.messages >= 10 && adCprUsd <= 2.00) {
        adAlerts.push(`⭐ Ganador (US$ ${adCprUsd.toFixed(2)})`);
      }

      if (ins.frequency >= 1.80 && ins.spendUsd >= 5) {
        adAlerts.push(`⚠️ Fatiga (${ins.frequency.toFixed(1)}x)`);
      }

      const formattedAd = {
        id: ad.id,
        name: ad.name,
        status: ad.status,
        effectiveStatus: ad.effective_status,
        adsetId: ad.adset?.id,
        adsetName: ad.adset?.name,
        thumbnailUrl: ad.creative?.thumbnail_url || null,
        imageUrl: ad.creative?.image_url || null,
        title: ad.creative?.title || null,
        body: ad.creative?.body || null,
        spendUsd: ins.spendUsd,
        spendArs: adSpendArs,
        messages: ins.messages,
        costPerActionUsd: adCprUsd,
        cprArs: adCprArs,
        frequency: ins.frequency,
        impressions: ins.impressions,
        ctr: ins.ctr,
        cpm: ins.cpm,
        alerts: adAlerts
      };

      // Acumular en la campaña padre
      const targetCamp = campaignsMap[campId];
      targetCamp.spendUsd += ins.spendUsd;
      targetCamp.spendArs += adSpendArs;
      targetCamp.messages += ins.messages;
      targetCamp.impressions += ins.impressions;
      if (ins.frequency > 0) {
        targetCamp.frequencySum += ins.frequency;
        targetCamp.adsCount += 1;
      }
      targetCamp.ads.push(formattedAd);
    });

    // Consolidar campañas finales
    const liveCampaigns: any[] = [];
    let totalMessages = 0;
    let totalSpendUsd = 0;
    let totalSpendArs = 0;
    let totalBudgetArs = 0;

    Object.values(campaignsMap).forEach((c: any) => {
      // Filtrar campañas que están completamente inactivas y no gastaron nada hoy
      if (c.status !== 'ACTIVE' && c.spendUsd === 0) return;

      const costPerActionUsd = c.messages > 0 ? (c.spendUsd / c.messages) : 0;
      const cprArs = c.messages > 0 ? Math.round(c.spendArs / c.messages) : 0;
      const frequency = c.adsCount > 0 ? (c.frequencySum / c.adsCount) : 1;
      const budgetConsumedPercent = c.budgetArs > 0 ? Math.round((c.spendArs / c.budgetArs) * 100) : 0;

      // Ordenar los anuncios de la campaña: primero los que tienen más gasto
      c.ads.sort((a: any, b: any) => b.spendUsd - a.spendUsd);

      totalMessages += c.messages;
      totalSpendUsd += c.spendUsd;
      totalSpendArs += c.spendArs;
      totalBudgetArs += c.budgetArs;

      liveCampaigns.push({
        status: c.status,
        accountName: c.accountName,
        campaignName: c.campaignName,
        campaignId: c.campaignId,
        messages: c.messages,
        costPerActionUsd,
        spendUsd: c.spendUsd,
        dailyBudgetUsd: c.dailyBudgetUsd,
        commercialOffer: c.commercialOffer,
        product: c.product,
        phoneLine: c.phoneLine,
        spendArs: c.spendArs,
        cprArs,
        budgetArs: c.budgetArs,
        frequency,
        budgetConsumedPercent,
        ads: c.ads
      });
    });

    // Ordenar campañas por gasto descendente por defecto
    liveCampaigns.sort((a, b) => b.spendUsd - a.spendUsd);

    const avgCprArs = totalMessages > 0 ? Math.round(totalSpendArs / totalMessages) : 0;
    const avgCprUsd = totalMessages > 0 ? (totalSpendUsd / totalMessages) : 0;
    const pacingPercent = totalBudgetArs > 0 ? Math.round((totalSpendArs / totalBudgetArs) * 100) : 0;
    const activeCampaignsCount = liveCampaigns.filter(c => c.status === 'ACTIVE').length;
    const pausedCampaignsCount = liveCampaigns.filter(c => c.status === 'PAUSED').length;

    const responsePayload = {
      tab: 'live',
      source: 'meta_api_direct',
      updatedAt: new Date().toISOString(),
      exchangeRate: customExchangeRate,
      summary: {
        totalMessages,
        totalSpendUsd,
        totalSpendArs,
        totalBudgetArs,
        avgCprArs,
        avgCprUsd,
        pacingPercent,
        activeCampaignsCount,
        pausedCampaignsCount,
        totalCampaignsCount: liveCampaigns.length
      },
      campaigns: liveCampaigns
    };

    // Guardar en cache de memoria
    memoryCache = {
      data: responsePayload,
      cachedAt: now
    };

    return NextResponse.json({
      ...responsePayload,
      isCached: false,
      cacheAgeSeconds: 0
    });

  } catch (error: any) {
    console.error('[Meta Ads Live API] Fatal error:', error);
    if (memoryCache) {
      return NextResponse.json({
        ...memoryCache.data,
        isCached: true,
        apiError: error.message
      });
    }
    return NextResponse.json({ error: error.message || 'Error processing Meta Ads Live' }, { status: 500 });
  }
}
