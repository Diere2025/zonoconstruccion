export const runtime = 'edge';
export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { reportingDates, type Metrics } from '@/lib/meta-ads-review';
const TTL = 180000;
const cacheMap = new Map<string, { at: number; data: any }>();
const pendingMap = new Map<string, Promise<any>>();
type LiveMetrics = Metrics & { spendArs: number; cpm: number };
const resolveAccount = (raw: string | null) => {
    const normalized = (raw || '').trim().toLowerCase();
    if (!normalized || normalized === 'default' || normalized === 's731.04' || normalized === 's731' || normalized === 'act_1077861488005193') {
        return { accountId: process.env.META_AD_ACCOUNT_ID || 'act_1077861488005193', token: process.env.META_ACCESS_TOKEN, expectedCurrency: 'USD' as const };
    }
    if (normalized === '1-zono' || normalized === '1zono' || normalized === 'act_2361501517627802') {
        return { accountId: 'act_2361501517627802', token: process.env.META_ZONO_ACCESS_TOKEN, expectedCurrency: 'ARS' as const };
    }
    if (normalized === '2-zono' || normalized === '2zono' || normalized === 'act_942497128185607') {
        return { accountId: 'act_942497128185607', token: process.env.META_ZONO_ACCESS_TOKEN, expectedCurrency: 'ARS' as const };
    }
    return null;
};
export async function GET(request: Request) {
    const params = new URL(request.url).searchParams;
    const rate = Number(params.get('exchangeRate') || 1704);
    if (!Number.isFinite(rate) || rate <= 0)
        return NextResponse.json({ error: 'Tipo de cambio inválido' }, { status: 400 });
    const target = resolveAccount(params.get('account'));
    if (!target)
        return NextResponse.json({ error: 'Cuenta publicitaria no reconocida' }, { status: 400 });
    const { accountId, token, expectedCurrency } = target;
    const isArs = expectedCurrency === 'ARS';
    const key = `${accountId}:${rate}`;
    const force = params.get('force') === 'true' || params.get('refresh') === 'true';
    const reply = (data: any, at: number, error?: string) => NextResponse.json({ ...data, isCached: true, cacheAgeSeconds: Math.floor((Date.now() - at) / 1000), stale: !!error || Date.now() - at > TTL, apiError: error }, { headers: { 'Cache-Control': 'private, no-store' } });
    const cached = cacheMap.get(key);
    if (cached && cached.data.dates.today === reportingDates(new Date(), cached.data.account.timezone).today && Date.now() - cached.at < (force ? 25000 : TTL))
        return reply(cached.data, cached.at);
    if (!token)
        return NextResponse.json({ error: 'No hay credencial de Meta configurada. Recomendaciones suspendidas.' }, { status: 503 });
    const metric = (r: any = {}): LiveMetrics => {
        const rawSpend = Number(r.spend || 0);
        return {
            spendUsd: isArs ? rawSpend / rate : rawSpend,
            spendArs: isArs ? rawSpend : rawSpend * rate,
            messages: Number(r.actions?.find((a: any) => a.action_type === 'onsite_conversion.messaging_conversation_started_7d')?.value || 0),
            frequency: Number(r.frequency || 0),
            ctr: Number(r.ctr || 0),
            cpm: Number(r.cpm || 0),
            impressions: Number(r.impressions || 0),
        };
    };
    async function graph(path: string, values: Record<string, string> = {}, list = false): Promise<any> {
        let url: URL | null = new URL(`https://graph.facebook.com/${process.env.META_API_VERSION || 'v21.0'}/${path}`);
        Object.entries(values).forEach(([k, v]) => url!.searchParams.set(k, v));
        url.searchParams.set('access_token', token!);
        const rows: any[] = [];
        const seen = new Set<string>();
        while (url) {
            if (url.origin !== 'https://graph.facebook.com' || seen.has(url.href))
                throw new Error('Paginación inválida de Meta');
            seen.add(url.href);
            let res: Response;
            try {
                res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
            } catch (error) {
                const timeout = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
                throw new Error(timeout
                    ? 'Meta tardó más de 20 segundos en responder. Volvé a actualizar; las recomendaciones quedan suspendidas.'
                    : 'El servidor no pudo conectarse con Meta. Revisar la conexión de red del servidor y volver a actualizar.');
            }
            const body: any = await res.json().catch(() => null);
            if (!body) throw new Error(`Meta devolvió una respuesta no válida (HTTP ${res.status}). Volvé a actualizar.`);
            if (!res.ok || body.error)
                throw new Error(`Meta no pudo completar la consulta (código ${body.error?.code || res.status}${body.error?.error_subcode ? '/' + body.error.error_subcode : ''}). Revisar permisos, restricciones y vigencia de la credencial.`);
            if (!list)
                return body;
            if (!Array.isArray(body.data))
                throw new Error('Meta devolvió una respuesta incompleta');
            rows.push(...body.data);
            url = body.paging?.next ? new URL(body.paging.next) : null;
        }
        return rows;
    }
    async function collect() {
        const account = await graph(accountId, { fields: 'name,currency,timezone_name,account_status,disable_reason,spend_cap,amount_spent' });
        if (account.currency !== expectedCurrency)
            throw new Error(`La cuenta no está en ${expectedCurrency}; se suspendió la conversión para evitar importes incorrectos.`);
        const dates = reportingDates(new Date(), account.timezone_name);
        const windows = { today: { since: dates.today, until: dates.today }, yesterday: { since: dates.yesterday, until: dates.yesterday }, week: { since: dates.weekStart, until: dates.yesterday } };
        const insights: Record<string, any[]> = {};
        const fields = 'campaign_id,campaign_name,spend,actions,frequency,impressions,ctr,cpm';
        // Sequential periods bound API concurrency; pagination must complete before publishing totals.
        for (const [period, range] of Object.entries(windows)) {
            const results = await Promise.allSettled(['ad', 'campaign'].map(level => graph(accountId + '/insights', { fields: fields + (level === 'ad' ? ',ad_id,ad_name,adset_id,adset_name' : ''), level, time_range: JSON.stringify(range), limit: '150' }, true)));
            for (let i = 0; i < results.length; i++) {
                const r = results[i];
                if (r.status === 'rejected')
                    throw r.reason;
                insights[`${period}_${i === 0 ? 'ad' : 'campaign'}`] = r.value;
            }
        }
        const metadata = await graph(accountId + '/ads', { fields: 'id,name,status,effective_status,campaign_id,campaign{id,name,status,effective_status,daily_budget},adset{id,name,daily_budget,optimization_goal,learning_stage_info},creative{thumbnail_url,image_url,title,body}', limit: '150' }, true);
        const adsById = new Map<string, any>(metadata.map((ad: any) => [ad.id, ad]));
        for (const period of Object.keys(windows))
            for (const r of insights[period + '_ad'])
                if (!adsById.has(r.ad_id))
                    adsById.set(r.ad_id, { id: r.ad_id, name: r.ad_name, effective_status: 'UNKNOWN', campaign_id: r.campaign_id, campaign: { id: r.campaign_id, name: r.campaign_name, effective_status: 'UNKNOWN' }, adset: { id: r.adset_id, name: r.adset_name } });
        const maps = Object.fromEntries(Object.entries(insights).map(([k, rows]) => [k, new Map(rows.map(r => [k.endsWith('_ad') ? r.ad_id : r.campaign_id, r]))]));
        const periods = (id: string, level: string) => Object.fromEntries(Object.keys(windows).map(p => [p, metric(maps[p + '_' + level].get(id))]));
        const campaigns = new Map<string, any>();
        for (const ad of adsById.values()) {
            const p = periods(ad.id, 'ad');
            if (ad.effective_status !== 'ACTIVE' && !Object.values(p).some(m => m.spendArs > 0 || m.messages > 0))
                continue;
            const c = ad.campaign;
            if (!c)
                continue;
            if (!campaigns.has(c.id)) {
                const cp = periods(c.id, 'campaign');
                const t = cp.today;
                const offer = c.name.match(/\((.*?)\)/)?.[1] || c.name;
                const product = /bio/i.test(offer) ? 'Biodigestores' : /cooper|universal|termo/i.test(offer) ? 'Termotanques' : /meps/i.test(offer) ? 'MEPS' : /tanque|aquafort/i.test(offer) ? 'Tanques' : 'Otros';
                const rawBudget = Number(c.daily_budget || 0) / 100;
                const budgetArs = isArs ? rawBudget : rawBudget * rate;
                const dailyBudgetUsd = isArs ? rawBudget / rate : rawBudget;
                campaigns.set(c.id, { campaignId: c.id, campaignName: c.name, commercialOffer: offer, product, phoneLine: c.name.match(/\[([\d|]+)\]/)?.[1]?.replaceAll('|', ' / ') || '', accountName: account.name, status: c.effective_status || c.status || 'UNKNOWN', ...t, periods: cp, spendArs: t.spendArs, costPerActionUsd: t.messages ? t.spendUsd / t.messages : 0, cprArs: t.messages ? t.spendArs / t.messages : 0, dailyBudgetUsd, budgetArs, budgetConsumedPercent: budgetArs ? t.spendArs / budgetArs * 100 : 0, ads: [] });
            }
            const t = p.today;
            campaigns.get(c.id).ads.push({ id: ad.id, name: ad.name, status: ad.status, effectiveStatus: ad.effective_status, adsetId: ad.adset?.id, adsetName: ad.adset?.name, adsetDailyBudget: ad.adset?.daily_budget ? Number(ad.adset.daily_budget) / 100 : null, adsetOptimizationGoal: ad.adset?.optimization_goal || null, adsetLearningStage: ad.adset?.learning_stage_info || null, thumbnailUrl: ad.creative?.thumbnail_url, imageUrl: ad.creative?.image_url, title: ad.creative?.title, body: ad.creative?.body, ...t, periods: p, spendArs: t.spendArs, costPerActionUsd: t.messages ? t.spendUsd / t.messages : 0, cprArs: t.messages ? t.spendArs / t.messages : 0, alerts: [] });
        }
        const rows = [...campaigns.values()].sort((a, b) => b.spendArs - a.spendArs);
        rows.forEach(c => c.ads.sort((a: any, b: any) => b.spendArs - a.spendArs));
        const totalSpendRaw = insights.today_campaign.reduce((s, r) => s + Number(r.spend || 0), 0);
        const totalSpendUsd = isArs ? totalSpendRaw / rate : totalSpendRaw;
        const totalSpendArs = isArs ? totalSpendRaw : totalSpendRaw * rate;
        const totalMessages = insights.today_campaign.reduce((s, r) => s + metric(r).messages, 0);
        const totalBudgetArs = rows.filter(c => c.status === 'ACTIVE').reduce((s, c) => s + c.budgetArs, 0);
        let activities: any[] = [];
        let activitiesError: string | null = null;
        try {
            activities = await graph(accountId + '/activities', { fields: 'event_time,event_type,translated_event_type,object_id,object_name,extra_data', since: String(Math.floor(new Date(dates.weekStart + 'T00:00:00Z').getTime() / 1000)), limit: '100' }, true);
        }
        catch (e) {
            activitiesError = e instanceof Error ? e.message : 'Historial no disponible';
        }
        if (reportingDates(new Date(), account.timezone_name).today !== dates.today)
            throw new Error('Cambió el día durante la consulta; actualizar nuevamente.');
        const cap = account.spend_cap == null ? null : Number(account.spend_cap) / 100;
        const spent = account.amount_spent == null ? null : Number(account.amount_spent) / 100;
        return { tab: 'live', source: 'meta_api_direct', updatedAt: new Date().toISOString(), stale: false, exchangeRate: rate, dates, account: { id: accountId, name: account.name, status: account.account_status, disableReason: account.disable_reason, timezone: account.timezone_name, currency: account.currency, spendCap: cap, remaining: cap && spent !== null ? Math.max(0, cap - spent) : null }, activities, activitiesError, summary: { totalMessages, totalSpendUsd, totalSpendArs, totalBudgetArs, avgCprUsd: totalMessages ? totalSpendUsd / totalMessages : 0, avgCprArs: totalMessages ? totalSpendArs / totalMessages : 0, pacingPercent: totalBudgetArs ? totalSpendArs / totalBudgetArs * 100 : 0, activeCampaignsCount: rows.filter(c => c.status === 'ACTIVE').length, pausedCampaignsCount: rows.filter(c => c.status === 'PAUSED').length, totalCampaignsCount: rows.length }, campaigns: rows };
    }
    try {
        let work = pendingMap.get(key);
        if (!work) {
            work = collect();
            pendingMap.set(key, work);
        }
        const data = await work;
        const at = Date.parse(data.updatedAt);
        cacheMap.set(key, { at, data });
        if (pendingMap.get(key) === work)
            pendingMap.delete(key);
        return reply(data, at);
    }
    catch (e) {
        pendingMap.delete(key);
        const error = e instanceof Error ? e.message : 'No se pudo consultar Meta';
        if (cached)
            return reply(cached.data, cached.at, error);
        return NextResponse.json({ error }, { status: 503 });
    }
}
