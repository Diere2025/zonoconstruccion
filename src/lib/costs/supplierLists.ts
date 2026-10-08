import { Definition, Purchase, catalogIdentity, date, normalize, number, resolvePurchaseArticle } from './model';
import { read } from './sources';
export const SUPPLIER_COST_BOOK='1q5m7T0pqlYBj9imWyTkJf5fus2eVyPtTLc74cp0Nul0';

/** Quotes are dated price evidence, never received quantities or stock movements. */
export async function supplierLists(definition:Definition,asOf:string):Promise<Purchase[]> {
  const [formulas]=await read(SUPPLIER_COST_BOOK,["'BDCosto'!A2"],'FORMULA');
  const formula=String(formulas[0]?.[0]||'');
  const tabs=[...formula.matchAll(/(?:'([^']+)'|([\p{L}\w]+))!A\d+:J/gu)].map(m=>m[1]||m[2]);
  if(tabs.length<10)throw new Error('No se pudo identificar las listas vinculadas a BDCosto.');
  const ranges=tabs.map(tab=>`'${tab.replace(/'/g,"''")}'!A1:G2000`);
  const sheets=await read(SUPPLIER_COST_BOOK,ranges);
  const aliases=new Map<string,Set<string>>();
  for(const article of definition.articles)for(const name of article.aliases){const n=catalogIdentity(name);const codes=aliases.get(n)||new Set<string>();codes.add(article.code);aliases.set(n,codes);}
  const protectedProducts=new Set(definition.products.filter(p=>p.origin==='Fabricación'||p.origin==='Ensamblado').map(p=>p.code));
  const result:Purchase[]=[];
  sheets.forEach((sheet,i)=>sheet.forEach((row,index)=>{
    const name=String(row[0]||''),cost=number(row[4]),effective=date(row[6]),vat=number(row[3]);
    const codes=aliases.get(catalogIdentity(name));
    if(!name||!(cost>0)||!effective||effective>asOf||!codes||!Number.isFinite(vat)||vat<0||vat>1)return;
    const candidates=definition.articles.filter(a=>codes.has(a.code));
    const article=candidates.length===1?candidates[0]:resolvePurchaseArticle(candidates,name);if(!article)return;
    const code=article.code;if(protectedProducts.has(code)||normalize(tabs[i]).includes('descuento'))return;
    // Lists of kilograms/bags need an explicit unit conversion before they are usable.
    if(article.unit!=='unidad')return;
    result.push({key:`LISTA:${tabs[i]}:${index+1}:${code}:${effective}:${cost}:${vat}`,source:`Lista ${tabs[i]} · BDCosto`,row:index+1,receipt:'Lista vigente',name,code,date:effective,vendor:tabs[i],quantity:0,unit:article.unit,cost:cost/article.factor,kind:'Lista',vat,observed:new Date().toISOString()});
  }));
  return result;
}
