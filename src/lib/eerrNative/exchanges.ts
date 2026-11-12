export const exchangeStatuses = {
  pending: 'Pendiente de revisión',
  supplier_requested: 'Reclamado al proveedor',
  supplier_partial: 'Reconocimiento parcial del proveedor',
  supplier_recognized: 'Reconocido por el proveedor',
  supplier_rejected: 'Rechazado por el proveedor',
  own_unusable: 'Fabricación propia · inutilizable',
  own_repairable: 'Fabricación propia · para reparar',
  own_reusable: 'Fabricación propia · recuperable',
  other_reviewed: 'Otro caso revisado',
} as const;

export type ExchangeStatus = keyof typeof exchangeStatuses;
export type ExchangeReview = {
  status: ExchangeStatus;
  supplier: string;
  recognized_amount: number | null;
  note: string;
  version: number;
};

export const initialExchangeReview: ExchangeReview = {
  status: 'pending', supplier: '', recognized_amount: null, note: '', version: 0,
};

export function validateExchangeReview(value: unknown): ExchangeReview {
  if (!value || typeof value !== 'object') throw new Error('Revisión inválida.');
  const review = value as ExchangeReview;
  const {status, version, recognized_amount} = review;
  if (!Object.hasOwn(exchangeStatuses, status) || !Number.isSafeInteger(version) || version < 0) {
    throw new Error('Estado o versión de revisión inválidos.');
  }
  const supplier = typeof review.supplier === 'string' ? review.supplier.trim() : '';
  const note = typeof review.note === 'string' ? review.note.trim() : '';
  if (supplier.length > 160 || note.length > 1500) throw new Error('Revisá la longitud del proveedor y del detalle.');
  if (status.startsWith('supplier_') && !supplier) throw new Error('Indicá el proveedor.');
  if (status !== 'pending' && !note) throw new Error('Registrá el motivo o comprobante de la revisión.');
  const recognized = status === 'supplier_partial' || status === 'supplier_recognized';
  if (recognized_amount !== null && (!recognized || !Number.isFinite(recognized_amount) || recognized_amount <= 0 ||
    recognized_amount > 1e12 || Math.abs(recognized_amount * 100 - Math.round(recognized_amount * 100)) > 0.01)) {
    throw new Error('Ingresá un importe reconocido válido en pesos.');
  }
  return {status, supplier: status.startsWith('supplier_') ? supplier : '', recognized_amount, note, version};
}
