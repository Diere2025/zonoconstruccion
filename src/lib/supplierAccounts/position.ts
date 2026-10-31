type Position={currency:string;pending_amount:number|string};
type Source={currency:string;amount:number|string;document_applied:number|string;opening_applied:number|string;included:boolean;kind:string};
type Document={currency:string;pending_amount:number|string;included:boolean};
/** Independent proof of the signed ledger: open debt minus remaining credits/advances. */
export function supplierPosition(workspace:{positions:Position[];sources:Source[];documents:Document[]},ledger:{balance_ars:number;balance_usd:number}){
 const totals={ARS:{opening:0,documents:0,unapplied:0,net:0,ledger:Math.round(ledger.balance_ars*100),difference:0},USD:{opening:0,documents:0,unapplied:0,net:0,ledger:Math.round(ledger.balance_usd*100),difference:0}};
 function cents(value:number|string){const n=Number(value);if(!Number.isFinite(n))throw new Error('Importe no válido en la posición del proveedor.');return Math.round(n*100);}
 for(const p of workspace.positions){if(p.currency!=='ARS'&&p.currency!=='USD')throw new Error('Moneda desconocida.');totals[p.currency].opening+=cents(p.pending_amount);}
 for(const d of workspace.documents){if(!d.included)continue;if(d.currency!=='ARS'&&d.currency!=='USD')throw new Error('Moneda desconocida.');totals[d.currency].documents+=cents(d.pending_amount);}
 for(const s of workspace.sources){if(!s.included||s.kind==='opening')continue;if(s.currency!=='ARS'&&s.currency!=='USD')throw new Error('Moneda desconocida.');totals[s.currency].unapplied+=cents(s.amount)-cents(s.document_applied)-cents(s.opening_applied);}
 for(const c of ['ARS','USD'] as const){const t=totals[c];t.net=t.opening+t.documents-t.unapplied;t.difference=t.net-t.ledger;for(const key of Object.keys(t) as (keyof typeof t)[])t[key]/=100;}
 return {totals,balanced:totals.ARS.difference===0&&totals.USD.difference===0};
}
