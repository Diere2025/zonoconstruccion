"use client";
import {useEffect,useRef,type ReactNode,type ClipboardEventHandler} from 'react';

export default function SelectionModal({title,onClose,children,wide=false,disabled=false,onPaste}:{title:string;onClose:()=>void;children:ReactNode;wide?:boolean;disabled?:boolean;onPaste?:ClipboardEventHandler<HTMLDialogElement>}) {
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const modal=ref.current;modal?.showModal();return()=>modal?.close();},[]);
 return <dialog ref={ref} onPaste={onPaste} aria-label={title} onCancel={e=>{e.preventDefault();e.stopPropagation();if(!disabled)onClose();}} onKeyDown={e=>{if(e.key==='Escape'||e.key==='Tab')e.stopPropagation();if(e.key==='Enter'&&e.target instanceof HTMLInputElement)e.preventDefault();}} className={`m-auto max-h-[80vh] w-[calc(100%-2rem)] ${wide?"max-w-3xl":"max-w-xl"} overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 text-slate-800 shadow-xl backdrop:bg-black/40`}>
  <div className="mb-4 flex items-center justify-between gap-3"><h3 className="font-semibold">{title}</h3><button type="button" disabled={disabled} onClick={onClose} className="rounded border px-3 py-2 text-sm">Cerrar</button></div>{children}
 </dialog>;
}
