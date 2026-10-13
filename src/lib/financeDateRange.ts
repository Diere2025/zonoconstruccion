import { treasuryToday } from './treasuryTransactionTime';

export function financeDateRange(preset: string, now = new Date()) {
  const today = treasuryToday(now);
  const day = new Date(today + 'T12:00:00Z');
  let start = today;
  let end = today;
  if (preset === 'ayer') {
    day.setUTCDate(day.getUTCDate() - 1);
    start = end = day.toISOString().slice(0, 10);
  } else if (preset === '7dias' || preset === '30dias') {
    // Include today: seven calendar days start six days before today.
    day.setUTCDate(day.getUTCDate() - (preset === '7dias' ? 6 : 29));
    start = day.toISOString().slice(0, 10);
  } else if (preset === 'mes') start = today.slice(0, 8) + '01';
  else if (preset === 'año') start = today.slice(0, 4) + '-01-01';
  return { start, end };
}
