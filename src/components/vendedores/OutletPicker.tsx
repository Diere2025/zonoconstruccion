'use client';
import { useOutletDialog } from '@/lib/useOutletDialog';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { X, Search, Package, Loader2, Download } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { createAuthenticatedRequester } from '@/lib/authenticatedRequest';
import { formatPrice } from '@/lib/utils';
import type { Product } from '@/types';
import type { OutletUnit } from '@/lib/outlet';
const request = createAuthenticatedRequester(supabase);
type Unit = OutletUnit & {
    product_id: string;
    final_price: number;
    image_urls: string[];
};
export default function OutletPicker({ orderId, onAdd, onClose }: {
    orderId?: string | null;
    onAdd: (p: Product[]) => void;
    onClose: () => void;
}) {
    const [units, setUnits] = useState<Unit[]>([]), [search, setSearch] = useState(''), [error, setError] = useState(''), [loading, setLoading] = useState(true), [selected, setSelected] = useState<Unit | null>(null);
    useEffect(() => { let active = true; request('/api/vendedores/outlet' + (orderId ? '?order=' + orderId : '')).then(d => { if (active)
        setUnits(d.units); }).catch(e => { if (active)
        setError(e.message); }).finally(() => { if (active)
        setLoading(false); }); return () => { active = false; }; }, [orderId]);
    const [exporting, setExporting] = useState(false);
    const exportCatalog = async () => {
        setExporting(true); setError('');
        try {
            // Always refresh all available units, independently of search or the order being edited.
            const data = await request('/api/vendedores/outlet');
            const { downloadOutletCatalogPdf } = await import('@/lib/outletCatalogPdf');
            await downloadOutletCatalogPdf(data.units);
        } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo generar el catálogo.'); }
        finally { setExporting(false); }
    };
    useOutletDialog(true, onClose);
    return <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/40 p-3"><div data-outlet-dialog role="dialog" aria-modal="true" aria-label="Segunda y Outlet" className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-xl"><header className="flex flex-wrap items-center justify-between gap-3 p-5"><h2 className="text-lg font-bold">Segunda y Outlet</h2><div className="flex items-center gap-2"><button type="button" disabled={exporting || loading} onClick={()=>void exportCatalog()} className="inline-flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-xs font-bold text-brand-700 disabled:opacity-50">{exporting ? <Loader2 size={16} className="animate-spin"/> : <Download size={16}/>}<span>{exporting ? 'Generando…' : 'Catálogo PDF'}</span></button><button type="button" aria-label="Cerrar" onClick={onClose}><X /></button></div></header><div className="overflow-y-auto px-5 pb-5">
 {error && <p role="alert" className="mb-3 text-sm text-red-600">{error}</p>}
 {selected ? <div className="space-y-4"><button type="button" onClick={() => setSelected(null)} className="text-sm text-brand-600">← Volver al catálogo</button><div className="grid gap-3 sm:grid-cols-2">{selected.image_urls.map((url, i) => <a key={url} href={url} target="_blank" rel="noreferrer"><Image unoptimized width={640} height={480} src={url} alt={`${selected.code}, foto ${i + 1}`} className="h-56 w-full rounded-xl border border-slate-100 object-contain"/></a>)}</div><h3 className="text-xl font-bold">{selected.name} · {selected.code}</h3><p className="whitespace-pre-wrap text-sm text-slate-700">{selected.reason}{selected.defect ? '\n' + selected.defect : ''}</p><div className="flex flex-wrap items-center justify-between gap-3"><strong className="text-2xl">{formatPrice(selected.final_price)}</strong><button type="button" className="rounded-xl bg-brand-600 px-4 py-3 font-bold text-white" onClick={() => { onAdd([{ id: selected.product_id, name: `${selected.name} · ${selected.condition === 'segunda' ? 'Segunda' : 'Outlet'} [${selected.code}] · ${selected.defect || selected.reason}`, sku: selected.code, description: selected.defect || selected.reason, category: selected.category, price: selected.final_price, image_url: selected.image_urls[0] || '', is_outlet_unit: true, cost_price: selected.cost_price ?? undefined }]); onClose(); }}>Agregar al pedido</button></div></div> : <>
 <label className="mb-4 flex items-center gap-2 rounded-xl border border-slate-200 px-3"><Search size={18} className="text-slate-400"/><input autoFocus aria-label="Buscar unidad" className="w-full py-3 text-sm outline-none" placeholder="Código o producto" value={search} onChange={e => setSearch(e.target.value)}/></label>
 {loading ? <Loader2 className="mx-auto my-12 animate-spin"/> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{units.filter(u => `${u.code} ${u.name}`.toLowerCase().includes(search.toLowerCase())).map(u => <button type="button" key={u.id} onClick={() => setSelected(u)} className="overflow-hidden rounded-xl border border-slate-200 text-left hover:border-brand-400"><div className="flex h-36 items-center justify-center bg-slate-50">{u.image_urls[0] ? <Image unoptimized width={400} height={300} src={u.image_urls[0]} alt={u.name} className="h-full w-full object-contain"/> : <Package className="text-slate-300"/>}</div><div className="space-y-1 p-3"><p className="text-xs text-slate-500">{u.code} · {u.condition === 'segunda' ? 'Segunda' : 'Outlet'}</p><h3 className="font-bold">{u.name}</h3><p className="font-bold">{formatPrice(u.final_price)}</p></div></button>)}</div>}
 {!loading && !units.length && !error && <p className="py-10 text-center text-sm text-slate-500">No hay unidades disponibles.</p>}
 </>}
 </div></div></div>;
}
