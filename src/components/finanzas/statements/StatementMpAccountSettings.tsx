'use client';
import {useState} from 'react';
import type {StatementAccount} from '@/lib/bankStatements/model';
import type {StatementOrderContext} from '@/lib/bankStatements/orderServer';
const control='rounded-lg border bg-white px-3 py-2 text-sm disabled:opacity-50';
function AccountRow({account,context,busy,save}:{account:StatementAccount;context:StatementOrderContext;busy:boolean;save:(account:string,mp:string|null,version?:number)=>Promise<void>}) {
 const mapping=context.mappings.find(row=>row.financial_account_id===account.id);const [selected,setSelected]=useState(mapping?.mp_account_id||'');
 return <div className="flex flex-wrap items-center gap-2 border-t py-2"><span className="min-w-28 text-sm">{account.name}</span><select className={control} aria-label={`Cuenta de Chequeo de Pagos para ${account.name}`} value={selected} disabled={busy} onChange={event=>setSelected(event.target.value)}><option value="">Sin asociación automática</option>{context.accounts.map(item=><option key={item.id} value={item.id}>{item.alias||item.name}</option>)}</select><button className={control} disabled={busy||selected===(mapping?.mp_account_id||'')} onClick={()=>save(account.id,selected||null,mapping?.version)}>Guardar cuenta de Chequeo</button></div>;
}
export default function StatementMpAccountSettings({accounts,context,busy,save}:{accounts:StatementAccount[];context:StatementOrderContext;busy:boolean;save:(account:string,mp:string|null,version?:number)=>Promise<void>}) {
 return <details className="rounded-xl border bg-white p-4"><summary className="cursor-pointer font-semibold">Cuentas de Chequeo de Pagos para vincular pedidos</summary><p className="my-3 text-sm text-slate-500">La vinculación automática solo compara cobros de la cuenta asociada, por número de operación o por importe y día si ambos lados son únicos. Considera el día del extracto y el anterior. Los casos dudosos quedan pendientes.</p>{!context.available?<p className="text-sm text-amber-800">Requiere habilitar la migración v171.</p>:accounts.map(account=><AccountRow key={`${account.id}:${context.mappings.find(row=>row.financial_account_id===account.id)?.version||0}`} account={account} context={context} busy={busy} save={save}/>)}</details>;
}
