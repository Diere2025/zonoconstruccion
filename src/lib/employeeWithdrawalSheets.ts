import { CENTRAL_ORDERS_SHEET, DELIVERIES_CURRENT_SHEET, SELLER_SHEET_CONFIG, getGoogleAccessToken } from '@/lib/googleSheets';
import { displayDateField, displayErpInstant } from '@/lib/dates/dateFields';
import { employeeReviewLabels } from '@/lib/employeeWithdrawals';

interface Snapshot {
  row: number;
  code: string;
  employee: string;
  category: string;
  created_at: string;
  state: string;
  status: string;
  delivery_closed: boolean;
  creator: string;
  mode?: 'pickup' | 'home';
  address?: string;
  locality?: string;
  delivery_date?: string;
  total?: number;
  discount_rate?: number;
  items: { name: string; quantity: number; delivered: number }[];
}

const title = 'Retiros de empleados';
const header = ['Código ERP', 'Tipo', 'Empleado', 'Carga', 'Categoría logística', 'Autorización', 'Entrega', 'Productos y cantidades',
  'Modalidad', 'Destino y fecha', 'Descuento empleado', 'Total del pedido'];

async function writeSnapshot(spreadsheet: string, token: string, snapshot: Snapshot) {
  const endpoint = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheet}`;
  async function request(path: string, body?: unknown) {
    const response = await fetch(endpoint + path, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Google Sheets respondió ${response.status}.`);
    return response.json();
  }
  async function findTab() {
    const metadata = await request('?fields=sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))');
    return metadata.sheets?.find((sheet: { properties: { title: string } }) => sheet.properties.title === title)?.properties;
  }
  let tab = await findTab();
  if (!tab) {
    try {
      const created = await request(':batchUpdate', {
        requests: [{ addSheet: { properties: { title, gridProperties: { rowCount: Math.max(1000, snapshot.row), columnCount: header.length, frozenRowCount: 1 } } } }],
      });
      tab = created.replies[0].addSheet.properties;
    } catch (error) {
      tab = await findTab();
      if (!tab) throw error;
    }
  }
  if (snapshot.row > tab.gridProperties.rowCount) {
    await request(':batchUpdate', { requests: [{ appendDimension: {
      sheetId: tab.sheetId, dimension: 'ROWS', length: Math.max(500, snapshot.row - tab.gridProperties.rowCount),
    } }] });
  }
  if (tab.gridProperties.columnCount < header.length) {
    await request(':batchUpdate', { requests: [{ appendDimension: {
      sheetId: tab.sheetId, dimension: 'COLUMNS', length: header.length - tab.gridProperties.columnCount,
    } }] });
  }
  const codes = await request(`/values/${encodeURIComponent(`'${title}'!A2:A`)}`);
  const prior = (codes.values as string[][] | undefined)?.findIndex(row => row[0] === snapshot.code) ?? -1;
  const row = prior >= 0 ? prior + 2 : snapshot.row;
  if (prior < 0 && codes.values?.[row - 2]?.[0]) {
    throw new Error('La fila asignada al retiro está ocupada por otro código.');
  }
  const partial = snapshot.items.some(item => item.delivered > 0);
  const status = snapshot.status === 'Entregado' ? 'Entregado' : snapshot.delivery_closed ? 'Entrega cerrada' : partial ? 'Entrega parcial' :
    snapshot.state === 'approved' ? (snapshot.mode === 'home' ? 'Habilitado para envío' : 'Habilitado para retiro') : 'No entregar';
  const values = [
    snapshot.code, 'Retiro de empleado', snapshot.employee, displayErpInstant(snapshot.created_at),
    snapshot.category, employeeReviewLabels[snapshot.state], status,
    snapshot.items.map(item => `${item.name} (${item.delivered}/${item.quantity})`).join(' · '),
    snapshot.mode === 'home' ? 'Envío a domicilio' : 'Retiro en depósito',
    snapshot.mode === 'home' ? [snapshot.address, snapshot.locality, displayDateField(snapshot.delivery_date ?? '')].filter(Boolean).join(' · ') : '',
    snapshot.discount_rate != null ? `${snapshot.discount_rate}%` : '',
    snapshot.total ?? '',
  ];
  const written = await request('/values:batchUpdate', {
    valueInputOption: 'RAW',
    includeValuesInResponse: true,
    responseValueRenderOption: 'UNFORMATTED_VALUE',
    data: [
      { range: `'${title}'!A1:L1`, values: [header] },
      { range: `'${title}'!A${row}:L${row}`, values: [values] },
    ],
  });
  const echoed = written.responses?.[1]?.updatedData?.values?.[0];
  if (!echoed || values.some((value, index) => String(echoed[index] ?? '') !== String(value ?? ''))) {
    throw new Error('Google Sheets no confirmó los datos del retiro.');
  }
}

export async function syncEmployeeWithdrawalSheets(snapshot: Snapshot) {
  const spreadsheets = new Set([CENTRAL_ORDERS_SHEET.spreadsheetId, DELIVERIES_CURRENT_SHEET.spreadsheetId]);
  const config = SELLER_SHEET_CONFIG[snapshot.creator];
  if (config?.enabled) spreadsheets.add(config.spreadsheetId);
  const token = await getGoogleAccessToken();
  const results = await Promise.allSettled([...spreadsheets].map(sheet => writeSnapshot(sheet, token, snapshot)));
  const failure = results.find(result => result.status === 'rejected');
  if (failure?.status === 'rejected') throw failure.reason;
}
