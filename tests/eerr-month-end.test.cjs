const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function eerrApi(days, firstDayColumn = 9, month = 9) {
  const sheet = Array.from({ length: 40 }, () => []);
  sheet[0][1] = 'Concepto';
  for (let day = 1; day <= days; day++) {
    sheet[0][firstDayColumn + day - 1] = `${day}/${month}`;
    sheet[2][firstDayColumn + day - 1] = '1.000';
    sheet[3][firstDayColumn + day - 1] = '400';
    sheet[4][firstDayColumn + day - 1] = '30';
  }
  sheet[0][firstDayColumn - 1] = 'Facturación';
  sheet[0][firstDayColumn + days] = 'Total';
  sheet[2][1] = 'Facturación';
  sheet[2][3] = String(days * 1000);
  sheet[3][1] = 'Costo mercadería';
  sheet[3][4] = String(days * 400);
  sheet[4][1] = 'MercadoPago';
  sheet[4][4] = String(days * 30);

  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/api/admin/finanzas/eerr/route.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, process: { env: {} }, URL, Date, console,
    require: name => {
      if (name === '@/lib/financeAdminAccess') return { requireFinanceAdmin: async () => null };
      if (name === '@/lib/googleSheets') return { fetchSpreadsheetValues: async (_id, range) => {
        if (!range.startsWith('EERR!')) return [];
        // Apply the requested column boundary, reproducing the old AK cutoff.
        const endColumn = range.match(/:([A-Z]+)\d+$/)?.[1];
        const width = endColumn ? Array.from(endColumn).reduce((n, char) => n * 26 + char.charCodeAt(0) - 64, 0) : Infinity;
        return sheet.map(row => row.slice(0, width));
      } };
      if (name === '@supabase/supabase-js') return { createClient: () => ({ from: () => {
        const query = { data: [] };
        query.select = query.or = query.neq = query.limit = () => query;
        return query;
      } }) };
      if (name === 'next/server') return { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return exports;
}

test('September 29 and 30 reach the matrix, daily results and card audit', async () => {
  const response = await eerrApi(30).GET({ url: 'https://example.test/eerr?refresh=true' });
  assert.equal(response.status, 200);
  const data = response.body;
  assert.equal(data.success, true);
  assert.equal(data.matrix.days.length, 30);
  assert.deepEqual(Array.from(data.matrix.days.slice(-2)), ['29/9', '30/9']);
  assert.equal(data.kpis.totalDiasMes, 30);
  assert.equal(data.kpis.diasRegistrados, 30);
  for (const day of data.dailyTimeline.slice(-2)) {
    assert.equal(day.revenue, 1000);
    assert.equal(day.cmv, 400);
    assert.equal(day.hasData, true);
  }
  for (const group of data.matrix.groups) {
    assert.equal(group.subtotal.dailyValues.length, 30);
    for (const row of group.rows) assert.equal(row.dailyValues.length, 30);
  }
  const revenue = data.matrix.groups.find(group => group.id === 'ingresos');
  assert.deepEqual(Array.from(revenue.subtotal.dailyValues.slice(-2)), [1000, 1000]);
  assert.deepEqual(Array.from(data.cardSurchargeAnalysis.dailyTimeline.slice(-2), day => [day.day, day.mpCost]), [['29/9', 30], ['30/9', 30]]);
});

test('a 31-day sheet with shifted columns keeps the last day and ignores summary headers', async () => {
  const response = await eerrApi(31, 11, 10).GET({ url: 'https://example.test/eerr' });
  assert.equal(response.status, 200);
  assert.equal(response.body.matrix.days.length, 31);
  assert.equal(response.body.matrix.days.at(-1), '31/10');
  assert.equal(response.body.dailyTimeline.at(-1).revenue, 1000);
  assert.equal(response.body.matrix.days.includes('Total'), false);
  assert.equal(response.body.matrix.days.includes('Facturación'), false);
});
