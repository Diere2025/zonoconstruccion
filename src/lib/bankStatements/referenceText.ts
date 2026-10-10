import {normalizedStatementText} from './model';
export function referenceText(...parts:Array<string|null|undefined>){const seen=new Set<string>();return parts.filter((part):part is string=>{if(!part?.trim())return false;const key=normalizedStatementText(part);if(seen.has(key))return false;seen.add(key);return true;}).join(' · ');}
