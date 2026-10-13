import {carrierIdentityKey} from '@/lib/carrierIdentity';
type Row=Record<string,any>;
const fields=['deliveries_total','change_fund','electronic_total','tolls_total','extraordinary_total','expected_cash','counted_cash','difference','shortage_recovered'];
const words=(name:string):string[]=>name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().match(/[a-z0-9]+/g)||[];
export function sameSettlementCarrier(a:string,b:string){if(carrierIdentityKey(a)===carrierIdentityKey(b)&&carrierIdentityKey(a))return true;const x=words(a),y=words(b);return Math.min(x.length,y.length)>=2&&(x.every(w=>y.includes(w))||y.every(w=>x.includes(w)));}
/** Read-only consolidation of an imported snapshot and its existing route; every origin remains accessible. */
export function consolidateSettlementSnapshots<T extends Row>(rows:T[]):T[]{
 const replacements=new Map<string,T>(),merged=new Set<string>();
 for(const source of rows){
  if(source.status!=='confirmed'||source.source!=='spreadsheet'||source.route_sheet_id||!source.dispatch_code)continue;
  const candidates=rows.filter(target=>target.id!==source.id&&target.status==='confirmed'&&target.route_sheet_id&&target.settlement_date===source.settlement_date&&(!target.dispatch_code||target.dispatch_code===source.dispatch_code)&&sameSettlementCarrier(source.carrier_name,target.carrier_name)&&fields.every(field=>Number(source[field]||0)===Number(target[field]||0)));
  if(candidates.length!==1)continue;const target=candidates[0];
  const otherSources=rows.filter(other=>other.id!==source.id&&other.source==='spreadsheet'&&!other.route_sheet_id&&other.status==='confirmed'&&other.settlement_date===source.settlement_date&&sameSettlementCarrier(other.carrier_name,target.carrier_name)&&fields.every(field=>Number(other[field]||0)===Number(target[field]||0)));
  if(otherSources.length)continue;
  replacements.set(target.id,{...target,dispatch_code:source.dispatch_code,consolidated_sources:[{id:source.id,code:source.code,source_row:source.source_row}]});merged.add(source.id);
 }
 return rows.filter(row=>!merged.has(row.id)).map(row=>replacements.get(row.id)||row);
}