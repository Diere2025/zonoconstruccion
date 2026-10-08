"use client";
import React from 'react';
import SearchableSelect from './SearchableSelect';
type Props=React.SelectHTMLAttributes<HTMLSelectElement> & {searchLabel?:string};
/** Long lists always use search; short choices retain the native selector. */
export default function AdaptiveSelect({children,searchLabel,...props}:Props){
 const options=React.Children.toArray(children).filter(React.isValidElement).map(child=>{
  const option=child as React.ReactElement<{value?:string|number;children?:React.ReactNode}>;
  return {value:String(option.props.value ?? ''),label:React.Children.toArray(option.props.children).join('')};
 });
 if(options.filter(o=>o.value!=='').length<=4)return <select {...props}>{children}</select>;
 const label=searchLabel || props['aria-label'] || props.name || 'Seleccionar opción';
 return <SearchableSelect id={props.id} label={label} hideLabel value={String(props.value ?? '')} options={props.required?options.filter(o=>o.value!==''):options} disabled={props.disabled} required={props.required} clearOnSearch={false}
  placeholder={options.find(o=>o.value==='')?.label || 'Escribí para buscar…'} onChange={value=>{
   const next=value==='' && !props.required && !options.some(o=>o.value==='')?(options[0]?.value || ''):value;
   props.onChange?.({target:{value:next},currentTarget:{value:next}} as React.ChangeEvent<HTMLSelectElement>);
  }}/>;
}
