// Local browser regression: every business API is mocked; no live data is read or changed.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.ORDER_EDIT_TEST_URL || 'http://127.0.0.1:3162';
if (new URL(base).hostname !== '127.0.0.1') throw Error('Loopback server required');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const seller = { id: id(1), email: 'jazmin-test@example.invalid', full_name: 'Jazmín Sánchez', role: 'seller', roles: ['seller'], seller_type: 'minorista', is_organic: true };
const user = { id: seller.id, email: seller.email, role: 'authenticated', aud: 'authenticated', user_metadata: {}, app_metadata: {} };
const client = { id: id(2), business_name: 'Yamila Di Yorio', tax_id: '', phone_primary: '1112345678', is_wholesale: false };
const product = { id: id(3), name: 'Termotanque de prueba', sku: 'TEST-TT', price: 490000, category: 'Termotanques', stock_current: 100 };
const pm = { id: 'a3a890a8-b677-4b7b-8ffb-d36c2e7b5ad3', name: 'Contado', surcharge_percentage: 0, is_active: true };
const locality = { id: id(4), name: 'La Boca (CABA)', zone_id: id(5), zones: { name: 'CABA' } };
const order = { id: id(6), legacy_code: 'JS26496', seller_id: seller.id, customer_name: client.business_name, client_id: client.id, shipping_address_id: id(7),
  address: 'Dirección de prueba 123', locality: locality.name, shipping_address_snapshot: { locality_id: locality.id },
  order_date: '2026-10-27', initial_delivery_date: '2026-10-28', max_delivery_date: '2026-10-30', created_at: '2026-10-27T15:00:00Z',
  status: 'Pendiente', payment_status: 'Pendiente', payment_method_id: pm.id, total_amount: 477750, channel: 'mostrador_minorista', category: 'Termotanques',
  totals: { subtotal: 490000, freight: 0, order_discount_type: 'fixed', order_discount_value: 12250, order_discount_amount: 12250 },
  sellers: { full_name: seller.full_name }, clients: { is_wholesale: false } };
const item = { id: id(8), order_id: order.id, product_id: product.id, product_name: product.name, quantity: 1, unit_price: 490000 };

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const context = await browser.newContext({ locale: 'en-US', timezoneId: 'America/Argentina/Buenos_Aires', viewport: { width: 1440, height: 1080 } });
    context.setDefaultTimeout(15000);
    const session = { access_token: 'fixture-only', refresh_token: 'fixture-only', user, expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer' };
    await context.addInitScript(session => localStorage.setItem('sb-ckvbyfgsbjbfaqotmeld-auth-token', JSON.stringify(session)), session);
    let accessReads = 0;
    const writes = [];
    await context.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      const json = data => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
      if (url.hostname.endsWith('supabase.co')) {
        if (!['GET', 'HEAD'].includes(request.method())) { writes.push(url.pathname); return route.abort(); }
        if (url.pathname === '/auth/v1/user') return json(user);
        const table = url.pathname.split('/').pop();
        if (table === 'sellers') return json(url.searchParams.has('id') || url.searchParams.has('email') ? seller : [seller]);
        if (table === 'orders') return json(url.searchParams.has('id') ? order : [order]);
        if (table === 'order_items') return json([item]);
        if (table === 'products') return json([product]);
        if (table === 'v_client_balances_and_stats' || table === 'clients') return json(url.searchParams.has('id') ? client : [client]);
        if (table === 'client_addresses') return json([{ id: id(7), client_id: client.id, full_address: order.address, locality_id: locality.id }]);
        if (table === 'payment_methods') return json([pm]);
        return json([]);
      }
      if (url.origin !== base) return route.abort();
      if (url.pathname === '/api/role-screen-access') {
        accessReads++;
        await new Promise(resolve => setTimeout(resolve, 200));
        return json({ overrides: {}, revision: 1, available: true });
      }
      if (url.pathname === '/api/vendedores/pedidos-init') return json({ currentSeller: seller, sellers: [seller], sellerType: 'minorista', isOrganic: true, role: 'seller',
        clients: [client], products: [product], localities: [locality], zones: [{ id: id(5), name: 'CABA' }], deliveryTimes: [], kits: [],
        advertisingSources: [], orderMediums: [], phoneLines: [], paymentMethods: [pm], recentOrders: [] });
      if (url.pathname.startsWith('/api/')) return json({ active: false, data: [], jobs: [], tickets: [], notifications: [], unreadCount: 0 });
      return route.continue();
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', dialog => { if (dialog.type() === 'alert') errors.push(dialog.message()); void dialog.accept(); });
    for (const entry of ['list', 'detail', 'print']) {
      await page.goto(`${base}/vendedores/pedidos?tab=list&date_from=2026-10-01&date_to=2026-10-30`);
      await page.getByTitle('Editar Pedido', { exact: true }).waitFor({ timeout: 120000 });
      if (entry === 'list') await page.getByTitle('Editar Pedido', { exact: true }).click();
      if (entry === 'detail') {
        await page.getByTitle('Ver Detalle del Pedido (Modo Lectura)', { exact: true }).click();
        await page.getByTitle('Modificar los datos de este pedido', { exact: true }).click();
      }
      if (entry === 'print') {
        await page.getByTitle('Imprimir / Exportar Comprobante de Pedido (PDF e Imagen)', { exact: true }).click();
        await page.getByRole('button', { name: '✏️ Editar', exact: true }).click();
      }
      await page.getByText('Modo Edición Activado', { exact: true }).waitFor();
      await page.waitForTimeout(1000);
      assert.equal(await page.getByText('Modo Edición Activado', { exact: true }).count(), 1, `${entry}: editing must survive the tab URL update`);
      assert.equal(await page.locator('input[value="JS26496"]').count(), 1);
      assert.equal(await page.getByRole('heading', { name: 'Carga de Nuevo Pedido', exact: true }).count(), 0);
      assert.equal(await page.locator('input[value="Dirección de prueba 123"]').count(), 1);
      const before = accessReads;
      await page.evaluate(() => { const url = new URL(location.href); url.searchParams.set('search', 'JS26496'); history.replaceState(null, '', url); });
      await page.waitForTimeout(500);
      assert.equal(accessReads, before, 'query changes must reuse the already verified identity permissions');
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await page.waitForTimeout(500);
      assert.ok(accessReads > before, 'permissions still refresh on focus');
      assert.equal(await page.getByText('Modo Edición Activado', { exact: true }).count(), 1);
      assert.equal(await page.locator('input[value="JS26496"]').count(), 1);
      console.log(`PASS ${entry}: same order, code and address survive navigation and permission refresh`);
    }
    assert.deepEqual(writes, [], 'opening and navigating must never create an order');
    assert.deepEqual(errors, []);
    await context.close();
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
