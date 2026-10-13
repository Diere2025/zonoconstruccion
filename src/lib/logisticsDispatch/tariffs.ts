import {CarrierRecord,carrierCommercialProfile,resolveCarrierIdentity} from '@/lib/carrierIdentity';
export function rateAmount(value:unknown):number|null{if(typeof value==='number')return Number.isFinite(value)?value:null;const text=String(value??'').replace(/[$\s.]/g,'').replace(',','.');if(!/^-?\d+(\.\d+)?$/.test(text))return null;const n=Number(text);return Number.isFinite(n)?n:null;}
const flag=(value:unknown):boolean|null=>/^s[ií]$/i.test(String(value||'').trim())?true:/^no$/i.test(String(value||'').trim())?false:null;
export function parseTariffRows(rows:Array<{row:number;values:unknown[]}>,carriers:CarrierRecord[]){return rows.filter(r=>r.values[0]).map(({row,values:v})=>{
 const label=String(v[0]).trim(),month=label.match(/\((\d{2})\.(\d{2})\)/),periodMonth=month&&Number(month[1])>=1&&Number(month[1])<=12?`20${month[2]}-${month[1]}`:null;
 const normalized=label.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const zoneVariant=/\blp\s*\/\s*zarate/.test(normalized)?'lp_zarate':/\bla plata\b/.test(normalized)?'la_plata':'regular';
 const bare=label.replace(/\(\d{2}\.\d{2}\)/g,'').replace(/\(La Plata\)/i,'').trim();
 const carrier=resolveCarrierIdentity(bare,carriers).carrier,profile=carrierCommercialProfile(bare);
 const companyKey=/\bgyv\b/.test(normalized)?'gyv':profile?.company_key||null;
 const baseDay=rateAmount(v[1]);
 const review=[...(!periodMonth?['effective_period_not_explicit']:[]),...(!companyKey&&!carrier?['carrier_or_vehicle_not_identified']:[]),...(baseDay===0?['zero_rate_requires_confirmation']:[]),...(flag(v[9])===null?['toll_inclusion_not_explicit']:[])];
 return {sourceRow:row,label,periodMonth,current:flag(v[8])===true,companyKey,carrierId:carrier?.id||null,zoneVariant,baseDay,hour:rateAmount(v[2]),extraHour:rateAmount(v[3]),extraKm:rateAmount(v[4]),companion:rateAmount(v[5]),includedKm:rateAmount(v[6]),bonus:rateAmount(v[7]),includesTolls:flag(v[9]),review};
 });}