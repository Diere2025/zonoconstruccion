const fs=require('node:fs'),path=require('node:path');
const {initial,simulate}=require('./whaticket-assistant-simulator.cjs');
const root=path.resolve(__dirname,'../output/whaticket-assistant-2026-09-30');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'base-comercial-piloto.json')));
const cases=[
 ['Precio de escalera 4x4','verified_price'],['Precio latex 20 litros','verified_price'],
 ['Promo dos baldes de latex','promotion_conditions_pending'],['Precio latex 10 litros','variant_not_in_pilot'],
 ['Escalera negra Omaha','variant_not_in_pilot'],['Pintura rosada','white_only'],
 ['Envio de latex','locality_required'],['Envio de latex','shipping_unverified',{locality:'Localidad de prueba'}],
 ['Latex en 6 cuotas sin interes','verified_installments'],['Quiero comprar latex','purchase_intent'],
 ['Envio de latex a La Plata','verified_shipping',{locality:'La Plata'}],
 ['Escalera en 12 cuotas','unsupported_installment_plan'],
 ['Reclamo de tanque roto','complaint'],['Donde esta mi pedido','existing_order'],
 ['Soy proveedor','supplier'],['Busco trabajo','job'],['Quiero una persona','human_requested'],
 ['','uninterpreted_media',{uninterpretedMedia:true}],['Comprobante transferencia realizada','payment_review'],
 ['Biodigestor para instalar','technical_fact_unverified'],['Pintura para interior antihumedad','technical_fact_unverified'],
 ['Precio latex','commercial_data_unverified',{at:'2026-10-02T16:00:00Z'}],
];
const rows=cases.map(([text,expected,extra={}],i)=>{const r=simulate(initial(),{id:String(i),type:'customer',at:'2026-09-30T16:00:00Z',text,...extra},catalog);return {type:'synthetic',question:text,expectedReason:expected,proposedResponse:r.answer,actualReason:r.reason,queue:r.queue,pass:r.reason===expected,correction:r.reason===expected?null:'Fix before client use',sent:r.sent};});
const real=JSON.parse(fs.readFileSync(path.join(root,'consultas-reservadas.json'))).filter(q=>q.families.some(f=>['escaleras','latex'].includes(f))).map(q=>{const r=simulate({...initial(),product:q.families.includes('latex')?'latex':'escaleras'},{id:q.messageRef,type:'customer',at:'2026-09-30T16:00:00Z',text:q.question},catalog);return {type:'reserved_real',ref:q.ref,question:q.question,proposedResponse:r.answer,actualReason:r.reason,expected:'Independent commercial evaluation pending',pass:null,sent:false};});
const result={mode:'offline_rules_only',nativeWabotTested:false,commercialUtilityScore:null,syntheticPassed:rows.filter(x=>x.pass).length,syntheticTotal:rows.length,rows:[...rows,...real]};
fs.writeFileSync(path.join(root,'matriz-pruebas.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({syntheticPassed:result.syntheticPassed,total:result.syntheticTotal,reservedReal:real.length}));
if(rows.some(x=>!x.pass))process.exitCode=1;
