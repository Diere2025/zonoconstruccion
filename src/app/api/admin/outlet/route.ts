import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateOutlet } from '@/lib/outlet';
import {calculateBulkPrices} from '@/lib/erp/prices';
export const runtime = 'edge';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Authorization' } });
class RequestError extends Error {
    constructor(message: string, public status = 400) { super(message); }
}
async function authorize(req: NextRequest) {
    const token = req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
    if (!token)
        throw new RequestError('Volvé a ingresar al ERP.', 401);
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user || data.user.is_anonymous)
        throw new RequestError('Volvé a ingresar al ERP.', 401);
    const access = await db.rpc('outlet_can_manage');
    if (access.error)
        throw new RequestError('El módulo requiere activar la migración de Segunda y Outlet.', 503);
    if (!access.data)
        throw new RequestError('Tu cuenta no puede administrar este catálogo.', 403);
    return { db, user: data.user };
}
function fail(error: unknown) { return json({ error: error instanceof RequestError ? error.message : error instanceof Error ? error.message : 'No se pudo guardar la unidad.' }, error instanceof RequestError ? error.status : 400); }
function databaseError(error: {
    code?: string;
    message: string;
}) {
    if (error.code === '23505')
        return new RequestError('Ya existe una unidad con ese código.', 409);
    if (['42P01', 'PGRST205'].includes(error.code || ''))
        return new RequestError('El módulo requiere activar su migración.', 503);
    return new RequestError('No se pudo guardar la ficha. Revisá los datos y reintentá.', 503);
}
export async function GET(req: NextRequest) {
    try {
        const { db } = await authorize(req);
        const result = await db.from('outlet_units').select('*').order('created_at', { ascending: false }).limit(1000);
        if (result.error)
            throw databaseError(result.error);
        const assignments = await db.from('outlet_assignments').select('unit_id,snapshot').is('released_at', null);
        const units = await Promise.all(result.data.map(async (unit) => {
            const images = unit.photos?.length ? await db.storage.from('outlet-images').createSignedUrls(unit.photos, 3600) : null;
            const price = unit.price_mode === 'base' ? await db.rpc('outlet_effective_list', { u: unit }) : null;
            const snapshot = assignments.data?.find(a => a.unit_id === unit.id)?.snapshot;
            return { ...unit, list_price: snapshot?.list_price ?? (price ? Number(price.data) : unit.list_price), image_urls: images?.data?.map(i => i.signedUrl) || [] };
        }));
        const products = await db.from('products').select('id,name,category,price,fixed_price,markup_percentage,markup_wholesale_percentage,sku,cost_price,unified_cost').eq('is_active', true).eq('is_outlet_unit', false).order('name').limit(2000);
        if (products.error)
            throw databaseError(products.error);
        const audit = req.nextUrl.searchParams.get('unit');
        const history = audit ? await db.from('outlet_audit').select('recorded_at,after_data,before_data').eq('unit_id', audit).order('recorded_at', { ascending: false }).limit(40) : null;
        const adminPermission=await db.rpc('outlet_is_admin');
        const prices=await calculateBulkPrices(db,products.data||[],'minorista');
        return json({ canManagePermissions:adminPermission.data===true,units, products: products.data?.map(p=>({...p,price:prices[p.id]?.price??p.price})), history: history?.data || [] });
    }
    catch (error) {
        return fail(error);
    }
}
export async function POST(req: NextRequest) {
    try {
        const { db, user } = await authorize(req);
        const input = await req.json();
        const values = validateOutlet(input);
        if(values.base_product_id){
            const model=await db.from('products').select('name,category,is_outlet_unit').eq('id',values.base_product_id).maybeSingle();
            if(model.error||!model.data||model.data.is_outlet_unit)throw new RequestError('Elegí un producto de referencia válido.');
            values.name=model.data.name;values.category=model.data.category;
        }else if(values.state==='available')throw new RequestError('Completá el producto de referencia antes de publicar.');
        if (values.photos.some(p => !p.startsWith(`${user.id}/`))) {
            // Existing photos may have been uploaded by another administrator.
            if (!input.id)
                throw new RequestError('Revisá las fotos de la unidad.');
            const previous = await db.from('outlet_units').select('photos').eq('id', input.id).single();
            if (previous.error || values.photos.some(p => !p.startsWith(`${user.id}/`) && !previous.data.photos.includes(p)))
                throw new RequestError('Revisá las fotos de la unidad.');
        }
        const result = await db.rpc('outlet_save_unit', { p_id: input.id || null, p_version: input.version || null, p_data: values });
        if (result.error)
            throw new RequestError(result.error.message, 409);
        return json({ id: result.data });
    }
    catch (error) {
        return fail(error);
    }
}
