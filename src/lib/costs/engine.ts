import { Article, CostLine, Definition, Product, Purchase, Result, Setting, purchaseIdentity, comparePriceEvidence, latestSetting, normalize } from './model';

export function calculate(def: Definition, purchases: Purchase[], product: Product, asOf: string, settings: Setting[], period = asOf.slice(0,7)): Result {
  const s = latestSetting(settings,product.code,asOf); const global = latestSetting(settings,'GLOBAL',asOf);
  const origin = s?.origin || product.origin; const warnings = new Set<string>();
  const articles = new Map(def.articles.map(a=>[a.code,a])); const recipes = new Map(def.recipes.map(r=>[r.code,r]));
  const available = purchases.filter(p=>p.date <= asOf);
  const byCode = new Map<string,Purchase[]>(); for (const p of available) { const list=byCode.get(p.code)||[]; list.push(p); byCode.set(p.code,list); }
  // Explicitly equivalent catalog names share price evidence without duplicating purchase events.
  const priceGroups=new Map<string,Article[]>();
  for(const a of def.articles){const identity=[purchaseIdentity(a.sku||a.name),a.unit,a.factor].join('|');const group=priceGroups.get(identity)||[];group.push(a);priceGroups.set(identity,group);}
  for(const group of priceGroups.values())if(group.length>1){const codes=new Set(group.map(a=>a.code));const evidence=available.filter(p=>codes.has(p.code));for(const a of group)byCode.set(a.code,evidence);}
  for (const list of byCode.values()) list.sort(comparePriceEvidence);
  const lines: CostLine[] = [];
  function price(a: Article | undefined, code: string, name: string): CostLine {
    const p = byCode.get(code)?.[0];
    if (p) { const age=Math.floor((Date.parse(asOf)-Date.parse(p.date))/86400000); if (age > (global?.staleDays ?? 90)) warnings.add(`${name}: ${p.kind==='Lista'?'lista':'compra'} de hace ${age} días`); return {name,code,quantity:1,unit:a?.unit||p.unit,cost:p.cost,subtotal:p.cost,date:p.date,vendor:p.vendor,source:p.source}; }
    if (a?.fallback != null && a.fallback > 0) { warnings.add(`${name}: precio de referencia sin fecha`); return {name,code,quantity:1,unit:a.unit,cost:a.fallback,subtotal:a.fallback,date:null,vendor:null,source:'Referencia sin fecha'}; }
    warnings.add(`${name}: falta precio de compra`); return {name,code,quantity:1,unit:a?.unit||'unidad',cost:null,subtotal:null,date:null,vendor:null,source:'Sin precio'};
  }
  const active = new Set<string>();
  function component(code: string, name: string, quantity: number, unit: string, destination: CostLine[]): number | null {
    if (active.has(code)) { warnings.add(`Ciclo en receta: ${name}`); return null; }
    const article=articles.get(code); const recipe=recipes.get(code);
    const body = /tacho.*(1000|3000)l/.test(normalize(name));
    const bodyProduct = def.products.find(p=>p.code===code || normalize(p.name)===normalize(name));
    const bodyOrigin = bodyProduct && (latestSetting(settings,bodyProduct.code,asOf)?.origin || bodyProduct.origin);
    if (recipe && !(body && bodyOrigin !== 'Fabricación')) {
      active.add(code); let sum=0; let missing=false;
      for (const c of recipe.components) { const v=component(c.code,c.name,quantity*c.quantity,c.unit,destination); if (v==null) missing=true; else sum+=v; }
      active.delete(code); return missing ? null : sum;
    }
    const line=price(article,code,name); line.quantity=quantity; line.unit=unit; line.subtotal=line.cost==null?null:line.cost*quantity; destination.push(line); return line.subtotal;
  }
  let manufacture: number | null = null;
  const recipe = product.recipe || recipes.get(product.code);
  if (recipe) {
    let sum=0; let missing=false;
    const includedCap=recipe.components.some(c=>/tachocamarabio(1000|3000)l/.test(normalize(c.name)) && (latestSetting(settings,c.code,asOf)?.origin || def.products.find(p=>p.code===c.code)?.origin || 'Compra')==='Compra');
    const useKit = product.termination==='Kit comprado'; let kitApplied=false;
    for (const c of recipe.components) {
      const n=normalize(c.name);
      if (includedCap && /^(tapaclickconaro|taparoscasinaro|aroconrosca)$/.test(n)) continue;
      if (useKit && /^(tapaclickconaro|taparoscasinaro|aroconrosca|brida|descompresor(deaire)?)$/.test(n)) {
        if (kitApplied) continue; kitApplied=true;
        const kit=def.articles.find(a=>normalize(a.name)==='tapabridaydescompresor');
        const v=component(kit?.code||'MISSING_KIT','Tapa, Brida y Descompresor',1,'unidad',lines); if(v==null)missing=true;else sum+=v; continue;
      }
      const v=component(c.code,c.name,c.quantity,c.unit,lines); if(v==null)missing=true;else sum+=v;
    }
    manufacture=missing?null:sum*1.05;
  }
  const manufactureWarnings=[...warnings]; warnings.clear();
  const buyArticle=def.articles.find(a=>normalize(a.name)===normalize(product.purchaseName)) || articles.get(product.code);
  const buyLine=price(buyArticle,buyArticle?.code||product.code,product.purchaseName||product.name);
  let purchase=buyLine.cost;
  const buyLines=[buyLine];
  if(recipe && product.purchaseName) {
    for(const c of recipe.components.filter(c=>/etiqueta/.test(normalize(c.name)) && !/sinmarca/.test(normalize(c.name)))) { const v=component(c.code,c.name,c.quantity,c.unit,buyLines); purchase=purchase==null||v==null?null:purchase+v; }
  }
  if(product.brandLabel && !buyLines.some(l=>/^etiqueta(aqua|bio)fort/.test(normalize(l.name)))) {const label=def.articles.find(a=>normalize(a.name)===normalize(product.brandLabel));const v=component(label?.code||'MISSING_LABEL',product.brandLabel,1,'unidad',buyLines);purchase=purchase==null||v==null?null:purchase+v;}
  // Warnings from the unused alternative must not make a valid selected route incomplete.
  const selectedLines=origin==='Compra'?buyLines:lines;
  if(origin!=='Compra'){warnings.clear();manufactureWarnings.forEach(w=>warnings.add(w));}
  const selectedMissing=selectedLines.some(l=>l.cost==null);
  const material=origin==='Compra'?purchase:origin==='Fabricación'||origin==='Ensamblado'?manufacture:null;
  const operationDetail: Record<string,number|null> = origin==='Compra' ? {flete:s?.freight ?? 0,embalaje:s?.packaging ?? 0} : {manoDeObra:s?.labor ?? null,gas:s?.gas ?? null,electricidad:s?.electricity ?? null,estructura:s?.overhead ?? null,flete:s?.freight ?? 0,embalaje:s?.packaging ?? 0};
  const operations=Object.values(operationDetail).reduce<number>((sum,n)=>sum+(n||0),0);
  const missingOps=Object.values(operationDetail).some(n=>n==null);
  if(missingOps && material!=null) warnings.add('Falta definir gastos de operación; el total está incompleto');
  if(asOf<def.captured && recipe) warnings.add('Receta actual aplicada a fecha anterior: estimación');
  const total=material==null?null:material+operations;
  const margin=total!=null && product.price>0?(product.price-total)/product.price*100:null;
  const monthPurchases=(byCode.get(buyArticle?.code||product.code)||[]).filter(p=>p.kind!=='Lista'&&p.date.startsWith(period));
  const quantity=monthPurchases.reduce((sum,p)=>sum+p.quantity,0);
  return {code:product.code,id:product.id,equivalentIds:product.equivalentIds,name:product.name,family:product.family,capacity:product.capacity,origin,date:asOf,material,purchase,manufacture,total,operations,operationDetail,operationBasis:s?.basis||'Pendiente',coverage:origin==='No usar'?'No usar':origin==='Por confirmar'?'Origen pendiente':material==null||selectedMissing?'Falta precio':missingOps?'Parcial':'Completo',warnings:[...warnings],lines:selectedLines,price:product.price,margin,suggested:total==null||missingOps?null:total/(1-(s?.margin??30)/100),weightedPurchase:quantity>0?monthPurchases.reduce((sum,p)=>sum+p.cost*p.quantity,0)/quantity:null,purchasedQuantity:quantity,recipeEstimated:asOf<def.captured&&!!recipe};
}

export function monthsUntil(asOf:string):string[] { const start=asOf.slice(0,4)+'-01'; const months=[]; for(let month=1;month<=Number(asOf.slice(5,7));month++){const prefix=start.slice(0,4)+'-'+String(month).padStart(2,'0'); const end=new Date(Date.UTC(Number(prefix.slice(0,4)),month,0)).toISOString().slice(0,10);months.push(end>asOf?asOf:end);}return months; }
export function changed(before:number|null,after:number|null,percent:number,minimum:number):boolean {return before!=null&&after!=null&&before>0&&Math.abs(after-before)>=minimum&&Math.abs(after/before-1)*100>=percent;}
