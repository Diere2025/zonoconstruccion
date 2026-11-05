import { NextRequest, NextResponse } from 'next/server';
import { outletSession } from '@/lib/outletServer';
export const runtime = 'edge';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Authorization' } });
export async function GET(req: NextRequest) {
    try {
        const { db } = await outletSession(req);
        const ownOrder = req.nextUrl.searchParams.get('order');
        const result = await db.from('outlet_units').select('*').in('state', ownOrder ? ['available', 'reserved'] : ['available']).order('code');
        if (result.error)
            throw new Error('No se pudo cargar el catálogo.');
        const assignments = ownOrder ? await db.from('outlet_assignments').select('unit_id,snapshot').eq('order_id', ownOrder).is('released_at', null) : null;
        const units = await Promise.all((result.data || []).filter(u => u.state === 'available' || assignments?.data?.some(a => a.unit_id === u.id)).map(async (u) => {
            const [list, cost] = await Promise.all([db.rpc('outlet_effective_list', { u }), db.rpc('outlet_effective_cost', { u })]);
            if(cost.error) throw new Error('No se pudo consultar el costo del producto base.');
            const signed = await db.storage.from('outlet-images').createSignedUrls(u.photos, 3600);
            const snap = assignments?.data?.find(a => a.unit_id === u.id)?.snapshot;
            return { ...u, cost_price: cost.data == null ? null : Number(cost.data), list_price: Number(list.data), final_price: snap?.final_price ?? Math.round(Number(list.data) * (1 - Number(u.discount) / 100) * 100) / 100, image_urls: signed.data?.map(p => p.signedUrl) || [] };
        }));
        return json({ units });
    }
    catch (e) {
        return json({ error: (e as Error).message }, 400);
    }
}
export async function POST(req: NextRequest) {
    try {
        const { db } = await outletSession(req);
        const body = await req.json();
        const result = await db.rpc('outlet_save_order', { p_operation: body.operation_id, p_order_id: body.order_id || null, p_order: body.order, p_items: body.items });
        if (result.error)
            throw new Error(result.error.message);
        return json(result.data);
    }
    catch (e) {
        return json({ error: (e as Error).message }, 409);
    }
}
