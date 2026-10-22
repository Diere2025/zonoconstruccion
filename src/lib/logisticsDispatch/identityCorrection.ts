import {sheetDate} from './model';
export type CorrectionSource={orderCode:string;date:string;carrier:string};
export type SourceCorrection={id:string;code:string;delivery_date:string;carrier_name:string;source_rows:CorrectionSource[];created_at:string};
export type CorrectionPreview={token:string;sourceToken:string;code:string;beforeDate:string;deliveryDate:string;beforeCarrier:string;carrierName:string;sourceRows:number;counts:Record<string,number>;blockers:string[];warnings:string[];related:{orders:string[];settlements:Array<{id:string;code:string;status:string}>;payments:Array<{id:string;code:string;amount:number|string;currency:string}>}};
/** Apply only the exact source identities reviewed by the operator; preserve original sheet evidence. */
export function correctedDeliveredRows(values:string[][],corrections:SourceCorrection[]){
 return values.map(row=>{let current=row;for(const correction of corrections){
  if(String(current[92]||'').trim().toUpperCase()!==correction.code)continue;
  const source=(correction.source_rows||[]).find(s=>s.orderCode===String(current[0]||'').trim()&&s.date===sheetDate(current[1])&&s.carrier===String(current[79]||'').trim());
  if(!source)continue;current=[...current];current[1]=correction.delivery_date.split('-').reverse().join('/');current[79]=correction.carrier_name;
 }return current;});
}
