export const AGENCY_FEE_RATE = 0.055;
export const REFERENCE_ARS = 1_000_000;
const TTL = 10 * 60_000;
const MAX_AGE = 60 * 60_000;
type Offer = { adv?: { price?: string; minSingleTransAmount?: string; maxSingleTransAmount?: string; surplusAmount?: string } };
export type MetaFx = {
    transport?: 'direct' | 'criptoya'; referenceUsdt?: number;
    source: 'binance_p2p'; baseRate: number | null; effectiveRate: number | null;
    agencyFeeRate: number; referenceArs: number; quotedAt: string | null;
    status: 'fresh' | 'stale' | 'unavailable'; error?: string;
};
export function selectBinanceRate(offers: Offer[]): number {
    const prices = offers.flatMap(({ adv }) => {
        const price = Number(adv?.price), min = Number(adv?.minSingleTransAmount);
        const max = Number(adv?.maxSingleTransAmount), available = Number(adv?.surplusAmount);
        return [price, min, max, available].every(Number.isFinite) && price > 0 && min > 0 &&
            min <= REFERENCE_ARS && max >= REFERENCE_ARS && available * price >= REFERENCE_ARS ? [price] : [];
    }).sort((a, b) => a - b).slice(0, 5);
    if (prices.length < 3) throw new Error('Binance no devolvió suficientes ofertas utilizables.');
    const middle = Math.floor(prices.length / 2);
    return prices.length % 2 ? prices[middle] : (prices[middle - 1] + prices[middle]) / 2;
}
export function createMetaFxProvider(fetcher: typeof fetch = fetch, now: () => number = Date.now) {
    let last: MetaFx | null = null;
    let pending: Promise<MetaFx> | null = null;
    let retryAfter = 0;
    const fallback = (): MetaFx => ({
        source: 'binance_p2p', agencyFeeRate: AGENCY_FEE_RATE, referenceArs: REFERENCE_ARS,
        baseRate: null, effectiveRate: null, quotedAt: last?.quotedAt ?? null,
        ...(last && now() - Date.parse(last.quotedAt!) <= MAX_AGE ? last : {}),
        status: last && now() - Date.parse(last.quotedAt!) <= MAX_AGE ? 'stale' : 'unavailable',
        error: 'No se pudo actualizar Binance P2P. Los importes ARS requieren una cotización vigente.',
    });
    return async (): Promise<MetaFx> => {
        if (last && now() - Date.parse(last.quotedAt!) < TTL) return last;
        if (now() < retryAfter) return fallback();
        if (pending) return pending;
        pending = (async () => {
            try {
                let quote: {baseRate: number; quotedAt: string; transport: 'direct' | 'criptoya'; referenceUsdt?: number} | null = null;
                for (const host of ['https://p2p.binance.com', 'https://www.binance.com']) {
                    try {
                        const response = await fetcher(host + '/bapi/c2c/v2/friendly/c2c/adv/search', {
                            method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, cache: 'no-store',
                            signal: AbortSignal.timeout(5000),
                            body: JSON.stringify({ fiat: 'ARS', asset: 'USDT', tradeType: 'BUY', page: 1, rows: 20,
                                transAmount: String(REFERENCE_ARS), publisherType: 'merchant', payTypes: [], countries: [],
                                proMerchantAds: false, shieldMerchantAds: false, filterType: 'all' }),
                        });
                        const body = await response.json();
                        if (!response.ok || body.code !== '000000' || !Array.isArray(body.data)) throw new Error('Invalid quote');
                        quote = {baseRate: selectBinanceRate(body.data), quotedAt: new Date(now()).toISOString(), transport: 'direct'};
                        break;
                    } catch { /* Try the alternate public host, then the documented aggregator. */ }
                }
                if (!quote) {
                    // Binance P2P purchase quote via CriptoYa. Use the source's original timestamp.
                    const response = await fetcher('https://criptoya.com/api/binancep2p/usdt/ars/500', {
                        cache: 'no-store', signal: AbortSignal.timeout(5000),
                    });
                    const body = await response.json();
                    const baseRate = Number(body.ask), timestamp = Number(body.time) * 1000;
                    if (!response.ok || !Number.isFinite(baseRate) || baseRate <= 0 || !Number.isFinite(timestamp) ||
                        now() - timestamp > TTL || timestamp > now() + 60_000) throw new Error('Invalid aggregator quote');
                    quote = {baseRate, quotedAt: new Date(timestamp).toISOString(), transport: 'criptoya', referenceUsdt: 500};
                }
                last = { source: 'binance_p2p', ...quote, effectiveRate: quote.baseRate * (1 + AGENCY_FEE_RATE),
                    agencyFeeRate: AGENCY_FEE_RATE, referenceArs: REFERENCE_ARS, status: 'fresh' };
                return last;
            } catch {
                retryAfter = now() + 60_000;
                return fallback();
            } finally { pending = null; }
        })();
        return pending;
    };
}
export const getMetaFx = createMetaFxProvider();

// Revalue the response from original USD amounts, never from already converted pesos.
type DollarMetrics = { spendUsd: number; costPerActionUsd: number };
type DollarCampaign = DollarMetrics & { status: string; dailyBudgetUsd: number; ads: DollarMetrics[] };
type DollarData = { campaigns: DollarCampaign[]; summary: { totalSpendUsd: number; avgCprUsd: number } };
export function applyMetaFx<T extends DollarData>(data: T, fx: MetaFx) {
    const ars = (usd: number) => fx.effectiveRate === null ? null : usd * fx.effectiveRate;
    const campaigns = data.campaigns.map((c) => ({ ...c,
        spendArs: ars(c.spendUsd), cprArs: ars(c.costPerActionUsd), budgetArs: ars(c.dailyBudgetUsd),
        ads: c.ads.map((ad) => ({ ...ad, spendArs: ars(ad.spendUsd), cprArs: ars(ad.costPerActionUsd) })),
    }));
    const budgetUsd = campaigns.filter((c) => c.status === 'ACTIVE').reduce((s: number, c) => s + c.dailyBudgetUsd, 0);
    return { ...data, exchangeRate: fx.effectiveRate, fx, campaigns, summary: { ...data.summary,
        totalSpendArs: ars(data.summary.totalSpendUsd), avgCprArs: ars(data.summary.avgCprUsd), totalBudgetArs: ars(budgetUsd) } };
}
