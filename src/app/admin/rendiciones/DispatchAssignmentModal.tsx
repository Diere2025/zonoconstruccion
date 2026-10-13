"use client";
import {useEffect,useRef,useState} from 'react';
import {displayReportDate} from '@/components/ui/ReportDateRangePicker';
type Item={carrierName:string;deliveryDate:string;routeNumberStr:string;dispatchCode?:string;dispatchCandidates?:Array<{code:string;carrier_name:string}>};
export default function DispatchAssignmentModal({item,onAssign,onClose}:{item:Item;onAssign:(code:string)=>void;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 const [value,setValue]=useState(item.dispatchCode||((item.dispatchCandidates||[]).length===1?item.dispatchCandidates![0].code:''));
 const [error,setError]=useState('');
 useEffect(()=>{const el=dialog.current;if(el&&!el.open)el.showModal();return()=>{if(el?.open)el.close();};},[]);
 const assign=()=>{const code=value.trim().toUpperCase();if(!/^LOG_REC_\d+[A-Z]?$/.test(code)){setError('Ingresá un código válido, por ejemplo LOG_REC_05435.');return;}onAssign(code);};
 return <dialog ref={dialog} onCancel={onClose} aria-labelledby="dispatch-assignment-title" className="m-auto w-[min(94vw,520px)] rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl backdrop:bg-slate-950/60">
 <div className="border-b border-slate-100 p-5"><h2 id="dispatch-assignment-title" className="text-lg font-bold text-slate-900">Asignar logística</h2><p className="mt-1 text-sm text-slate-500">{item.carrierName} · {displayReportDate(item.deliveryDate)} · {item.routeNumberStr}</p></div>
 <div className="space-y-4 p-5"><p className="text-sm text-slate-600">Este recorrido no tiene un LOG asignado en Entregados. Elegí la salida o ingresá su código. R1 y R2 pueden compartir el mismo LOG y el pago total del fletero.</p>
 {!!item.dispatchCandidates?.length&&<label className="block text-sm font-medium text-slate-700">Salidas de esta fecha y fletero<select value={item.dispatchCandidates.some(o=>o.code===value)?value:''} onChange={e=>{setValue(e.target.value);setError('');}} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2"><option value="">Seleccionar salida</option>{item.dispatchCandidates.map(o=><option key={o.code} value={o.code}>{o.code} · {o.carrier_name}</option>)}</select></label>}
 <label className="block text-sm font-medium text-slate-700">Código de logística<input autoFocus value={value} onChange={e=>{setValue(e.target.value.toUpperCase());setError('');}} placeholder="LOG_REC_05435" className="mt-1 w-full rounded-lg border border-slate-300 p-2" /></label>
 <p className="text-xs text-slate-500">La asignación queda vinculada en el ERP al generar. No modifica la planilla.</p>{error&&<p role="alert" className="text-sm text-red-700">{error}</p>}</div>
 <div className="flex justify-end gap-2 border-t border-slate-100 p-4"><button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm">Cancelar</button><button type="button" onClick={assign} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Asignar LOG</button></div></dialog>;
}
