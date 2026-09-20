const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('la reserva consolidada por nombre tiene prioridad sobre un ID duplicado', () => {
  const source = fs.readFileSync('src/app/api/admin/sync-stock/route.ts', 'utf8');
  const blocks = [...source.matchAll(/const dbCalculatedReserved =([\s\S]*?)\|\|\s*0;/g)];
  assert.ok(blocks.length >= 2);
  for (const [, block] of blocks.slice(0, 2)) {
    const namePosition = block.indexOf('norm_${normCleanProdName}');
    const idPosition = block.indexOf('dbProd.id');
    assert.ok(namePosition >= 0 && idPosition > namePosition);
  }
  assert.match(source, /const aliases = new Set\(/);
  assert.equal((source.match(/addCalculatedReserve\(dbCalculatedReservesMap/g) || []).length, 4);
});

test('la comparación devuelve una sola fila por producto emparejado', () => {
  const source = fs.readFileSync('src/app/api/admin/sync-stock/route.ts', 'utf8');
  assert.match(source, /const comparisonByProductId = new Map<string, any>\(\)/);
  assert.match(source, /comparisonByProductId\.set\(dbProd\.id,/);
  assert.match(source, /Array\.from\(comparisonByProductId\.values\(\)\)/);
});
