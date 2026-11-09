import { displayDateField, validCalendarDate } from '@/lib/dates/dateFields';

export const withdrawalStates: Record<string, string> = {
  pending: 'Pendiente de RR. HH.', approved: 'Autorizado', returned: 'Devuelto para corregir',
  rejected: 'Rechazado', cancelled: 'Cancelado',
};

export const employeeDiscountRate = 5;
export const EMPLOYEE_WITHDRAWAL_PAYMENT = 'Descuento Sueldo';
export const EMPLOYEE_WITHDRAWALS_PATH = '/vendedores/retiros-empleados';
export const WITHDRAWAL_REVIEWS_REFRESH = 'employee-withdrawal-reviews-refresh';

export function withdrawalMapUrl(address: string, locality: string) {
  if (!address.trim() || !locality.trim()) return '';
  const params = new URLSearchParams({api: '1', query: `${address.trim()}, ${locality.trim()}`});
  return `https://www.google.com/maps/search/?${params}`;
}

export function isWithdrawalMapUrl(url: string) {
  return /^https:\/\/(www\.google\.(com|com\.ar)\/maps([/?#]|$)|maps\.google\.(com|com\.ar)([/?#]|$)|maps\.app\.goo\.gl\/|goo\.gl\/maps\/)/.test(url);
}

export function employeeDiscountCents(subtotal: number, rate = employeeDiscountRate) {
  return Math.round(subtotal * Math.round(rate * 100) / 10000);
}

export const employeeReviewLabels: Record<string, string> = {
  pending: 'Aún no validado por RR. HH.',
  approved: 'Validado por RR. HH.',
  returned: 'RR. HH. solicitó una corrección',
  rejected: 'Rechazado por RR. HH.',
  cancelled: 'Retiro cancelado',
};

export type WithdrawalCadence = 'monthly' | 'weekly';

export function shiftPayrollDate(date: string, step: number, cadence: WithdrawalCadence) {
  if (!validCalendarDate(date)) return '';
  const [year, month, day] = date.split('-').map(Number);
  if (cadence === 'weekly') return new Date(Date.UTC(year, month - 1, day + 7 * step)).toISOString().slice(0, 10);
  const last = new Date(Date.UTC(year, month + step, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1 + step, Math.min(day, last))).toISOString().slice(0, 10);
}

export function payrollPeriodEnd(start: string, cadence: WithdrawalCadence) {
  if (!validCalendarDate(start)) return '';
  const [year, month, day] = start.split('-').map(Number);
  return (cadence === 'weekly' ? new Date(Date.UTC(year, month - 1, day + 6)) : new Date(Date.UTC(year, month, 0)))
    .toISOString().slice(0, 10);
}

export function displayPayrollPeriod(start: string, end: string, cadence: WithdrawalCadence) {
  if (cadence === 'monthly') return displayDateField(start.slice(0, 7), 'month');
  return [displayDateField(start), displayDateField(end)].filter(Boolean).join(' al ');
}
