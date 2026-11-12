'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {supabase} from '@/lib/supabase';
import {createAuthenticatedRequester} from '@/lib/authenticatedRequest';
import {buildReport,displayDate,expenseCategories,localYesterday,period,provisionFieldErrors,validateProvisions,type Provisions,type ExpenseCategory,type ExcludedMovement} from '@/lib/eerrNative/model';
import NativeEerrCharts from './NativeEerrCharts';
import NativeEerrMatrix from './NativeEerrMatrix';
import NativeEerrExchanges from './NativeEerrExchanges';
import NativeEerrAdvertising from './NativeEerrAdvertising';
import type { Advertising } from '@/lib/eerrNative/advertising';
import type { ExchangeReview } from '@/lib/eerrNative/exchanges';
const request=createAuthenticatedRequester(supabase);
type Report=ReturnType<typeof buildReport>&{advertising?:Advertising;omittedOrders?:{code:string;reason:string}[];provisions:Provisions;version:number;canSave:boolean;canReviewExchanges:boolean;costUpdatedAt:string;generatedAt:string;migrationNotice:string|null};
const money=(n:number|null)=>n===null?'Pendiente':new Intl.NumberFormat('es-AR',{style:'currency',currency: 'ARS', maximumFractionDigits: 0}).format(n);
const field='rounded border border-slate-300 bg-white px-2 py-1.5 text-slate-900';
const sections = [
  ['summary', 'Resumen'],
  ['advertising', 'Publicidad'],
  ['daily', 'Resultado diario'],
  ['included', 'Importes incluidos'],
  ['pending', 'Pendientes y exclusiones'],
  ['exchanges', 'Cambios'],
  ['excluded', 'Movimientos no sumados'],
  ['provisions', 'Precarga mensual'],
] as const;
type Section = typeof sections[number][0];

function ExcludedMovements({ movements }: { movements: ExcludedMovement[] }) {
 const byCategory = new Map<string, ExcludedMovement[]>();
 for (const movement of movements) {
   const category = movement.category.trim() || 'Sin categoría';
   const group = byCategory.get(category);
   if (group) group.push(movement);
   else byCategory.set(category, [movement]);
 }
 const groups = [...byCategory].sort(([a], [b]) => a.localeCompare(b, 'es-AR'));

 if (!groups.length) return <p className="mt-3 text-sm text-slate-600">No hay movimientos excluidos en el período.</p>;

 return (
   <div className="mt-3 space-y-2">
     {groups.map(([category, rows]) => (
       <details key={category} className="rounded-lg border border-slate-200 text-sm">
         <summary className="cursor-pointer rounded-lg bg-slate-50 px-3 py-2.5 font-medium hover:bg-slate-100">
           {category}{' '}
           <span className="ml-2 text-xs font-normal text-slate-600">
             {rows.length} {rows.length === 1 ? 'movimiento' : 'movimientos'}
           </span>
         </summary>
         <div className="max-h-96 overflow-auto" tabIndex={0} role="region" aria-label={'Movimientos de ' + category}>
           <table className="w-full text-left">
             <thead className="sticky top-0 bg-slate-50 text-xs text-slate-700">
               <tr>
                 <th scope="col" className="px-3 py-2">Fecha</th>
                 <th scope="col" className="px-3 py-2">Concepto</th>
                 <th scope="col" className="px-3 py-2">Referencia</th>
                 <th scope="col" className="px-3 py-2 text-right">Importe</th>
                 <th scope="col" className="px-3 py-2">Motivo</th>
               </tr>
             </thead>
             <tbody>
               {rows.sort((a, b) => b.day.localeCompare(a.day) || a.code.localeCompare(b.code)).map(movement => (
                 <tr key={movement.id} className="border-t border-slate-100">
                   <td className="whitespace-nowrap px-3 py-2">{displayDate(movement.day)}</td>
                   <td className="min-w-36 px-3 py-2 font-medium">{movement.concept.trim() || 'Sin concepto'}</td>
                   <td className="whitespace-nowrap px-3 py-2">{movement.code}</td>
                   <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{money(movement.amount)}</td>
                   <td className="min-w-48 px-3 py-2 text-slate-600">{movement.reason}</td>
                 </tr>
               ))}
             </tbody>
           </table>
         </div>
       </details>
     ))}
   </div>
 );
}

export default function NativeEerrView(){
 const latestDay = localYesterday();
 const [month,setMonth]=useState(latestDay.slice(0,7)),[data,setData]=useState<Report|null>(null),[draft,setDraft]=useState<Provisions>({}),[error,setError]=useState(''),[loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[dirty,setDirty]=useState(false),[notice,setNotice]=useState(''),[reload,setReload]=useState(0);
 const [selectedCutoff, setSelectedCutoff] = useState<string | null>(null);
 const availablePeriod = period(month, latestDay);
 const cutoff = selectedCutoff ?? availablePeriod.cutoff;
 const reportUrl='/api/admin/finanzas/eerr-native?month='+month+'&until='+cutoff;
 const generation=useRef(0);
 const [section, setSection] = useState<Section>('summary');
 const sectionId = useId();
 const provisionPanel = useRef<HTMLElement>(null);

 function selectSection(next: Section) {
   setSection(next);
   document.getElementById(sectionId + '-tab-' + next)?.focus();
 }

 function panelProps(id: Section) {
   return {
     id: sectionId + '-panel-' + id,
     role: 'tabpanel',
     'aria-labelledby': sectionId + '-tab-' + id,
     hidden: section !== id,
     tabIndex: 0,
   };
 }
 const [validationShown,setValidationShown]=useState(false);
 useEffect(() => {
   if (!dirty) return;

   function guardUnload(event: BeforeUnloadEvent) {
     event.preventDefault();
     event.returnValue = '';
   }

   function guardPlanillasLink(event: MouseEvent) {
     if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey ||
         event.shiftKey || event.altKey || !(event.target instanceof Element)) return;
     const link = event.target.closest<HTMLAnchorElement>('a[href="/admin/finanzas/eerr"]');
     if (!link || (link.target && link.target !== '_self')) return;
     if (!window.confirm('Hay una precarga sin guardar. ¿Querés descartarla e ir a EERR Planillas?')) {
       event.preventDefault();
     }
   }

   window.addEventListener('beforeunload', guardUnload);
   document.addEventListener('click', guardPlanillasLink, true);
   return () => {
     window.removeEventListener('beforeunload', guardUnload);
     document.removeEventListener('click', guardPlanillasLink, true);
   };
 }, [dirty]);
 useEffect(()=>{const id=++generation.current;setLoading(true);setData(null);setError('');setDirty(false);setNotice('');setValidationShown(false);request(reportUrl).then((r:Report)=>{if(id===generation.current){setData(r);setDraft(r.provisions);}}).catch((e:Error)=>{if(id===generation.current)setError(e.message);}).finally(()=>{if(id===generation.current)setLoading(false);});return()=>{generation.current++;};},[reportUrl,reload]);
 const followAdvertising=section==='advertising'&&!!data?.advertising&&!loading&&!dirty&&!saving;
 useEffect(()=>{
   if(!followAdvertising)return;
   let active=true;
   let running=false;
   const current=generation.current;
   const timer=window.setInterval(async()=>{
     if(document.hidden||running)return;
     running=true;
     try{
       const updated:Report=await request(reportUrl);
       if(active&&current===generation.current){setData(updated);setDraft(updated.provisions);}
     }catch{
       if(active&&current===generation.current)setError('No se pudo actualizar el seguimiento de Meta. Usá Actualizar para reintentar.');
     }finally{running=false;}
   },5*60*1000);
   return()=>{active=false;window.clearInterval(timer);};
 },[followAdvertising,reportUrl,reload]);
 async function save(){if(!data)return;setValidationShown(true);setError('');setNotice('');let provisions:Provisions;try{provisions=validateProvisions(draft);}catch(e){setError(e instanceof Error?e.message:'Revisá la precarga.');requestAnimationFrame(()=>provisionPanel.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus());return;}setSaving(true);try{await request('/api/admin/finanzas/eerr-native',{method:'PUT',body:JSON.stringify({month,version:data.version,provisions})});const r=await request(reportUrl);setData(r);setDraft(r.provisions);setDirty(false);setValidationShown(false);setNotice('Precarga guardada. Resultado recalculado.');}catch(e){setError(e instanceof Error?e.message:'No se pudo guardar.');}finally{setSaving(false);}}
 function changeMonth(value:string){if(dirty&&!window.confirm('Hay una precarga sin guardar. ¿Querés descartarla y cambiar de mes?'))return;setMonth(value);setSelectedCutoff(null);}
 function changeCutoff(value:string){if(dirty&&!window.confirm('Hay una precarga sin guardar. ¿Querés descartarla y cambiar la fecha de corte?'))return;setSelectedCutoff(value === availablePeriod.cutoff ? null : value);}
 function refresh(){if(dirty&&!window.confirm('Hay una precarga sin guardar. ¿Querés descartarla y recargar?'))return;setReload(v=>v+1);}
 async function saveExchange(orderId:string,review:ExchangeReview){
   const current=generation.current;
   await request('/api/admin/finanzas/eerr-native',{method:'PATCH',body:JSON.stringify({orderId,review})});
   if(current!==generation.current)return;
   const updated:Report=await request(reportUrl);
   if(current===generation.current){setData(updated);setNotice('Seguimiento del cambio guardado.');}
 }
 function edit(category:ExpenseCategory,patch:Partial<NonNullable<Provisions[ExpenseCategory]>>){setDraft(d=>({...d,[category]:{amount:NaN,status:'estimated',note:'',...d[category],...patch}}));setDirty(true);setError('');}
 const currentYear = Number(latestDay.slice(0,4));
 const latestMonth = latestDay.slice(5,7);
 return <section className="w-full min-w-0 space-y-5 rounded-xl border border-slate-200 bg-white p-4 text-slate-900 sm:p-6">
  <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-bold">EERR Sistema</h1><p className="text-sm text-slate-600">Ventas entregadas, CMV identificado y gastos con trazabilidad.</p></div><div className="flex flex-wrap items-center gap-2">
   <label className="text-sm">Mes <select aria-label="Mes del EERR" className={field} disabled={saving} value={month.slice(5)} onChange={e=>changeMonth(month.slice(0,5)+e.target.value)}>{Array.from({length:12},(_,i)=>String(i+1).padStart(2,'0')).map(m=><option key={m} value={m} disabled={month.slice(0,4)===String(currentYear)&&m>latestMonth}>{m}</option>)}</select></label>
   <label className="text-sm">Año <select aria-label="Año del EERR" className={field} disabled={saving} value={month.slice(0,4)} onChange={e=>changeMonth(e.target.value+'-'+(e.target.value===String(currentYear)&&month.slice(5)>latestMonth?latestMonth:month.slice(5)))}>{Array.from({length:currentYear-2019},(_,i)=>currentYear-i).map(y=><option key={y}>{y}</option>)}</select></label>
   <label className="text-sm">Hasta <select aria-label="Fecha de corte del EERR" className={field} disabled={saving} value={cutoff} onChange={e=>changeCutoff(e.target.value)}>{availablePeriod.days.map(day=><option key={day} value={day}>{displayDate(day)}</option>)}</select></label>
   <button className={field} disabled={loading||saving} onClick={refresh}>Actualizar</button>
  </div></div>
  {error&&<p role="alert" className="rounded bg-red-50 p-3 text-red-800">{error}</p>}{notice&&<p role="status" className="rounded bg-green-50 p-3 text-green-800">{notice}</p>}
  {loading&&<p role="status">Calculando el período…</p>}
  {data&&<>
   {dirty&&<p role="status" className="rounded bg-amber-50 p-3 text-sm text-amber-900">Hay una precarga sin guardar. Los importes del EERR corresponden a la última versión guardada; se actualizarán al guardar una precarga válida.</p>}
   <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-sm">
    <p>Período <strong>{displayDate(data.period.start)} al {displayDate(data.period.cutoff)}</strong></p>
    {data.status === 'incomplete' ? (
      <button type="button" onClick={() => selectSection('pending')} className="rounded-md bg-amber-50 px-2.5 py-1 font-medium text-amber-900 hover:bg-amber-100">
        Resultado parcial · {data.issues.length} incidencias
      </button>
    ) : <span className="text-slate-600">Provisional · pendiente de cierre y conciliación</span>}
   </div>
   <div className="flex flex-wrap items-start gap-2">
   <details className="min-w-0 grow rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">
    <summary className="cursor-pointer py-2 font-medium">Notas y criterios del EERR</summary>
    <div className="space-y-2 border-t border-slate-200 py-3">
     <ul className="list-disc space-y-1 pl-5">{data.notices.map(note => <li key={note}>{note}</li>)}</ul>
     <p>{data.advertising?'El consumo de Meta toma el costo y el fee de las recargas utilizadas. Los consumos de Redot se clasifican según su destino.':'Publicidad toma movimientos de caja o la precarga mensual del período.'}</p>
     <p>Las comisiones por pagos con tarjeta vía Payway se registran como «PAYNORTH - Fee» en «Costo Financiera», con la fecha del movimiento de caja.</p>
     {data.migrationNotice && <p className="font-medium">{data.migrationNotice}</p>}
     {data.totals.result===null&&<p>Resultado parcial calculado con los importes identificados. Quedan {data.issues.length} incidencias por conciliar.{data.missingCosts>0&&` Hay ${data.missingCosts} pedidos con CMV incompleto.`}</p>}
    </div>
   </details>
   <a href="/admin/finanzas/eerr" target="_blank" rel="noopener"
      className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50">
     Abrir EERR Planillas ↗
   </a>
   </div>

   <div role="tablist" aria-label="Secciones del EERR" className="flex flex-wrap gap-1.5 rounded-lg bg-slate-100 p-1.5">
    {sections.map(([id, label], index) => {
      const count = id === 'included' ? data.entries.length
        : id === 'pending' ? data.issues.length
        : id === 'exchanges' ? data.exchanges.length
        : id === 'excluded' ? data.excludedMovements.length
        : undefined;
      return (
        <button
          key={id}
          type="button"
          role="tab"
          id={sectionId + '-tab-' + id}
          aria-controls={sectionId + '-panel-' + id}
          aria-selected={section === id}
          tabIndex={section === id ? 0 : -1}
          onClick={() => setSection(id)}
          onKeyDown={event => {
            const destination = {
              ArrowLeft: (index + sections.length - 1) % sections.length,
              ArrowRight: (index + 1) % sections.length,
              Home: 0,
              End: sections.length - 1,
            }[event.key as 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End'];
            if (destination === undefined) return;
            event.preventDefault();
            selectSection(sections[destination][0]);
          }}
          className="rounded-md px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-white/70 aria-selected:bg-white aria-selected:text-indigo-800 aria-selected:shadow-sm"
        >
          {label}
          {count !== undefined && <span className="ml-1.5 rounded bg-slate-200/70 px-1.5 py-0.5 text-xs tabular-nums">{count}</span>}
          {id === 'provisions' && dirty && <span className="ml-1.5 text-xs text-amber-800">Sin guardar</span>}
        </button>
      );
    })}
   </div>

   <section {...panelProps('exchanges')}>
    <NativeEerrExchanges exchanges={data.exchanges} canReview={data.canReviewExchanges} onSave={saveExchange}/>
   </section>

   <section {...panelProps('advertising')}>
    <NativeEerrAdvertising data={data.advertising}/>
   </section>

   <section {...panelProps('summary')} className="space-y-5">
    <NativeEerrMatrix report={data} />
    <details className="rounded-lg border border-slate-200 px-3 py-2">
      <summary className="cursor-pointer text-sm font-semibold">Gastos por rubro y origen</summary>
   <div><p className="mt-2 text-sm text-slate-600">Insumo GLP corresponde a Hipergas.</p><div className="mt-3 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Rubro</th><th>Origen</th><th className="text-right">Incluido al corte</th><th className="text-right">Caja reemplazada</th></tr></thead><tbody>{data.groups.map(g=><tr key={g.category} className="border-b"><td className="p-2">{g.category}</td><td>{g.mode}</td><td className="text-right">{money(g.amount)}</td><td className="text-right">{g.mode.startsWith('Precarga')?money(g.replaced):'—'}</td></tr>)}</tbody></table></div></div>
    </details>
   </section>

   <section {...panelProps('provisions')} ref={provisionPanel}>
    <h2 className="font-semibold">Precarga mensual</h2><p className="my-3 text-sm text-slate-600">La precarga es opcional: el EERR calcula con los movimientos registrados. Activá solo los rubros que querés reemplazar y completá importe, estado y fundamento. Ingresá el importe del mes completo. Se divide entre los días de lunes a sábado del mes y se imputa hasta la fecha de corte. Un cero explícito también reemplaza los movimientos. Confirmado describe la precarga, no certifica todo el EERR.</p>{!data.canSave&&<p role="alert" className="mb-3 rounded bg-amber-50 p-3 text-sm text-amber-900">La precarga está deshabilitada: {data.migrationNotice||'no se pudo habilitar su almacenamiento.'} Una vez habilitada, pulsá Actualizar.</p>}
    {data.advertising&&<p className="mb-3 text-sm text-slate-600">Publicidad y su fee se calculan desde el consumo de Meta.</p>}
    <fieldset disabled={saving||!data.canSave} className="space-y-3">{expenseCategories.filter(category=>!data.advertising||!['Publicidad','Publicidad (Fee)'].includes(category)).map((category,index)=>{const v=draft[category],errors=validationShown&&v?provisionFieldErrors(v):{};return <div key={category} className="rounded border p-3">
     <label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={!!v} onChange={e=>{if(e.target.checked)edit(category,{});else{setDraft(d=>{const next={...d};delete next[category];return next;});setDirty(true);setError('');}}}/>{category}</label>
     {v&&<div className="mt-2 grid gap-2 sm:grid-cols-3">
      <label className="text-sm">Importe mensual ARS<input aria-label={'Importe '+category} aria-invalid={!!errors.amount} aria-describedby={errors.amount?`provision-amount-${index}`:undefined} className={field+' block w-full'} type="number" min="0" step="0.01" max="1000000000000" value={Number.isNaN(v.amount)?'':v.amount} onChange={e=>edit(category,{amount:e.target.value===''?NaN:Number(e.target.value)})}/>{errors.amount&&<span id={`provision-amount-${index}`} className="mt-1 block text-red-700">{errors.amount}</span>}</label>
      <label className="text-sm">Estado<select aria-label={'Estado '+category} aria-invalid={!!errors.status} className={field+' block w-full'} value={v.status} onChange={e=>edit(category,{status:e.target.value as 'estimated'|'confirmed'})}><option value="estimated">Estimado</option><option value="confirmed">Confirmado</option></select>{errors.status&&<span className="mt-1 block text-red-700">{errors.status}</span>}</label>
      <label className="text-sm">Fundamento<input aria-label={'Fundamento '+category} aria-invalid={!!errors.note} aria-describedby={errors.note?`provision-note-${index}`:undefined} className={field+' block w-full'} maxLength={500} value={v.note} onChange={e=>edit(category,{note:e.target.value})} placeholder="Comprobante, período o criterio"/>{errors.note&&<span id={`provision-note-${index}`} className="mt-1 block text-red-700">{errors.note}</span>}</label>
     </div>}
    </div>;})}<button disabled={!dirty||saving} onClick={save} className="rounded bg-indigo-700 px-4 py-2 text-white disabled:opacity-50">{saving?'Guardando…':'Guardar precarga y recalcular'}</button></fieldset>
   </section>

   <section {...panelProps('pending')} className="space-y-4">
    <div><h2 className="font-semibold">Incidencias del período</h2>{data.issues.length?<ul className="mt-3 max-h-96 space-y-2 overflow-auto text-sm">{data.issues.map((x,i)=><li key={i}><strong>{x.reference}</strong>: {x.reason}</li>)}</ul>:<p className="mt-2 text-sm">Sin incidencias automáticas. Revisar las advertencias de cobertura antes de cerrar.</p>}</div>
   {!!data.omittedOrders?.length&&<div><h3 className="font-semibold">Pedidos excluidos por criterio ({data.omittedOrders.length})</h3><ul className="mt-3 max-h-96 space-y-2 overflow-auto text-sm">{data.omittedOrders.map((o,i)=><li key={i}><strong>{o.code}</strong>: {o.reason}</li>)}</ul></div>}
   </section>

   <section {...panelProps('daily')} className="space-y-4">
   <NativeEerrCharts days={data.days} partial={data.totals.result===null}/>
    <h2 className="mb-3 font-semibold">Resultado diario</h2><div className="overflow-x-auto"><table className="mt-3 w-full text-sm"><thead><tr><th className="text-left">Fecha</th><th>Ventas</th><th>CMV identificado</th><th>Gastos</th><th>Rendimientos</th><th>Saldo diario identificado</th></tr></thead><tbody>{data.days.map(d=><tr key={d.day} className="border-b text-right"><td className="py-2 text-left">{displayDate(d.day)}</td><td>{money(d.revenue)}</td><td>{money(d.cmv)}</td><td>{money(d.expenses)}</td><td>{money(d.otherIncome)}</td><td>{money(d.result)}</td></tr>)}</tbody></table></div>
   </section>

   <section {...panelProps('included')}>
    <h2 className="mb-3 font-semibold">Detalle de importes incluidos</h2><div className="max-h-96 overflow-auto"><table className="mt-3 w-full text-sm"><thead><tr className="text-left"><th>Fecha</th><th>Referencia</th><th>Rubro / origen</th><th>Detalle</th><th>Importe</th></tr></thead><tbody>{data.entries.map((e,i)=><tr className="border-b" key={i}><td className="whitespace-nowrap py-2">{displayDate(e.day)}</td><td>{e.reference}</td><td>{e.category}<small className="block text-slate-500">{e.source}</small></td><td>{e.note}</td><td className="whitespace-nowrap text-right">{money(e.amount)}</td></tr>)}</tbody></table></div>
   </section>

   <section {...panelProps('excluded')}>
    <h2 className="font-semibold">Movimientos no sumados</h2>
    <ExcludedMovements movements={data.excludedMovements} />
   </section>
  </>}
 </section>;
}
