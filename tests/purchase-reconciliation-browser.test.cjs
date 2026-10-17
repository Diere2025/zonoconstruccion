// Exercises the actual component with an isolated API fixture; never accesses the ERP database.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),esbuild=require('esbuild');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=process.cwd(),temp=path.join(root,'tmp/reconciliation-browser');fs.mkdirSync(temp,{recursive:true});
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const receipt=(n,quantity)=>({id:id(n),supplier_id:id(1),delivery_slip_number:'R-'+n,reception_date:'2026-10-17T01:00:00Z',currency:'ARS',supplier:{name:'Proveedor prueba'},items:[{id:id(n+100),product_name:'Artículo '+n,quantity_received:quantity,unit_cost:100,product:{name:'Artículo '+n,sku:'SKU-'+n},order:{unit_cost:100,purchase_orders:{oc_code:'OC-'+n}}}]});
const fixture={receipts:[receipt(10,10),receipt(11,5)],bills:[],lines:[]};
(async()=>{
 const bundle=await esbuild.build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import View from './src/components/admin/PurchaseReconciliation';createRoot(document.getElementById('root')).render(<View onChanged={()=>window.changed=(window.changed||0)+1} onClose={()=>window.closed=true}/>);`,resolveDir:root,loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic',plugins:[{name:'isolated-auth',setup(build){build.onResolve({filter:/^@\/lib\/supabase$/},()=>({path:'mock',namespace:'fixture'}));build.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const supabase={auth:{getSession:async()=>({data:{session:{access_token:'fixture-only'}}})}};`,loader:'js'}));}}]});
 const {compile}=require('@tailwindcss/node');const cssCompiler=await compile(fs.readFileSync('src/app/globals.css','utf8'),{base:path.join(root,'src/app'),onDependency(){}});
 const tokens=['src/components/admin/PurchaseReconciliation.tsx','src/components/ui/ErpDateInput.tsx'].flatMap(file=>fs.readFileSync(file,'utf8').match(/[A-Za-z0-9_:/!.[\]%-]+/g)||[]);const css=cssCompiler.build(tokens);
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/bundle.js'?'text/javascript':req.url==='/style.css'?'text/css':'text/html');res.end(req.url==='/bundle.js'?bundle.outputFiles[0].text:req.url==='/style.css'?css:'<!doctype html><html lang="es"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/bundle.js"></script></html>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({headless:true,channel:'msedge'});const page=await browser.newPage({locale:'en-US',timezoneId:'America/Los_Angeles',viewport:{width:1440,height:1050}});const errors=[],posted=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/admin/purchase-reconciliation',async route=>{if(route.request().method()==='POST'){
    const p=route.request().postDataJSON();posted.push(p);
    if(p.void){const b=fixture.bills.find(b=>b.id===p.id);if(b)b.status='Anulado';}
    else if(!p.confirm){fixture.bills.push({id:p.id,supplier_id:p.supplierId,number:p.number,document_type:p.type,bill_date:p.date,due_date:p.dueDate,currency:p.currency,declared_total:p.declaredTotal,calculated_total:p.declaredTotal,perceptions_ba:p.perceptionsBa,perceptions_caba:p.perceptionsCaba,perceptions_other:p.perceptionsOther,notes:p.notes,resolution:p.resolution,status:'Pendiente',version:1,supplier:{name:'Proveedor prueba'}});fixture.lines.push(...p.lines.map(l=>({bill_id:p.id,receipt_item_id:l.receiptItemId,quantity:l.quantity,unit_price:l.unitPrice,discount:l.discount,vat:l.vat,expected_unit_cost:100})));}
    await route.fulfill({json:{id:p.id}});
  }else await route.fulfill({json:fixture});});
  await page.goto('http://127.0.0.1:'+server.address().port);await page.getByRole('button',{name:'Completar comprobante y conciliar'}).first().click();
  await page.getByRole('textbox',{name:'Fecha del comprobante',exact:true}).fill('17/10/2026');
  await page.getByRole('textbox',{name:'Vencimiento del comprobante',exact:true}).fill('30/10/2026');
  assert.equal(await page.getByRole('textbox',{name:'Fecha del comprobante',exact:true}).inputValue(),'17/10/2026');
  assert.equal(await page.locator('input[type=date]').first().inputValue(),'2026-10-17');
  assert.equal(await page.locator('input[type=date]').first().evaluate(e=>getComputedStyle(e).opacity),'0');
  await page.getByLabel('Número',{exact:true}).fill('FC-PRUEBA');
  await page.getByLabel('Tipo',{exact:true}).selectOption('Factura');
  await page.getByLabel('Cantidad a facturar 1',{exact:true}).fill('4');
  await page.getByLabel('Precio 1',{exact:true}).fill('110');
  await page.getByLabel('Agregar otro remito',{exact:true}).selectOption(id(11));
  assert.equal(await page.getByLabel('Cantidad a facturar 1',{exact:true}).inputValue(),'4','Adding another receipt preserves edits');
  await page.getByLabel('Percepción Buenos Aires',{exact:true}).fill('10');
  await page.getByLabel('Total del comprobante',{exact:true}).fill('1147.4');
  assert.equal(await page.getByRole('button',{name:'Confirmar conciliación',exact:true}).isDisabled(),true);
  await page.getByLabel('Resolución de diferencias (obligatoria para conciliar)',{exact:true}).fill('Precio aceptado por Compras');
  await page.screenshot({path:path.join(temp,'conciliacion.png'),fullPage:true});
  await page.getByRole('button',{name:'Confirmar conciliación',exact:true}).click();
  await page.getByRole('heading',{name:'Recepciones pendientes de facturar',exact:true}).waitFor();
  assert.equal(posted.length,1);assert.equal(posted[0].confirm,true);assert.equal(posted[0].date,'2026-10-17');assert.equal(posted[0].dueDate,'2026-10-30');assert.equal(posted[0].lines.length,2);assert.equal(posted[0].lines[0].quantity,4);assert.equal(posted[0].lines[1].quantity,5);assert.equal(posted[0].perceptionsBa,10);assert.equal(posted[0].declaredTotal,1147.4);
  assert.equal(await page.getByText('16/10/2026',{exact:true}).count(),2,'Receipt instants use Buenos Aires independently of browser zone');
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Completar comprobante y conciliar'}).first().click();assert.equal(await page.getByRole('textbox',{name:'Fecha del comprobante',exact:true}).getAttribute('type'),'text');
  await page.getByRole('textbox',{name:'Fecha del comprobante',exact:true}).fill('31/02/2026');assert.equal(await page.getByRole('textbox',{name:'Fecha del comprobante',exact:true}).evaluate(e=>e.checkValidity()),false);
  await page.getByLabel('Número',{exact:true}).fill('INVALID-DATE');await page.getByRole('button',{name:'Guardar para revisar',exact:true}).click();assert.equal(posted.length,1,'Invalid visual date cannot silently save the previous ISO date');
  await page.getByRole('textbox',{name:'Fecha del comprobante',exact:true}).fill('17/10/2026');await page.getByLabel('Número',{exact:true}).fill('BORRADOR-1');await page.getByRole('button',{name:'Guardar para revisar',exact:true}).click();
  await page.getByRole('heading',{name:'Recepciones pendientes de facturar',exact:true}).waitFor();await page.getByRole('button',{name:'Completar comprobante y conciliar'}).first().click();assert.equal(await page.getByLabel('Número',{exact:true}).inputValue(),'BORRADOR-1','Completing a receipt resumes its saved draft instead of duplicating input');
  await page.getByLabel('Motivo de anulación',{exact:true}).fill('Borrador descartado');await page.getByRole('button',{name:'Anular comprobante',exact:true}).click();await page.getByRole('heading',{name:'Recepciones pendientes de facturar',exact:true}).waitFor();assert.equal(posted.length,3);assert.equal(posted[2].void,true);
  assert.deepEqual(errors,[]);console.log('Browser (en-US, Los Angeles): DD/MM/YYYY, Buenos Aires instants, inherited lines, partial/multiple receipts, tax totals, explicit approval, ISO payload and narrow viewport: OK');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
