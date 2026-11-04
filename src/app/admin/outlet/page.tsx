'use client';
import { useOutletDialog } from '@/lib/useOutletDialog';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import SearchableSelect from '@/components/ui/SearchableSelect';
import AdaptiveSelect from '@/components/ui/AdaptiveSelect';
import Image from 'next/image';
import { ArrowLeft, Plus, Search, X, ImagePlus, Loader2, Package, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { createAuthenticatedRequester } from '@/lib/authenticatedRequest';
import { outletPrice, type OutletUnit } from '@/lib/outlet';
import { formatPrice } from '@/lib/utils';
import { optimizeImageUpload } from '@/lib/optimizeImageUpload';
const request = createAuthenticatedRequester(supabase);
const stateLabel: Record<string, string> = { draft: 'Borrador', available: 'Disponible', reserved: 'Reservado', sold: 'Vendido', withdrawn: 'Retirado', review: 'En revisión' };
type Unit = OutletUnit & {
    return_reason?: string;
    image_urls: string[];
};
type Base = {
    id: string;
    name: string;
    category: string;
    price: number;
};
const empty = (): Unit => ({ id: '', code: '', condition: 'segunda', name: '', category: '', base_product_id: null, reason: '', defect: '', location: '', attributes: {}, list_price: null, discount: null, photos: [], image_urls: [], state: 'draft', version: 1 });
const field = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20';
const button = 'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-50';
export default function OutletPage() {
    const [history, setHistory] = useState<Array<{
        recorded_at: string;
        after_data: Unit;
    }>>([]);
    const [units, setUnits] = useState<Unit[]>([]), [products, setProducts] = useState<Base[]>([]), [draft, setDraft] = useState<Unit | null>(null);
    const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [uploading, setUploading] = useState(false), [error, setError] = useState('');
    const [search, setSearch] = useState(''), [condition, setCondition] = useState(''), [state, setState] = useState('');
    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await request('/api/admin/outlet');
            setUnits(data.units);
            setProducts(data.products);
        }
        catch (e) {
            setError((e as Error).message);
        }
        finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { void load(); }, [load]);
    useEffect(() => {
        if (!draft)
            return;
        const close = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !busy && !uploading)
                setDraft(null);
        };
        window.addEventListener('keydown', close);
        return () => window.removeEventListener('keydown', close);
    }, [draft, busy, uploading]);
    useEffect(() => { setHistory([]); if (draft?.id)
        request('/api/admin/outlet?unit=' + draft.id).then(d => setHistory(d.history || [])).catch(() => { }); }, [draft?.id]);
    useOutletDialog(!!draft, () => { if (!busy && !uploading)
        setDraft(null); });
    const draftList = draft?.price_mode === 'base' ? (products.find(p => p.id === draft.base_product_id)?.price ?? null) : draft?.list_price ?? null;
    const update = (patch: Partial<Unit>) => setDraft(current => current ? { ...current, ...patch } : current);
    async function upload(files: FileList | null) {
        if (!files || !draft)
            return;
        setUploading(true);
        setError('');
        try {
            if (draft.photos.length + files.length > 20)
                throw new Error('Podés cargar hasta 20 fotos.');
            const { data: { user } } = await supabase.auth.getUser();
            if (!user)
                throw new Error('Volvé a ingresar al ERP.');
            for (const file of Array.from(files)) {
                if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
                    throw new Error('Usá fotos JPG, PNG o WebP.');
                const optimized = await optimizeImageUpload(file);
                const extension = optimized.type === 'image/png' ? 'png' : optimized.type === 'image/webp' ? 'webp' : 'jpg';
                const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
                const result = await supabase.storage.from('outlet-images').upload(path, optimized, { contentType: optimized.type });
                if (result.error)
                    throw new Error('No se pudo subir la foto. Volvé a intentar.');
                const signed = await supabase.storage.from('outlet-images').createSignedUrl(path, 3600);
                if (signed.error)
                    throw new Error('No se pudo mostrar la foto.');
                setDraft(current => current ? { ...current, photos: [...current.photos, path], image_urls: [...current.image_urls, signed.data.signedUrl] } : current);
            }
        }
        catch (e) {
            setError((e as Error).message);
        }
        finally {
            setUploading(false);
        }
    }
    async function save(e: React.FormEvent) {
        e.preventDefault();
        if (!draft)
            return;
        setBusy(true);
        setError('');
        try {
            await request('/api/admin/outlet', { method: 'POST', body: JSON.stringify({ ...draft, id: draft.id || undefined }) });
            setDraft(null);
            await load();
        }
        catch (e) {
            setError((e as Error).message);
        }
        finally {
            setBusy(false);
        }
    }
    const filtered = units.filter(u => (!condition || u.condition === condition) && (!state || u.state === state) && `${u.code} ${u.name} ${u.category}`.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es')));
    return <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
  <Link href="/admin/catalogo" className="inline-flex items-center gap-2 text-sm text-slate-500"><ArrowLeft size={16}/>Catálogo</Link>
  <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-black text-slate-900">Segunda y Outlet</h1><button className={`${button} bg-brand-600 text-white`} onClick={() => { setError(''); setDraft(empty()); }}><Plus size={18}/>Nueva unidad</button></header>

  {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
  <div className="flex flex-wrap gap-3"><label className="relative min-w-48 flex-1"><Search size={18} className="absolute left-3 top-3 text-slate-400"/><input aria-label="Buscar unidades" placeholder="Buscar por código o producto" className={`${field} pl-10`} value={search} onChange={e => setSearch(e.target.value)}/></label><select aria-label="Condición" className={`${field} !w-auto`} value={condition} onChange={e => setCondition(e.target.value)}><option value="">Todas las condiciones</option><option value="segunda">Segunda</option><option value="outlet">Outlet</option></select><div className="w-full sm:w-56"><AdaptiveSelect aria-label="Estado" className={`${field} !w-auto`} value={state} onChange={e => setState(e.target.value)}><option value="draft">Borradores</option><option value="withdrawn">Retirados</option><option value="available">Disponibles</option><option value="reserved">Reservados</option><option value="sold">Vendidos</option><option value="review">En revisión</option><option value="">Todos los estados</option></AdaptiveSelect></div></div>
  {loading ? <div className="flex justify-center p-16"><Loader2 className="animate-spin text-brand-600" aria-label="Cargando"/></div> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{filtered.map(u => <button key={u.id} onClick={() => { setError(''); setDraft({ ...u }); }} className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-left transition hover:border-brand-300 hover:shadow-md">
   <div className="flex h-48 items-center justify-center bg-slate-50">{u.image_urls[0] ? <Image unoptimized width={640} height={480} alt={u.name || u.code} src={u.image_urls[0]} className="h-full w-full object-contain"/> : <Package size={40} className="text-slate-300"/>}</div>
   <div className="space-y-2 p-4"><div className="flex justify-between gap-2 text-xs text-slate-500"><span>{u.code}</span><span>{u.condition === 'segunda' ? 'Segunda' : 'Outlet'} · {stateLabel[u.state]}</span></div><h2 className="font-bold text-slate-900">{u.name || 'Sin identificar'}</h2><div className="flex flex-wrap items-baseline gap-2"><strong className="text-xl text-slate-900">{outletPrice(u.list_price, u.discount) === null ? 'Precio pendiente' : formatPrice(outletPrice(u.list_price, u.discount)!)}</strong>{u.discount !== null && <span className="text-sm text-brand-600">−{u.discount}%</span>}</div>{u.list_price !== null && <span className="text-xs text-slate-400">Lista {formatPrice(u.list_price)}</span>}</div>
  </button>)}</div>}
  {!loading && !filtered.length && <div className="rounded-2xl border border-dashed border-slate-200 p-12 text-center text-slate-500">{units.length ? 'No hay unidades con esos filtros.' : 'Cargá la primera unidad para comenzar.'}</div>}
  {draft && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-2 md:p-6"><form onSubmit={save} data-outlet-dialog role="dialog" aria-modal="true" aria-labelledby="outlet-title" className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
   <header className="flex items-center justify-between border-b border-slate-100 p-5"><h2 id="outlet-title" className="text-lg font-bold">{draft.id ? draft.code : 'Nueva unidad'}</h2><button type="button" aria-label="Cerrar" disabled={busy || uploading} onClick={() => setDraft(null)}><X size={22}/></button></header>
   <div className="space-y-6 overflow-y-auto p-5"><fieldset disabled={busy || uploading || ['reserved', 'sold'].includes(draft.state)} className="min-w-0 space-y-6">{error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <section className="grid gap-4 sm:grid-cols-2"><label className="space-y-1 text-sm">Condición<select autoFocus className={field} value={draft.condition} onChange={e => update({ condition: e.target.value as Unit['condition'] })}><option value="segunda">Segunda</option><option value="outlet">Outlet</option></select></label><label className="space-y-1 text-sm">Código<input className={field} value={draft.code} placeholder="Automático al guardar" onChange={e => update({ code: e.target.value })}/></label>
    <div className="sm:col-span-2"><SearchableSelect label="Producto de referencia" value={draft.base_product_id||''} placeholder="Buscar modelo…" clearOnSearch={false} options={[{value:'',label:'Pendiente de vincular'},...products.filter(p=>p.price>0&&!/descuento|bonificaci/i.test(p.name)).map(p=>({value:p.id,label:p.name}))]} onChange={value=>{const p=products.find(p=>p.id===value);update({base_product_id:p?.id||null,...(p?{name:p.name,category:p.category,list_price:p.price}:{})});}}/></div>
    {(['name', 'category', 'location'] as const).map(key => <label key={key} className="space-y-1 text-sm">{{ name: 'Nombre', category: 'Categoría', location: 'Ubicación' }[key]}<input className={field} value={draft[key]} onChange={e => update({ [key]: e.target.value })}/></label>)}
    <label className="space-y-1 text-sm">Estado<select className={field} value={draft.state} onChange={e => update({ state: e.target.value as Unit['state'] })}><option value="draft">Borrador</option><option value="withdrawn">Retirado</option><option value="available">Disponible</option><option value="review">En revisión</option>{['reserved', 'sold'].includes(draft.state) && <option value={draft.state}>{stateLabel[draft.state]}</option>}</select></label></section>
    <section className="space-y-3"><h3 className="font-bold text-slate-800">Fotos y condición</h3><div className="flex flex-wrap gap-3">{draft.image_urls.map((url, i) => <div key={draft.photos[i]} className="relative"><a href={url} target="_blank" rel="noreferrer"><Image unoptimized width={96} height={96} src={url} alt={`Foto ${i + 1}`} className="h-24 w-24 rounded-xl border border-slate-200 object-contain"/></a><button type="button" aria-label={`Quitar foto ${i + 1}`} disabled={uploading} className="absolute right-0 top-0 rounded-full bg-white p-1 text-red-600" onClick={() => update({ photos: draft.photos.filter((_, n) => n !== i), image_urls: draft.image_urls.filter((_, n) => n !== i) })}><Trash2 size={14}/></button>{i > 0 && <button type="button" className="block text-xs text-brand-600" onClick={() => update({ photos: [draft.photos[i], ...draft.photos.filter((_, n) => n !== i)], image_urls: [draft.image_urls[i], ...draft.image_urls.filter((_, n) => n !== i)] })}>Usar de portada</button>}{i === 0 && <span className="text-xs text-slate-500">Portada</span>}</div>)}<label className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 text-xs text-slate-500">{uploading ? <Loader2 className="animate-spin"/> : <ImagePlus />}Agregar fotos<input type="file" multiple accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={uploading} onChange={e => { void upload(e.target.files); e.target.value = ''; }}/></label></div>
    <label className="block space-y-1 text-sm">Costo (opcional)<input type="number" min="0" step="0.01" className={field} value={draft.cost_price ?? ''} onChange={e => update({ cost_price: e.target.value === '' ? null : Number(e.target.value) })}/></label><label className="block space-y-1 text-sm">Motivo<input className={field} placeholder={draft.condition === 'outlet' ? 'Exhibición, embalaje dañado…' : 'Motivo de segunda'} value={draft.reason} onChange={e => update({ reason: e.target.value })}/></label><label className="block space-y-1 text-sm">Falla u observaciones<textarea rows={3} className={field} value={draft.defect} onChange={e => update({ defect: e.target.value })}/></label>
    {draft.base_product_id && !draft.product_id && <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={!!draft.take_from_base_stock} onChange={e => update({ take_from_base_stock: e.target.checked })}/>Reclasificar una unidad del stock del producto base</label>}<details className="text-sm"><summary className="cursor-pointer text-slate-500">Características y notas</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">{(['capacity', 'color', 'dimensions', 'notes'] as const).map(key => <label key={key}>{{ capacity: 'Capacidad (L)', color: 'Color', dimensions: 'Dimensiones', notes: 'Notas' }[key]}<input className={field} value={draft.attributes[key] || ''} onChange={e => update({ attributes: { ...draft.attributes, [key]: e.target.value } })}/></label>)}</div></details></section>
    <section className="grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-3"><label className="text-sm sm:col-span-3">Referencia de precio<select className={field} value={draft.price_mode || 'manual'} onChange={e => update({ price_mode: e.target.value as 'base' | 'manual' })}><option value="manual">Lista manual</option><option value="base" disabled={!draft.base_product_id}>Seguir lista del producto base</option></select></label><label className="text-sm">Precio de lista<input type="number" min="0" step="0.01" className={field} disabled={draft.price_mode === 'base'} value={draft.price_mode === 'base' ? (products.find(p => p.id === draft.base_product_id)?.price ?? '') : draft.list_price ?? ''} onChange={e => update({ list_price: e.target.value === '' ? null : Number(e.target.value) })}/></label><label className="text-sm">Descuento (%)<input type="number" min={draft.condition === 'segunda' ? 5 : 0.01} max={draft.condition === 'segunda' ? 50 : 99.99} step="0.01" className={field} value={draft.discount ?? ''} onChange={e => update({ discount: e.target.value === '' ? null : Number(e.target.value) })}/></label><div><p className="text-sm text-slate-500">Precio final</p><p className="mt-2 text-xl font-bold">{outletPrice(draftList, draft.discount) === null ? '—' : formatPrice(outletPrice(draftList, draft.discount)!)}</p></div></section>
   {units.find(u => u.id === draft.id)?.state === 'review' && draft.state === 'available' && <label className="block text-sm">Revisión física<textarea required className={field} value={draft.return_reason || ''} onChange={e => update({ return_reason: e.target.value })} placeholder="Estado verificado y motivo de republicación"/></label>}
   </fieldset><details className="text-sm text-slate-500"><summary className="cursor-pointer">Historial</summary>{history.map((h, i) => <p key={i} className="mt-2">{new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(h.recorded_at))} · {stateLabel[h.after_data.state]}</p>)}</details></div><footer className="flex justify-end gap-2 border-t border-slate-100 p-4"><button type="button" className={`${button} text-slate-500`} disabled={busy || uploading} onClick={() => setDraft(null)}>Cancelar</button><button type="submit" disabled={busy || uploading || ['reserved', 'sold'].includes(draft.state)} className={`${button} bg-brand-600 text-white`}>{busy ? <Loader2 size={16} className="animate-spin"/> : null}{draft.state === 'available' ? 'Publicar' : draft.state === 'withdrawn' ? 'Retirar' : 'Guardar'}</button></footer>
  </form></div>}
 </div>;
}
