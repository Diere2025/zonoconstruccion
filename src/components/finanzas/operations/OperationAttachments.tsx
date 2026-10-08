"use client";
import {useEffect,useRef,useState} from 'react';
import {supabase} from '@/lib/supabase';
import {optimizeImageUpload} from '@/lib/optimizeImageUpload';

export function appendOperationFiles(files:File[],incoming:File[],existingIds:number){if(incoming.some(f=>!['image/jpeg','image/png','image/webp','application/pdf'].includes(f.type)||f.size>(f.type==='application/pdf'?10:30)*1024*1024))throw new Error('Usá imágenes JPG, PNG o WebP de hasta 30 MB, o PDF de hasta 10 MB.');if(files.length+incoming.length>5||existingIds>=20)throw new Error('Podés adjuntar hasta 5 archivos por carga y 20 comprobantes por operación.');return [...files,...incoming];}
export type AttachmentContext={effective_date:string;account_id:string;currency:string;amount:string;operation_type:string;supplier_id?:string;order_id?:string;concept:string;notes?:string};
export async function uploadOperationAttachments(files:File[],context:AttachmentContext,preview=false):Promise<string> {
 if(preview)return crypto.randomUUID();
 const {data:{session}}=await supabase.auth.getSession();
 if(!session)throw new Error('La sesión venció. Volvé a ingresar.');
 const body=new FormData();
 const category=context.operation_type==='customer_collection'?'collection':context.operation_type==='supplier_payment'?'supplier':'other';
 Object.entries({voucherDate:context.effective_date,category,accountId:context.account_id,currency:context.currency,amount:context.amount,supplierId:context.supplier_id||'',orderIds:JSON.stringify(context.order_id?[context.order_id]:[]),counterparty:context.concept,notes:context.notes||''}).forEach(([key,value])=>body.set(key,value));
 const prepared=await Promise.all(files.map(file=>optimizeImageUpload(file,'document')));
 prepared.forEach(file=>body.append('files',file));
 const response=await fetch('/api/admin/treasury-vouchers',{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`},body});
 const data=await response.json();
 if(!response.ok||!data.success)throw new Error(data.error||'No se pudieron cargar los comprobantes.');
 return data.id;
}
function AttachmentPreview({file}:{file:File}) {
 const preview=useRef<HTMLImageElement>(null);
 useEffect(()=>{if(!preview.current)return;const next=URL.createObjectURL(file);preview.current.src=next;return()=>URL.revokeObjectURL(next);},[file]);
 // Local object URLs are previewed without remote image processing.
 // eslint-disable-next-line @next/next/no-img-element
 return file.type.startsWith('image/')?<img ref={preview} alt={file.name} className="h-16 w-16 rounded border object-contain"/>:<span className="text-xs">PDF</span>;
}
export default function OperationAttachments({files,onFilesChange,ids,labels,onRemove,disabled=false}:{files:File[];onFilesChange:(files:File[])=>void;ids:string[];labels?:Array<{id:string;reference:string|null}>;onRemove:(id:string)=>void;disabled?:boolean}) {
 const input=useRef<HTMLInputElement>(null),[error,setError]=useState('');
 const add=(incoming:File[])=>{try{onFilesChange(appendOperationFiles(files,incoming,ids.length));setError('');}catch(e){setError(e instanceof Error?e.message:'No se pudieron adjuntar los archivos.');}};
 return <section tabIndex={0} className="rounded-lg border border-slate-200 p-3" onPaste={e=>{if(!disabled&&e.clipboardData.files.length){e.preventDefault();e.stopPropagation();add(Array.from(e.clipboardData.files));}}}><h3 className="text-sm font-semibold">Comprobantes</h3><p className="mt-1 text-xs text-slate-500">Adjuntá imágenes o PDF. Se cargan y vinculan al guardar la operación.</p><input ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" disabled={disabled} className="hidden" aria-label="Adjuntar comprobantes" onChange={e=>{add(Array.from(e.target.files||[]));e.target.value='';}}/><button type="button" disabled={disabled} onClick={()=>input.current?.click()} className="mt-3 rounded-lg border px-3 py-2 text-sm">Adjuntar comprobante</button>{files.map((f,i)=><div key={`${f.name}-${i}`} className="mt-2 flex items-center gap-2 text-xs"><AttachmentPreview file={f}/><span className="flex-1 break-all">{f.name}</span><button type="button" disabled={disabled} aria-label={`Quitar ${f.name}`} onClick={()=>onFilesChange(files.filter((_,index)=>index!==i))}>Quitar</button></div>)}{ids.map(id=><div key={id} className="mt-2 flex justify-between gap-2 text-xs"><span>{labels?.find(v=>v.id===id)?.reference||'Comprobante adjunto'} · cargado</span><button type="button" disabled={disabled} onClick={()=>onRemove(id)}>Quitar vínculo</button></div>)}{error&&<p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}</section>;
}
