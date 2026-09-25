"use client";

import { useMemo } from 'react';
import { Plus } from 'lucide-react';
import { Product } from '@/types';
import { VisualCatalogConfig, VisualFamily } from '@/lib/visualSelectorConfig';

interface Props {
  config: VisualCatalogConfig | null;
  products: Product[];
  onAddProduct: (product: Product) => void;
  family?: VisualFamily;
}

export default function VisualSelectorQuickProducts({ config, products, onAddProduct, family }: Props) {
  const productById = useMemo(() => new Map(products.map(product => [product.id, product])), [products]);
  const visible = (ids: string[]) => ids
    .map(id => productById.get(id))
    .filter((product): product is Product => Boolean(product && product.is_active !== false && product.category !== 'Interno'));
  const directProducts = visible(family ? (family.directProductIds || []) : (config?.directProductIds || []));

  const section = (title: string, entries: Product[]) => entries.length > 0 && (
    <section className="space-y-2" aria-label={title}>
      <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide">{title}</h4>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {entries.map(product => (
          <button
            key={product.id}
            type="button"
            onClick={() => onAddProduct(product)}
            className="min-w-0 rounded-xl border border-slate-200 bg-white p-2.5 text-center hover:border-brand-500 hover:shadow-md transition-all group cursor-pointer"
            title={`Agregar ${product.name}`}
          >
            <div className="h-20 rounded-lg bg-slate-50 p-1.5 flex items-center justify-center overflow-hidden">
              {(config?.directProductImages?.[product.id] || product.image_url) ? <img src={config?.directProductImages?.[product.id] || product.image_url} alt="" className="max-w-full max-h-full object-contain" /> : <Plus className="w-6 h-6 text-slate-300" />}
            </div>
            <p className="mt-2 text-[11px] font-extrabold text-slate-800 line-clamp-2 min-h-[2rem]">{product.name}</p>
            <span className="mt-1 inline-flex items-center gap-1 text-[9px] font-black uppercase text-brand-600">Agregar <Plus className="w-3 h-3" /></span>
          </button>
        ))}
      </div>
    </section>
  );

  return <div>{section(family ? `Productos de ${family.name}` : 'Accesos directos', directProducts)}</div>;
}
