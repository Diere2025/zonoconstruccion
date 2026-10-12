import {NextResponse} from 'next/server';
import {financialContext} from '@/lib/financialOperations/server';
import {OperationError,isUuid} from '@/lib/financialOperations/validation';
import {allRows} from '@/lib/paymentPlanning/server';
import type {FinancialConcept} from '@/lib/financialConcepts';
export const runtime='edge';export const dynamic='force-dynamic';
const reply=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'no-store'}});
function failure(error:unknown){const e=error as {code?:string;message?:string;status?:number};return reply({error:e.message||'No se pudo clasificar el movimiento'},e.status||(['40001','23505'].includes(e.code||'')?409:e.code==='42501'?403:400));}
export async function GET(request:Request){try{const {db,actor}=await financialContext(request);const [rows,concepts]=await Promise.all([db.rpc('unclassified_financial_movements',{p_actor:actor}),allRows<FinancialConcept>(db.from('financial_concepts').select('id,concept,category,sub_category,movement_type,efe_category,is_active,source_row').eq('is_active',true).order('concept').order('id'))]);if(rows.error)throw rows.error;return reply({rows:rows.data||[],concepts:concepts.filter(c=>c.concept.trim().toLowerCase()!=='sin clasificar'&&c.category.trim().toLowerCase()!=='sin clasificar')});}catch(e){return failure(e);}}
export async function PATCH(request:Request){try{const {db,actor}=await financialContext(request,true),body=await request.json();if(!isUuid(body.transaction)||!isUuid(body.concept)||!Number.isSafeInteger(body.version)||body.version<0)throw new OperationError('Movimiento o concepto inválido');const r=await db.rpc('classify_existing_financial_movement',{p_actor:actor,p_transaction:body.transaction,p_concept:body.concept,p_version:body.version});if(r.error)throw r.error;return reply({saved:true});}catch(e){return failure(e);}}
