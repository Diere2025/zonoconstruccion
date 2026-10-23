import type { VisualItemOption } from '@/lib/visualSelectorConfig';
import { formatPrice } from '@/lib/utils';

export function BioComboTitle({ label }: { label: string }) {
  const installationCapacity = /kit.*instalaci/i.test(label) ? label.match(/(\d+)\s*L\b/i)?.[1] : undefined;
  const [capacity, model] = installationCapacity
    ? [`${installationCapacity}L`, /autolimp/i.test(label) ? 'Autolimpiable · Con instalación' : 'Convencional · Con instalación']
    : /adicional.*instalaci/i.test(label) ? ['Adicionales', 'Instalación BioFort'] : label.split(' · ');
  return (
    <div className="mb-2 space-y-1">
      <h6 className={`${capacity === 'Adicionales' ? 'text-xl' : 'text-3xl'} font-black tracking-tight leading-none text-slate-900`}>{capacity}</h6>
      <p className="text-xs font-semibold leading-snug text-slate-600">{model}</p>
    </div>
  );
}

export function BioComboExtras({ items, onAdd }: { items?: VisualItemOption[]; onAdd: (item: VisualItemOption) => void }) {
  if (!items?.length) return null;
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
      {items.filter(item => item.isActive).map(item => {
        const component = item.comboItems?.[0];
        return (
          <div key={item.id} className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Completá tu combo · 15% OFF</p>
              <p className="mt-1 text-xs font-bold text-slate-800">{item.label}</p>
            </div>
            <button type="button" onClick={() => onAdd(item)} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-emerald-700">
              <span>+ Agregar cámara</span>
              {component?.customPrice !== undefined && <span>{formatPrice(component.customPrice)}</span>}
            </button>
          </div>
        );
      })}
    </div>
  );
}
