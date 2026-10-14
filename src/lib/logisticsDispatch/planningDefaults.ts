type Row = Record<string, any>;
const key = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
/** Frequency is per LOG, never per load or company: two drivers need not share a vehicle. */
export function carrierPlanningDefaults(history: Row[]) {
 const grouped: Record<string, {vehicles: string[]; companions: string[]}> = {};
 for (const id of new Set(history.map(p => p.carrier_id || p.planned?.carrierId).filter(Boolean))) {
  const rows = history.filter(p => (p.carrier_id || p.planned?.carrierId) === id && p.status !== 'cancelled');
  const ranked = (field: string, includeEmpty = false) => {
   const counts = new Map<string, {value: string; count: number}>();
   for (const row of rows) {
    let value = String(row.planned?.[field] || '').trim();
    if (field === 'companion' && /^(sin acompa.*|solo|ninguno)$/i.test(value)) value = '';
    if (!value && !includeEmpty) continue;
    const normalized = key(value), entry = counts.get(normalized);
    counts.set(normalized, {value: entry?.value ?? value, count: (entry?.count || 0) + 1});
   }
   return [...counts.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)).map(x => x.value);
  };
  grouped[id] = {vehicles: ranked('vehicle'), companions: ranked('companion', true)};
 }
 return grouped;
}
