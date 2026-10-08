import { getGoogleAccessToken } from '@/lib/googleSheets';
import { isDiscountProduct } from '@/lib/erp/discounts';
import { Article, Definition, Origin, Product, Purchase, Recipe, Setting, catalogIdentity, date, latestSetting, normalize, number, purchaseNameGroups, identifyingSku, resolvePurchaseArticle } from './model';

export const COST_SOURCES = {bom:'1BeNJYToBmeC1yOMNrYxH1I0Th7lTQTMdRhl1HmMhTds',cost:'1SeQuds8IXRDteHuO_w2FPzbqvpFVf55G6cMo8J7o3nc',purchases:'1orAhg5O_8AHeFihgeXvT512TvokQmf3qDQWQAVVjpNk'};
type Cell = string | number | boolean;
export async function read(id:string,ranges:string[],render='UNFORMATTED_VALUE'):Promise<Cell[][][]> {
  const token=await getGoogleAccessToken(); const query=ranges.map(r=>'ranges='+encodeURIComponent(r)).join('&');
  const response=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchGet?${query}&valueRenderOption=${render}&dateTimeRenderOption=SERIAL_NUMBER`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:AbortSignal.timeout(90000)});
  if(!response.ok)throw new Error(`No se pudo leer la fuente de costos (${response.status}).`);
  const body=await response.json(); if(body.valueRanges?.length!==ranges.length)throw new Error('La fuente respondió con rangos incompletos.');
  return body.valueRanges.map((r:{values?:Cell[][]})=>r.values||[]);
}
export interface CatalogRow {id:string;name:string;category:string|null;price:number;cost_price:number;sku:string|null;is_active:boolean;is_generic:boolean;is_insumo:boolean;is_discontinued:boolean;is_service:boolean;production_type:string}
function familyFor(name:string):string {
  const n=normalize(name);
  if(n.includes('aquafort')){const group=n.includes('cisterna')?'Cisternas':n.includes('tapa')?'Tapas':n.includes('cuatr')?'CUATR':n.includes('tric')?'TRIC':n.includes('bic')?'BIC':'Otros';return 'AquaFort · '+group;}
  if(n.includes('biofort')){const group=n.includes('autolimpi')?'Autolimpiable':n.includes('desengras')?'Desengrasadoras':n.includes('septica')?'Sépticas':n.includes('biodig')?'Biodigestores':'Otros';return 'BioFort · '+group;}
  return 'Piezas de fabricación';
}
export async function collectSources(catalog:CatalogRow[],asOf:string,settings:Setting[]=[],soldProductIds:Set<string>=new Set()):Promise<{definition:Definition;purchases:Purchase[];diagnostics:string[]}> {
  const [bom,cost,buy]=await Promise.all([
    read(COST_SOURCES.bom,["'Códigos Artículos'!A:B","'BOM Desglosada'!A:G","'BOM Piezas'!A:G","'BOM Cortes'!A:G"]),
    read(COST_SOURCES.cost,["'Origen de Costos'!A:O","'Precios Componentes'!A:J"]),
    read(COST_SOURCES.purchases,["'🔴Recibidos ZONO'!A:W","'🔵Centuma'!A:T","'🔵Mundileno'!A:T","'🔵Victech'!A:T","'🔵Insumos'!A:W"]),
  ]);
  if(bom[0].length<100||cost[0].length<60||buy[0].length<100)throw new Error('La fuente de costos está vacía o incompleta; se conserva la última actualización.');
  const diagnostics:string[]=[]; const articles:Article[]=bom[0].slice(1).filter(r=>r[0]&&r[1]).map(r=>({code:String(r[0]),name:String(r[1]),aliases:[String(r[1])],unit:'unidad',factor:1,fallback:null}));
  const nameToArticle=new Map(articles.map(a=>[normalize(a.name),a]));
  for(const row of cost[1].slice(1)){
    if(!row[0])continue; const name=String(row[0]);let a=nameToArticle.get(normalize(name));
    if(!a){a={code:'COMP-'+normalize(name),name,aliases:[name],unit:'unidad',factor:1,fallback:null};articles.push(a);nameToArticle.set(normalize(name),a);}
    if(row[1])a.aliases.push(String(row[1])); const f=number(row[2]);a.factor=f>0?f:1;const reference=number(row[6]);a.fallback=reference>0?reference:null;
  }
  const recipes:Recipe[]=[];const recipeMap=new Map<string,Recipe>();
  for(const sheet of bom.slice(1))for(const r of sheet.slice(1)){
    if(!r[0]||!r[1]||!r[5]||!r[6])continue; const qty=number(r[2]); if(!(qty>0))throw new Error(`Cantidad inválida en receta ${r[0]}.`);
    const code=String(r[5]);let recipe=recipeMap.get(code);if(!recipe){recipe={code,name:String(r[0]),components:[]};recipes.push(recipe);recipeMap.set(code,recipe);}
    recipe.components.push({code:String(r[6]),name:String(r[1]),quantity:qty,unit:String(r[3]||'unidad')});const article=articles.find(a=>a.code===String(r[6]));if(article)article.unit=String(r[3]||'unidad');
  }
  const catalogNames=new Map<string,CatalogRow[]>();for(const p of catalog){const n=catalogIdentity(p.name);catalogNames.set(n,[...(catalogNames.get(n)||[]),p]);}
  const products:Product[]=[];
  const excluded=(name:string)=>{const n=normalize(name);return isDiscountProduct({name})||/^(tapa(?:a)?rosca[fa]|extensorcamaras)$/.test(n)||/powerlit|segunda|280l|470l|550l|tachoconico600l/.test(n)||(/tapafibrocemento/.test(n)&&/sinmarca/.test(n));};
  for(const r of cost[0].slice(1)) {
    if(!r[0])continue; const name=String(r[0]); const n=normalize(name);const matches=catalogNames.get(n)||[];const exact=matches.filter(p=>!p.is_discontinued && !/ciego/i.test(p.name));const active=exact.filter(p=>p.is_active);const db=active.length===1?active[0]:exact.length===1?exact[0]:matches.length===1?matches[0]:null;
    if(matches.length>1&&!db)diagnostics.push(`Vinculación pendiente: ${name} coincide con más de un producto del catálogo.`);
    const article=nameToArticle.get(n);const code=article?.code||db?.id||'PROD-'+n;
    if(!article){const a:Article={code,name,aliases:[name],unit:'unidad',factor:1,fallback:null};articles.push(a);nameToArticle.set(n,a);}
    const canonicalArticle=nameToArticle.get(n);if(canonicalArticle)for(const match of matches)if(!canonicalArticle.aliases.includes(match.name))canonicalArticle.aliases.push(match.name);
    const capacity=Number(name.match(/(\d+)\s*L\b/i)?.[1]||0);
    products.push({code,id:db?.id||null,equivalentIds:matches.filter(p=>/\(ciego\)/i.test(p.name)).map(p=>p.id),name,family:familyFor(name),capacity,origin:excluded(name)?'No usar':String(r[2]||r[1]||'Por confirmar') as Origin,purchaseName:String(r[8]||name),termination:String(r[14]||''),brandLabel:String(r[7]||''),price:Number(db?.price)||0,reference:number(r[12])>0?number(r[12]):null,recipe:recipeMap.get(code)});
  }
  for(const p of catalog){
    const equivalent=products.find(x=>x.id!==p.id&&catalogIdentity(x.name)==='flotanteecovarillaplastica12'&&catalogIdentity(p.name)===catalogIdentity(x.name));
    if(equivalent){equivalent.equivalentIds=[...new Set([...(equivalent.equivalentIds||[]),p.id])];continue;}
    if((!p.is_active&&(!soldProductIds.has(p.id)||['fabricado','ensamblado'].includes(p.production_type)))||p.is_discontinued||p.is_generic||p.is_insumo||p.is_service||excluded(p.name)||products.some(x=>x.id===p.id||catalogIdentity(x.name)===catalogIdentity(p.name)))continue;
    const code=p.id; const n=normalize(p.name);const existing=nameToArticle.get(n);
    if(!existing){const a:Article={code,name:p.name,aliases:[p.name],unit:'unidad',factor:1,fallback:Number(p.cost_price)>0?Number(p.cost_price):null};articles.push(a);nameToArticle.set(n,a);}
    products.push({code:existing?.code||code,id:p.id,name:p.name,family:p.category||'Otros',capacity:Number(p.name.match(/(\d+)\s*L\b/i)?.[1]||0),origin:p.production_type==='fabricado'?'Por confirmar':p.production_type==='ensamblado'?'Por confirmar':'Compra',purchaseName:p.name,termination:'',price:Number(p.price)||0,reference:Number(p.cost_price)||null});
  }
  // The ERP SKU identifies the purchased product; the name may be a web description.
  for(const p of catalog){const sku=identifyingSku(p.sku);if(!sku)continue;
    const article=articles.find(a=>a.code===p.id)||articles.find(a=>normalize(a.name)===normalize(p.name));
    if(article){article.sku=sku;if(!article.aliases.some(alias=>normalize(alias)===normalize(sku)))article.aliases.push(sku);}
  }
  // Keep one cost entry for duplicate purchase records and retain old IDs for order lookup.
  const skuProducts=new Map<string,Product>();
  for(const p of [...products]){const db=catalog.find(c=>c.id===p.id),sku=identifyingSku(db?.sku);if(!sku||p.origin!=='Compra')continue;
    const key=normalize(sku),old=skuProducts.get(key);if(!old){skuProducts.set(key,p);continue;}
    const oldActive=catalog.find(c=>c.id===old.id)?.is_active;const keep=db?.is_active&&!oldActive?p:old,drop=keep===p?old:p;
    keep.equivalentIds=[...new Set([...(keep.equivalentIds||[]),...(drop.equivalentIds||[]),...(drop.id?[drop.id]:[])])].filter(id=>id!==keep.id);
    products.splice(products.indexOf(drop),1);skuProducts.set(key,keep);
  }
  for(const group of purchaseNameGroups){
    const primary=articles.find(a=>group.some(name=>normalize(a.name)===normalize(name)));
    if(primary)for(const name of group)if(!articles.some(a=>a.aliases.some(alias=>normalize(alias)===normalize(name))))primary.aliases.push(name);
  }
  const aliases=new Map<string,Article[]>();for(const a of articles)for(const alias of a.aliases){const n=normalize(alias);const current=aliases.get(n)||[];if(!current.some(x=>x.code===a.code))current.push(a);aliases.set(n,current);}
  function canonical(name:string,vendor:string):string {
    let n=normalize(name);
    if(normalize(vendor).includes('fibrosur')&&/^aquafortcisterna(1000|3000)l$/.test(n))n=n.replace('aquafortcisterna','tachocamarabio');
    if(/recuperado/.test(n)&&/negro/.test(n))n='recuperadonegroeconomico';
    return n;
  }
  const purchases:Purchase[]=[];const occurrence=new Map<string,number>();let unmapped=0;
  function add(source:string,row:number,receipt:string,name:string,when:Cell,vendor:string,qty:number,rawCost:number,poly=false){
    const d=date(when);if(!d||d>asOf||!(qty>0)||!(rawCost>0))return;
    const n=canonical(name,vendor);let matches=aliases.get(n)||[];
    if(poly){const color=normalize(name);const type=color.includes('virgen')?'virgen':color.includes('recuperado')?'recuperado':'';const candidates=articles.filter(a=>{const an=normalize(a.name);return type && an.includes(type) && ['negro','gris','blanco','beige','celeste','natural'].some(c=>color.includes(c)&&an.includes(c));});if(candidates.length===1)matches=candidates;}
    const a=poly?(matches.length===1?matches[0]:undefined):resolvePurchaseArticle(matches,n);
    if(!a){unmapped++;return;}
    // Polymer supplier reconciliation explicitly prices by kg, even when bags are also recorded.
    const factor=poly || (/skimmer/.test(n)&&normalize(name)===normalize(a.name))?1:a.factor;
    const baseKey=[source,receipt||'SIN-REMITO',d,normalize(vendor),n].join('|');const count=(occurrence.get(baseKey)||0)+1;occurrence.set(baseKey,count);
    purchases.push({key:baseKey+'|'+count,source,row,receipt,name,code:a.code,date:d,vendor,quantity:qty*factor,unit:poly?'kg':a.unit,cost:rawCost/factor});
  }
  for(const sheet of [0,4])for(let i=1;i<buy[sheet].length;i++){const r=buy[sheet][i];if(normalize(r[15])!=='ok'||/nc|credit/.test(normalize(r[2])))continue;add(sheet===0?'Recibidos ZONO':'Insumos',i+1,String(r[1]||''),String(r[5]||''),r[0],String(r[4]||''),number(r[6]),number(r[22]));}
  for(let sheet=1;sheet<=3;sheet++)for(let i=1;i<buy[sheet].length;i++){const r=buy[sheet][i];const centuma=sheet===1;const free=r[centuma?16:18];if(free===true||['true','si','sincargo'].includes(normalize(free)))continue;
    const tax=centuma?0:number(r[10]);const costPerKg=number(r[centuma?10:12])/(1+(Number.isFinite(tax)?tax:0));add(['','Centuma','Mundileno','Victech'][sheet],i+1,String(r[0]||''),String(r[4]||''),r[1],['','Centuma','Mundileno','Victech'][sheet],number(r[2]),costPerKg,true);
  }
  diagnostics.push(`${unmapped} renglones de compra no vinculados de forma inequívoca; no intervienen en el costo.`);
  products.sort((a,b)=>a.family.localeCompare(b.family)||a.capacity-b.capacity||a.name.localeCompare(b.name));
  return {definition:{articles,products:products.filter(p=>!excluded(p.name)&&!latestSetting(settings,p.code,asOf)?.excluded),recipes,captured:asOf},purchases,diagnostics};
}
