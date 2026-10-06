const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function loadRoute(readRanges) {
  const exports = {};
  const source = fs.readFileSync('src/app/api/admin/produccion-data/route.ts', 'utf8');
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, {
    exports,
    require(name) {
      if (name === 'next/server') return {
        NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) }
      };
      if (name === '@/lib/googleSheets') return { fetchSpreadsheetValueRanges: readRanges };
      throw new Error(`Unexpected import: ${name}`);
    },
    console: { error() {} }
  });
  return exports;
}

test('reads complete production ranges and preserves the hidden G column before quality and status', async () => {
  const route = loadRoute(async (id, ranges) => {
    assert.equal(id, '1z_yqAdxYn0aESDIARhL_Y9KyYSidQ2tp7Ezkqde0IE0');
    assert.equal(Array.from(ranges).join('|'), "'Fabricación'!A:M|'Ensamblaje'!A:I");
    return [
      [['Fecha', 'Producto'],
        ['06/10/2026', 'Aquafort - TRIC 500L Gris', '12', '2. Tarde', 'SIMPLE', 'Leonardo', 'Julio', 'De segunda', 'Planificado', 'Media', 'NO', 'Gris', 'Detalle, con coma\ny salto'],
        ['05/10/2026', 'Tacho Cónico 700L', '7', '1. Mañana', 'DOBLE', 'Samuel', '', 'Roto o Inutilizable', 'Cancelado', 'Baja', 'SI']],
      [['Fecha', 'Producto'],
        ['06/10/2026', 'Tanque 500L', '4', 'Julio', 'Campo oculto E', 'Planificado', 'Alta', 'NO', '2. Tarde']]
    ];
  });
  const { body, status } = await route.GET();
  assert.equal(status, 200);
  const [planned, cancelled] = body.data.fabricacion;
  assert.equal(planned.cantidad, 12);
  assert.equal(planned.operarioSecundario, 'Julio');
  assert.equal(planned.calidad, 'De segunda');
  assert.equal(planned.estado, 'Planificado');
  assert.equal(planned.prioridad, 'Media');
  assert.equal(planned.aStock, 'NO');
  assert.equal(planned.color, 'Gris');
  assert.equal(planned.observaciones, 'Detalle, con coma\ny salto');
  assert.equal(cancelled.operarioSecundario, '');
  assert.equal(cancelled.calidad, 'Roto o Inutilizable');
  assert.equal(cancelled.estado, 'Cancelado');
  assert.equal(body.data.ensamblaje[0].estado, 'Planificado');
  assert.equal(body.data.ensamblaje[0].aStock, 'NO');
  assert.equal(body.data.ensamblaje[0].turno, '2. Tarde');
});

test('handles blank rows and omitted trailing cells from the values API', async () => {
  const route = loadRoute(async () => [
    [['Fecha', 'Producto'], [], ['06/10/2026', 'Cono Biodigestor', '11']], []
  ]);
  const { body } = await route.GET();
  assert.equal(body.data.totalFabRows, 1);
  assert.equal(body.data.totalEnsRows, 0);
  assert.equal(body.data.fabricacion[0].cantidad, 11);
  assert.equal(body.data.fabricacion[0].operarioSecundario, '');
});

test('reports denied sheet access instead of returning a successful empty synchronization', async () => {
  const route = loadRoute(async () => { throw new Error('Google Sheets batch API error: 403'); });
  const { body, status } = await route.GET();
  assert.equal(status, 500);
  assert.equal(body.success, false);
  assert.match(body.error, /403/);
});
