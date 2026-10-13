import {readBatches} from '../financialOperations/readBatches';
import type {SupabaseClient} from '@supabase/supabase-js';
import {allRows} from '@/lib/paymentPlanning/server';
import {catalogConcepts,type CatalogItem} from './model';
import type {FinancialConcept} from '@/lib/financialConcepts';
export async function readCatalog(db:SupabaseClient){return allRows<CatalogItem>(db.from('financial_classification_items').select('*').order('kind').order('name').order('id'));}
export async function selectableConcepts(db:SupabaseClient,concepts:FinancialConcept[]){return catalogConcepts(concepts,await readCatalog(db));}
// Existing financial identities remain stable; only new classifications take a snapshot of the structured catalog.
export async function movementClassifications(db:SupabaseClient,ids:string[]){const result=new Map<string,Record<string,string>>();await readBatches(ids,async chunk=>{const r=await db.from('financial_classification_snapshots').select('transaction_id,value').in('transaction_id',chunk);if(r.error)throw r.error;for(const x of r.data||[])result.set(x.transaction_id,x.value);});return result;}
