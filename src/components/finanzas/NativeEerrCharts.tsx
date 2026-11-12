'use client';

import {useEffect,useRef,useState} from 'react';
import {dailyProgress,displayDate,type buildReport} from '@/lib/eerrNative/model';

type Day=ReturnType<typeof buildReport>['days'][number];
const money=(value:number)=>new Intl.NumberFormat('es-AR',{style:'currency',currency: 'ARS', maximumFractionDigits: 0}).format(value);
const compact=(value:number)=>'$ '+new Intl.NumberFormat('es-AR',{notation:'compact',maximumFractionDigits:1}).format(value);
const height=240,left=66,right=18,top=18,bottom=34;

export default function NativeEerrCharts({days,partial}:{days:Day[];partial:boolean}) {
 const rows=dailyProgress(days),[mode,setMode]=useState<'result'|'flows'>('result'),[selected,setSelected]=useState('');
 const chartContainer=useRef<HTMLDivElement>(null),[width,setWidth]=useState(640);
 useEffect(()=>{const el=chartContainer.current;if(!el)return;const observer=new ResizeObserver(entries=>setWidth(Math.max(240,Math.floor(entries[0].contentRect.width))));observer.observe(el);return()=>observer.disconnect();},[]);
 if(!rows.length)return null;
 const index=Math.max(0,rows.findIndex(r=>r.day===selected)),active=selected&&rows.some(r=>r.day===selected)?rows[index]:rows[rows.length-1];
 const activeIndex=rows.findIndex(r=>r.day===active.day);
 const step=(width-left-right)/rows.length,x=(i:number)=>left+step*(i+.5);
 function scale(values:number[]){let min=Math.min(0,...values),max=Math.max(0,...values);if(min===max)max=min+1;const pad=(max-min)*.08;min-=pad;max+=pad;return {min,max,y:(v:number)=>top+(max-v)/(max-min)*(height-top-bottom)};}
 const dailyScale=scale(rows.flatMap(r=>mode==='flows'?[r.revenue,r.totalCosts]:[r.identifiedResult])),cumulativeScale=scale(rows.map(r=>r.cumulativeResult));
 const ticks=[...new Set([0,...Array.from({length:5},(_,i)=>Math.round(i*(rows.length-1)/4))])];
 function selectAt(event:React.PointerEvent<SVGSVGElement>){const bounds=event.currentTarget.getBoundingClientRect(),position=(event.clientX-bounds.left)/bounds.width*width;const i=Math.max(0,Math.min(rows.length-1,Math.floor((position-left)/step)));setSelected(rows[i].day);}
 function axes(s:ReturnType<typeof scale>){return <>
  {[s.max,0,s.min].map((value,i)=><g key={i}><line x1={left} x2={width-right} y1={s.y(value)} y2={s.y(value)} stroke={value===0?'#94a3b8':'#e2e8f0'} strokeDasharray={value===0?undefined:'3 4'}/><text x={left-8} y={s.y(value)+4} textAnchor="end" fontSize="11" fill="#64748b">{compact(value)}</text></g>)}
  {ticks.map(i=><text key={i} x={x(i)} y={height-10} textAnchor="middle" fontSize="12" fill="#64748b">{displayDate(rows[i].day).slice(0,5)}</text>)}
 </>;}
 const path=rows.map((r,i)=>`${i?'L':'M'} ${x(i)} ${cumulativeScale.y(r.cumulativeResult)}`).join(' ');
 const qualifier=partial?'parcial':'provisional';
 return <section aria-label="Gráficos de avance diario" className="min-w-0 space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
  <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Avance diario</h2><p className="text-xs text-slate-600">Desde {displayDate(rows[0].day)} hasta {displayDate(rows[rows.length-1].day)}. Importes en ARS.</p></div>
   <label className="text-sm">Detalle del día <select aria-label="Detalle del día en gráficos" className="ml-1 rounded border bg-white px-2 py-1.5" value={active.day} onChange={e=>setSelected(e.target.value)}>{rows.map(r=><option key={r.day} value={r.day}>{displayDate(r.day)}</option>)}</select></label>
  </div>
  <div className="grid min-w-0 gap-4 xl:grid-cols-2">
   <article className="min-w-0 overflow-hidden rounded-lg border bg-white p-3">
    <div className="mb-2 flex flex-wrap items-center gap-2" role="group" aria-label="Vista del gráfico diario"><button type="button" aria-pressed={mode==='result'} onClick={()=>setMode('result')} className="rounded border px-2 py-1 text-xs aria-pressed:bg-indigo-700 aria-pressed:text-white">Resultado diario</button><button type="button" aria-pressed={mode==='flows'} onClick={()=>setMode('flows')} className="rounded border px-2 py-1 text-xs aria-pressed:bg-indigo-700 aria-pressed:text-white">Ventas y costos</button></div>
    <h3 className="text-sm font-medium">{mode==='result'?`Resultado ${qualifier} por día`:'Ventas frente a CMV + gastos'}</h3>
    <div ref={chartContainer} className="mt-2 overflow-x-auto"><svg role="img" aria-label={mode==='result'?'Gráfico de resultado diario':'Gráfico de ventas y costos diarios'} viewBox={`0 0 ${width} ${height}`} className="w-full" onPointerMove={selectAt} onPointerDown={selectAt}>
     <title>{mode==='result'?`Resultado ${qualifier} por día`:'Ventas y costos diarios'}</title>{axes(dailyScale)}
     {rows.map((r,i)=>{const bar=Math.min(24,step*.7);return <g key={r.day} opacity={activeIndex===i?1:.8}>{mode==='result'?<rect x={x(i)-bar/2} width={bar} y={Math.min(dailyScale.y(0),dailyScale.y(r.identifiedResult))} height={Math.max(1,Math.abs(dailyScale.y(r.identifiedResult)-dailyScale.y(0)))} fill={r.identifiedResult>=0?'#059669':'#e11d48'}/>:<>
      <rect x={x(i)-bar/2} width={bar/2} y={Math.min(dailyScale.y(0),dailyScale.y(r.revenue))} height={Math.max(1,Math.abs(dailyScale.y(0)-dailyScale.y(r.revenue)))} fill="#4f46e5"/>
      <rect x={x(i)} width={bar/2} y={Math.min(dailyScale.y(0),dailyScale.y(r.totalCosts))} height={Math.max(1,Math.abs(dailyScale.y(0)-dailyScale.y(r.totalCosts)))} fill="#f59e0b"/>
     </>}<title>{displayDate(r.day)}: {mode==='result'?money(r.identifiedResult):`Ventas ${money(r.revenue)}; CMV + gastos ${money(r.totalCosts)}`}{r.missingCosts?' · CMV incompleto':''}</title></g>;})}
     <line x1={x(activeIndex)} x2={x(activeIndex)} y1={top} y2={height-bottom} stroke="#64748b" strokeDasharray="3 3"/>
    </svg></div>
    <p className="mt-1 text-xs text-slate-600">{mode==='result'?'Verde: saldo positivo · Rojo: saldo negativo':'Violeta: ventas · Ámbar: CMV + gastos'}</p>
   </article>
   <article className="min-w-0 overflow-hidden rounded-lg border bg-white p-3"><h3 className="text-sm font-medium">Resultado {qualifier} acumulado</h3><p className="mt-1 text-xs text-slate-500">Suma de los saldos diarios identificados.</p>
    <div className="mt-2 overflow-x-auto"><svg role="img" aria-label="Gráfico de resultado acumulado" viewBox={`0 0 ${width} ${height}`} className="w-full" onPointerMove={selectAt} onPointerDown={selectAt}>
     <title>Resultado {qualifier} acumulado</title>{axes(cumulativeScale)}<path d={path} fill="none" stroke="#4f46e5" strokeWidth="2.5" strokeLinejoin="round"/>
     {rows.map((r,i)=><circle key={r.day} cx={x(i)} cy={cumulativeScale.y(r.cumulativeResult)} r={i===activeIndex?5:2.5} fill={r.cumulativeResult>=0?'#059669':'#e11d48'}><title>{displayDate(r.day)}: {money(r.cumulativeResult)}</title></circle>)}
     <line x1={x(activeIndex)} x2={x(activeIndex)} y1={top} y2={height-bottom} stroke="#64748b" strokeDasharray="3 3"/>
    </svg></div><p className="mt-1 text-xs text-slate-600">La línea cero permite ver cuándo el saldo acumulado pasa a positivo o negativo.</p>
   </article>
  </div>
  <div aria-label="Detalle del día seleccionado" className="rounded-lg border bg-white p-3"><h3 className="mb-2 text-sm font-semibold">Detalle del {displayDate(active.day)}</h3><dl className="grid grid-cols-2 gap-3 text-sm lg:grid-cols-6">{[['Ventas',active.revenue],['CMV',active.cmv],['Gastos',active.expenses],['Rendimientos',active.otherIncome],['Saldo diario',active.identifiedResult],['Acumulado',active.cumulativeResult]].map(([label,value])=><div key={String(label)}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 font-medium">{money(value as number)}</dd></div>)}</dl>{active.missingCosts>0&&<p className="mt-2 text-sm text-amber-900">CMV incompleto: hay {active.missingCosts} pedidos con costo pendiente en este día.</p>}</div>
  {partial&&<p className="text-xs text-amber-900">Los gráficos muestran saldos parciales con los importes identificados. Las incidencias pendientes también afectan la conciliación del acumulado.</p>}
 </section>;
}
