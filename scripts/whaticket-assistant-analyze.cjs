const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'../output/whaticket-assistant-2026-09-30');
const read=name=>JSON.parse(fs.readFileSync(path.join(root,name)));
const save=(name,d)=>fs.writeFileSync(path.join(root,name),JSON.stringify(d,null,2));
const rules={escaleras:/escaler/i,latex:/l[aá]tex|zonolatex/i,cooper:/cooper/i,tanques:/\btanque\b(?!s?\s*el[eé]ctric)|tanques\s+de\s+agua/i,biodigestores:/biodigest/i,impermeabilizacion:/membrana|impermeabili/i};
function families(message){
 const s=message.text||'';
 if(/asignad[oa] autom[aá]ticamente|conversaci[oó]n (?:resuelta|cerrada)/i.test(s))return [];
 let found=Object.entries(rules).filter(([,r])=>r.test(s)).map(([k])=>k);
 if(found.length>2)return []; // A catalog menu does not establish product interest.
 if(found.includes('escaleras')&&/debajo de una escalera|bajo la escalera/i.test(s))found=found.filter(f=>f!=='escaleras');
 if(found.includes('biodigestores'))found=found.filter(f=>f!=='biodigestores').concat(/autolimpi/i.test(s)?'biodigestores_autolimpiantes':/convencional|tradicional/i.test(s)?'biodigestores_convencionales':'biodigestores_sin_tipo');
 return found;
}
const intents={precio:/precio|cu[aá]nto (?:sale|cuesta)|presupuesto|oferta|promo/i,cuotas:/cuota|tarjeta|visa|inter[eé]s|financi/i,envio:/env[ií]o|envian|envi[aá]n|localidad|llegan|reparto/i,plazo:/cu[aá]ndo|demora|plazo|d[ií]a.*entrega|viernes|s[aá]bado/i,medidas:/medida|di[aá]metro|altura|ancho|largo|litro|\blts\b|capacidad/i,compra:/quiero (?:comprar|confirmar)|confirmo|lo compro|tomar.*pedido/i,reclamo:/reclamo|no (?:me )?(?:lleg[oó]|funciona)|roto|fall[ao]|devoluci/i,tecnico:/instal|infiltr|plomero|suelo|absorci|gas|superior|inferior/i};
const sample=read('muestra-local-redactada.json');
const records=sample.map(t=>({...t,families:[...new Set(t.messages.flatMap(families))]}));
const holdoutRefs=new Set(records.filter(t=>t.families.length).filter((_,i)=>i%5===0).map(t=>t.ref));
const overview=Object.fromEntries(Object.keys(intents).map(k=>[k,records.filter(t=>t.messages.some(m=>m.direction==='incoming'&&intents[k].test(m.text))).length]));
const counts={};const diagnosis={};
for(const family of [...Object.keys(rules).filter(x=>x!=='biodigestores'),'biodigestores_convencionales','biodigestores_autolimpiantes','biodigestores_sin_tipo']){
 const rows=records.filter(t=>t.families.includes(family));counts[family]=rows.length;
 const development=rows.filter(t=>!holdoutRefs.has(t.ref));
 diagnosis[family]={ticketsWithSpecificMention:rows.length,completeWindow:rows.filter(t=>t.windowComplete).length,developmentCount:development.length,holdoutCount:rows.length-development.length,intents:Object.fromEntries(Object.entries(intents).map(([k,re])=>[k,development.filter(t=>t.messages.some(m=>m.direction==='incoming'&&re.test(m.text))).length])),mediaPending:rows.reduce((n,t)=>n+t.messages.filter(m=>m.mediaPending).length,0),refs:development.slice(0,50).map(t=>t.ref),confirmedSales:null,salesLimitation:'No ticket-to-ERP order mapping verified. Status closed and personal details do not prove sale.'};
}
save('diagnostico-estructurado.json',{rule:'Specific mentions in individual messages; broad catalog menus excluded. Product family remains a candidate classification, not manual adjudication.',sampleSize:records.length,counts,intents:overview,byFamily:diagnosis,holdoutReferences:[...holdoutRefs],mediaPending:records.reduce((n,t)=>n+t.messages.filter(m=>m.mediaPending).length,0)});
const summary=read('resumen.json');
summary.rawKeywordCandidates=summary.rawKeywordCandidates||summary.counts;
summary.counts=counts;
summary.classificationLimitation='Specific individual-message mentions; broad menus excluded. Still requires manual adjudication; conversations can include multiple families.';
save('resumen.json',summary);
// Only safe commercial questions are copied to the review set; free-form contact data stays out.
const safeQuestion=s=>s.length>8&&s.length<220&&!/[0-9]{4,}|\[dato|\[nombre|\[email|\[contacto|calle|domicilio|entre |mi nombre|a nombre|direcci/i.test(s)&&/precio|cuota|promo|medida|capacidad|instal|carga|color|pintura|litro|gas|tarjeta|cu[aá]nto/i.test(s);
save('consultas-reservadas.json',records.filter(t=>holdoutRefs.has(t.ref)).flatMap(t=>t.messages.filter(m=>m.direction==='incoming'&&safeQuestion(m.text)).slice(0,3).map(m=>({ref:t.ref,messageRef:m.ref,families:t.families,question:m.text.replace(/\nLink: \[enlace\]/g,''),expected:'Pending independent commercial review; not scored against a native AI.'}))));
const quick=read('respuestas-rapidas.json'),materials=read('materiales-respuestas.json'),products=read('productos-erp.json');
const skuNames=['GardenLife - Escalera Multifunción Alum 16 escalones (TE1700)','Zono Látex Pro Lavable (20L)','Equilibrio Enduído Int /Ext (4L)','Equilibrio Fijador Sellador (4L)','Rodillo Simil Lana 22x40','Guante Moteado'];
save('base-comercial-piloto.json',{checkedAt:'2026-09-30',mode:'draft_for_review',pricesExpireAt:'2026-09-30T21:00:00-03:00',priceWarning:'Snapshot only; refresh from ERP before any client pilot. Prices zero/internal/inactive/discontinued must never be auto-quoted.',products:skuNames.map(name=>read('validacion-erp-piloto.json').products.find(p=>p.name===name)),promotions:[{key:'latex-x2',amount:119600,source:'Whaticket /latexx2 and /promoslatex; ERP discount not independently verified'},{key:'latex-renovacion',amount:89900,source:'Whaticket /combolatex and ERP components + Descuento - Combo Latex / MEP Enduído Fijador (-4000); arithmetic 63800+15200+14900-4000'},{key:'latex-pintor',amount:96130,source:'Whaticket /comboc/accesorios and ERP components + combo discount -4000; arithmetic 63800+15200+14900+4400+1830-4000'},{key:'escaleras-x2',amount:298000,source:'Whaticket /escalera and ERP Descuento - Escaleras -20000; derived 159000*2-20000; quantity applicability still needs confirmation'}],approvedForSimulation:['escaleras','latex'],blockedFacts:['shipping coverage by locality','delivery lead-time per operation','installment values and fees','stock for imported variants','warranty and specs against manufacturer','ERP eligibility flags and promotions'],rules:{latex:'White only. No colored option or toner combo in the pilot.',tanques:'Own production; ERP stock does not automatically block sales.',biodigestores:'Own production; technical sizing and installation need a person.',cooper:'Replenishment stated by Diego; model and actual delivery still require confirmation.',universal:'No replenishment; only confirmed available variants.'},quickResponses:quick.filter(q=>['escalera','zonolatex','latexx2','combolatex','comboc/accesorios','promoslatex'].includes(q.shortcut)),materials:materials.filter(q=>['escalera','zonolatex','latexx2','combolatex','comboc/accesorios','promoslatex'].includes(q.shortcut)),mediaApproval:'Attached media IDs verified; image contents still require visual commercial approval.'});
const pilot=read('base-comercial-piloto.json');
pilot.availabilityPolicy=read('politica-stock.json');
pilot.rules.escaleras='Diego confirmed available stock and replenishment. Ignore ERP stock for this assistant and pilot; do not block or exclude escaleras because of ERP inventory. Delivery conditions still require current information.';
pilot.blockedFacts=pilot.blockedFacts.map(f=>f==='stock for imported variants'?'stock for other imported variants; escaleras excluded by Diego confirmation':f);
pilot.commercialTerms=read('condiciones-comerciales.json');
pilot.blockedFacts=pilot.blockedFacts.filter(f=>!['shipping coverage by locality','delivery lead-time per operation','installment values and fees'].includes(f));
pilot.blockedFacts.push('Geographic classification of an unrecognized locality; exceptions for Sundays and holidays');
save('base-comercial-piloto.json',pilot);
console.log(JSON.stringify({counts,holdout:[...holdoutRefs].length,intents:overview}));
