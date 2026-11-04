import { createClient } from '@supabase/supabase-js';
import { createDb, deliverNotice } from '../../workers/route-sales/core.mjs';
import type { SheetOrderPayload } from './googleSheets';

// null keeps the existing sender in charge while the pilot is disabled.
export async function reconcileRouteSaleNotice(code: string, order: SheetOrderPayload) {
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!);
 const {data:config,error:configError}=await db.from('route_sales_config').select('enabled').eq('id',true).maybeSingle();
 if(configError?.code==='42P01'||configError?.code==='PGRST205')return null;
 if(configError)throw Error('No se pudo consultar la configuración de avisos');
 if(!config?.enabled)return null;
 const summary=(order.items||[]).map(i=>`${i.quantity||1} ${i.name}`).join(' + ').slice(0,180)||'Pedido';
 const date=(order.deliveryDate||'').slice(0,10);
 const {data:id,error}=await db.rpc('link_route_sale_order',{
  p_link:order.whaticketLink||'',p_code:code,p_seller:order.sellerName||'Vendedor/a',
  p_summary:summary,p_locality:order.locality||'Sin localidad',p_date:date?date.slice(8,10)+'/'+date.slice(5,7):'A coordinar',
  p_from:/^\d{4}-\d{2}-\d{2}$/.test(date)?date:null
 });
 if(error)throw Error('No se pudo vincular el aviso de recorridos: '+error.message);
 return deliverNotice(createDb({SUPABASE_URL:process.env.NEXT_PUBLIC_SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY:process.env.SUPABASE_SERVICE_ROLE_KEY}),
  {LOGISTICS_TELEGRAM_BOT_TOKEN:process.env.LOGISTICS_TELEGRAM_BOT_TOKEN},id);
}
