const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{const browser=await chromium.launch({headless:true,channel:'chrome'});try{
 for(const [id,alias,mp,date,amount] of [['7b241292-a4d8-46ca-9fa2-9ea6b61427fa','pagoszono.26','MP4','22/10/2026','447.200'],['000101a7-1f12-4102-9d9e-871da7f7b326','diegozono.mp','MP3','06/10/2026','500.000']]){
 const context=await browser.newContext({locale:'en-US',timezoneId:'America/Argentina/Buenos_Aires'});
 await context.addInitScript(alias=>{window.sent=[];window.chrome={runtime:{onMessage:{addListener(){}},sendMessage:(message,done)=>{if(message.action.startsWith('RESERVE_MONITOR_'))return done({ok:true,active:false,enabled:false});window.sent.push(message);done({ok:true,data:{success:true,captured:message.payload.rows.length}});}},storage:{local:{get:(_keys,done)=>done({accountName:alias,webhookUrl:'https://example.invalid/api/mp-webhook',secretToken:'test'}),set(){}},onChanged:{addListener(){}}}};},alias);
 await context.route('**/*',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:`<h1>Movimientos de tu reserva</h1><h2>${date}</h2><div>12:31<br>Dinero reservado<br>+ $${amount}</div>`}));
 const page=await context.newPage();await page.goto(`https://www.mercadopago.com.ar/savings/movements/${id}`);await page.addScriptTag({path:'chrome-extension-mp/reserve-parser.js'});await page.addScriptTag({path:'chrome-extension-mp/reserve-reader.js'});
 await page.getByText('Reserva Diego · '+mp,{exact:true}).waitFor();await page.getByRole('button',{name:'Leer visibles',exact:true}).click();await page.waitForFunction(()=>window.sent.length===1);
 const message=await page.evaluate(()=>window.sent[0]);assert.equal(message.payload.account,alias);assert.equal(message.payload.rows.length,1);assert.equal(message.payload.rows[0].amount,mp==='MP4'?'447200.00':'500000.00');assert.equal(message.payload.rows[0].occurredAt,mp==='MP4'?'2026-10-22T12:31:00-03:00':'2026-10-06T12:31:00-03:00');assert.equal(new URL(message.url).pathname,'/api/mp-reserve-web');
 fs.mkdirSync('output/mp4-reserve',{recursive:true});await page.screenshot({path:`output/mp4-reserve/${mp}-en-US.png`,fullPage:true});await context.close();
 }
 console.log('English browser: MP3 and MP4 widgets, DD/MM/YYYY dates, correct amount, account and endpoint passed (mocked ERP).');
 }finally{await browser.close();}})().catch(e=>{console.error(e.message);process.exitCode=1});
