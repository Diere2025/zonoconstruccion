export interface GasReading {fecha:string;hora:string;timestamp:number;tipo:string;porcentajeAntes:number;cargaLitros:number;precioLitro:number}
/** Use the level before each refill as the endpoint, so a boundary refill is counted only in the following interval. */
export function measuredGas(events:GasReading[],capacity:number) {
  const sorted=[...events].sort((a,b)=>a.timestamp-b.timestamp);
  const readings=sorted.filter(e=>e.porcentajeAntes>0||e.tipo==='Lectura');
  if(readings.length<2)return null;
  const first=readings[0],last=readings[readings.length-1];
  const refills=sorted.filter(e=>e.tipo==='Recarga'&&e.cargaLitros>0&&e.timestamp>=first.timestamp&&e.timestamp<last.timestamp);
  const loaded=refills.reduce((n,e)=>n+e.cargaLitros,0);
  const liters=capacity*(first.porcentajeAntes-last.porcentajeAntes)/100+loaded;
  if(liters<0)return null;
  const price=loaded>0?refills.reduce((n,e)=>n+e.cargaLitros*e.precioLitro,0)/loaded:first.precioLitro;
  return {first,last,liters,price,cost:liters*price,loaded};
}
