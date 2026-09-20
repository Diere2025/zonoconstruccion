export const JAZMIN_SELLER_ID = '13430e05-b61a-4a3f-9fc3-152d377c4b0c';
export const JAZMIN_SPREADSHEET_ID = '16DPcJEdrTMYvNSaUKQo9ODKClqe1VHLlKOX6O_sELRw';
export const JAZMIN_SHEET_NAME = 'Pendientes';
export const PROCESSED_SELLER_STATUS = '🔹 Pasado';

function statusWords(status: string): string[] {
  return (status || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function isJazminCentralCancellation(defaultSellerId: string | null | undefined, status: string): boolean {
  return defaultSellerId === JAZMIN_SELLER_ID && statusWords(status).includes('cancelado');
}
