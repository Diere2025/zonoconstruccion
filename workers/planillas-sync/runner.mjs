import { parseCSV, mergeContiguousSheetRows } from './rows.mjs';

export const TIME_ZONE = 'America/Argentina/Buenos_Aires';
export const CRONS = ['0 10 * * *', '0 17 * * *', '30 2 * * *'];
export const SHEETS = [
  ['Jazmín Sánchez', '16DPcJEdrTMYvNSaUKQo9ODKClqe1VHLlKOX6O_sELRw', '13430e05-b61a-4a3f-9fc3-152d377c4b0c', 'web_organica', '1414092286'],
  ['Diego Bóveda', '1ccs1yPtwSSUf6dcA5XpxhpvPaWmHfJ0zsCfyJvEBvtg', '381df0d1-183f-4ccb-aaf2-8147c76159a9', 'mostrador_minorista', '1414092286'],
  ['Ludmila Krenz', '1tp10RNH7z5VpWL9eVmofpOVrB2HzEpfbSEc1ngKO9_8', '54b2d319-8f6f-47ff-b794-b7731978410a', 'mostrador_minorista', '1414092286'],
  ['Facundo Paz', '1c0iswWt2GAv8NhXfNgIlaOul9wanpZHaeMFeN2Pr0ns', '3820a0fe-bb0a-4a84-ad85-79e49868cad7', 'mostrador_minorista', ''],
  ['Central/Ruteo', '1nz545_xNUgdI2LMAGIDCjh6Qs8-vUDHdynzj7jU2wm0', '381df0d1-183f-4ccb-aaf2-8147c76159a9', 'mostrador_minorista', '786380854'],
].map(([name, id, defaultSellerId, defaultChannel, gid], index) => ({
  name, defaultSellerId, defaultChannel, isCentralSheet: index === 4,
  url: `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv${gid ? `&gid=${gid}` : ''}`,
}));
const STOCK_URL = 'https://docs.google.com/spreadsheets/d/1vrI3WFH6W35sj9JJ4sa3yr7XlJDaKP920R6t54jLW6o/export?format=csv&gid=447948741';
const words = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const codes = value => String(value || '').split(/[/,]/).map(x => x.trim().toUpperCase()).filter(Boolean);
const formulaError = value => /^#(?:REF!|N\/A|VALUE!|ERROR!|DIV\/0!|NAME\?|NUM!)/i.test(String(value).trim());

export function activeCodes(orders) {
  return new Set(orders.filter(o => ['Pendiente', 'Confirmado', 'Entregando'].includes(o.status)).flatMap(o => codes(o.legacy_code)));
}

export function selectRows(rows, sheet, active) {
  return rows.slice(1).filter(row => {
    const code = String(row[1] || '').trim().toUpperCase();
    if (!code || code.startsWith('ENC')) return false;
    const status = words(row[0]);
    const existing = codes(code).some(part => active.has(part));
    return sheet.isCentralSheet
      ? !['entregado', 'cancelado', 'anulado', 'pasado'].includes(status) || existing
      : status === 'no esta' || existing;
  });
}

export function readOrderSource(csv, label) {
  if (/<(?:!DOCTYPE|html)/i.test(csv)) throw Error(`${label}: se recibió HTML en lugar de la planilla.`);
  const rows = parseCSV(csv);
  if (rows.length < 2 || !/codigo/.test(words(rows[0]?.[1]))) throw Error(`${label}: encabezado o datos de pedidos inválidos.`);
  if (rows.some(row => row.slice(0, 3).some(formulaError))) throw Error(`${label}: hay errores de fórmula en códigos o estados.`);
  return mergeContiguousSheetRows(rows);
}

export function checkStockSource(csv) {
  const rows = parseCSV(csv);
  const headers = rows[0]?.map(words) || [];
  const product = headers.findIndex(h => h.startsWith('producto'));
  const physical = headers.findIndex(h => h.startsWith('stock actual'));
  if (product < 0 || physical < 0) throw Error('Stock: encabezado inválido.');
  const products = rows.slice(1).filter(row => String(row[product] || '').trim());
  if (!products.length) throw Error('Stock: la fuente está vacía.');
  for (const row of products) {
    if (row.some(formulaError) || !String(row[physical] ?? '').trim() || !Number.isFinite(Number(String(row[physical]).replace(',', '.')))) {
      throw Error('Stock: faltan cantidades o hay errores de fórmula. No se actualizará el stock.');
    }
  }
  return products.length;
}

/** Orchestrates the existing production endpoints; business rules stay in the ERP. */
export async function runSync({ request, progress = async () => {}, dryRun = false, runId = crypto.randomUUID() }) {
  const summary = { dryRun, sheets: [], imported: 0, updated: 0, logisticsUpdated: 0, stockUpdated: 0,
    protectedPartialRows: 0, deliveryDateConflicts: 0, warnings: [] };
  await progress('Leyendo fuentes', summary);
  const master = await request('/api/admin/import-master-data?scope=orders');
  if (!Array.isArray(master.orders) || !master.orders.length) throw Error('No se pudo leer el índice de pedidos.');
  const active = activeCodes(master.orders);
  // Finish all source reads before allowing the first mutation; sequential
  // downloads leave connection headroom for Cloudflare and PostgREST.
  const sources = [];
  for (const sheet of SHEETS) {
    const csv = await request(`/api/admin/fetch-sheet?url=${encodeURIComponent(sheet.url)}`, { text: true });
    const rows = selectRows(readOrderSource(csv, sheet.name), sheet, active);
    sources.push({ sheet, rows });
    summary.sheets.push({ name: sheet.name, rows: rows.length, processed: 0 });
  }
  summary.stockSourceProducts = checkStockSource(await request(`/api/admin/fetch-sheet?url=${encodeURIComponent(STOCK_URL)}`, { text: true }));
  if (!dryRun) {
    for (let index = 0; index < sources.length; index++) {
      const { sheet, rows } = sources[index];
      let offset = 0, size = 5, fast = 0;
      while (offset < rows.length) {
        await progress(`Pedidos: ${sheet.name}`, summary);
        const batch = rows.slice(offset, offset + size);
        const started = Date.now();
        // Do not blindly retry mutations after an ambiguous network failure.
        const result = await request('/api/admin/import-sheet', { body: {
          sheetName: `${sheet.name} (Automático)`, rows: batch, skipENC: true,
          skipCAMB: false, syncPaymentMethods: false, defaultSellerId: sheet.defaultSellerId,
          defaultChannel: sheet.defaultChannel, isCentralSheet: sheet.isCentralSheet,
          importRunId: runId, sourceName: sheet.name, sourceUrl: sheet.url,
        } });
        const warnings = result.warnings || [];
        // The existing importer deliberately preserves the full ERP detail
        // when one seller row is only part of a grouped order. Its support
        // ticket remains open; this safeguard is not a failed write.
        const protectedWarnings = warnings.filter(warning => /^Pedido [A-Z0-9_ /,\-]+: fila parcial de [A-Z0-9_ /,\-]+; se conservan artículos e importes del ERP\.$/i.test(
          String(warning).replace(/^\[[^\]]+\]\s*/, '').replace(/^⚠️?\s*/, '')
        ));
        if (result.success !== true || protectedWarnings.length !== warnings.length || result.supportAlerts?.failed > 0) {
          throw Error(`${sheet.name}: el lote devolvió incidencias; se detuvo antes del stock.`);
        }
        summary.protectedPartialRows += protectedWarnings.length;
        for (const warning of protectedWarnings) summary.warnings.push({ source: sheet.name, kind: 'protected_partial_row', message: warning });
        summary.imported += result.totalImported || 0;
        summary.updated += result.totalUpdated || 0;
        offset += batch.length;
        summary.sheets[index].processed = offset;
        const elapsed = Date.now() - started;
        if (elapsed >= 8000) { size = Math.max(5, size / 2); fast = 0; }
        else if (elapsed <= 4000 && ++fast >= 2) { size = Math.min(20, size * 2); fast = 0; }
      }
    }
  }
  let cursor = 0;
  let review = { reviewMode: 'recent', reviewDays: 3 };
  await progress(dryRun ? 'Verificando logística sin cambios' : 'Conciliando logística', summary);
  for (let batch = 0; ; batch++) {
    if (batch >= 200) throw Error('Logística excedió el límite de lotes.');
    const result = await request('/api/admin/audit-deliveries', { body: { ...review, cursor, batchSize: 250, syncRunId: runId, dryRun } });
    if (result.success !== true || typeof result.done !== 'boolean') throw Error('Logística devolvió un resultado incompleto.');
    // This count reports stored dates that the API explicitly did NOT
    // overwrite. Match the manual flow: preserve them, record the notice,
    // and continue the independent physical-stock reconciliation.
    if (result.conflictingDeliveryDatesCount > 0) {
      summary.deliveryDateConflicts += result.conflictingDeliveryDatesCount;
      summary.warnings.push({ source: 'Logística', kind: 'preserved_delivery_dates', count: result.conflictingDeliveryDatesCount });
    }
    summary.logisticsUpdated += (dryRun ? result.plannedUpdatesCount : result.syncedOrdersCount) || 0;
    if (result.done) break;
    if (!Number.isInteger(result.nextCursor) || result.nextCursor <= cursor) throw Error('Logística no avanzó de lote.');
    if (cursor === 0) {
      if (!Array.isArray(result.reviewOrderCodes)) throw Error('Logística no devolvió el índice fijo de pedidos.');
      review = { reviewMode: result.review?.mode === 'full' ? 'full' : 'resolved-recent', reviewSince: result.review?.since, reviewOrderCodes: result.reviewOrderCodes };
    }
    cursor = result.nextCursor;
    await progress('Conciliando logística', summary);
  }
  await progress('Verificando stock', summary);
  checkStockSource(await request(`/api/admin/fetch-sheet?url=${encodeURIComponent(STOCK_URL)}`, { text: true }));
  const comparison = await request('/api/admin/sync-stock');
  if (!Array.isArray(comparison.comparisonList) || !comparison.comparisonList.length) throw Error('Stock: no hay productos vinculados para sincronizar.');
  summary.stockMatched = comparison.comparisonList.length;
  if (!dryRun) {
    await progress('Actualizando stock y reservas', summary);
    const stock = await request('/api/admin/sync-stock', { body: {} });
    if (stock.success !== true) throw Error('No se pudo completar el stock.');
    summary.stockUpdated = stock.updatedCount || 0;
  }
  await progress(dryRun ? 'Verificación completada sin cambios' : 'Completado', summary);
  return summary;
}
