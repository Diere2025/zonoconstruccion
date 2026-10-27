import {reopeningReason} from './reopening';
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
export async function dispatchReopeningState(db:any,actor:string,dispatchId:string){
 if(!uuid(dispatchId))throw new Error('LOG inválido.');
 const result=await db.rpc('logistics_dispatch_reopening_state',{p_actor:actor,p_dispatch:dispatchId});if(result.error)throw result.error;return result.data;
}
export async function reopenDispatch(db:any,actor:string,body:any){
 if(!uuid(body.dispatchId)||!uuid(body.key)||!Number.isInteger(body.version)||body.version<1)throw new Error('Actualizá el LOG antes de reabrir.');
 const reason=reopeningReason(body.reason);
 const result=await db.rpc('reopen_logistics_dispatch',{p_actor:actor,p_dispatch:body.dispatchId,p_version:body.version,p_key:body.key,p_reason:reason});if(result.error)throw result.error;return result.data;
}
