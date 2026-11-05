import { createClient } from '@supabase/supabase-js';
import { createOutletCatalogPdf } from '@/lib/outletCatalogPdf';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const noCache = { 'Cache-Control': 'no-store' };

export async function GET() {
    try {
        const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
            auth: { persistSession: false, autoRefreshToken: false },
        });
        const bucket = db.storage.from('outlet-images');
        const available = async () => {
            const result = await db.from('outlet_units').select('*').eq('state', 'available').order('id');
            if (result.error) throw result.error;
            return result.data;
        };

        // If a reservation or edit lands during rendering, discard that edition.
        for (let attempt = 0; attempt < 2; attempt++) {
            const rows = await available();
            const units = await Promise.all(rows.map(async unit => {
                const list = await db.rpc('outlet_effective_list', { u: unit });
                const price = Number(list.data);
                if (list.error || !Number.isFinite(price) || price <= 0) throw new Error('Precio de lista no disponible.');
                return {
                    code: unit.code, name: unit.name, condition: unit.condition, state: unit.state,
                    reason: unit.reason, defect: unit.defect, list_price: price, discount: Number(unit.discount),
                    final_price: Math.round(price * (1 - Number(unit.discount) / 100) * 100) / 100,
                    image_urls: (unit.photos as string[]).slice(0, 1),
                };
            }));
            const pdf = await createOutletCatalogPdf(units, async path => {
                const { data, error } = await bucket.download(path);
                if (error || !data) throw new Error('Foto no disponible.');
                return { data: new Uint8Array(await data.arrayBuffer()) };
            }, new Date(), true);
            const latest = await db.from('outlet_units').select('id,version').eq('state', 'available').order('id');
            if (latest.error) throw latest.error;
            if (latest.data.length !== rows.length || latest.data.some((unit, i) =>
                unit.id !== rows[i].id || unit.version !== rows[i].version)) continue;
            return new Response(pdf.output('arraybuffer'), { headers: {
                ...noCache,
                'Content-Type': 'application/pdf',
                'Content-Disposition': 'inline; filename="ZONO-Segunda-y-Outlet.pdf"',
                'X-Content-Type-Options': 'nosniff',
            } });
        }
    } catch (error) {
        console.error('Outlet PDF generation failed:', error instanceof Error ? error.message : 'catalog unavailable');
    }
    return new Response('El catálogo se está actualizando. Volvé a abrir el enlace en unos instantes.', {
        status: 503, headers: { ...noCache, 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '5' },
    });
}
