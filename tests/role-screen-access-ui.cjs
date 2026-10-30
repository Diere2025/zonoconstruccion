// Run against a local dev server. All authenticated APIs are mocked; no live data is used.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.ROLE_ACCESS_TEST_URL || 'http://127.0.0.1:3116';
if (new URL(base).hostname !== '127.0.0.1') throw new Error('This test requires a loopback server.');

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  try {
    const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 1080 } });
    const user = { id: '00000000-0000-4000-8000-000000000001', email: 'admin-role-access@example.invalid', role: 'authenticated', user_metadata: { role: 'admin' }, app_metadata: {} };
    const session = { access_token: 'fake-session-for-local-ui-only', refresh_token: 'fake-refresh', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user };
    let config = { overrides: {}, revision: 0, available: true };
    let saves = 0;
    let conflict = false;
    let profileRole = 'admin';
    let productReads = 0;
    const productRequests = [];
    await context.addInitScript(({ session }) => {
      localStorage.setItem('sb-ckvbyfgsbjbfaqotmeld-auth-token', JSON.stringify(session));
    }, { session });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      const json = body => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      if (url.hostname.endsWith('supabase.co')) {
        if (url.pathname.includes('/rest/v1/products')) { productReads++; productRequests.push(route.request().frame().url()); }
        if (url.pathname === '/auth/v1/user') return json(user);
        if (url.pathname.includes('/rest/v1/sellers')) return json({ id: user.id, full_name: 'Usuario de ensayo', role: profileRole, roles: [profileRole], seller_type: 'ambos', can_sell_wholesale: true });
        return json([]);
      }
      if (url.origin !== base) return route.abort();
      if (url.pathname === '/api/role-screen-access') {
        if (route.request().method() === 'PUT') {
          saves++;
          if (conflict) return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Otro administrador modificó los accesos. Recargá la configuración antes de guardar.' }) });
          const body = route.request().postDataJSON();
          assert.equal(body.revision, config.revision);
          config = { ...config, overrides: body.overrides, revision: config.revision + 1 };
        }
        return json(config);
      }
      if (url.pathname.startsWith('/api/')) return json({ active: false, data: [], tickets: [], notifications: [], unreadCount: 0 });
      return route.continue();
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/admin/accesos`);
    await page.getByRole('combobox', { name: 'Rol a configurar' }).waitFor({ timeout: 90000 });
    await page.getByRole('combobox', { name: 'Rol a configurar' }).selectOption('compras');
    const checkbox = page.getByRole('checkbox', { name: 'Acceso a Catálogo General', exact: true });
    assert.equal(await checkbox.isChecked(), false);
    await checkbox.check();
    await page.getByRole('combobox', { name: 'Rol a configurar' }).selectOption('logistica');
    await page.getByRole('combobox', { name: 'Rol a configurar' }).selectOption('compras');
    assert.equal(await checkbox.isChecked(), true);
    await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Accesos guardados.' }).waitFor();
    assert.equal(config.overrides.compras['inventario-1'], true);
    await page.reload();
    await page.getByRole('combobox', { name: 'Rol a configurar' }).selectOption('compras');
    assert.equal(await checkbox.isChecked(), true);
    await page.getByRole('button', { name: 'Restaurar este rol', exact: true }).click();
    assert.equal(await checkbox.isChecked(), false);
    await page.getByRole('button', { name: 'Descartar', exact: true }).click();
    assert.equal(await checkbox.isChecked(), true);
    conflict = true;
    await checkbox.uncheck();
    await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Otro administrador' }).waitFor();
    assert.equal(await checkbox.isChecked(), false);
    await page.getByRole('button', { name: 'Descartar', exact: true }).click();
    assert.equal(await checkbox.isChecked(), true);
    await page.getByRole('textbox', { name: 'Buscar pantalla o módulo' }).fill('Catálogo General');
    assert.equal(await page.getByRole('checkbox').count(), 1);
    fs.mkdirSync('.codex-tmp/role-access-qa', { recursive: true });
    await page.screenshot({ path: '.codex-tmp/role-access-qa/desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByTitle('Mostrar menú lateral', { exact: true }).waitFor();
    await page.screenshot({ path: '.codex-tmp/role-access-qa/mobile.png', fullPage: true, animations: 'disabled' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(await page.locator('main section').evaluateAll(items => items.every(item => item.getBoundingClientRect().right <= innerWidth)), true);
    assert.equal(saves, 2);
    assert.deepEqual(errors, []);
    profileRole = 'compras';
    const readsBeforeDenied = productReads;
    config = { overrides: { compras: { 'inventario-1': false } }, revision: 3, available: true };
    await page.goto(`${base}/admin/catalogo`);
    await page.waitForURL(`${base}/admin`, { timeout: 90000 });
    assert.equal(await page.locator('a[href="/admin/catalogo"]').count(), 0);
    assert.equal(productReads, readsBeforeDenied, `denied screen must not mount and request products: ${JSON.stringify(productRequests)}`);
    config = { overrides: { compras: { 'inventario-1': true } }, revision: 4, available: true };
    await page.goto(`${base}/admin/catalogo`);
    await page.locator('a[href="/admin/catalogo"]').first().waitFor({ state: 'attached', timeout: 30000 });
    assert.equal(new URL(page.url()).pathname, '/admin/catalogo');
    console.log('PASS local UI: role switching, grant, save/reload, restore, discard, save conflict, search, mobile layout, English browser, denied direct URL, granted direct URL; no live data requests.');
    await context.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
