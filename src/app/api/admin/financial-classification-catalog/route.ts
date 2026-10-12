import {NextResponse} from 'next/server';
import {financialContext} from '@/lib/financialOperations/server';
import {isUuid,OperationError} from '@/lib/financialOperations/validation';
import {allRows} from '@/lib/paymentPlanning/server';
import {readCatalog} from '@/lib/financialClassification/server';
import {catalogConcepts} from '@/lib/financialClassification/model';
import type {FinancialConcept} from '@/lib/financialConcepts';
export const runtime='edge';export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
function fail(e:unknown){const x=e as {message?:string;status?:number;code?:string};return reply({error:x.message||'No se pudo guardar la clasificación.'},x.status||(['40001','23505'].includes(x.code||'')?409:400));}
export async function GET(request:Request){try{const{db}=await financialContext(request);const[items,concepts]=await Promise.all([readCatalog(db),allRows<FinancialConcept>(db.from('financial_concepts').select('*').order('concept').order('id'))]);return reply({items,concepts:catalogConcepts(concepts,items,false)});}catch(e){return fail(e);}}
export async function POST(request:Request){try{const{db,actor}=await financialContext(request,true),b=await request.json();if(!isUuid(b.key)||b.id&&!isUuid(b.id)||!b.data||!['category','concept','person','destination','preset'].includes(b.data.kind)||typeof b.data.name!=='string'||!b.data.name.trim()||b.data.name.length>160||typeof b.data.is_active!=='boolean'||b.id&&(!Number.isInteger(b.version)||b.version<1))throw new OperationError('Completá nombre y estado.');for(const k of ['category_id','concept_id','person_id','destination_id'])if(b.data[k]&&!isUuid(b.data[k]))throw new OperationError('Referencia inválida.');const r=await db.rpc('manage_financial_classification',{p_actor:actor,p_key:b.key,p_id:b.id||null,p_version:b.version||null,p_data:b.data});if(r.error)throw r.error;return reply({saved:r.data});}catch(e){return fail(e);}}
