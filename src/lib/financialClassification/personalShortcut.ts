import type {FinancialConcept} from '@/lib/financialConcepts';
import {guidedOptions} from './guided';

export function personalExtractionShortcut(email:string|undefined,concepts:FinancialConcept[]){
 if(email?.trim().toLowerCase()!=='diego.boveda@gmail.com')return null;
 const options=guidedOptions(concepts.filter(c=>c.movement_type==='Egreso'||c.movement_type==='Mov. Financiero')).filter(o=>o.group==='Extracciones Diego Bóveda'&&o.concept==='Extracción personal'&&!o.detail);
 return options.length===1?options[0].id:null;
}
