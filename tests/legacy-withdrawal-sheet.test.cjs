const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const snapshot = {
  code: 'RMRH00155', employee: 'Persona de prueba', state: 'pending', status: 'En Espera',
  order_date: '2026-11-07', mode: 'home', delivery_date: '2026-11-09', deadline: '2026-11-09',
  address: 'Domicilio de prueba', locality: 'Morón', category: 'ESCALERAS', discount_rate: 5, total: 151050,
  maps_link: 'https://maps.app.goo.gl/example',
  items: [{ name: 'Escalera', sku: 'SKU de prueba', quantity: 1, price: 159000 }],
};

function fixture(existingCustomer, existingNote) {
  const row = [{ userEnteredValue: { stringValue: 'RMRH00155' } }];
  if (existingCustomer) row[4] = { userEnteredValue: { stringValue: existingCustomer } };
  if (existingNote) row[0].note = existingNote;
  const developerMetadata = [];
  const batches = [];
  const loaded = {};
  const employeeWithdrawals = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/employeeWithdrawals.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports: employeeWithdrawals, URLSearchParams, require: () => ({}) });
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/legacyWithdrawalSheet.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports: loaded, AbortSignal,
    require: name => {
      if (name.endsWith('dateFields')) return { validCalendarDate: value => /^\d{4}-\d{2}-\d{2}$/.test(value) };
      if (name.endsWith('employeeWithdrawals')) return employeeWithdrawals;
      throw new Error(`Unexpected dependency ${name}`);
    },
    fetch: async (input, options) => {
      const url = new URL(input);
      const ok = value => ({ ok: true, json: async () => value });
      if (url.searchParams.has('ranges')) return ok({ sheets: [{ data: [{ rowData: [{ values: row }],
        rowMetadata: [{ developerMetadata }],
      }] }] });
      if (url.searchParams.has('fields')) return ok({ sheets: [{ properties: {
        sheetId: 1609233686, title: 'Retiros', gridProperties: { rowCount: 606 },
      } }] });
      if (url.pathname.endsWith(':batchUpdate')) {
        const body = JSON.parse(options.body);
        batches.push(body);
        for (const { updateCells, createDeveloperMetadata } of body.requests) {
          if (createDeveloperMetadata) developerMetadata.push(createDeveloperMetadata.developerMetadata);
          if (!updateCells) continue;
          assert.equal(updateCells.start.rowIndex, 157);
          row[updateCells.start.columnIndex] = updateCells.rows[0].values[0];
        }
        return ok({});
      }
      if (url.searchParams.has('valueRenderOption')) {
        const effective = row.map(cell => cell?.userEnteredValue?.stringValue ?? cell?.userEnteredValue?.numberValue ?? '');
        effective[28] = snapshot.total;
        return ok({ values: [effective] });
      }
      const codes = Array.from({ length: 155 }, () => []);
      codes[154] = ['RMRH00155'];
      return ok({ values: codes });
    },
  });
  return { write: loaded.writeLegacyWithdrawal, row, batches, developerMetadata };
}

test('legacy mirror uses the reserved ERP code, shows review, and retries on the same row', async () => {
  const { write, row, batches, developerMetadata } = fixture();
  await write('fake-token', snapshot);
  assert.equal(row[0].userEnteredValue.stringValue, snapshot.code);
  assert.match(row[9].userEnteredValue.stringValue, /^Aún no validado/);
  assert.equal(row[20].userEnteredValue.stringValue, 'Descuento Sueldo');
  assert.equal(row[15].userEnteredValue, undefined);
  assert.equal(row[16].userEnteredValue.stringValue, 'Morón');
  assert.equal(row[0].note, undefined);
  assert.equal(row[28].userEnteredValue.formulaValue, '=AB158');
  assert.equal(row[29].userEnteredValue.stringValue, 'SKU de prueba');
  assert.equal(row[18].userEnteredValue.stringValue, snapshot.maps_link);
  assert.equal(row[33].userEnteredValue.stringValue, 'Descuento de empleado');
  assert.equal(row[34].userEnteredValue.numberValue, 1);
  assert.equal(row[35].userEnteredValue.numberValue, -7950);
  assert.equal(batches[0].requests.at(-1).repeatCell.cell.userEnteredFormat.numberFormat.pattern, 'dd/mm/yyyy');
  await write('fake-token', { ...snapshot, state: 'approved', status: 'Pendiente' });
  assert.equal(row[15].userEnteredValue.stringValue, '🔹 Pasado');
  assert.equal(batches.length, 2);
  assert.equal(developerMetadata.length, 1);
});

test('legacy mirror migrates the ERP note and generates a map from the saved destination', async () => {
  const { write, row, developerMetadata } = fixture(snapshot.employee, 'Pedido gestionado por el ERP: RMRH00155');
  await write('fake-token', { ...snapshot, maps_link: null });
  assert.equal(row[0].note, undefined);
  assert.equal(developerMetadata[0].metadataValue, snapshot.code);
  const map = new URL(row[18].userEnteredValue.stringValue);
  assert.equal(map.searchParams.get('query'), 'Domicilio de prueba, Morón');
});

test('pickup withdrawals keep their dates in all three historical columns', async () => {
  const { write, row } = fixture();
  const serial = (Date.UTC(2026, 10, 7) - Date.UTC(1899, 11, 30)) / 86400000;
  await write('fake-token', { ...snapshot, mode: 'pickup', delivery_date: '2026-11-07', deadline: '2026-11-07' });
  assert.deepEqual(row.slice(1, 4).map(cell => cell.userEnteredValue.numberValue), [serial, serial, serial]);
  assert.equal(row[17].userEnteredValue, undefined);
  assert.equal(row[18].userEnteredValue, undefined);
});

test('legacy mirror refuses to overwrite a historical order with the same code', async () => {
  const { write, batches } = fixture('Otro pedido');
  await assert.rejects(write('fake-token', snapshot), /ya tiene datos/);
  assert.equal(batches.length, 0);
});
