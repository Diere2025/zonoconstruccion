import { normalizedStatementText, statementCents, type StatementEntry } from './model';
import type { FinancialConcept } from '@/lib/financialConcepts';
export type StatementOrder = { id:string; code:string; customer:string|null; order_date:string|null; payment_id:string|null; payment_amount:string|null };
export type StatementOrderLink = { order_id:string; code:string; kind:'automatic'|'manual'; method:string; version:number; payment_id:string|null; stale?:boolean };
export type StatementMpAccount = {id:string;name:string;alias:string|null};
export type StatementMpMapping = {financial_account_id:string;mp_account_id:string;version:number};
export function isStatementCollection(entry:Pick<StatementEntry,'description'|'signed_amount'|'financial_concept_id'>,concepts:FinancialConcept[]) {
 if(statementCents(entry.signed_amount)<=0)return false;
 if(entry.financial_concept_id){const concept=concepts.find(item=>item.id===entry.financial_concept_id);return !!concept&&normalizedStatementText(concept.concept)==='cobro'&&normalizedStatementText(concept.category)==='recaudacion';}
 return ['cobro','ingreso de dinero','dinero recibido'].includes(normalizedStatementText(entry.description));
}
