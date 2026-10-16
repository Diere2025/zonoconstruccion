const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');

test('EERR renders negative daily subtotals and expanded results, preserving positive values and zero dashes',()=>{
 const data={kpis:{totalFacturacion:3000},dailyTimeline:[],expensesByCategory:[],matrix:{days:['13/10','14/10','15/10'],groups:[
  {id:'ingresos',title:'Ingresos',color:'#000',rows:[],subtotal:{total:3000,dailyValues:[1000,1000,1000]}},
  {id:'resultados',title:'Resultados finales',color:'#000',subtotal:{total:-150,dailyValues:[-250,100,0]},rows:[
   {concept:'Utilidad dsp de Impuestos',total:-150,dailyValues:[-250,100,0],pctTot:'-5%'}]}
 ]}};
 let index=0;
 const hooks={...React,useState:initial=>{const slot=index++;return [slot===0?data:slot===1?false:slot===12?{resultados:false}:initial,()=>{}];},
  useEffect:()=>{},useMemo:fn=>fn(),useCallback:fn=>fn,useRef:initial=>({current:initial})};
 const exports={};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/finanzas/EstadoResultadosView.tsx','utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}
 }).outputText,{exports,console,Date,Intl,require:name=>name==='react'?hooks:name==='@/lib/supabase'?{}:name==='@/lib/authenticatedRequest'?{createAuthenticatedRequester:()=>()=>{}}:require(name)});
 const html=renderToStaticMarkup(exports.default());
 const rows=[...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map(match=>match[1]);
 for(const label of ['Resultados finales','Utilidad dsp de Impuestos']){
  const row=rows.find(row=>row.includes(label));assert.ok(row,label);
  const cells=[...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(match=>match[1].replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' '));
  assert.match(cells[3],/-\$\s*250/);assert.match(cells[3],/-25\.0%/);
  assert.match(cells[4],/\$\s*100/);assert.match(cells[4],/10\.0%/);assert.equal(cells[5],'-');
  assert.match(row,/text-rose-600/);
 }
});
