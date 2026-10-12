'use client';
import ClassificationCatalog from './ClassificationCatalog';
import type {FinancialConcept} from '@/lib/financialConcepts';
export default function FinancialConceptManager({onClose,onChanged}:{concepts:FinancialConcept[];onClose:()=>void;onChanged:()=>Promise<void>}){return <div role="dialog" aria-modal="true" aria-label="Clasificación de movimientos" className="fixed inset-0 z-[60] overflow-y-auto bg-slate-50"><ClassificationCatalog onClose={onClose} onChanged={onChanged}/></div>;}
