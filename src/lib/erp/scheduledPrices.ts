import { SupabaseClient } from '@supabase/supabase-js';
import { fetchSpreadsheetValues } from '@/lib/googleSheets';

const SPREADSHEET_ID = '1K3c_6SMScaTkSI3FMDnQPVyj-c7MSqQEoWW4q3mL3Jg';
const SHEET_NAME = 'PVP por Fecha';

function parseDateToIso(dateStr: string): string | null {
  if (!dateStr) return null;
  const clean = dateStr.trim();
  
  const dmyMatch = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    return `${year}-${month}-${day}`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return clean;
  }

  const serial = parseFloat(clean);
  if (!isNaN(serial) && serial > 35000 && serial < 60000) {
    const utcDays = Math.floor(serial - 25569);
    const date = new Date(utcDays * 86400 * 1000);
    return date.toISOString().split('T')[0];
  }

  return null;
}

function parseSpanishPrice(priceStr: any): number {
  if (!priceStr) return 0;
  let clean = priceStr.toString().replace(/[$\s]/g, '').trim();
  if (!clean) return 0;
  const hasComma = clean.includes(',');
  const hasDot = clean.includes('.');
  if (hasComma && hasDot) {
    clean = clean.replace(/\./g, '').replace(/,/g, '.');
  } else if (hasComma) {
    clean = clean.replace(/,/g, '.');
  } else if (hasDot) {
    clean = clean.replace(/\./g, '');
  }
  const val = parseFloat(clean);
  return isNaN(val) ? 0 : val;
}

const normalize = (str: string) => {
  if (!str) return '';
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
};

/**
 * Aplica en la tabla products todas las programaciones pendientes cuya fecha de vigencia ya llegó (<= hoy)
 */
export async function applyScheduledPriceUpdates(supabase: SupabaseClient): Promise<number> {
  try {
    const { data: count, error } = await supabase.rpc('apply_scheduled_price_updates');
    if (!error && typeof count === 'number') {
      return count;
    }
  } catch (err) {
    console.warn('Error ejecutando apply_scheduled_price_updates:', err);
  }
  return 0;
}

/**
 * Lee la hoja 'PVP por Fecha' y crea programaciones en scheduled_price_updates para todas las filas futuras
 */
export async function syncScheduledPricesFromSheet(supabase: SupabaseClient): Promise<{
  futureRowsCount: number;
  newScheduledCreated: number;
  appliedCount: number;
}> {
  // 1. Aplicar los que ya hayan vencido hoy
  const appliedCount = await applyScheduledPriceUpdates(supabase);

  // 2. Traer filas de la hoja
  const rows = await fetchSpreadsheetValues(SPREADSHEET_ID, `'${SHEET_NAME}'!A2:C`);
  if (!rows || rows.length === 0) {
    return { futureRowsCount: 0, newScheduledCreated: 0, appliedCount };
  }

  // 3. Productos en BD para asociar product_id
  const { data: dbProducts } = await supabase.from('products').select('id, name, sku');
  const dbMap = new Map<string, any>();
  (dbProducts || []).forEach(p => {
    if (p.name) dbMap.set(normalize(p.name), p);
    if (p.sku) dbMap.set(normalize(p.sku), p);
  });

  // 4. Traer existentes en scheduled_price_updates
  const { data: existingScheduled } = await supabase
    .from('scheduled_price_updates')
    .select('id, product_name, price, effective_date, status');

  const existingKeySet = new Set<string>();
  (existingScheduled || []).forEach(s => {
    existingKeySet.add(`${normalize(s.product_name)}_${s.effective_date}_${Math.round(s.price)}`);
  });

  const now = new Date();
  const nowAr = new Date(now.toLocaleString('en-US', { timeZone: 'America/Buenos_Aires' }));
  const todayArStr = nowAr.toISOString().split('T')[0];

  const toInsert: any[] = [];
  let futureRowsCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const dateRaw = (row[0] || '').trim();
    const nameRaw = (row[1] || '').trim();
    const priceRaw = (row[2] || '').trim();

    if (!dateRaw || !nameRaw || !priceRaw) continue;

    const effectiveDate = parseDateToIso(dateRaw);
    const price = parseSpanishPrice(priceRaw);

    if (!effectiveDate || price <= 0) continue;

    if (effectiveDate > todayArStr) {
      futureRowsCount++;
      const normKey = normalize(nameRaw);
      const dedupeKey = `${normKey}_${effectiveDate}_${Math.round(price)}`;

      if (!existingKeySet.has(dedupeKey)) {
        const matchedProd = dbMap.get(normKey);
        toInsert.push({
          product_id: matchedProd ? matchedProd.id : null,
          product_name: nameRaw,
          sku: matchedProd?.sku || null,
          price,
          effective_date: effectiveDate,
          status: 'pending',
          notes: `Sincronizado automáticamente desde 'PVP por Fecha' (fila ${i + 2})`
        });
        existingKeySet.add(dedupeKey);
      }
    }
  }

  let newScheduledCreated = 0;
  if (toInsert.length > 0) {
    const { data: inserted, error: insertError } = await supabase
      .from('scheduled_price_updates')
      .insert(toInsert)
      .select('id');

    if (insertError) throw insertError;
    newScheduledCreated = inserted?.length || 0;
  }

  return {
    futureRowsCount,
    newScheduledCreated,
    appliedCount
  };
}
