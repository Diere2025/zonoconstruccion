// Accounting dates and registration times are separate: backdating must not
// erase the time at which a movement was entered.
export function treasuryToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function treasuryDateTime(date: string, now = new Date()): string {
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(now);
  const result = new Date(`${date}T${time}.${String(now.getMilliseconds()).padStart(3, '0')}-03:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(result.getTime()) || treasuryToday(result) !== date) throw new Error('La fecha del movimiento no es válida.');
  return result.toISOString();
}

export function compareTreasuryTransactions(a: { created_at: string; registered_at?: string; id: string }, b: { created_at: string; registered_at?: string; id: string }): number {
  return treasuryToday(new Date(a.created_at)).localeCompare(treasuryToday(new Date(b.created_at)))
    || Date.parse(a.registered_at || a.created_at) - Date.parse(b.registered_at || b.created_at)
    || a.id.localeCompare(b.id);
}
