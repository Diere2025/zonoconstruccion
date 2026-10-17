import {planningRows} from './planningServer';
type Row=Record<string,any>;
/** Use persisted LOG/route relationships; never guess a rendition from date or driver. */
export async function planningRenditions(db:any,plans:Row[]){
 const attached=new Map<string,Map<string,Row>>();
 const add=(id:string,s:Row)=>{if(!s||s.status==='archived')return;const rows=attached.get(id)||new Map();rows.set(s.id,s);attached.set(id,rows);};
 const columns='id,code,status,settlement_date,carrier_name,route_sheet_id,expected_cash,counted_cash,difference,shortage_recovered';
 for(let i=0;i<plans.length;i+=150){const ids=plans.slice(i,i+150).map(p=>p.dispatch_id);
  const links=await planningRows(db.from('logistics_dispatch_settlements').select(`dispatch_id,treasury_settlements(${columns})`).in('dispatch_id',ids).order('settlement_id'));
  links.forEach(l=>add(l.dispatch_id,Array.isArray(l.treasury_settlements)?l.treasury_settlements[0]:l.treasury_settlements));
  const routes=await planningRows(db.from('logistics_dispatch_routes').select('dispatch_id,route_sheet_id').in('dispatch_id',ids).order('route_sheet_id'));
  if(routes.length){const settlements=await planningRows(db.from('treasury_settlements').select(columns).in('route_sheet_id',[...new Set(routes.map(r=>r.route_sheet_id))]).neq('status','archived').order('id'));for(const s of settlements)for(const r of routes.filter(r=>r.route_sheet_id===s.route_sheet_id))add(r.dispatch_id,s);}
 }
 return plans.map(p=>({...p,renditions:[...(attached.get(p.dispatch_id)?.values()||[])].map(s=>({...s,shortage:Math.max(0,-Number(s.difference||0)),href:'/admin/rendiciones?rendicion='+encodeURIComponent(s.id)}))}));
}
