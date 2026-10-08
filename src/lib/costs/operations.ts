import { Definition, Product, Setting, latestSetting, normalize } from './model';
export interface FactoryReport {
  success:boolean;
  modelScores:{producto:string;puntaje:number}[];
  monthlyBreakdown:{monthKey:string;gasCostoUnitario:number;mdoDirectaCostoUnitario:number;luzCostoUnitario:number;opexCostoUnitario:number;isEstimatedMdo?:boolean;isEstimatedLuz?:boolean}[];
  operatorsData:{isWarehouse:boolean;months:Record<string,{salary:number;tanksAssembled:number}>}[];
}
/** Reuse only operating allocations; the old factory report's materials are deliberately ignored. */
export function operatingSetting(def:Definition,p:Product,asOf:string,manual:Setting[],factory:FactoryReport|null):Setting|undefined {
  const selected=latestSetting(manual,p.code,asOf);const origin=selected?.origin||p.origin;
  if(origin==='Compra'||origin==='No usar'||origin==='Por confirmar'||!factory)return selected;
  const month=factory.monthlyBreakdown.find(m=>m.monthKey===asOf.slice(0,7));if(!month)return selected;
  function score(name:string):number|null {const matches=factory!.modelScores.filter(m=>normalize(m.producto)===normalize(name));return matches.length===1?matches[0].puntaje:null;}
  let factor=origin==='Fabricación'?score(p.name):0;
  if(origin==='Ensamblado'){
    for(const c of p.recipe?.components||[]) {
      if(!def.recipes.some(r=>r.code===c.code)||/pieza.*(awaduct|pvc)/.test(normalize(c.name)))continue;
      const body=def.products.find(x=>x.code===c.code);const bodyOrigin=latestSetting(manual,c.code,asOf)?.origin||body?.origin;
      if(/(1000|3000)l/.test(normalize(c.name))&&bodyOrigin!=='Fabricación')continue;
      const bodyScore=score(c.name);if(bodyScore==null){factor=null;break;}factor=(factor||0)+bodyScore*c.quantity;
    }
  }
  const warehouse=factory.operatorsData.filter(o=>o.isWarehouse).map(o=>o.months[asOf.slice(0,7)]).filter(Boolean);
  const salary=warehouse.reduce((n,m)=>n+m.salary,0),assembled=warehouse.reduce((n,m)=>n+m.tanksAssembled,0);
  const assemblyLabor=salary>0&&assembled>0?salary/assembled:undefined;
  const defaults:Setting={code:p.code,effective:asOf,basis:month.isEstimatedMdo||month.isEstimatedLuz?'Estimado':'Asignado'};
  if(factor!=null){defaults.gas=factor*month.gasCostoUnitario;defaults.labor=origin==='Ensamblado'&&assemblyLabor==null?undefined:factor*month.mdoDirectaCostoUnitario+(origin==='Ensamblado'?assemblyLabor||0:0);if(origin==='Fabricación'){defaults.electricity=factor*month.luzCostoUnitario;defaults.overhead=factor*month.opexCostoUnitario;}}
  // Assembly utilities/overheads still require their own allocation; a bought body does not consume rotomolding gas.
  return {...defaults,...selected};
}
