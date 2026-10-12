import type {SupabaseClient} from '@supabase/supabase-js';
export async function settlementDispatchReferences<T extends {id:string}>(db:SupabaseClient,rows:T[]):Promise<Array<T&{dispatch_code?:string}>> {
 const result=new Map<string,string>();
 try {for(let offset=0;offset<rows.length;offset+=100){
  const r=await db.from('logistics_dispatch_settlements').select('settlement_id,logistics_dispatches(code)').in('settlement_id',rows.slice(offset,offset+100).map(x=>x.id));
  if(r.error)throw r.error;
  for(const l of r.data||[]){const d=Array.isArray(l.logistics_dispatches)?l.logistics_dispatches[0]:l.logistics_dispatches;if(d)result.set(l.settlement_id,d.code);}
 }}catch(error){const e=error as {code?:string;message?:string};if(!['42P01','PGRST205','PGRST200'].includes(e.code||'')||!e.message?.includes('logistics_dispatch_settlements'))throw error;}
 return rows.map(row=>({...row,dispatch_code:result.get(row.id)}));
}
