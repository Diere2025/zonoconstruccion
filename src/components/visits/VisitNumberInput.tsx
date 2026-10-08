'use client';
import { useState } from 'react';

// Keep an empty editing value visible; numeric conversion belongs to the saved model.
export default function VisitNumberInput({value,onChange,blankZero=false,...props}:{value:number;onChange:(value:number)=>void;blankZero?:boolean} & Omit<React.InputHTMLAttributes<HTMLInputElement>,'value'|'onChange'|'type'>) {
  const [edited,setEdited]=useState<{value:number;text:string}|null>(null);
  const text=edited?.value===value?edited.text:blankZero && value===0?'':String(value);
  return <input {...props} type="number" value={text} onChange={event=>{const text=event.target.value,numeric=Number(text);setEdited({value:numeric,text});onChange(numeric);}}/>;
}
