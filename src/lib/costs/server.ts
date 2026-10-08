import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { calculate, changed, monthsUntil } from './engine';
import { Definition, Purchase, Result, Setting, comparePriceEvidence, latestSetting, today } from './model';
import { CatalogRow, collectSources } from './sources';
import { FactoryReport, operatingSetting } from './operations';
import { GET as factoryReport } from '@/app/api/admin/gas-consumo-data/route';
import { databasePurchases } from './databasePurchases';
import { supplierLists } from './supplierLists';

export function costDatabase() {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error('El servicio de costos no está configurado.');
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
async function rows<T>(db:SupabaseClient,table:string,select:string):Promise<T[]> {
  const all:T[]=[]; for(let offset=0;;offset+=1000){const result=await db.from(table).select(select).range(offset,offset+999);if(result.error)throw new Error(result.error.message);all.push(...result.data as T[]);if(result.data.length<1000)break;}return all;
}
async function hash(value:unknown):Promise<string>{const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));return Array.from(new Uint8Array(bytes)).map(b=>b.toString(16).padStart(2,'0')).join('');}
function definitionIdentity(def:Definition){
  const byCode=(a:{code:string},b:{code:string})=>a.code.localeCompare(b.code);
  return {
    recipes:def.recipes.map(r=>({...r,components:[...r.components].sort(byCode)})).sort(byCode),
    articles:def.articles.map(a=>({code:a.code,aliases:[...a.aliases].sort(),unit:a.unit,factor:a.factor,fallback:a.fallback})).sort(byCode),
    products:def.products.map(p=>({code:p.code,name:p.name,origin:p.origin,purchaseName:p.purchaseName,termination:p.termination,brandLabel:p.brandLabel})).sort(byCode),
  };
}
export async function readCosts(db=costDatabase()) {
  const [state,alerts,settings]=await Promise.all([db.from('cost_system_state').select('updated_at,last_error,payload,lease_until').eq('id',true).single(),db.from('cost_alerts').select('id,created_at,data,acknowledged_at').is('acknowledged_at',null).order('created_at',{ascending:false}).limit(250),db.from('cost_settings').select('data').order('effective',{ascending:false})]);
  if(state.error)throw new Error(state.error.message);if(alerts.error||settings.error)throw new Error(alerts.error?.message||settings.error?.message);
  return {...state.data.payload,updatedAt:state.data.updated_at,lastError:state.data.last_error,syncing:!!state.data.lease_until&&Date.parse(state.data.lease_until)>Date.now(),alerts:alerts.data,settings:settings.data.map(s=>s.data)};
}
/** Existing heartbeat refreshes sources every six hours; failures preserve the last publication. */
export async function refreshCostsIfDue() {
  if(!process.env.SUPABASE_SERVICE_ROLE_KEY)return {skipped:true};
  const db=costDatabase();const state=await db.from('cost_system_state').select('updated_at,last_attempt_at,lease_until').eq('id',true).maybeSingle();
  if(state.error||!state.data?.updated_at)return {skipped:true};
  const last=Math.max(Date.parse(state.data.updated_at),Date.parse(state.data.last_attempt_at||state.data.updated_at));
  if(Date.now()-last<6*3600000)return {skipped:true};
  return syncCosts(db);
}
export async function syncCosts(db=costDatabase()) {
  const claim=await db.rpc('cost_claim_sync');if(claim.error)throw new Error(claim.error.message);if(!claim.data)return {busy:true};const token=claim.data;
  try {
    const asOf=today();
    const [catalog,settingRows,versionRows,oldState]=await Promise.all([
      rows<CatalogRow>(db,'products','id,name,category,price,cost_price,sku,is_active,is_discontinued,is_generic,is_insumo,is_service,production_type'),
      rows<{data:Setting}>(db,'cost_settings','data'),
      rows<{definition:Definition;fingerprint:string;recorded_at:string}>(db,'cost_source_versions','definition,fingerprint,recorded_at'),
      db.from('cost_system_state').select('payload').eq('id',true).single(),
    ]);
    if(oldState.error)throw new Error(oldState.error.message);
    const settings=settingRows.map(s=>s.data);
    const soldProductIds=new Set<string>();const since=new Date(Date.parse(asOf)-120*86400000).toISOString().slice(0,10);
    // Inactive commercial products can still need a cost for recently recorded orders.
    for(let offset=0;;offset+=1000){const r=await db.from('order_items').select('product_id,orders!inner(order_date)').gte('orders.order_date',since).not('product_id','is',null).order('id').range(offset,offset+999);if(r.error)throw new Error(r.error.message);for(const item of r.data)if(item.product_id)soldProductIds.add(item.product_id);if(r.data.length<1000)break;}
    const {definition,purchases,diagnostics}=await collectSources(catalog,asOf,settings,soldProductIds);
    purchases.push(...await databasePurchases(db,definition,catalog,purchases,asOf,diagnostics));
    const oldQuotes=(oldState.data?.payload?.supplierQuotes||[]) as Purchase[];
    // Keep observed list versions so a later replacement does not erase earlier evidence.
    const quoteMap=new Map(oldQuotes.map(q=>[q.key,q]));
    for(const quote of await supplierLists(definition,asOf))if(!quoteMap.has(quote.key))quoteMap.set(quote.key,quote);
    const supplierQuotes=[...quoteMap.values()];
    const priceEvidence=[...purchases,...supplierQuotes];
    let factory:FactoryReport|null=null;
    try{const response=await factoryReport();const data=await response.json();if(response.ok&&data.success)factory=data;else diagnostics.push('No se actualizaron los gastos de fábrica; requieren revisión.');}catch{diagnostics.push('No se pudieron consultar los gastos de fábrica.');}
    const versionHash=await hash(definitionIdentity(definition));
    const ordered=versionRows.sort((a,b)=>a.definition.captured.localeCompare(b.definition.captured)||a.recorded_at.localeCompare(b.recorded_at));const last=ordered.at(-1);
    const newVersion=!last||last.fingerprint!==versionHash;
    if(!newVersion)definition.captured=last.definition.captured;
    const versions=newVersion?[...ordered.map(v=>v.definition),definition]:ordered.map(v=>v.definition);
    const withOperations=(def:Definition,p:typeof definition.products[number],date:string)=>{const operating=operatingSetting(def,p,date,settings,factory);return calculate(def,priceEvidence,p,date,operating?[...settings.filter(s=>s.code!==p.code),operating]:settings);};
    const current=definition.products.map(p=>withOperations(definition,p,asOf));
    const history:Record<string,Result[]>={};
    for(const period of monthsUntil(asOf)){
      const vintage=versions.filter(v=>v.captured<=period).at(-1)||versions.filter(v=>v.captured===versions[0]?.captured).at(-1)||definition;
      const currentPrices=new Map(definition.products.map(p=>[p.code,p.price]));
      for(const product of vintage.products){const result=withOperations(vintage,{...product,price:currentPrices.get(product.code)||0},period);(history[product.code] ||= []).push(result);}
    }
    const oldCurrent=(oldState.data?.payload?.current||[]) as Result[];const oldByCode=new Map(oldCurrent.map(r=>[r.code,r]));
    const global=latestSetting(settings,'GLOBAL',asOf);const alerts:{fingerprint:string;data:unknown}[]=[];
    for(const result of current){
      const before=oldByCode.get(result.code);if(changed(before?.total??null,result.total,global?.productThreshold??5,global?.minimumImpact??1000)){
        const data={type:'Costo del producto',code:result.code,name:result.name,before:before?.total,after:result.total,percent:before?.total?((result.total!/before.total)-1)*100:null,date:asOf,reason:before?.origin!==result.origin?'Cambio de origen de costo':'Cambio de precios, receta o gastos operativos',components:result.lines.filter(l=>{const old=before?.lines.find(x=>x.code===l.code);return old&&old.cost!==l.cost;}).map(l=>l.name)};
        alerts.push({fingerprint:await hash(data),data});
      }
      if(result.coverage!=='Completo'&&result.origin!=='No usar')alerts.push({fingerprint:await hash({code:result.code,coverage:result.coverage}),data:{type:'Datos pendientes',code:result.code,name:result.name,reason:result.coverage,date:asOf}});
    }
    const previousPurchases=(oldState.data?.payload?.latestPurchases||[]) as Purchase[];const previous=new Map(previousPurchases.map(p=>[p.code,p]));const latest=new Map<string,Purchase>();for(const p of priceEvidence){const old=latest.get(p.code);if(!old||comparePriceEvidence(p,old)<0)latest.set(p.code,p);}
    for(const p of latest.values()){
      const old=previous.get(p.code);if(changed(old?.cost??null,p.cost,global?.inputThreshold??10,global?.minimumImpact??1000)){
        const affected=current.filter(r=>r.lines.some(l=>l.code===p.code)).map(r=>r.name);const data={type:'Precio de componente',code:p.code,name:p.name,before:old?.cost,after:p.cost,percent:old?((p.cost/old.cost)-1)*100:null,date:p.date,vendor:p.vendor,reason:p.kind==='Lista'?'Actualización de lista vigente en BDCosto':'Nueva compra o corrección en conciliación',affected};alerts.push({fingerprint:await hash(data),data});
      }
      const age=Math.floor((Date.parse(asOf)-Date.parse(p.date))/86400000);
      const affected=current.filter(r=>r.origin!=='No usar'&&r.lines.some(l=>l.code===p.code)).map(r=>r.name);
      if(age>(global?.staleDays??90)&&affected.length){const data={type:'Precio antiguo',code:p.code,name:p.name,date:p.date,vendor:p.vendor,reason:`Último precio: ${p.date}; revisar vigencia.`,affected};alerts.push({fingerprint:await hash(data),data});}
    }
    const snapshots=await Promise.all([...current,...Object.values(history).flat()].map(async data=>({data,fingerprint:await hash(data)})));
    const payload={current,history,diagnostics,sourceDate:asOf,purchaseCount:purchases.length,supplierQuotes,productCount:current.length,versionCount:versions.length,latestPurchases:[...latest.values()],recipeBaseline:versions[0]?.captured};
    const publish=await db.rpc('cost_publish_sync',{token,document:{purchases,snapshots,alerts,payload,version:newVersion?definition:null,versionHash}});if(publish.error)throw new Error(publish.error.message);
    return {success:true,products:current.length,purchases:purchases.length,alerts:alerts.length,complete:current.filter(r=>r.coverage==='Completo').length};
  }catch(error){await db.rpc('cost_release_sync',{token,failure:error instanceof Error?error.message:'Falló la actualización'});throw error;}
}
