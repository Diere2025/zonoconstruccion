export const customerPriceIndexSeries = '148.3_INIVELNAL_DICI_M_26';
export const customerPriceIndexSource = 'https://www.indec.gob.ar/indec/web/Nivel4-Tema-3-5-31-0';
export const customerPriceIndexApi = `https://apis.datos.gob.ar/series/api/series/?ids=${customerPriceIndexSeries}&format=json&limit=500`;
export const customerPriceIndexCsv = 'https://www.indec.gob.ar/ftp/cuadros/economia/serie_ipc_divisiones.csv';

export function parseCustomerPriceIndex(payload: unknown, today: string) {
  const input = payload as { data?: unknown[][]; meta?: Array<{ field?: { id?: string } }> };
  if (!Array.isArray(input?.data) || input.meta?.[1]?.field?.id !== customerPriceIndexSeries) {
    throw new Error('El origen no devolvió la serie nacional del IPC.');
  }
  const rows = input.data.map(row => {
    const [month, index_value] = Array.isArray(row) ? row : [];
    if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])-01$/.test(month)
      || typeof index_value !== 'number' || !Number.isFinite(index_value) || index_value <= 0 || index_value >= 1_000_000_000) {
      throw new Error('La serie del IPC contiene un dato inválido.');
    }
    return { month, index_value };
  }).filter(row => row.month < `${today.slice(0, 7)}-01`).sort((a, b) => a.month.localeCompare(b.month));

  if (rows[0]?.month !== '2016-12-01' || rows[0]?.index_value !== 100 || rows.length < 100) {
    throw new Error('La serie del IPC está incompleta.');
  }
  for (let index = 1; index < rows.length; index++) {
    const next = new Date(`${rows[index - 1].month}T00:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + 1);
    if (rows[index].month !== next.toISOString().slice(0, 10)) throw new Error('Falta un mes en la serie del IPC.');
  }
  return rows;
}

export function displayPriceIndexMonth(iso: string) {
  const [year, month] = iso.split('-');
  return `${month}/${year}`;
}
