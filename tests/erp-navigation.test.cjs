const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const exportsValue = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/erpNavigation.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS }
}).outputText, { exports: exportsValue, require, URLSearchParams });
const { erpModules, visibleErpModules, activeErpLink } = exportsValue;
const identity = (roles, restrictedSeller = false, canUseWholesale = false) => ({ roles, restrictedSeller, canUseWholesale });
const urls = modules => modules.flatMap(module => module.links.map(link => link.href));

test('each destination has one primary module; global analysis and Meta belong to direction', () => {
  const all = urls(erpModules);
  assert.equal(new Set(all).size, all.length);
  for (const href of ['/admin/dashboard', '/admin/meta-ads', '/admin/rentabilidad', '/admin/capital-estancado']) {
    assert.equal(erpModules.find(module => module.links.some(link => link.href === href)).id, 'direccion');
  }
  for (const href of all) assert.ok(fs.existsSync(`src/app${href.split('?')[0]}/page.tsx`), href);
});

test('specialized roles keep their authorized links and multi-role users receive their union', () => {
  for (const role of ['administracion', 'logistica', 'fletero', 'compras']) {
    const visible = visibleErpModules(identity([role]));
    assert.ok(!visible.some(module => module.id === 'direccion'));
    assert.ok(urls(visible).includes('/incidencias'));
    assert.ok(!urls(visible).includes('/vendedores/pedidos?tab=form&client_type=minoristas'));
  }
  const combined = new Set(urls(visibleErpModules(identity(['administracion', 'compras']))));
  for (const href of [...urls(visibleErpModules(identity(['administracion']))), ...urls(visibleErpModules(identity(['compras'])))]) assert.ok(combined.has(href), href);
  assert.deepEqual(Array.from(urls(visibleErpModules(identity(['fletero'])))).sort(), ['/admin/cobros-mp', '/incidencias'].sort());
});

test('restricted sellers receive wholesale links only when individually enabled', () => {
  const restricted = urls(visibleErpModules(identity(['seller'], true)));
  assert.ok(restricted.includes('/vendedores'));
  assert.ok(!restricted.some(url => url.includes('mayorista')));
  const enabled = urls(visibleErpModules(identity(['seller'], true, true)));
  assert.ok(enabled.includes('/vendedores/presupuestos-mayorista'));
  assert.ok(!enabled.includes('/admin/dashboard-mayorista'));
  assert.ok(!enabled.includes('/vendedores/cotizaciones?channel=mayorista'));
});

test('query parameters select the correct module and screen; detail and printing aliases retain context', () => {
  const cases = [
    ['/admin/compras', '', 'compras', 'Órdenes de Compra'],
    ['/admin/compras', 'tab=production', 'produccion', 'Órdenes de Producción'],
    ['/admin/compras', 'tab=claims_exchanges', 'postventa', 'Gestión de Reclamos y Cambios'],
    ['/admin/compras', 'tab=hold_orders', 'logistica', 'Pedidos en Espera'],
    ['/admin/dashboard-mayorista', 'tab=mapping', 'inventario', 'Vinculación de Productos Mayoristas'],
    ['/admin/dashboard-mayorista', 'tab=products', 'mayorista', 'Dashboard Mayorista'],
    ['/vendedores/cotizaciones', 'channel=mayorista', 'mayorista', 'Presupuestos Mayoristas'],
    ['/vendedores/clientes', 'client_type=mayoristas', 'mayorista', 'Clientes Mayoristas'],
    ['/vendedores/clientes', '', 'minorista', 'Clientes Minoristas'],
    ['/vendedores/pedidos', 'tab=list&client_type=mayoristas&status=Entregado', 'mayorista', 'Pedidos Mayoristas'],
    ['/vendedores/pedidos', '', 'minorista', 'Pedidos Minoristas'],
    ['/admin/finanzas/eerr', '', 'direccion', 'Estado de Resultados (EERR)'],
    ['/admin/finanzas', 'tab=accounts', 'tesoreria', 'Cuentas y saldos'],
    ['/admin/rendiciones/123', '', 'tesoreria', 'Rendiciones de Recorridos'],
    ['/incidencias/123', '', 'soporte', 'Incidencias y Tickets'],
    ['/vendedores/ruteo/remitos', '', 'logistica', 'Impresión Logística']
  ];
  for (const [path, query, module, screen] of cases) {
    const active = activeErpLink(erpModules, path, query);
    assert.equal(active?.module.id, module, `${path}?${query}`);
    assert.equal(active?.link.name, screen, `${path}?${query}`);
  }
});

test('unauthorized screens do not acquire a breadcrumb through another module', () => {
  assert.equal(activeErpLink(visibleErpModules(identity(['administracion'])), '/admin/finanzas/eerr', ''), undefined);
});
