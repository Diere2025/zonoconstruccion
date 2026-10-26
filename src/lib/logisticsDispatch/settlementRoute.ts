type RouteInput = {
 carrierId:string;
 deliveryDate:string;
 runNumber:number;
 existingRouteSheetId?:string|null;
 total:number;
 hasAssistant:boolean;
};

/** The full carrier identity keeps namesakes and renamed drivers in separate routes. */
export function settlementRouteCode(carrierId:string,deliveryDate:string,runNumber:number){
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(carrierId))throw new Error('Fletero inválido.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)||!Number.isInteger(runNumber)||runNumber<1)throw new Error('Fecha o recorrido inválido.');
 return `HR-${deliveryDate.replace(/-/g,'')}-${carrierId.toLowerCase()}-R${runNumber}`;
}

export async function ensureSettlementRoute(db:any,input:RouteInput){
 const code=settlementRouteCode(input.carrierId,input.deliveryDate,input.runNumber);
 const lookup=()=>db.from('route_sheets').select('id,code').eq('carrier_id',input.carrierId).eq('delivery_date',input.deliveryDate).eq('run_number',input.runNumber);
 const found=await (input.existingRouteSheetId?lookup().eq('id',input.existingRouteSheetId):lookup()).maybeSingle();
 if(found.error)throw found.error;
 if(found.data)return found.data;
 if(input.existingRouteSheetId)throw new Error('La hoja de ruta ya no corresponde al fletero, fecha y recorrido seleccionados. Volvé a leer Entregados.');
 const created=await db.from('route_sheets').insert({carrier_id:input.carrierId,delivery_date:input.deliveryDate,run_number:input.runNumber,code,total_theoretical_cash:input.total,has_assistant:input.hasAssistant,status:'Pendiente'}).select('id,code').single();
 if(!created.error)return created.data;
 // Another request may have created the same business route after our lookup.
 // Read that exact identity; never repurpose a different carrier's route by code.
 if(created.error.code==='23505'){
  const concurrent=await lookup().maybeSingle();
  if(concurrent.error)throw concurrent.error;
  if(concurrent.data)return concurrent.data;
 }
 throw created.error;
}
