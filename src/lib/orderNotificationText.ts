export function sellerFirstName(name?: string | null): string {
  return (name || '').trim().split(/\s+/)[0] || '';
}

export function cancellationReasonText(reason?: string | null): string {
  const text = (reason || '').trim().replace(/^Anulado por Logística\.\s*/i, '');
  return !text || /^Anulado desde ERP\.?$/i.test(text) ? 'Sin motivo informado' : text;
}
