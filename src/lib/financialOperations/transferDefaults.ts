export function transferDefaults(accounts:Array<{id:string;name:string;currency:string;is_active:boolean}>,sourceId?:string) {
 const active=accounts.filter(a=>a.is_active);
 const source=(sourceId?active.find(a=>a.id===sourceId):undefined) || active.find(a=>a.name.trim().toLowerCase()==='cuenta mp2') || active.find(a=>a.currency==='ARS') || active[0];
 const destinations=active.filter(a=>a.id!==source?.id && a.currency===source?.currency);
 return {account_id:source?.id || '',destination_account_id:destinations.find(a=>a.name.trim().toLowerCase()==='cuenta mp1')?.id || destinations[0]?.id || ''};
}
