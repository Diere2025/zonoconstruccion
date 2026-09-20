/* global getVisibleRows, parseDOMRow, getRowDate, reportPayment, knownTxIds,
   pendingPayments, failedPayments, scanDOMActivities, manualSyncVisibleActivities,
   config, testNow, NativeDate */
const results = [];
const fixture = document.querySelector('main');
const initialTime = testNow;
let requests = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function equal(actual, expected) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function row(name, amount = '179.100', time = '07:45', outgoing = false, status = 'Aprobado', extra = '') {
  return `<div class="movement"><div>${time}</div><div>${name}</div><div>Transferencia ${outgoing ? 'enviada' : 'recibida'}</div><div>${status}</div><div>${outgoing ? '-' : '+'} $${amount}</div>${extra}</div>`;
}
function mount(html) {
  fixture.innerHTML = html;
  return fixture.querySelector('.movement');
}
function payment() {
  return parseDOMRow(mount('<h2>Hoy</h2>' + row('Cliente Prueba')));
}
function respondWith(response) {
  chrome.runtime.sendMessage = (request, callback) => {
    requests.push(request);
    queueMicrotask(() => callback(response));
  };
}
async function test(name, action) {
  try {
    knownTxIds.clear(); pendingPayments.clear(); failedPayments.clear();
    config.accountName = 'pagoszono.26';
    config.webhookUrl = 'https://example.invalid/api/mp-webhook';
    testNow = initialTime;
    requests = [];
    chrome.runtime.lastError = undefined;
    await action();
    results.push(`PASS ${name}`);
  } catch (error) {
    results.push(`FAIL ${name}: ${error.message}`);
  }
}

// Keep the actual routing predicate active, using a local /activities URL.
setTimeout(() => { (async () => {
  await test('Captura: dos ingresos de hoy, salidas excluidas e histórico separado', () => {
    mount('<h2>Hoy</h2>' + row('Salida', '1.300.000', '09:32', true) +
      row('Cliente Uno') + row('Cliente Dos', '282.000', '07:33') +
      '<h2>14 de septiembre</h2>' + row('Cliente Anterior', '237.100', '17:11'));
    const payments = getVisibleRows().map(parseDOMRow);
    equal(payments.map(p => [p.payerName, p.amount, p.date, p.isToday]), [
      ['Cliente Uno', 179100, '2026-09-15', true],
      ['Cliente Dos', 282000, '2026-09-15', true],
      ['Cliente Anterior', 237100, '2026-09-14', false]
    ]);
  });
  await test('No captura un contenedor como si fuera un pago adicional', () => {
    mount('<h2>Hoy</h2><section>' + row('Cliente Uno') + row('Cliente Dos', '282.000', '07:33') + '</section>');
    equal(getVisibleRows().map(el => parseDOMRow(el).payerName), ['Cliente Uno', 'Cliente Dos']);
  });
  await test('Mismo monto y minuto, distintos pagadores: conserva ambos', () => {
    mount('<h2>Hoy</h2>' + row('Cliente Uno') + row('Cliente Dos'));
    equal(getVisibleRows().length, 2);
    assert(parseDOMRow(getVisibleRows()[0]).id !== parseDOMRow(getVisibleRows()[1]).id, 'IDs collided');
  });
  await test('Lee más de 15 movimientos cargados', () => {
    mount('<h2>Hoy</h2>' + Array.from({ length: 20 }, (_, i) => row(`Cliente ${i}`, `${1000 + i}`, '08:00')).join(''));
    equal(getVisibleRows().length, 20);
  });
  await test('Lee filas con más de ocho hijos y etiquetas inline', () => {
    mount('<h2>Hoy</h2><div class="movement"><span>07:45</span><br><span>Cliente Prueba</span><br><span>Transferencia recibida</span><br><span>Aprobado</span><br><span>+ $179.100</span></div>');
    equal(getVisibleRows().length, 1);
    equal(parseDOMRow(getVisibleRows()[0]).amount, 179100);
  });
  await test('Lee el listado aunque esté fuera del primer main', () => {
    const outside = document.createElement('section');
    fixture.innerHTML = '';
    outside.innerHTML = '<h2>Hoy</h2>' + row('Fuera de main');
    document.body.appendChild(outside);
    try {
      equal(getVisibleRows().map(el => parseDOMRow(el).payerName), ['Fuera de main']);
    } finally { outside.remove(); }
  });
  await test('Diagnóstico incluye estructura local sin secretos', () => {
    payment();
    config.secretToken = 'TEST_SECRET_NOT_FOR_DIAGNOSTICS';
    const diagnostic = getReadingDiagnostics();
    equal(diagnostic.detectedRows, 1);
    assert(diagnostic.samples.length > 0, 'Missing DOM sample');
    assert(!JSON.stringify(diagnostic).includes(config.secretToken), 'Secret leaked');
  });
  await test('Ignora copias ocultas y elementos propios de la extensión', () => {
    mount('<h2>Hoy</h2>' + row('Visible') + '<div hidden>' + row('Oculto') + '</div><div id="zono-mp-toasts">' + row('Toast') + '</div>');
    equal(getVisibleRows().map(el => parseDOMRow(el).payerName), ['Visible']);
  });
  await test('Preserva centavos y espacios del importe', () => {
    const parsed = parseDOMRow(mount('<h2>Hoy</h2>' + row('Cliente Prueba', '1.234,56')));
    equal(parsed.amount, 1234.56);
    respondWith({ ok: true, data: { success: true } });
    return reportPayment(parsed).then(() => assert(requests[0].payload.text.includes('$ 1.234,56 De'), 'Wrong decimal format for webhook'));
  });
  await test('Rechaza salidas con signo menos Unicode', () => {
    const el = mount('<h2>Hoy</h2>' + row('Cliente Prueba'));
    el.innerHTML = el.innerHTML.replace('+ $', '− $');
    equal(parseDOMRow(el), null);
  });
  await test('No registra pagos pendientes o rechazados', () => {
    for (const status of ['Pendiente', 'Rechazado', 'Cancelado', 'En proceso']) {
      equal(parseDOMRow(mount('<h2>Hoy</h2>' + row('Cliente Prueba', '100', '09:00', false, status))), null);
    }
  });
  await test('La fecha explícita prevalece sobre la hora histórica', () => {
    const el = mount('<h2>10 de septiembre</h2>' + row('Cliente Prueba', '100', '17:11'));
    equal(getRowDate(el).dateStr, '2026-09-10');
  });
  await test('Nombre Domingo no se interpreta como encabezado de fecha', () => {
    const el = mount('<h2>Hoy</h2>' + row('Domingo Perez'));
    equal(getRowDate(el).isToday, true);
  });
  await test('Automático envía solo ingresos de hoy', async () => {
    mount('<h2>Hoy</h2>' + row('Cliente Hoy') + '<h2>14 de septiembre</h2>' + row('Cliente Ayer'));
    respondWith({ ok: true, data: { success: true } });
    scanDOMActivities();
    await Promise.all([...pendingPayments.values()]);
    equal(requests.length, 1);
    assert(requests[0].payload.text.includes('Cliente Hoy'), 'Wrong day submitted');
  });
  await test('Pestaña pasiva ignora cobros y no envía alertas', async () => {
    mount('<h2>Hoy</h2>' + row('No debe enviarse'));
    isMonitorTab = false;
    respondWith({ ok: true, data: { success: true } });
    try {
      scanDOMActivities();
      await Promise.resolve();
      equal(requests.length, 0);
    } finally {
      isMonitorTab = true;
    }
  });
  await test('Un fallo no marca el pago como enviado y permite reintento', async () => {
    const p = payment();
    respondWith({ ok: false, status: 500 });
    equal(await reportPayment(p), 'failed');
    equal(knownTxIds.size, 0);
    equal(await reportPayment(p), 'retrying');
    equal(requests.length, 1);
    testNow += 31000;
    respondWith({ ok: true, data: { success: true } });
    equal(await reportPayment(p), 'confirmed');
    equal(failedPayments.size, 0);
    equal(await reportPayment(p), 'duplicate');
    equal(requests.length, 2);
  });
  await test('HTTP 200 con success:false o HTML no cuenta como éxito', async () => {
    const p = payment();
    for (const data of [{ success: false, message: 'Descartado' }, {}]) {
      respondWith({ ok: true, data });
      equal(await reportPayment(p, true), 'failed');
      equal(knownTxIds.size, 0);
    }
  });
  await test('Escaneos simultáneos esperan el mismo envío', async () => {
    const p = payment();
    respondWith({ ok: true, data: { success: true } });
    equal(await Promise.all([reportPayment(p), reportPayment(p), reportPayment(p, true)]), ['confirmed', 'confirmed', 'confirmed']);
    equal(requests.length, 1);
  });
  await test('Duplicado confirmado por ERP no se vuelve a enviar', async () => {
    const p = payment();
    respondWith({ ok: true, data: { success: true, isDuplicate: true } });
    equal(await reportPayment(p), 'duplicate');
    equal(await reportPayment(p), 'duplicate');
    equal(requests.length, 1);
  });
  await test('Error del canal Chrome permite reintento manual', async () => {
    const p = payment();
    chrome.runtime.sendMessage = (request, callback) => {
      chrome.runtime.lastError = { message: 'Canal cerrado' };
      callback();
      chrome.runtime.lastError = undefined;
    };
    equal(await reportPayment(p), 'failed');
    respondWith({ ok: true, data: { success: true } });
    equal(await reportPayment(p, true), 'confirmed');
  });
  await test('Cambiar cuenta no suprime el envío de esa cuenta', async () => {
    const p = payment();
    respondWith({ ok: true, data: { success: true } });
    await reportPayment(p);
    config.accountName = 'diegozono.mp';
    await reportPayment(p);
    equal(requests.map(r => r.payload.account), ['pagoszono.26', 'diegozono.mp']);
  });
  await test('Manual informa confirmados, duplicados y fallos reales', async () => {
    mount('<h2>Hoy</h2>' + row('Nuevo') + row('Duplicado', '200') + '<h2>14 de septiembre</h2>' + row('Fallido', '300'));
    const messages = [];
    const originalToast = showToast;
    showToast = message => messages.push(message);
    chrome.runtime.sendMessage = (request, callback) => {
      requests.push(request);
      callback(request.payload.text.includes('Fallido') ? { ok: false } :
        { ok: true, data: { success: true, isDuplicate: request.payload.text.includes('Duplicado') } });
    };
    try {
      await manualSyncVisibleActivities();
      equal(requests.length, 3);
      assert(messages.at(-1).includes('1 ingresados · 1 ya registrados · 1 fallaron'), messages.at(-1));
    } finally { showToast = originalToast; }
  });
  const failed = results.filter(result => result.startsWith('FAIL')).length;
  document.getElementById('results').textContent = `${results.length - failed}/${results.length} pruebas OK\n${results.join('\n')}`;
  document.title = failed ? `${failed} pruebas fallaron` : `${results.length} pruebas OK`;
  fixture.innerHTML = '';
})(); }, 0);
