// Headless UI test with synthetic API responses. No real ERP rows are written.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
process.loadEnvFile('.env.local');
const base = process.env.VISITS_TEST_URL || 'http://127.0.0.1:3000';
const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname;
const seller = randomUUID(), installer = randomUUID(), caseId = randomUUID();
const kits = [{ id: randomUUID(), name: 'Kit Instalación Convencional 600L', sku: 'DEMO-600', price: 1000 }, { id: randomUUID(), name: 'Kit Instalación Autolimpiante 700L', sku: 'DEMO-700', price: 1200 }];
const extra_products=[{code:'additional',name:'Adicionales Instalación Biofort',product_id:randomUUID(),unit:'metro',unit_price:30000},{code:'termination',name:'Terminación Instalación Biofort',product_id:randomUUID(),unit:'unidad',unit_price:0}];
const component={id:randomUUID(),name:'Caño físico de ensayo',sku:'PIPE',price:100};
const people = [{ id: seller, name: 'Vendedora de ensayo', roles: ['seller'] }, { id: installer, name: 'Instalador de ensayo', roles: ['instalador'] }];
let v = null, appointments = [], quotes = [], events = [], writes = 0, checks = 0;
const errors = [];
function summary() { return { appointments: v?.visit_count || 0, opportunities: v?.visit_count ? 1 : 0, won: v?.visit_count && v.outcome === 'won' ? 1 : 0, pending: v?.visit_count && v.outcome === 'pending' ? 1 : 0, lost: v?.visit_count && v.outcome === 'lost' ? 1 : 0, conversion: v?.visit_count && v.outcome === 'won' ? 100 : 0, reasons: v?.visit_count && v.outcome === 'lost' ? { [v.outcome_reason]: 1 } : {} }; }
async function mock(context, role) {
  const userId = role === 'seller' ? seller : installer;
  const user = { id: userId, email: `ui-${role}@example.invalid`, role: 'authenticated', aud: 'authenticated', user_metadata: {}, app_metadata: {} };
  const session = { access_token: `synthetic-${role}`, refresh_token: 'synthetic', expires_at: Math.floor(Date.now()/1000)+3600, expires_in: 3600, token_type: 'bearer', user };
  await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: `sb-${host.split('.')[0]}-auth-token`, session });
  await context.route(`https://${host}/**`, async route => {
    const url = new URL(route.request().url());
    const body = url.pathname.includes('/auth/v1/user') ? user : url.pathname.includes('/rest/v1/sellers') ? { id: userId, full_name: role === 'seller' ? 'Vendedora de ensayo' : 'Instalador de ensayo', role, roles: [role], seller_type: 'minorista' } : [];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await context.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url()), endpoint = url.pathname;
    let result = [];
    if (endpoint === '/api/visits/session') result = { id: userId, name: role === 'seller' ? 'Vendedora de ensayo' : 'Instalador de ensayo', commercial: role === 'seller', administrator: false, default_installer_id: installer, kits, people,extra_products };
    else if (endpoint.startsWith('/api/visits/order-draft/')) result={visit:v,quote:quotes[0],products:[...kits,component,...extra_products.map(p=>({id:p.product_id,name:p.name,sku:null,price:p.unit_price}))],kit_components:Object.fromEntries(kits.map(k=>[k.id,[{product_id:component.id,quantity:3}]])),whaticket_link:'https://whaticket.example.test/internal/123',prepared_for:seller};
    else if (endpoint === '/api/visits/list') result = { visits: v ? [v] : [], total: v ? 1 : 0, summary: summary() };
    else if (endpoint === '/api/visits/agenda') result = { appointments, visits: v ? [v] : [] };
    else if (endpoint.startsWith('/api/visits/case/')) result = { visit: v, appointments, quotes, events, orders: [], attachments: [] };
    else if (endpoint.startsWith('/api/visits/read/')) result = { ok: true };
    else if (endpoint === '/api/visits/command') {
      const { command, data: d } = req.postDataJSON(); writes++;
      if (command === 'create') v = { ...d, id: caseId, number: 1, version: 1, created_by: seller, interest_kit: kits.find(k => k.id === d.kit_id), final_kit: null, outcome: 'pending', outcome_reason: 'contact', outcome_note: '', outcome_at: null, next_action: 'Contactar al cliente', next_at: new Date(Date.now()+86400000).toISOString(), next_owner_id: installer, contact_status: 'none', quote_amount: null, quote_status: '', quote_id: null, last_visit_at: null, visit_count: 0, payment_amount: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      else {
        assert.equal(req.postDataJSON().version, v.version);
        v.version++;
        if (command === 'kit') v.final_kit = kits.find(k => k.id === d.kit_id);
        if (command === 'contact') v.contact_status = d.result;
        if (command === 'appointment') appointments.push({ ...d, id: randomUUID(), case_id: v.id, note: d.body, result: '', performed_at: null });
        if (command === 'visit_result') { const ap = appointments.find(a => a.id === d.appointment_id); Object.assign(ap, { status: d.status, result: d.body, performed_at: d.performed_at, technical: d.technical }); v.visit_count++; v.last_visit_at = d.performed_at; }
        if (command === 'quote') { const q = { ...d, id: randomUUID(), kit: kits.find(k => k.id === d.kit_id), number: quotes.length+1, total: d.lines.reduce((n,l)=>n+l.quantity*l.unit_price,0), created_at: new Date().toISOString() }; quotes.unshift(q); v.quote_amount=q.total;v.quote_id=q.id;v.quote_status=q.status; }
        if (command === 'outcome') { v.outcome=d.outcome;v.outcome_reason=d.reason;v.outcome_note=d.body;v.outcome_at=d.at;v.next_action=d.next_action;v.next_at=d.next_at;v.next_owner_id=d.next_owner_id;if(d.outcome==='won')v.installation_date=d.installation_date || null; }
        if(command==='payment'){if(d.payment_kind==='deposit')v.deposit_amount=(v.deposit_amount || 0)+Number(d.amount);else v.payment_amount+=Number(d.amount);}
      }
      events.unshift({ id: randomUUID(), actor_id: userId, kind: command, body: d.body || v.request_reason, data: { input: d, after: structuredClone(v) }, created_at: new Date().toISOString() });
      result = { id: v.id, version: v.version };
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) });
  });
}
let browser;
(async () => {
  fs.mkdirSync('output/visits-tests', { recursive: true });
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); await mock(ctx, 'seller');
  const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}/visitas`); await page.getByRole('heading', { name: 'Seguimiento de visitas', exact: true }).waitFor({ timeout: 60000 });
  await page.getByRole('button', { name: 'Nueva visita', exact: true }).click();
  let form = page.getByRole('dialog');
  await form.getByRole('textbox', { name: 'Cliente *', exact: true }).fill('Cliente ficticio BIOFORT');
  await form.getByRole('textbox', { name: 'Teléfono *', exact: true }).fill('1100000000');
  await form.getByRole('combobox', { name: /Localidad/ }).fill('Otro');await form.getByRole('option',{name:'Otro (escribir localidad)',exact:true}).click();await form.getByRole('textbox',{name:'Escribir localidad *',exact:true}).fill('La Plata');
  await form.getByRole('textbox', { name: 'Dirección de la obra', exact: true }).fill('Obra de ensayo 123');
  assert.equal(await form.getByRole('combobox',{name:'Día aproximado',exact:true}).inputValue(),'installer');assert.equal(await form.getByRole('combobox',{name:'Hora aproximada',exact:true}).inputValue(),'installer');checks++;
  await form.getByRole('combobox',{name:'Día aproximado',exact:true}).selectOption('specify');
  await form.locator('input[type=date]').first().fill('2026-10-15');assert.equal(await form.getByRole('textbox',{name:'Día aproximado (opcional)',exact:true}).inputValue(),'15/10/2026');checks++;
  await form.getByRole('textbox', { name: 'Motivo de la visita *', exact: true }).fill('Relevamiento para instalación');
  await form.getByRole('combobox', { name: 'Kit de interés *', exact: true }).selectOption(kits[0].id);
  await form.getByRole('combobox', { name: 'Instalador', exact: true }).selectOption(installer);
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();
  await page.getByRole('heading', { name: 'Cliente ficticio BIOFORT', exact: true }).waitFor(); checks++;
  assert.equal(v.scheduled_date,'2026-10-15');assert.equal(v.scheduled_time,'');checks++;
  await page.getByRole('button', { name: 'Definir kit final', exact: true }).click(); form = page.getByRole('dialog');
  await form.getByRole('combobox', { name: 'Kit finalmente seleccionado', exact: true }).selectOption(kits[1].id);
  await form.getByRole('textbox', { name: 'Motivo del cambio / observación', exact: true }).fill('Cliente necesita autolimpiante');
  await form.getByRole('button', { name: 'Guardar', exact: true }).click(); await form.waitFor({ state: 'hidden' });
  assert.equal(v.interest_kit.id, kits[0].id); assert.equal(v.final_kit.id, kits[1].id); checks++;
  await page.getByRole('button', { name: 'Coordinar visita', exact: true }).click(); form = page.getByRole('dialog');
  await form.getByRole('combobox', { name: 'Estado', exact: true }).selectOption('confirmed');
  await form.getByLabel('El cliente confirmó la franja', { exact: true }).check(); await form.getByLabel('El instalador confirmó disponibilidad', { exact: true }).check();
  await form.getByRole('button', { name: 'Guardar', exact: true }).click(); await form.waitFor({ state: 'hidden' }); checks++;
  await page.getByRole('button', { name: 'Registrar resultado', exact: true }).click(); form = page.getByRole('dialog');
  await form.getByRole('textbox', { name: 'Qué se habló y cuál fue el resultado *', exact: true }).fill('Visita realizada, se recomendó kit autolimpiante');
  await form.getByRole('button', { name: 'Guardar', exact: true }).click(); await form.waitFor({ state: 'hidden' }); assert.equal(v.visit_count, 1); checks++;
  await page.getByRole('button', { name: 'Cargar presupuesto', exact: true }).click(); form = page.getByRole('dialog');
  await form.getByLabel('Concepto 1', { exact: true }).fill('Kit y mano de obra');await form.getByLabel('Precio unitario 1',{exact:true}).fill('');assert.equal(await form.getByLabel('Precio unitario 1',{exact:true}).inputValue(),'');checks++;await form.getByLabel('Precio unitario 1', { exact: true }).fill('1200000');
  await form.getByRole('button',{name:'Adicionales Instalación Biofort',exact:true}).click();await form.getByLabel('Cantidad 2',{exact:true}).fill('');assert.equal(await form.getByLabel('Cantidad 2',{exact:true}).inputValue(),'');await form.getByLabel('Cantidad 2',{exact:true}).fill('4');assert.equal(await form.getByLabel('Precio unitario 2',{exact:true}).inputValue(),'30000');checks++;
  await form.getByRole('button',{name:'Terminación Instalación Biofort',exact:true}).click();await form.getByLabel('Precio unitario 3',{exact:true}).fill('10000');checks++;
  await form.getByRole('combobox', { name: 'Estado', exact: true }).selectOption('sent');
  assert.equal(await form.getByLabel('Hora · Cuándo se comunicó',{exact:true}).count(),0);await form.getByRole('textbox',{name:'Cuándo se comunicó',exact:true}).fill('06/10/2026');checks++;
  await form.getByRole('textbox', { name: 'Alcance y condiciones de pago *', exact: true }).fill('Kit e instalación. Pago por transferencia.');
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();await form.waitFor({ state: 'hidden' }); checks++;
  assert.equal(quotes[0].lines[1].description,'Adicionales Instalación Biofort');assert.equal(quotes[0].lines[1].quantity,4);assert.equal(quotes[0].lines[2].description,'Terminación Instalación Biofort');checks++;
  assert.ok(quotes[0].communicated_at.startsWith('2026-10-06'));checks++;
  await page.getByRole('button',{name:'Informar cobro de visita / seña',exact:true}).click();form=page.getByRole('dialog');await form.getByRole('combobox',{name:'Concepto del cobro',exact:true}).selectOption('deposit');await form.getByLabel('Importe cobrado en esta ocasión',{exact:true}).fill('20000');await form.getByLabel('Detalle / referencia del comprobante',{exact:true}).fill('Seña ficticia');await form.getByRole('button',{name:'Guardar',exact:true}).click();await form.waitFor({state:'hidden'});assert.equal(v.deposit_amount,20000);assert.equal(v.payment_amount,0);checks++;
  await page.getByRole('button', { name: 'Registrar resultado comercial', exact: true }).click(); form = page.getByRole('dialog');
  await form.getByRole('combobox', { name: 'Resultado comercial', exact: true }).selectOption('lost');
  await form.getByRole('textbox', { name: 'Explicación del caso *', exact: true }).fill('Cliente indicó presupuesto insuficiente');
  const before = writes; await form.getByRole('button', { name: 'Guardar', exact: true }).click();
  assert.equal(await form.getByRole('combobox', { name: 'Motivo de no concreción *', exact: true }).evaluate(el => el.validity.valid), false); assert.equal(writes, before); checks++;
  await form.getByRole('combobox', { name: 'Motivo de no concreción *', exact: true }).selectOption('price'); await form.getByRole('button', { name: 'Guardar', exact: true }).click(); await form.waitFor({ state: 'hidden' }); assert.equal(v.outcome, 'lost'); checks++;
  await page.screenshot({ path: 'output/visits-tests/visit-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Actualizar / reabrir seguimiento', exact: true }).click(); form = page.getByRole('dialog');
  await form.getByRole('combobox', { name: 'Resultado comercial', exact: true }).selectOption('won');await form.getByRole('combobox',{name:'Fecha de instalación',exact:true}).selectOption('defined');await form.getByRole('textbox',{name:'Día de instalación',exact:true}).fill('20/10/2026'); await form.getByRole('textbox', { name: 'Qué confirmó el cliente y por qué medio *', exact: true }).fill('Confirmó por WhatsApp el kit autolimpiante y presupuesto'); await form.getByRole('button', { name: 'Guardar', exact: true }).click();await page.getByRole('heading',{name:'¿Deseás registrar el pedido o vincularlo a un pedido actual?',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Vincular a un pedido actual',exact:true}).count(),1);await page.getByRole('button',{name:'Vincular a un pedido actual',exact:true}).click();assert.equal(await page.getByRole('searchbox',{name:'Buscar pedido por cliente',exact:true}).evaluate(el=>el===document.activeElement),true);checks++;await page.getByRole('button',{name:'Actualizar / reabrir seguimiento',exact:true}).click();form=page.getByRole('dialog');await form.getByRole('combobox',{name:'Resultado comercial',exact:true}).selectOption('won');await form.getByLabel('Qué confirmó el cliente y por qué medio *',{exact:true}).fill('Confirmación ficticia para probar ambas opciones');await form.getByRole('button',{name:'Guardar',exact:true}).click();await page.getByRole('heading',{name:'¿Deseás registrar el pedido o vincularlo a un pedido actual?',exact:true}).waitFor();await page.getByRole('button',{name:'Registrar pedido',exact:true}).click();checks++;
  await page.getByRole('button',{name:'Continuar en Pedidos',exact:true}).waitFor();await page.route('**/vendedores/pedidos?from_visit=*',route=>route.fulfill({status:200,contentType:'text/html',body:'<h1>Pedido de ensayo</h1>'}));await page.getByRole('button',{name:'Continuar en Pedidos',exact:true}).click();await page.getByRole('heading',{name:'Pedido de ensayo'}).waitFor();const draft=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('visit_order_draft')));assert.equal(draft.installationDate,'2026-10-20');assert.equal(draft.items[1].id,component.id);assert.equal(draft.items[1].quantity,3);assert.equal(draft.items[1].customPrice,0);assert.equal(draft.items[1].bundleParentId,kits[1].id);assert.equal(draft.sourceVisitId,caseId);assert.equal(draft.customerName,v.customer_name);assert.equal(draft.items[0].customPrice,1200000);assert.equal(draft.whaticketLink,'https://whaticket.example.test/internal/123');checks++;await page.goto(`${base}/visitas?case=${caseId}`);await page.getByRole('heading',{name:'Cliente ficticio BIOFORT',exact:true}).waitFor();
  await page.getByRole('button', { name: 'Volver', exact: true }).click(); await page.getByRole('heading', { name: 'Seguimiento de visitas', exact: true }).waitFor(); await page.getByText('100%', { exact: true }).waitFor(); await page.screenshot({ path: 'output/visits-tests/board-desktop.png', fullPage: true }); checks++;
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } }); await mock(mobile, 'instalador');
  const phone = await mobile.newPage(); phone.on('pageerror', e => errors.push(e.message));
  await phone.goto(`${base}/visitas`); await phone.getByRole('heading', { name: 'Seguimiento de visitas', exact: true }).waitFor({ timeout: 60000 });
  assert.equal(await phone.getByRole('button', { name: 'Nueva visita', exact: true }).count(), 0); checks++;
  await phone.getByRole('button', { name: /Cliente ficticio BIOFORT/ }).first().click(); await phone.getByRole('heading', { name: 'Cliente ficticio BIOFORT', exact: true }).waitFor();
  assert.equal(await phone.getByRole('button', { name: 'Actualizar / reabrir seguimiento', exact: true }).count(), 0); checks++;
  await phone.getByRole('button',{name:'Informar cobro de visita / seña',exact:true}).click();const cash=phone.getByRole('dialog');await cash.getByLabel('Importe cobrado en esta ocasión',{exact:true}).fill('50000');await cash.getByLabel('Detalle / referencia del comprobante',{exact:true}).fill('Visita ficticia');await cash.getByRole('button',{name:'Guardar',exact:true}).click();await cash.waitFor({state:'hidden'});assert.equal(v.payment_amount,50000);checks++;
  assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); checks++;
  await phone.screenshot({ path: 'output/visits-tests/visit-mobile.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks, api: 'mocked', productionData: 'unchanged', desktop: true, mobile: true, screenshots: path.resolve('output/visits-tests') }));
})().catch(e => { console.error(e.stack); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });
