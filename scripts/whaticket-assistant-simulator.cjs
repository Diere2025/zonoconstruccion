// Offline reference flow. No HTTP client, credentials, queue mutations or message sending.
function normalize(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
function initial(){return {state:'automatic',seen:[],product:null,locality:null,lastAt:null,quote:null};}
function financingQuote(price,terms){
 const totalCents=Math.round(Math.round(price*100)*(100+terms.surchargePercent)/100);
 const regularCents=Math.round(totalCents/terms.installments);
 const paymentsCents=Array.from({length:terms.installments},(_,i)=>i===terms.installments-1?totalCents-regularCents*(terms.installments-1):regularCents);
 return {cashPrice:price,totalCents,paymentsCents,installments:terms.installments,surchargePercent:terms.surchargePercent,plan:terms.plan};
}
function simulate(previous,event,catalog){
 const state={...previous,seen:[...previous.seen]};
 const output=(answer=null,reason=null,queue=null)=>({state,answer,reason,queue,mode:'offline_review_only',sent:false});
 if(!event.id)return output(null,'missing_event_id');
 if(state.seen.includes(event.id))return output(null,'duplicate');
 state.seen.push(event.id);
 if(event.type==='human'){state.state='human';return output(null,'human_intervened');}
 if(event.type==='resolved'){state.state='resolved';return output(null,'resolved');}
 if(state.state!=='automatic')return output(null,'paused');
 if(event.type!=='customer')return output(null,'system_event');
 const at=new Date(event.at).getTime();
 if(!Number.isFinite(at))return output(null,'invalid_timestamp');
 if(state.lastAt&&at<new Date(state.lastAt).getTime())return output(null,'delayed_event');
 state.lastAt=event.at;
 if(event.locality)state.locality=event.locality;
 const text=normalize(Array.isArray(event.text)?event.text.join('\n'):event.text);
 const handoff=(queue,reason,answer)=>{state.state='pending_sales';return {...output(answer,reason,queue),internalNote:{product:state.product,locality:state.locality,quote:state.quote,quantity:event.quantity||null,paymentInterest:/cuota|tarjeta/.test(text)?'card':null,reason,adId:event.verifiedAdId||null,unverifiedOrigin:event.originText||null}};};
 if(/reclamo|roto|no funciona|devolucion/.test(text))return handoff('Reclamos','complaint','Te derivo a Reclamos para que revisen tu caso.');
 if(/pedido.*(?:no lleg|donde|seguimiento)|donde.*pedido/.test(text))return handoff('Logística','existing_order','Te derivo a Logística para revisar tu pedido.');
 if(/curriculum|\bcv\b|busco trabajo|empleo/.test(text))return handoff('RRHH','job','Te derivo a RRHH.');
 if(/soy proveedor|ofrecerles|lista mayorista.*proveedor/.test(text))return handoff('Compras','supplier','Te derivo a Compras.');
 if(/persona|vendedora|humano/.test(text))return handoff('Ventas','human_requested','Te paso con el equipo de Ventas.');
 if(event.uninterpretedMedia)return handoff('Ventas','uninterpreted_media','No puedo interpretar ese archivo. Te paso con una persona para revisarlo.');
 const mentions=[[/escaler/,'escaleras'],[/latex|pintura/,'latex'],[/cooper|termotanque/,'cooper'],[/biodigestor/,'biodigestores'],[/\btanque/,'tanques'],[/membrana|impermeabili/,'impermeabilizacion']].map(([r,f])=>({f,i:text.search(r)})).filter(x=>x.i>=0).sort((a,b)=>a.i-b.i);
 if(mentions.length>1)return handoff('Ventas','multiple_products','Te paso con Ventas para revisar esos productos juntos.');
 if(mentions.length){if(state.product!==mentions[0].f)state.quote=null;state.product=mentions[0].f;}
 if(!state.product&&event.verifiedAdProduct)state.product=event.verifiedAdProduct;
 if(/quiero comprar|lo compro|confirmo.*compra/.test(text))return handoff('Ventas','purchase_intent','Te paso con Ventas para confirmar el pedido y las condiciones.');
 if(/pag[ouée]|comprobante|transferencia realizada/.test(text))return handoff('Ventas','payment_review','El equipo tiene que verificar el pago antes de confirmarlo.');
 const commercial=catalog.commercialTerms;
 const coveredFamily=commercial?.families.includes(state.product);
 const asksFinancing=/cuota|tarjeta|sin interes/.test(text);
 if(asksFinancing&&(!coveredFamily||!commercial.financing))return handoff('Ventas','installments_unverified','Los valores dependen del plan de tarjeta. Te paso con Ventas para confirmarlos.');
 if(asksFinancing&&/(?:\b3\b|\b12\b|tres|doce)\s*cuotas/.test(text))return output('Por ahora ofrecemos solo 6 cuotas con Cuota Simple, con un 42% de recargo.','unsupported_installment_plan');
 if(/envio|entrega|llegan|reparto/.test(text)){
  if(!state.locality)return output('¿A qué localidad sería el envío?','locality_required');
  if(coveredFamily&&commercial.shipping.exactLocalityAliases.some(x=>normalize(x)===normalize(state.locality))){
   const schedule=normalize(state.locality)==='la plata'?' A La Plata vamos miércoles y sábados.':'';
   return output(`El envío a ${state.locality} es gratis. El plazo de entrega es de 1 a 3 días hábiles.${schedule}`,'verified_shipping');
  }
  return handoff('Ventas','shipping_unverified','Ventas va a confirmar la cobertura y el plazo para tu localidad.');
 }
 if(/medida|altura|peso|soporta|diametro|instal|garantia|antihumedad|antihongo|rendimiento|cuantas manos/.test(text))return handoff('Ventas','technical_fact_unverified','Te paso con Ventas para confirmar ese dato con la ficha del producto.');
 if(state.product==='latex'&&/color|rosad|turques|entonador/.test(text))return output('Las promociones de Látex Zono del piloto son de blanco.','white_only');
 if(state.product==='latex'&&/\b(?:4|10)\s*(?:l|litros)\b/.test(text))return handoff('Ventas','variant_not_in_pilot','Te paso con Ventas para revisar esa presentación.');
 if(state.product==='escaleras'&&/12 escalones|3\s*x\s*4|negra|omaha/.test(text))return handoff('Ventas','variant_not_in_pilot','Te paso con Ventas para revisar ese modelo.');
 if(!['escaleras','latex'].includes(state.product))return state.product?handoff('Ventas','outside_pilot','Te paso con Ventas para confirmar las opciones de ese producto.'):output('Soy el asistente de Zono. ¿Por qué producto consultás?','product_required');
 const product=catalog.products.find(p=>state.product==='escaleras'?/GardenLife.*16/.test(p.name):p.name==='Zono Látex Pro Lavable (20L)');
 if(!product||!product.is_active||product.is_discontinued||product.is_generic||Number(product.price)<=0||new Date(catalog.pricesExpireAt).getTime()<at)return handoff('Ventas','commercial_data_unverified','Necesito que Ventas confirme el precio vigente.');
 if(/promo|\b2\b|dos baldes|combo|kit/.test(text))return handoff('Ventas','promotion_conditions_pending','Te paso con Ventas para confirmar la promoción y sus condiciones.');
 const price=Number(product.price);state.quote={price,sku:product.sku,source:'ERP snapshot',checkedAt:catalog.checkedAt};
 if(asksFinancing){
  const quote=financingQuote(price,commercial.financing);
  state.quote={...state.quote,financing:quote,termsSource:commercial.source};
  const money=n=>(n/100).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2});
  return output(`Podés pagar en 6 cuotas de $${money(quote.paymentsCents[0])} aprox. con Cuota Simple. Incluye un 42% de recargo; el total es $${money(quote.totalCents)}.`,'verified_installments');
 }
 return output(`${state.product==='escaleras'?'La escalera GardenLife de 16 escalones':'El Látex Zono Pro blanco de 20L'} está a $${price.toLocaleString('es-AR')}.`,'verified_price');
}
module.exports={initial,simulate,financingQuote};
