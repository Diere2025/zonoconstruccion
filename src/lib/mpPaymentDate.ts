// Mercado Pago days are interpreted in Argentina (UTC-3), regardless of browser timezone.
export function getMPPaymentDayBounds(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const start = new Date(`${day}T03:00:00.000Z`);
  if (!Number.isFinite(start.getTime()) || start.toISOString().slice(0, 10) !== day) return null;
  return {
    startIso: start.toISOString(),
    endExclusiveIso: new Date(start.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  };
}

export function isMPPaymentOnDay(receivedAt: string, day: string) {
  const bounds = getMPPaymentDayBounds(day);
  if (!bounds) return false;
  const timestamp = new Date(receivedAt).getTime();
  return timestamp >= Date.parse(bounds.startIso) && timestamp < Date.parse(bounds.endExclusiveIso);
}
