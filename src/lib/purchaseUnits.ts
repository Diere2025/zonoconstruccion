export type PurchaseUnit='kg'|'unit';
export const PLASTIC_BAG_KG=20;
export function suggestedPurchaseUnit(supplier:string,name:string):PurchaseUnit {
 const normalized=(s:string)=>s.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();
 return ['centuma','mundileno','victech'].includes(normalized(supplier).trim())&&/recuperado|virgen|polietileno|plastico|pead|pebd/.test(normalized(name))?'kg':'unit';
}
export const bagsToKg=(bags:number)=>Math.round(bags*PLASTIC_BAG_KG*1000)/1000;
export const kgToBags=(kg:number)=>Math.round(kg/PLASTIC_BAG_KG*100000)/100000;
export function purchaseUnitNote(unit:PurchaseUnit,currency:string){return unit==='kg'?`Cantidad en kg. Precio en ${currency}/kg.`:`Cantidad en unidades. Precio en ${currency}/unidad.`;}
