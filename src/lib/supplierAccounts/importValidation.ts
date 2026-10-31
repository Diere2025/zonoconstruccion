import { isAccountDate, isUuid, openingAmount } from '../supplierAccount';

export function validateSupplierImport(body: unknown) {
  if (!body || typeof body !== 'object') throw new Error('Archivo de revisión inválido.');
  const value = body as Record<string, unknown>;
  if (value.mode !== 'preview' || !Array.isArray(value.rows) || !value.rows.length || value.rows.length > 2000) throw new Error('Cargá una previsualización de hasta 2.000 filas.');
  if (typeof value.sourceBook !== 'string' || !/^[a-zA-Z0-9_-]{10,120}$/.test(value.sourceBook)
    || typeof value.sourceSnapshotHash !== 'string' || !/^[a-f0-9]{64}$/.test(value.sourceSnapshotHash)
    || !isAccountDate(value.cutoffDate) || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))) throw new Error('Faltan libro, captura o fecha de corte válidos.');
  const identities = new Set<string>();
  const rows = value.rows.map((raw: unknown) => {
    if (!raw || typeof raw !== 'object') throw new Error('Fila inválida.');
    const row = raw as Record<string, unknown>;
    if (!Number.isInteger(row.sourceRow) || Number(row.sourceRow) < 1 || typeof row.sheetId !== 'string' || !/^\d{1,20}$/.test(row.sheetId)
      || typeof row.component !== 'string' || !['opening','payment','purchase','credit','debit','adjustment','unknown'].includes(row.component)
      || typeof row.contentHash !== 'string' || !/^[a-f0-9]{64}$/.test(row.contentHash) || !Array.isArray(row.originalValues) || row.originalValues.length > 40) throw new Error('Identidad o contenido de fila inválido.');
    const key = `${row.sheetId}:${row.sourceRow}:${row.component}`;
    if (identities.has(key)) throw new Error('El archivo contiene filas repetidas.');
    identities.add(key);
    if (row.supplierId && !isUuid(row.supplierId)) throw new Error('Proveedor de fila inválido.');
    if (row.effectiveDate && !isAccountDate(row.effectiveDate)) throw new Error('Fecha de fila inválida.');
    return { sheetId: row.sheetId, sourceRow: row.sourceRow, component: row.component, contentHash: row.contentHash,
      originalValues: row.originalValues, supplierId: row.supplierId || null, effectiveDate: row.effectiveDate || null,
      amount: row.ledgerEffect === null ? null : openingAmount(row.ledgerEffect).toFixed(2),
      status: row.status === 'invalid' ? 'invalid' : 'pending_evidence' };
  });
  return { sourceBook: value.sourceBook, snapshotHash: value.sourceSnapshotHash, cutoffDate: value.cutoffDate, capturedAt: value.createdAt, rows };
}

export function validateSupplierReview(value: Record<string, unknown>) {
  if (!isUuid(value.rowId) || !Number.isInteger(value.version) || Number(value.version) < 1
    || !['pending_evidence','excluded','to_import','linked'].includes(String(value.status))
    || typeof value.reason !== 'string' || value.reason.trim().length < 3 || value.reason.length > 2000) throw new Error('Elegí una fila y explicá la decisión.');
  if (value.supplierId && !isUuid(value.supplierId)) throw new Error('Proveedor inválido.');
  if (value.currency && !['ARS','USD'].includes(String(value.currency))) throw new Error('Moneda inválida.');
  if (value.effectiveDate && !isAccountDate(value.effectiveDate)) throw new Error('Fecha inválida.');
  const amount = value.amount === null || value.amount === '' ? null : openingAmount(value.amount).toFixed(2);
  if (['to_import','linked'].includes(String(value.status)) && (!value.supplierId || !value.currency || !value.effectiveDate || amount === null)) throw new Error('Completá proveedor, moneda, fecha e importe antes de resolver la fila.');
  if (value.status === 'linked' && (Number(isUuid(value.purchaseId)) + Number(isUuid(value.paymentId)) !== 1)) throw new Error('Elegí un documento o pago existente.');
  return { rowId: value.rowId, version: value.version, status: value.status, reason: value.reason.trim(), supplierId: value.supplierId || null,
    currency: value.currency || null, effectiveDate: value.effectiveDate || null, amount,
    purchaseId: value.status === 'linked' ? value.purchaseId || null : null, paymentId: value.status === 'linked' ? value.paymentId || null : null };
}
