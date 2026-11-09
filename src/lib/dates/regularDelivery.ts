import { displayDateField, validCalendarDate } from './dateFields';

export function regularDeliveryWindow(orderDate: string) {
  if (!validCalendarDate(orderDate)) return { from: '', to: '' };

  const day = new Date(orderDate + 'T00:00:00Z');
  let from = '';
  let deliveryDays = 0;
  while (deliveryDays < 4) {
    day.setUTCDate(day.getUTCDate() + 1);
    if (day.getUTCDay() === 0) continue;
    deliveryDays++;
    if (deliveryDays === 1) from = day.toISOString().slice(0, 10);
  }
  return { from, to: day.toISOString().slice(0, 10) };
}

export function displayDeliveryWindow(from: string, to?: string | null) {
  const start = displayDateField(from);
  const end = to ? displayDateField(to) : '';
  return start && end && start !== end ? `Del ${start} al ${end}` : start || end;
}
