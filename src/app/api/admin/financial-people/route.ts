import {NextResponse} from 'next/server';
import {financialContext} from '@/lib/financialOperations/server';
import {isUuid,OperationError} from '@/lib/financialOperations/validation';
export const runtime='edge';export const dynamic='force-dynamic';
function failure(e:unknown){const x=e as {status?:number;code?:string;message?:string};return NextResponse.json({error:x.code==='23505'&&/financial_people_unique_cuit/.test(x.message||'')?'Ya existe un registro con ese CUIT/CUIL.':x.message||'No se pudo gestionar el padrón.'},{status:x.status||(['23505','40001'].includes(x.code||'')?409:400)});}
export async function GET(request:Request){try{
 const {db,actor}=await financialContext(request);const people=[];
 for(let start=0;;start+=500){const page=await db.from('financial_people').select('*,financial_people_aliases(alias,source)').order('full_name').order('id').range(start,start+499);if(page.error)throw page.error;people.push(...(page.data||[]));if((page.data||[]).length<500)break;}
 const permission=await db.rpc('can_manage_financial_operations',{p_user_id:actor});if(permission.error)throw permission.error;
 return NextResponse.json({people,can_write:permission.data},{headers:{'Cache-Control':'no-store'}});
}catch(e){return failure(e);}}
export async function POST(request:Request){try{
 const {db,actor}=await financialContext(request,true),body=await request.json(),p=body.data;
 if(!isUuid(body.key)||body.id&&!isUuid(body.id)||body.id&&(!Number.isInteger(body.version)||body.version<1))throw new OperationError('Referencia inválida.');
 if(!p||typeof p.full_name!=='string'||p.full_name.trim().length<2||p.full_name.length>160||!Array.isArray(p.kinds)||!p.kinds.length||p.kinds.some((k:unknown)=>!['employee','temporary','carrier','professional','cleaning','transport','beneficiary'].includes(String(k)))||typeof p.is_active!=='boolean')throw new OperationError('Completá nombre y relación.');
 if(p.cuit&&!(typeof p.cuit==='string'&&/^\d{11}$/.test(p.cuit)))throw new OperationError('CUIT: indicá 11 dígitos, sin guiones.');
 if(typeof p.role!=='string'||p.role.length>160||!/^\d+(\.\d{1,2})?$/.test(String(p.base_salary))||Number(p.base_salary)>=1e12)throw new OperationError('Puesto o sueldo base inválido.');
 if(body.id&&(typeof body.reason!=='string'||body.reason.trim().length<3||body.reason.length>1000))throw new OperationError('Indicá el motivo del cambio.');
 const data={full_name:p.full_name.trim(),kinds:[...new Set(p.kinds)],cuit:p.cuit||'',role:p.role,base_salary:String(p.base_salary),is_active:p.is_active};
 const result=await db.rpc('manage_financial_person',{p_actor:actor,p_key:body.key,p_id:body.id||null,p_version:body.version||null,p_data:data,p_reason:body.reason||'Alta manual'});if(result.error)throw result.error;
 return NextResponse.json({person:result.data},{headers:{'Cache-Control':'no-store'}});
}catch(e){return failure(e);}}
