export const freightRoundingLimit=100;
export function freightPaymentLimit(remaining:number){return Math.round((remaining+freightRoundingLimit-0.01)*100)/100;}
export function freightRoundingDifference(amount:number,remaining:number){
 const difference=Math.round((amount-remaining)*100)/100;
 return amount>0&&difference!==0&&Math.abs(difference)<freightRoundingLimit?difference:null;
}
