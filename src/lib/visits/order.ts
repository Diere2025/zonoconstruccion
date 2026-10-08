import { generateDefaultVisualConfig, includeInstallationKitCuplas, type VisualCatalogConfig } from '@/lib/visualSelectorConfig';
import type { Product } from '@/types';
import type { QuoteLine } from './model';

export type KitComponents = Record<string,{product_id:string;quantity:number}[]>;
export function visitKitComponents(products:Product[],configured:VisualCatalogConfig|null):KitComponents {
  const fallback=generateDefaultVisualConfig(products.map(p=>/^kit instalaci[oó]n/i.test(p.name)?{...p,is_active:true}:p));
  const generated=fallback.families.flatMap(f=>f.subgroups).find(s=>s.id==='kits_instalacion')?.items || [];
  const tree=configured?includeInstallationKitCuplas(configured,products):fallback;
  const saved=tree.families.flatMap(f=>f.subgroups).find(s=>s.id==='kits_instalacion')?.items || [];
  const result:KitComponents={};
  for(const item of [...generated,...saved]){
    const parent=item.comboItems?.[0]?.productId;
    if(!parent || !item.isCombo || !item.comboItems || item.comboItems.length<2)continue;
    result[parent]=item.comboItems.slice(1).map(c=>({product_id:c.productId,quantity:c.quantity}));
  }
  return result;
}

export function expandVisitOrderLines<T extends {id:string;name:string}>(lines:QuoteLine[],mapping:string[],products:T[],components:KitComponents) {
  return lines.flatMap((line,index)=>{
    const product=products.find(p=>p.id===mapping[index]);
    if(!product)throw new Error('Seleccioná un producto para cada concepto.');
    const parent={...product,quantity:line.quantity,customPrice:line.unit_price,discountType:'percentage' as const,discountValue:0};
    if(!/^kit instalaci[oó]n/i.test(product.name))return [parent];
    if(!components[product.id]?.length)throw new Error(`Falta configurar los componentes de ${product.name}.`);
    return [parent,...components[product.id].map(component=>{
      const child=products.find(p=>p.id===component.product_id);
      if(!child || !Number.isFinite(component.quantity) || component.quantity<=0)throw new Error(`Revisá los componentes configurados de ${product.name}.`);
      return {...child,quantity:component.quantity*line.quantity,customPrice:0,basePrice:0,discountType:'percentage' as const,discountValue:0,bundleParentId:product.id,isIncludedInKit:true,baseQuantity:component.quantity};
    })];
  });
}
