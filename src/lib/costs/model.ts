export type Origin = 'Compra' | 'Fabricación' | 'Ensamblado' | 'No usar' | 'Por confirmar';
export interface Purchase { key: string; source: string; row: number; receipt: string; name: string; code: string; date: string; vendor: string; quantity: number; unit: string; cost: number; kind?: 'Lista'; vat?: number; observed?: string }
export interface Component { code: string; name: string; quantity: number; unit: string }
export interface Recipe { code: string; name: string; components: Component[] }
export interface Article { code: string; name: string; sku?:string; aliases: string[]; unit: string; fallback: number | null; factor: number }
export interface Product { code: string; id: string | null; equivalentIds?: string[]; name: string; family: string; capacity: number; origin: Origin; purchaseName: string; termination: string; brandLabel?: string; price: number; reference: number | null; recipe?: Recipe }
export interface Setting { code: string; effective: string; excluded?: boolean; origin?: Origin; labor?: number; gas?: number; electricity?: number; overhead?: number; freight?: number; packaging?: number; margin?: number; basis?: 'Medido' | 'Asignado' | 'Estimado'; inputThreshold?: number; productThreshold?: number; minimumImpact?: number; staleDays?: number }
export interface Definition { articles: Article[]; products: Product[]; recipes: Recipe[]; captured: string }
export function comparePriceEvidence(a:Purchase,b:Purchase):number {return b.date.localeCompare(a.date)||(b.observed||'').localeCompare(a.observed||'')||b.key.localeCompare(a.key);}
export interface CostLine { name: string; code: string; quantity: number; unit: string; cost: number | null; subtotal: number | null; date: string | null; vendor: string | null; source: string; warning?: string }
export interface Result { code: string; id: string | null; equivalentIds?: string[]; name: string; family: string; capacity: number; origin: Origin; date: string; material: number | null; purchase: number | null; manufacture: number | null; total: number | null; operations: number; operationDetail: Record<string, number | null>; operationBasis: string; coverage: string; warnings: string[]; lines: CostLine[]; price: number; margin: number | null; suggested: number | null; weightedPurchase: number | null; purchasedQuantity: number; recipeEstimated: boolean }

export function normalize(value: unknown): string { return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\(ciego\)/g, '').replace(/[^a-z0-9]/g, ''); }
/** Reviewed purchase names only; similar products with other sizes or models remain separate. */
export const purchaseNameGroups = [
  ['Válvula de Flotante Eco 1/2" Varilla Plástica','Flotante Eco Varilla Plástica 1/2"'],
  ['Base de Hierro Reforzada para Tanque (74 cm)','Base Hierro Reforzada 74 cms'],
  ['Bomba Periférica de Agua 1/2 HP - Konan KBP12','Konan - Bomba Periferica 1/2 HP (KBP12)'],
  ['Rodillo Simil Lana 22cm x 40mm - Tornado','Rodillo Simil Lana 22x40'],
  ['Biolam - Concentrado Enzimático para Biodigestores (500g)','Biolam - Concentrado Enzimático 500g'],
];
const purchaseIdentities=new Map(purchaseNameGroups.flatMap(group=>group.map(name=>[normalize(name),normalize(group[0])] as const)));
export function purchaseIdentity(value:unknown):string {const n=normalize(value);return purchaseIdentities.get(n)||n;}
export function identifyingSku(value:unknown):string|null {
  const sku=String(value||'').trim();return sku&&!/^AUTO[-_]/i.test(sku)&&!/_OLD$/i.test(sku)?sku:null;
}
export function resolvePurchaseArticle(articles:Article[],name:string):Article|undefined {
  const n=normalize(name),matches=articles.filter(a=>a.aliases.some(alias=>normalize(alias)===n));
  if(matches.length===1)return matches[0];
  const exact=matches.filter(a=>normalize(a.name)===n);if(exact.length===1)return exact[0];
  if(matches.length&&matches.every(a=>purchaseIdentity(a.sku||a.name)===purchaseIdentity(matches[0].sku||matches[0].name)&&a.unit===matches[0].unit&&a.factor===matches[0].factor))return [...matches].sort((a,b)=>a.code.localeCompare(b.code))[0];
  return undefined;
}
/** Explicit catalog aliases only: preserve brand, capacity and pipe diameter. */
export function catalogIdentity(value: unknown): string {
  const n=normalize(value);
  if(n==='valvuladeflotanteeco12varillaplastica'||n==='flotanteecovarillaplastica12')return 'flotanteecovarillaplastica12';
  const desengrasadora=n.match(/^camaradesengrasadora(?:paracocina)?(70|300|500|600|750|1000)litros(?:canos(50|110)mm)?biofort$/);
  if(desengrasadora){const capacity=desengrasadora[1],diameter=desengrasadora[2];if(capacity==='70'&&!diameter)return n;return `biofortdesengrasadora${capacity}l${diameter?'c'+diameter:''}`;}
  const cisterna=n.match(/^cisternadeagua(slim)?(300|500|600|750|1000|3000)litros(slim)?aquafort$/);
  return cisterna?`aquafortcisterna${cisterna[1]||cisterna[3]?'slim':''}${cisterna[2]}l`:n;
}
export function number(value: unknown): number { if (typeof value === 'number') return Number.isFinite(value) ? value : NaN; let s = String(value ?? '').trim().replace(/[$%\s]/g, ''); if (!s) return NaN; if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); return Number(s); }
export function date(value: unknown): string | null {
  if (typeof value === 'number') { if (value < 30000 || value > 80000) return null; return new Date(Date.UTC(1899,11,30) + Math.floor(value)*86400000).toISOString().slice(0,10); }
  const s = String(value ?? '').trim(); let parts: number[];
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) parts = s.slice(0,10).split('-').map(Number);
  else { const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/); if (!m) return null; parts = [Number(m[3]) < 100 ? 2000+Number(m[3]) : Number(m[3]),Number(m[2]),Number(m[1])]; }
  const d = new Date(Date.UTC(parts[0],parts[1]-1,parts[2])); return d.getUTCFullYear() === parts[0] && d.getUTCMonth() === parts[1]-1 && d.getUTCDate() === parts[2] ? d.toISOString().slice(0,10) : null;
}
export function today(): string { return new Intl.DateTimeFormat('en-CA', {timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); }
export function latestSetting(settings: Setting[], code: string, asOf: string): Setting | undefined { return settings.filter(s => s.code === code && s.effective <= asOf).sort((a,b)=>b.effective.localeCompare(a.effective))[0]; }
export function validateSetting(input: unknown): Setting {
  const s = input as Setting; const origins: Origin[] = ['Compra','Fabricación','Ensamblado','No usar','Por confirmar'];
  if (!s || typeof s.code !== 'string' || s.code.length > 100 || date(s.effective) !== s.effective || (s.origin && !origins.includes(s.origin))) throw new Error('Código, fecha u origen inválidos.');
  const result: Setting = {code:s.code,effective:s.effective};
  if(s.excluded!==undefined){if(typeof s.excluded!=='boolean')throw new Error('Exclusión inválida.');result.excluded=s.excluded;}
  if (s.origin) result.origin = s.origin;
  if (s.basis) { if (!['Medido','Asignado','Estimado'].includes(s.basis)) throw new Error('Tipo de medición inválido.'); result.basis=s.basis; }
  const keys = ['labor','gas','electricity','overhead','freight','packaging','margin','inputThreshold','productThreshold','minimumImpact','staleDays'] as const;
  for (const k of keys) if (s[k] !== undefined) { if (typeof s[k] !== 'number' || !Number.isFinite(s[k]) || s[k]! < 0 || s[k]! > (k === 'margin' ? 95 : 1e9)) throw new Error(`Valor inválido: ${k}`); result[k] = s[k]; }
  return result;
}
