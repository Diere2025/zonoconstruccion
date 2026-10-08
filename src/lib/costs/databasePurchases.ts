import { CatalogRow } from './sources';
import { Definition, Purchase, date, normalize, resolvePurchaseArticle } from './model';
import { SupabaseClient } from '@supabase/supabase-js';
interface Entry {id:string;product_id:string;quantity:number;unit_cost:number;supplier_purchases:{id:string;purchase_date:string;invoice_number:string;currency:string;document_type:string;purchase_reception_id:string|null;suppliers:{name:string}|null}|null}
/** Standalone invoice lines complement Sheets. Linked receptions are not imported twice. */
export async function databasePurchases(db:SupabaseClient,def:Definition,catalog:CatalogRow[],existing:Purchase[],asOf:string,diagnostics:string[]):Promise<Purchase[]> {
  const products=new Map(catalog.map(p=>[p.id,p]));const result:Purchase[]=[];let unsupported=0;
  for(let offset=0;;offset+=1000){
    const response=await db.from('supplier_purchase_items').select('id,product_id,quantity,unit_cost,supplier_purchases(id,purchase_date,invoice_number,currency,document_type,purchase_reception_id,suppliers(name))').order('id').range(offset,offset+999);
    if(response.error)throw new Error('No se pudieron consultar las compras cargadas en el sistema.');
    for(const item of response.data as unknown as Entry[]){
      const purchase=item.supplier_purchases,product=products.get(item.product_id);if(!purchase||!product||purchase.purchase_reception_id||/nc|credit/.test(normalize(purchase.document_type)))continue;
      const when=date(purchase.purchase_date);if(!when||when>asOf||!(item.quantity>0)||!(item.unit_cost>0))continue;
      if(purchase.currency&&purchase.currency!=='ARS'){unsupported++;continue;}
      const article=resolvePurchaseArticle(def.articles,product.name);if(!article){unsupported++;continue;}const vendor=purchase.suppliers?.name||'Proveedor del sistema';
      if(existing.some(p=>p.code===article.code&&p.date===when&&normalize(p.vendor)===normalize(vendor)&&Math.abs(p.cost-Number(item.unit_cost))<.01&&Math.abs(p.quantity-Number(item.quantity))<.001))continue;
      result.push({key:'SISTEMA|'+item.id,source:'Compras del sistema',row:0,receipt:purchase.invoice_number||purchase.id,name:product.name,code:article.code,date:when,vendor,quantity:Number(item.quantity),unit:article.unit,cost:Number(item.unit_cost)});
    }
    if(response.data.length<1000)break;
  }
  if(unsupported)diagnostics.push(`${unsupported} compras del sistema pendientes de equivalencia o conversión de moneda; no se incluyeron.`);
  for(let offset=0;;offset+=1000){
    const response=await db.from('purchase_reception_items').select('id,product_id,product_name,quantity_received,unit_cost,purchase_receptions(id,reception_date,delivery_slip_number,suppliers(name))').order('id').range(offset,offset+999);
    if(response.error)throw new Error('No se pudieron consultar las recepciones de compras.');
    interface Reception {id:string;product_id:string|null;product_name:string|null;quantity_received:number;unit_cost:number;purchase_receptions:{id:string;reception_date:string;delivery_slip_number:string;suppliers:{name:string}|null}|null}
    for(const item of response.data as unknown as Reception[]){
      const receipt=item.purchase_receptions;const name=products.get(item.product_id||'')?.name||item.product_name;if(!receipt||!name)continue;
      const when=date(receipt.reception_date);if(!when||when>asOf||!(item.quantity_received>0)||!(item.unit_cost>0))continue;
      const article=resolvePurchaseArticle(def.articles,name);if(!article)continue;const vendor=receipt.suppliers?.name||'Proveedor del sistema';
      const duplicate=[...existing,...result].some(p=>p.code===article.code&&normalize(p.vendor)===normalize(vendor)&&((normalize(p.receipt)===normalize(receipt.delivery_slip_number)&&!!receipt.delivery_slip_number)||(p.date===when&&Math.abs(p.cost-Number(item.unit_cost))<.01&&Math.abs(p.quantity-Number(item.quantity_received))<.001)));
      if(duplicate)continue;
      result.push({key:'RECEPCION|'+item.id,source:'Recepciones del sistema',row:0,receipt:receipt.delivery_slip_number||receipt.id,name,code:article.code,date:when,vendor,quantity:Number(item.quantity_received),unit:article.unit,cost:Number(item.unit_cost)});
    }
    if(response.data.length<1000)break;
  }
  return result;
}
