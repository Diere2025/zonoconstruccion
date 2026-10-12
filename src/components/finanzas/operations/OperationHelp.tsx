import {operationInstructions} from '@/lib/financialOperations/operationCatalog';
import type {OperationType} from '@/lib/financialOperations/types';
export default function OperationHelp({kind}:{kind:OperationType}) {
 return <details className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
  <summary className="cursor-pointer font-semibold text-slate-800">Ver instructivo</summary>
  <div className="mt-3 space-y-2">{operationInstructions[kind].map(text=><p key={text}>{text}</p>)}</div>
 </details>;
}
