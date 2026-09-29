"use client";

import { useEffect, useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { Product } from '@/types';
import { supabase } from '@/lib/supabase';
import { formatPrice, normalizeText } from '@/lib/utils';

interface Props {
  products?: Product[];
  onAddProduct: (product: Product) => void;
}

export default function RetailProductPicker({ products: suppliedProducts, onAddProduct }: Props) {
  const [loadedProducts, setLoadedProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(!suppliedProducts);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (suppliedProducts) return;
    let cancelled = false;
    async function loadProducts() {
      setLoading(true);
      setError('');
      try {
        const products: Product[] = [];
        // Paginate so products beyond Supabase's default row limit are available.
        for (let offset = 0; ; offset += 1000) {
          const { data, error } = await supabase.from('products').select('*')
            .eq('is_active', true).order('name').order('id').range(offset, offset + 999);
          if (error) throw error;
          if (cancelled) return;
          products.push(...(data || []));
          if (!data || data.length < 1000) break;
        }
        setLoadedProducts(products);
      } catch {
        if (!cancelled) setError('No se pudieron cargar los productos minoristas.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadProducts();
    return () => { cancelled = true; };
  }, [suppliedProducts, reload]);

  const results = useMemo(() => {
    const tokens = normalizeText(query).trim().split(/\s+/).filter(Boolean);
    return (suppliedProducts || loadedProducts).filter(product => product.is_active !== false
      && tokens.every(token => normalizeText(`${product.name} ${product.sku || ''} ${product.category}`).includes(token)));
  }, [suppliedProducts, loadedProducts, query]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 border-b border-slate-100 bg-slate-50 p-3.5">
        <p className="text-xs text-slate-600">Se agregan con precio minorista. Podés ajustar el precio en el detalle; la lista mayorista no se modifica.</p>
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input aria-label="Buscar productos minoristas" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar por nombre, código o categoría" className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs outline-none focus:border-brand-500" />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3.5">
        {loading ? <p className="text-xs text-slate-500">Cargando productos minoristas...</p> : error ? (
          <div role="alert" className="text-xs text-red-700">{error} <button type="button" onClick={() => setReload(value => value + 1)} className="font-bold underline">Reintentar</button></div>
        ) : results.length === 0 ? <p className="text-xs text-slate-500">No se encontraron productos minoristas.</p> : (
          <div className="divide-y divide-slate-100">
            {results.map(product => {
              const unavailable = product.is_discontinued && Number(product.stock_current || 0) <= 0;
              return (
                <div key={product.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-800">{product.name}</p>
                    <p className="text-[11px] text-slate-500">{product.sku} · {product.category}</p>
                    <p className="text-xs font-bold text-slate-700">{formatPrice(product.price)}{unavailable ? ' · Descontinuado sin stock' : ''}</p>
                  </div>
                  <button type="button" disabled={unavailable} aria-label={`Agregar ${product.name}`} onClick={() => onAddProduct(product)} className="flex shrink-0 items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-40"><Plus className="h-3.5 w-3.5" /> Agregar</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
