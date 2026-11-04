export type OutletCondition = 'segunda' | 'outlet';
export interface OutletUnit {
    id: string;
    code: string;
    condition: OutletCondition;
    name: string;
    category: string;
    base_product_id: string | null;
    reason: string;
    defect: string;
    location: string;
    attributes: Record<string, string>;
    list_price: number | null;
    discount: number | null;
    photos: string[];
    state: 'draft' | 'available' | 'reserved' | 'sold' | 'withdrawn' | 'review';
    take_from_base_stock?: boolean;
    base_stock_transferred?: boolean;
    product_id?: string;
    price_mode?: 'manual' | 'base';
    cost_price?: number | null;
    version: number;
}
export function outletPrice(list: number | null, discount: number | null): number | null {
    if (list === null || discount === null || !Number.isFinite(list) || !Number.isFinite(discount))
        return null;
    return Math.round((list * (100 - discount) / 100 + Number.EPSILON) * 100) / 100;
}
export function validateOutlet(input: Record<string, unknown>) {
    const text = (key: string, max = 2000) => String(input[key] ?? '').trim().slice(0, max);
    const condition = input.condition;
    if (condition !== 'segunda' && condition !== 'outlet')
        throw new Error('Elegí Segunda u Outlet.');
    const number = (key: string) => {
        if (input[key] === '' || input[key] === null || input[key] === undefined)
            return null;
        const value = Number(input[key]);
        if (!Number.isFinite(value))
            throw new Error('Revisá los importes.');
        return value;
    };
    const list_price = number('list_price'), discount = number('discount');
    if (list_price !== null && (list_price < 0 || list_price > 999999999999))
        throw new Error('Revisá el precio de lista.');
    if (discount !== null && (discount <= 0 || discount >= 100 || (condition === 'segunda' && (discount < 5 || discount > 50))))
        throw new Error(condition === 'segunda' ? 'Ingresá un descuento entre 5 % y 50 %.' : 'Ingresá un descuento mayor a 0 % y menor a 100 %.');
    const photos = Array.isArray(input.photos) ? input.photos : [];
    if (photos.length > 20 || photos.some(p => typeof p !== 'string' || !/^[a-f0-9-]{36}\/[a-f0-9-]{36}\.(jpg|png|webp)$/.test(p)))
        throw new Error('Revisá las fotos de la unidad.');
    const state = input.state ?? 'draft';
    if (!['draft', 'available', 'withdrawn', 'review'].includes(String(state)))
        throw new Error('Estado no válido.');
    const attributes: Record<string, string> = {};
    for (const key of ['capacity', 'color', 'dimensions', 'notes']) {
        const value = (input.attributes as Record<string, unknown> | undefined)?.[key];
        if (value !== undefined)
            attributes[key] = String(value).trim().slice(0, 2000);
    }
    const base_product_id = input.base_product_id || null;
    if (base_product_id !== null && (typeof base_product_id !== 'string' || !/^[a-f0-9-]{36}$/.test(base_product_id)))
        throw new Error('Elegí un producto de referencia válido.');
    const cost_price = number('cost_price');
    if (cost_price !== null && cost_price < 0)
        throw new Error('Revisá el costo.');
    const price_mode = input.price_mode === 'base' ? 'base' : 'manual';
    return { take_from_base_stock: input.take_from_base_stock === true, cost_price, price_mode, return_reason: text('return_reason'), code: text('code', 80) || undefined, condition, name: text('name', 200), category: text('category', 120), base_product_id,
        reason: text('reason'), defect: text('defect'), location: text('location', 200), attributes, list_price, discount, photos, state };
}
