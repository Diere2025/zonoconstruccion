import {carrierIdentityKey} from '@/lib/carrierIdentity';
import {estimateDispatchFee} from './planning';
type Row = Record<string, any>;
export const planningCarrierName = (name: string) => carrierIdentityKey(name) === carrierIdentityKey('Alejandro Gavaplast') ? 'Alejandro Camissa' : name;
export function companionTariffLabel(name: string) {
 const identity = carrierIdentityKey(name);
 return identity === carrierIdentityKey('Diego Weis') ? 'No corresponde · viaja solo' : identity === carrierIdentityKey('Daniel Osuna') ? 'No corresponde · remis' : 'Se abona aparte';
}
/** Normalize the local review without rewriting source IDs, original evidence or actual payments. */
export function correctPlanningView(data: Row): Row {
 if (!Array.isArray(data.plans)) return data;
 const carriers = (data.carriers || []).filter((c: Row) => c.name.trim().toLowerCase() !== 'pato').map((c: Row) => ({...c,name:planningCarrierName(c.name)}));
 const tariffs = (data.tariffs || []).map((t: Row) => ({...t,label:String(t.label || '').replace(/Alejandro\s+Gavaplast/ig,'Alejandro Camissa')}));
 const plans = (data.plans || []).map((p: Row) => {
  const planned = {...p.planned,router:/^pablo$/i.test(String(p.planned.router || '').trim()) ? 'Pablo Jara' : p.planned.router};
  const header = (h: Row) => ({...h,carrier_name:planningCarrierName(h.carrier_name || '')});
  const logistics_dispatches = Array.isArray(p.logistics_dispatches) ? p.logistics_dispatches.map(header) : p.logistics_dispatches ? header(p.logistics_dispatches) : p.logistics_dispatches;
  const snapshot = p.tariff_snapshot ? {...p.tariff_snapshot,label:String(p.tariff_snapshot.label || '').replace(/Alejandro\s+Gavaplast/ig,'Alejandro Camissa')} : null;
  return {...p,planned,logistics_dispatches,tariff_snapshot:snapshot,estimate:estimateDispatchFee(planned,snapshot)};
 });
 return {...data,carriers,tariffs,plans};
}
