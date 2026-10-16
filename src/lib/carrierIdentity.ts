export type CarrierRecord={id:string;name:string;is_active?:boolean};
const aliases:Record<string,string>={
 'gv':'gyv',
 'gustao gyv':'gyv',
 'gustavo gyv':'gyv','gomez gustavo':'gyv','gomez gustavo omar':'gyv','gomez gustavo gyv':'gyv','gomez gustavo gyv omar':'gyv',
 'alejandro camissa':'alejandro gavaplast','alejandro cammisa':'alejandro gavaplast','daniel ozuna':'daniel osuna','diego weiss':'diego weis',
};
export function carrierIdentityKey(value:string):string{
 const key=value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\((?:la plata|zarate|lujan|z\.?\s*norte|zona norte|zona sur)\)/g,' ').match(/[a-z0-9]+/g)?.sort().join(' ')||'';
 return aliases[key]||key;
}
export function resolveCarrierIdentity<T extends CarrierRecord>(name:string,carriers:T[]):{carrier:T|null;state:'matched'|'unknown'|'ambiguous'}{
 const key=carrierIdentityKey(name),active=carriers.filter(c=>c.is_active!==false);
 const exact=active.filter(c=>carrierIdentityKey(c.name)===key);
 // The owner confirmed Gustavo Gomez / GYV. Prefer the catalogue record named GYV.
 if(key==='gyv'){const canonical=exact.filter(c=>c.name.trim().toUpperCase()==='GYV');if(canonical.length===1)return {carrier:canonical[0],state:'matched'};}
 if(exact.length===1)return {carrier:exact[0],state:'matched'};if(exact.length>1)return {carrier:null,state:'ambiguous'};
 const words=key.split(' ').filter(Boolean);
 const candidates=active.filter(c=>{const other=carrierIdentityKey(c.name).split(' ');return Math.min(words.length,other.length)>=2&&(words.every(w=>other.includes(w))||other.every(w=>words.includes(w)));});
 return candidates.length===1?{carrier:candidates[0],state:'matched'}:{carrier:null,state:candidates.length?'ambiguous':'unknown'};
}
export function carrierCommercialProfile(name:string,zoneHint=''):{company_key:string;company_name:string;driver_name:string;tariff_area_hint:'general'|'la_plata'|'zarate';tariff_group_hint?:string}|null{
 const key=carrierIdentityKey(name),words=key.split(' ');
 const zone=(name+' '+zoneHint).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const area=/\bla\s+plata\b/.test(zone)?'la_plata':/\bzarate\b/.test(zone)?'zarate':'general';
 if(key==='gyv')return {company_key:'gyv',company_name:'GyV',driver_name:/\bgustavo\b/i.test(name)?'Gustavo Gomez':'Chofer no identificado',tariff_area_hint:area,tariff_group_hint:area==='general'?'regular':'lp_zarate'};
 if(words.includes('ramallo')&&words.includes('jorge'))return {company_key:'gyv',company_name:'GyV',driver_name:name,tariff_area_hint:area,tariff_group_hint:area==='general'?'regular':'lp_zarate'};
 if(words.includes('herrera')&&words.includes('patricio')||words.includes('rostagno')&&words.includes('gaston'))return {company_key:'gyv',company_name:'GyV',driver_name:name,tariff_area_hint:area,tariff_group_hint:area==='general'?'regular':'lp_zarate'};
 if(key==='alejandro gavaplast')return {company_key:'gavaplast',company_name:'Gavaplast',driver_name:'Alejandro Camissa',tariff_area_hint:area};
 return null;
}
export function normalizeSettlementCarriers<T extends Record<string,any>>(rows:T[],carriers:CarrierRecord[]):T[]{return rows.map(row=>{const resolved=resolveCarrierIdentity(row.carrier_name||'',carriers);return resolved.carrier?{...row,original_carrier_name:row.original_carrier_name||row.carrier_name,carrier_name:resolved.carrier.name,canonical_carrier_id:resolved.carrier.id,transport_profile:carrierCommercialProfile(row.original_carrier_name||row.carrier_name,[row.route_detail,row.data?.zone].filter(Boolean).join(' '))}:row;});}
export function canonicalCarrierOptions<T extends CarrierRecord>(carriers:T[]):T[]{return carriers.filter(c=>c.is_active!==false&&(!resolveCarrierIdentity(c.name,carriers).carrier||resolveCarrierIdentity(c.name,carriers).carrier?.id===c.id));}
