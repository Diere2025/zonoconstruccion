type Account={id:string;name:string;type?:string;currency?:string;is_active?:boolean};
type Method={id:string;name:string};
/** The account determines the method for freight disbursements. Never infer it from its display name. */
export function freightAccountMethod(accountId:string,accounts:Account[],methods:Method[]):string {
 const account=accounts.find(a=>a.id===accountId&&a.is_active!==false&&a.currency==='ARS');
 if(!account)throw new Error('Elegí una cuenta de salida activa en pesos.');
 const names:Record<string,string[]>={efectivo:['efectivo'],banco:['transferencia'],virtual:['transferencia'],tarjeta:['tarjeta de credito','tarjeta']};
 const options=names[account.type||''];
 if(!options)throw new Error('La cuenta no tiene un tipo de pago configurado. Solicitá su revisión a Administración.');
 const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
 for(const name of options){const matches=methods.filter(m=>normalize(m.name)===name);if(matches.length===1)return matches[0].id;if(matches.length>1)break;}
 throw new Error('Falta configurar un medio de pago único para esta cuenta. Solicitá su revisión a Administración.');
}
