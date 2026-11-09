import { validCalendarDate } from '@/lib/dates/dateFields';
import { EMPLOYEE_WITHDRAWAL_PAYMENT, employeeReviewLabels, withdrawalMapUrl } from '@/lib/employeeWithdrawals';

const spreadsheetId = '1EZXtAdloYtoSt9x52w_H4_slLmteogIZK4aYKgA5mQg';
const sheetId = 1609233686;
const title = 'Retiros';
const headerRows = 3;
const productSlots = 12;
const firstProduct = 29; // AD, zero-based. Each slot has SKU, quantity, price and subtotal.
const ownershipKey = 'zono.employee_withdrawal';

export interface LegacyWithdrawal {
  code: string;
  employee: string;
  state: string;
  status: string;
  seller_name?: string;
  order_date?: string;
  delivery_date?: string;
  deadline?: string;
  phone?: string;
  operational_note?: string;
  address?: string;
  locality?: string;
  maps_link?: string | null;
  mode?: 'pickup' | 'home';
  category: string;
  beneficiary_type?: 'employee' | 'carrier' | 'external' | 'personal';
  discount_rate?: number;
  total?: number;
  items: { name: string; sku?: string; quantity: number; price?: number }[];
}

type CellValue = { stringValue: string } | { numberValue: number } | { formulaValue: string };
type SheetCell = { userEnteredValue?: CellValue; note?: string };

function columnName(index: number) {
  let label = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    label = String.fromCharCode(65 + (n - 1) % 26) + label;
  }
  return label;
}

function sheetDate(value?: string) {
  if (!value || !validCalendarDate(value)) return undefined;
  return Math.round((Date.parse(value + 'T00:00:00Z') - Date.UTC(1899, 11, 30)) / 86400000);
}

const cents = (value: number) => Math.round(value * 100);

export async function writeLegacyWithdrawal(token: string, snapshot: LegacyWithdrawal) {
  const number = Number(/^RMRH(\d{5,})$/.exec(snapshot.code)?.[1]);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error('Código inválido para la planilla histórica de retiros.');
  if (snapshot.total == null || !Number.isFinite(snapshot.total) ||
      snapshot.items.some(item => item.price == null || !Number.isFinite(item.price))) {
    throw new Error('Faltan los importes del ERP para sincronizar la planilla histórica de retiros.');
  }
  const endpoint = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
  async function request(path: string, body?: unknown) {
    const response = await fetch(endpoint + path, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Planilla histórica de retiros: Google Sheets respondió ${response.status}.`);
    return response.json();
  }

  const metadata = await request('?fields=sheets(properties(sheetId,title,gridProperties(rowCount)))');
  const sheet = metadata.sheets?.find((entry: { properties: { sheetId: number; title: string } }) =>
    entry.properties.sheetId === sheetId && entry.properties.title === title)?.properties;
  if (!sheet) throw new Error('La pestaña histórica Retiros no está disponible.');

  const valuePath = (range: string) => '/values/' + encodeURIComponent(`'${title}'!${range}`);
  const matchedRows: number[] = [];
  for (let start = headerRows + 1; start <= sheet.gridProperties.rowCount; start += 10000) {
    const codes = await request(valuePath(`A${start}:A${Math.min(start + 9999, sheet.gridProperties.rowCount)}`));
    (codes.values ?? []).forEach((row: unknown[], index: number) => {
      if (String(row[0] ?? '').trim() === snapshot.code) matchedRows.push(start + index);
    });
  }
  if (matchedRows.length > 1) throw new Error('El código del retiro está duplicado en la planilla histórica.');
  const row = matchedRows[0] ?? number + headerRows;
  if (row > sheet.gridProperties.rowCount) {
    await request(':batchUpdate', { requests: [{ appendDimension: {
      sheetId, dimension: 'ROWS', length: row - sheet.gridProperties.rowCount,
    } }] });
  }

  const anchor = `'${title}'!A${row}:BY${row}`;
  const before = await request('?ranges=' + encodeURIComponent(anchor) +
    '&fields=sheets(data(rowData(values(userEnteredValue,note)),rowMetadata(developerMetadata(metadataKey,metadataValue))))');
  const grid = before.sheets?.[0]?.data?.[0];
  const cells: SheetCell[] = grid?.rowData?.[0]?.values ?? [];
  const codeCell = cells[0]?.userEnteredValue;
  const code = codeCell && 'stringValue' in codeCell ? codeCell.stringValue.trim() : '';
  const marker = `Pedido gestionado por el ERP: ${snapshot.code}`;
  const oldMarker = cells[0]?.note === marker;
  const rowMetadata: { metadataKey: string; metadataValue: string }[] = grid?.rowMetadata?.[0]?.developerMetadata ?? [];
  const ownership = rowMetadata.filter(entry => entry.metadataKey === ownershipKey);
  const owned = ownership.some(entry => entry.metadataValue === snapshot.code);
  if ((codeCell && code !== snapshot.code) || (matchedRows.length && code !== snapshot.code) ||
      ownership.some(entry => entry.metadataValue !== snapshot.code) || (!owned && cells[0]?.note && !oldMarker)) {
    throw new Error('La fila reservada para el código está ocupada en la planilla histórica.');
  }

  const values = new Map<number, CellValue | undefined>();
  function set(index: number, value?: string | number) {
    values.set(index, typeof value === 'number' ? { numberValue: value } : value ? { stringValue: value } : undefined);
  }
  function formula(index: number, value: string) {
    values.set(index, { formulaValue: value });
  }

  const gross = snapshot.items.reduce((sum, item) => sum + item.quantity * cents(item.price ?? 0), 0);
  const discount = gross - cents(snapshot.total);
  if (discount < 0) throw new Error('El total del retiro supera el importe de sus productos.');
  const availableProductSlots = discount > 0 ? productSlots - 1 : productSlots;
  const sheetItems = snapshot.items.slice(0, availableProductSlots);
  const overflow = snapshot.items.slice(availableProductSlots);
  if (discount > 0) sheetItems.push({ name: 'Descuento de empleado', quantity: 1, price: -discount / 100 });
  const otherSubtotal = overflow.reduce((sum, item) => sum + item.quantity * cents(item.price ?? 0), 0);
  const status = ['cancelled', 'rejected'].includes(snapshot.state) ? '❌ Anulado' :
    snapshot.state !== 'approved' ? '' : snapshot.status === 'Entregado' ? '🟢 Entregado' : '🔹 Pasado';
  const locality = snapshot.mode === 'home' ? snapshot.locality : undefined;
  const mapsLink = snapshot.mode === 'home'
    ? snapshot.maps_link || withdrawalMapUrl(snapshot.address ?? '', locality ?? '')
    : undefined;
  const deliveryDate = snapshot.delivery_date ?? (snapshot.mode === 'pickup' ? snapshot.order_date : undefined);
  const dates = [sheetDate(deliveryDate), sheetDate(snapshot.order_date), sheetDate(snapshot.deadline ?? deliveryDate)];
  const payroll = snapshot.beneficiary_type !== 'carrier' && snapshot.beneficiary_type !== 'external';
  const detail = [
    employeeReviewLabels[snapshot.state],
    snapshot.mode === 'home' ? `Envío a domicilio · ${snapshot.locality ?? ''}` : 'Retiro en depósito',
    payroll ? 'Descuento por nómina' : 'Acuerdo fuera de nómina',
    snapshot.seller_name && `Cargado por ${snapshot.seller_name}`,
    `Categoría: ${snapshot.category}`,
    snapshot.discount_rate ? `Descuento: ${snapshot.discount_rate}%` : '',
    snapshot.operational_note,
    overflow.length ? `Productos adicionales: ${overflow.map(item => `${item.quantity} × ${item.sku || item.name}`).join(' · ')}` : '',
  ].filter(Boolean).join('\n');
  set(0, snapshot.code);
  dates.forEach((date, index) => set(index + 1, date));
  set(4, snapshot.employee);
  set(5, snapshot.phone);
  set(9, detail);
  set(15, status);
  set(16, locality);
  set(17, snapshot.mode === 'home' ? snapshot.address : undefined);
  set(18, mapsLink);
  set(20, payroll ? EMPLOYEE_WITHDRAWAL_PAYMENT : undefined);

  const subtotalRefs: string[] = [];
  for (let index = 0; index < productSlots; index++) {
    const start = firstProduct + 4 * index;
    const item = sheetItems[index];
    set(start, item?.sku || item?.name);
    set(start + 1, item?.quantity);
    set(start + 2, item?.price);
    const subtotal = start + 3;
    subtotalRefs.push(columnName(subtotal) + row);
    const existing = cells[subtotal]?.userEnteredValue;
    if (!existing || !('formulaValue' in existing)) {
      formula(subtotal, `=${columnName(start + 1)}${row}*${columnName(start + 2)}${row}`);
    }
  }
  formula(27, `=${subtotalRefs.join('+')}+${otherSubtotal}/100`);
  formula(28, `=AB${row}`);

  if (!owned && !oldMarker && [...values.keys()].some(index => {
    if (index === 0) return false;
    const cell = cells[index]?.userEnteredValue;
    return cell && !('formulaValue' in cell) && !('numberValue' in cell && cell.numberValue === 0) &&
      !('stringValue' in cell && !cell.stringValue.trim());
  })) throw new Error('El código ya tiene datos en la planilla histórica. El ERP no los sobrescribió.');

  const writes = Array.from(values, ([columnIndex, userEnteredValue]) => ({
    updateCells: {
      start: { sheetId, rowIndex: row - 1, columnIndex },
      rows: [{ values: [{ ...(userEnteredValue ? { userEnteredValue } : {}) }] }],
      fields: columnIndex === 0 && oldMarker ? 'userEnteredValue,note' : 'userEnteredValue',
    },
  }));
  const ownershipWrites = owned ? [] : [{ createDeveloperMetadata: { developerMetadata: {
    metadataKey: ownershipKey, metadataValue: snapshot.code, visibility: 'DOCUMENT',
    location: { dimensionRange: { sheetId, dimension: 'ROWS', startIndex: row - 1, endIndex: row } },
  } } }];
  await request(':batchUpdate', { requests: [...writes, ...ownershipWrites, { repeatCell: {
    range: { sheetId, startRowIndex: row - 1, endRowIndex: row, startColumnIndex: 1, endColumnIndex: 4 },
    cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'dd/mm/yyyy' } } },
    fields: 'userEnteredFormat.numberFormat',
  } }] });
  const verified = (await request(valuePath(`A${row}:BY${row}`) + '?valueRenderOption=UNFORMATTED_VALUE')).values?.[0];
  if (verified?.[0] !== snapshot.code || verified?.[4] !== snapshot.employee ||
      dates.some((date, index) => String(verified?.[index + 1] ?? '') !== String(date ?? '')) ||
      verified?.[9] !== detail || String(verified?.[15] ?? '') !== status ||
      String(verified?.[16] ?? '') !== (locality ?? '') || String(verified?.[18] ?? '') !== (mapsLink ?? '') ||
      typeof verified?.[28] !== 'number' || cents(verified[28]) !== cents(snapshot.total)) {
    throw new Error('La planilla histórica no confirmó el código, el estado o el importe del ERP.');
  }
  if (discount > 0) {
    const discountColumn = firstProduct + (sheetItems.length - 1) * 4;
    if (verified[discountColumn] !== 'Descuento de empleado' || verified[discountColumn + 1] !== 1 ||
        typeof verified[discountColumn + 2] !== 'number' || cents(verified[discountColumn + 2]) !== -discount) {
      throw new Error('La planilla histórica no confirmó el renglón de descuento.');
    }
  }
}
