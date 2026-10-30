// Synthetic browser fixtures. External reads/writes are intercepted; no live orders or sheets.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
process.loadEnvFile('.env.local');
const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname;
const id = '00000000-0000-4000-8000-000000000001';
const user = { id, email: 'preview@example.invalid', role: 'authenticated', aud: 'authenticated', user_metadata: { role: 'admin' }, app_metadata: {} };
const seller = { id, full_name: 'Vendedor de prueba', role: 'admin', roles: ['admin'], seller_type: 'ambos', can_sell_wholesale: true, is_active: true, prefix: 'TEST' };
const session = { access_token: 'synthetic-via-cargo-preview', refresh_token: 'synthetic', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user };
const destination = { mode: 'branch', name: 'Ana Pérez', document: '12345678', phone: '3511234567', province: 'Córdoba', locality: 'Córdoba', postal_code: '5000', branch: 'Terminal Córdoba', address: '', maps_url: 'https://maps.app.goo.gl/example', references: 'Retira por la tarde' };
const dispatch = { branch: 'Centro de despacho', address: 'Avenida de prueba 100', locality_id: 'city', locality: 'Quilmes', maps_url: '', references: 'Ingreso por portón' };
const client = { id: 'client', business_name: 'Cliente de prueba', phone_primary: '1155443322', tax_id: '20123456789', is_wholesale: false };
const city = { id: 'city', name: 'Quilmes', zone_id: 'zone', zones: { id: 'zone', name: 'Sur', delivery_times: { id: 'regular', name: 'Regular', category: 'Regular' } } };
const init = { currentSeller: seller, role: 'admin', sellerType: 'ambos', isOrganic: false, sellers: [seller], products: [{ id: 'product', name: 'Tanque de prueba 500', sku: 'T500', price: 100000, retail_price: 100000, is_active: true, category: 'TANQUES', stock: 10 }], clients: [client], localities: [city], zones: [city.zones], deliveryTimes: [{ id: 'regular', name: 'Regular', category: 'Regular' }], kits: [], advertisingSources: [{ id: 'ad', name: 'Cliente', is_active: true }], orderMediums: [{ id: 'medium', name: 'WhatsApp', is_active: true }], phoneLines: [], paymentMethods: [{ id: 'cash', name: 'Contado', is_active: true, surcharge_percentage: 0 }], recentOrders: [] };
const writes = [];
const georefReads = [];
let georefFailure = false;

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const context = await browser.newContext({ locale: 'en-US', deviceScaleFactor: 2, timezoneId: 'America/Argentina/Buenos_Aires', viewport: { width: 1600, height: 1100 } });
    await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: `sb-${host.split('.')[0]}-auth-token`, session });
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (['127.0.0.1', 'localhost'].includes(url.hostname) && !url.pathname.startsWith('/api/')) return route.continue();
      let data = [];
      if (url.pathname === '/api/vendedores/pedidos-init') data = init;
      else if (url.pathname === '/api/logistica/via-cargo-config') data = { dispatch, canEdit: true };
      else if (url.pathname === '/api/georef') {
        georefReads.push(url.search);
        if (georefFailure && url.searchParams.get('kind') === 'localities') {
          await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Unavailable' }) }); return;
        }
        const provinces = [{ id: '06', name: 'Buenos Aires' }, { id: '14', name: 'Córdoba' }, { id: '82', name: 'Santa Fe' }];
        const rosario = (url.searchParams.get('q') || '').toLowerCase().startsWith('ros');
        data = { results: url.searchParams.get('kind') === 'provinces' ? provinces : rosario
          ? [{ id: 'rosario', name: 'Rosario', province: provinces[2], department: 'Rosario' }]
          : [{ id: 'cordoba', name: 'Córdoba', province: provinces[1], department: 'Capital' }] };
      }
      else if (url.pathname.startsWith('/api/')) data = { active: false, notifications: [], unread: 0 };
      else if (url.hostname === host) {
        if (url.pathname.includes('/auth/v1/user')) data = user;
        else if (url.pathname.includes('/rest/v1/sellers')) data = request.headers().accept?.includes('object') ? seller : [seller];
        else if (url.pathname.includes('/rest/v1/clients')) data = [client];
        else if (url.pathname.includes('/rest/v1/addresses')) data = url.searchParams.get('via_cargo') === 'not.is.null'
          ? [{ id: 'saved-via', via_cargo: destination }]
          : [{ id: 'home', alias: 'Principal', full_address: 'Mitre 540', locality_id: 'city', postal_code: '1878' }];
        if (!['GET', 'HEAD'].includes(request.method())) writes.push({ path: url.pathname, body: request.postDataJSON() });
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto((process.env.VIA_CARGO_UI_URL || 'http://127.0.0.1:3177') + '/vendedores/pedidos?tab=form', { timeout: 120000 });
    await page.getByRole('checkbox', { name: 'Envío por Vía Cargo' }).waitFor({ timeout: 120000 });
    fs.mkdirSync('output/via-cargo', { recursive: true });
    await page.getByRole('button', { name: 'Agregar CP', exact: true }).click();
    const normalCP = page.getByRole('textbox', { name: 'Código postal de reparto', exact: true });
    await normalCP.fill('B1878ABC');
    assert.equal(await normalCP.getAttribute('required'), null);
    await page.getByRole('checkbox', { name: 'Envío por Vía Cargo' }).check();
    const panel = page.getByRole('region', { name: 'Datos de envío — Vía Cargo' });
    await panel.waitFor();
    assert.equal(await normalCP.count(), 0);
    const sameClient = panel.getByRole('checkbox', { name: 'El destinatario es el mismo cliente', exact: true });
    assert.ok(await sameClient.isChecked());
    assert.equal(await panel.getByRole('textbox', { name: 'Nombre y apellido', exact: true }).count(), 0);
    await sameClient.uncheck();
    for (const label of ['Nombre y apellido', 'DNI / CUIT', 'Teléfono de contacto', 'Provincia', 'Localidad de destino', 'Código postal']) assert.notEqual(await panel.getByLabel(label, { exact: true }).getAttribute('required'), null, label);
    assert.ok(await panel.getByText('Modalidad pendiente de definir.').count());
    const finalAddress = panel.getByRole('textbox', { name: 'Dirección exacta, piso y departamento', exact: true });
    assert.equal(await finalAddress.getAttribute('required'), null);
    await finalAddress.fill('Mitre 540');
    await panel.getByRole('radio', { name: 'Entrega a domicilio', exact: true }).check();
    assert.notEqual(await panel.getByRole('textbox', { name: 'Dirección exacta, piso y departamento', exact: true }).getAttribute('required'), null);
    await panel.getByRole('radio', { name: 'Retiro en sucursal', exact: true }).check();
    assert.equal(await finalAddress.getAttribute('required'), null);
    assert.equal(await finalAddress.inputValue(), 'Mitre 540');
    assert.notEqual(await panel.getByRole('textbox', { name: 'Sucursal de retiro de destino', exact: true }).getAttribute('required'), null);
    await panel.getByRole('textbox', { name: 'Nombre y apellido', exact: true }).fill('Juan Pérez');
    await panel.getByRole('textbox', { name: 'DNI / CUIT', exact: true }).fill('12345678');
    await panel.getByRole('textbox', { name: 'Teléfono de contacto', exact: true }).fill('3511234567');
    await panel.getByLabel('Provincia', { exact: true }).fill('cord');
    await panel.getByRole('option', { name: 'Córdoba', exact: true }).waitFor();
    await panel.getByLabel('Provincia', { exact: true }).press('ArrowDown');
    await panel.getByLabel('Provincia', { exact: true }).press('Enter');
    assert.equal(await panel.getByLabel('Provincia', { exact: true }).inputValue(), 'Córdoba');
    await panel.getByLabel('Localidad de destino', { exact: true }).fill('cor');
    await panel.getByRole('listbox', { name: 'Sugerencias de Localidad de destino' }).getByRole('option', { name: /Córdoba/ }).click();
    assert.ok(georefReads.some(query => query.includes('province=14')));
    assert.equal(await panel.getByRole('link', { name: 'Consultar CP ↗' }).getAttribute('href'), 'https://www.correoargentino.com.ar/formularios/cpa');
    await panel.getByRole('textbox', { name: 'Código postal', exact: true }).fill('5000');
    await panel.getByRole('textbox', { name: 'Sucursal de retiro de destino', exact: true }).fill('Terminal Córdoba');
    await panel.getByRole('textbox', { name: 'Referencias del cliente para Vía Cargo', exact: true }).fill('Retira por la tarde, llamar al llegar.');
    const locations = await Promise.all(['Provincia', 'Localidad de destino', 'Código postal'].map(name => panel.getByLabel(name, { exact: true }).boundingBox()));
    assert.ok(locations.every(box => Math.abs(box.y - locations[0].y) < 1), 'Province, locality and CP share one desktop row');
    const branchBox = await panel.getByRole('textbox', { name: 'Sucursal de retiro de destino', exact: true }).boundingBox();
    const mapsBox = await panel.getByRole('textbox', { name: 'Link de Google Maps del destino', exact: true }).boundingBox();
    assert.ok(Math.abs(branchBox.y - mapsBox.y) < 1, 'Destination and Maps share one desktop row');
    assert.equal(await panel.getByRole('combobox', { name: 'Cómo guardar destino Vía Cargo' }).count(), 0);
    await page.getByText('Vista previa de Detalle Entrega en planilla', { exact: true }).click();
    assert.ok((await page.locator('pre').filter({ hasText: 'VÍA CARGO' }).textContent()).includes('Dirección de destino: Mitre 540'));
    await page.screenshot({ path: 'output/via-cargo/formulario-escritorio.png', fullPage: true });
    await panel.screenshot({ path: 'output/via-cargo/destinatario-escritorio.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    const closeMenu = page.getByRole('button', { name: 'Cerrar menú lateral', exact: true });
    if (await closeMenu.isVisible()) await closeMenu.click();
    await page.waitForFunction(() => document.getElementById('erp-sidebar').getBoundingClientRect().right <= 1);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await panel.screenshot({ path: 'output/via-cargo/destinatario-movil.png', animations: 'disabled' });
    await page.setViewportSize({ width: 1600, height: 1100 });
    await page.getByRole('checkbox', { name: 'Envío por Vía Cargo' }).uncheck();
    await page.getByPlaceholder('Ej. 1155443322 (Principal)', { exact: true }).fill(client.phone_primary);
    await page.getByRole('button', { name: 'Cargar Datos de Cliente de prueba', exact: true }).click();
    await page.getByRole('textbox', { name: 'Código postal de reparto', exact: true }).waitFor();
    assert.equal(await page.getByRole('textbox', { name: 'Código postal de reparto', exact: true }).inputValue(), '1878');
    await page.getByRole('checkbox', { name: 'Envío por Vía Cargo' }).check();
    await panel.getByRole('combobox', { name: 'Destino Vía Cargo guardado' }).selectOption('saved-via');
    assert.equal(await panel.getByRole('textbox', { name: 'Nombre y apellido', exact: true }).inputValue(), 'Ana Pérez');
    assert.equal(await panel.getByRole('textbox', { name: 'Código postal', exact: true }).inputValue(), '5000');
    assert.equal(await panel.getByRole('textbox', { name: 'Sucursal de retiro de destino', exact: true }).inputValue(), 'Terminal Córdoba');
    await panel.getByRole('textbox', { name: 'Nombre y apellido', exact: true }).fill('Otro destinatario');
    assert.equal(destination.name, 'Ana Pérez');
    await panel.getByRole('combobox', { name: 'Destino Vía Cargo guardado' }).selectOption('');
    assert.ok(await sameClient.isChecked());
    assert.equal(await panel.getByRole('textbox', { name: 'Nombre y apellido', exact: true }).count(), 0);
    const detailPreview = page.locator('pre').filter({ hasText: 'VÍA CARGO' });
    assert.ok((await detailPreview.textContent()).includes(client.business_name));
    assert.ok((await detailPreview.textContent()).includes(client.tax_id));
    await page.getByRole('textbox', { name: 'Nombre / Razón social', exact: true }).fill('Cliente modificado');
    assert.ok((await detailPreview.textContent()).includes('Cliente modificado'));
    await page.getByRole('textbox', { name: /DNI \/ CUIT/ }).fill('20999999991');
    assert.ok((await detailPreview.textContent()).includes('20999999991'));
    await panel.screenshot({ path: 'output/via-cargo/destinatario-mismo-cliente.png' });
    if (process.env.VIA_CARGO_GUIDE === '1') {
      await page.getByRole('textbox', { name: 'Nombre / Razón social', exact: true }).fill('Juan Pérez');
      await page.getByRole('textbox', { name: /DNI \/ CUIT/ }).fill('12345678');
      await panel.getByRole('radio', { name: 'Entrega a domicilio', exact: true }).check();
      await panel.getByLabel('Provincia', { exact: true }).fill('cord');
      await panel.getByRole('option', { name: 'Córdoba', exact: true }).click();
      await panel.getByLabel('Localidad de destino', { exact: true }).fill('cor');
      await panel.getByRole('listbox', { name: 'Sugerencias de Localidad de destino' }).getByRole('option', { name: /Córdoba/ }).click();
      await panel.getByLabel('Código postal', { exact: true }).fill('5000');
      await panel.getByLabel('Dirección exacta, piso y departamento', { exact: true }).fill('Mitre 540, piso 2, departamento B');
      await panel.getByLabel('Referencias del cliente para Vía Cargo', { exact: true }).fill('Portón verde. Llamar antes de llegar.');
      await page.setViewportSize({ width: 640, height: 1100 });
      await page.waitForFunction(() => document.getElementById('erp-sidebar').getBoundingClientRect().right <= 1);
      for (const name of [/Bandeja de pedidos/, /Atajos/]) {
        const widget = page.getByRole('button', { name });
        if (await widget.count()) await widget.first().evaluate(element => element.style.visibility = 'hidden');
      }
      const guideStyle = await page.addStyleTag({ content: '.fixed { visibility: hidden !important; }' });
      const guideDetails = page.locator('details').filter({ has: page.getByText('Vista previa de Detalle Entrega en planilla', { exact: true }) });
      await guideDetails.evaluate(element => element.open = true);
      const activation = page.getByRole('heading', { name: 'Destino de Reparto', exact: true }).locator('..');
      await activation.screenshot({ path: 'output/via-cargo/guia-activar.png', animations: 'disabled' });
      await panel.screenshot({ path: 'output/via-cargo/guia-destinatario.png', animations: 'disabled' });
      await panel.locator(':scope > div.grid').screenshot({ path: 'output/via-cargo/guia-datos.png', animations: 'disabled' });
      await page.locator('details').filter({ has: page.getByText('Vista previa de Detalle Entrega en planilla', { exact: true }) }).screenshot({ path: 'output/via-cargo/guia-planilla.png', animations: 'disabled' });
      await guideStyle.evaluate(element => element.remove());
      await page.setViewportSize({ width: 1600, height: 1100 });
    }
    await panel.getByLabel('Provincia', { exact: true }).fill('');
    await panel.getByLabel('Código postal', { exact: true }).fill('5000');
    await panel.getByLabel('Localidad de destino', { exact: true }).fill('ros');
    await panel.getByRole('option', { name: /Rosario/ }).click();
    assert.equal(await panel.getByLabel('Provincia', { exact: true }).inputValue(), 'Santa Fe');
    assert.equal(await panel.getByLabel('Código postal', { exact: true }).inputValue(), '');
    georefFailure = true;
    await panel.getByLabel('Localidad de destino', { exact: true }).fill('Localidad manual');
    await panel.getByText('Georef no responde. Podés escribir la localidad manualmente.', { exact: true }).waitFor();
    assert.equal(await panel.getByLabel('Localidad de destino', { exact: true }).inputValue(), 'Localidad manual');
    await panel.getByLabel('Código postal', { exact: true }).fill('3000');
    assert.equal(await panel.getByLabel('Código postal', { exact: true }).inputValue(), '3000');
    await page.goto((process.env.VIA_CARGO_UI_URL || 'http://127.0.0.1:3177') + '/admin/via-cargo');
    await page.getByRole('heading', { name: 'Vía Cargo · Punto de despacho', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Guardar punto de despacho', exact: true }).waitFor();
    assert.equal(await page.getByRole('textbox', { name: 'Sucursal de despacho', exact: false }).inputValue(), dispatch.branch);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result: 'passed', locale: 'en-US', screenshots: ['output/via-cargo/destinatario-escritorio.png', 'output/via-cargo/destinatario-movil.png'], writes: writes.length }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

