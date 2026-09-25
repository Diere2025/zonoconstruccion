// Vincula movimientos historicos con conceptos precargados sin alterar clasificaciones existentes.
// Uso: node --env-file=.env.local scripts/backfill-financial-concepts.cjs [--apply]
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const normalize = value => String(value || '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const signature = row => [row.category, row.sub_category, row.movement_type, row.efe_category]
  .map(normalize).join('|');

async function main() {
  const apply = process.argv.includes('--apply');
  const db = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });
  await db.connect();
  try {
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    const { rows: presets } = await db.query(`
      SELECT id, concept, category, sub_category, movement_type, efe_category, source_row
      FROM public.financial_concepts WHERE is_active = true
      ORDER BY source_row NULLS LAST, id`);
    const { rows: movements } = await db.query(`
      SELECT id, concept, category, sub_category, type, efe_category, financial_concept_id
      FROM public.cash_transactions`);
    const byConcept = new Map();
    for (const preset of presets) {
      const key = normalize(preset.concept);
      if (!byConcept.has(key)) byConcept.set(key, []);
      byConcept.get(key).push(preset);
    }

    const matches = [];
    const pendingRows = [];
    const stats = { total: movements.length, alreadyLinked: 0, noPreset: 0,
      classificationConflict: 0, ambiguous: 0, matchable: 0,
      subcategoriesToFill: 0, efeCategoriesToFill: 0 };
    const unresolved = new Map();
    for (const tx of movements) {
      if (tx.financial_concept_id) { stats.alreadyLinked++; continue; }
      const candidates = byConcept.get(normalize(tx.concept)) || [];
      if (!candidates.length) {
        stats.noPreset++;
        unresolved.set(tx.concept || '(sin concepto)', (unresolved.get(tx.concept || '(sin concepto)') || 0) + 1);
        pendingRows.push({ tx, reason: 'Sin concepto precargado', preset: null });
        continue;
      }
      const compatible = candidates.filter(p =>
        normalize(p.category) === normalize(tx.category) &&
        (!normalize(tx.sub_category) || normalize(p.sub_category) === normalize(tx.sub_category)) &&
        (p.movement_type === 'Mov. Financiero' || normalize(p.movement_type) === normalize(tx.type)) &&
        (!normalize(tx.efe_category) || normalize(p.efe_category) === normalize(tx.efe_category)));
      const distinct = new Set(compatible.map(signature));
      if (distinct.size > 1) {
        stats.ambiguous++;
        pendingRows.push({ tx, reason: 'Más de una clasificación posible', preset: null });
        continue;
      }
      if (!distinct.size) {
        stats.classificationConflict++;
        pendingRows.push({ tx, reason: 'Clasificación distinta', preset: candidates.length === 1 ? candidates[0] : null });
        continue;
      }
      const preset = compatible[0];
      matches.push({ tx, preset });
      stats.matchable++;
      if (!normalize(tx.sub_category) && preset.sub_category) stats.subcategoriesToFill++;
      if (!normalize(tx.efe_category) && preset.efe_category) stats.efeCategoriesToFill++;
    }

    if (apply) {
      if (stats.ambiguous) throw new Error('Hay asociaciones ambiguas; revisar antes de aplicar');
      let updated = 0;
      for (let i = 0; i < matches.length; i += 500) {
        const batch = matches.slice(i, i + 500);
        const { rowCount } = await db.query(`
          UPDATE public.cash_transactions AS tx SET
            financial_concept_id = mapped.preset_id,
            sub_category = CASE WHEN NULLIF(BTRIM(tx.sub_category), '') IS NULL
              THEN NULLIF(mapped.sub_category, '') ELSE tx.sub_category END,
            efe_category = CASE WHEN NULLIF(BTRIM(tx.efe_category), '') IS NULL
              THEN NULLIF(mapped.efe_category, '') ELSE tx.efe_category END
          FROM UNNEST($1::uuid[], $2::uuid[], $3::text[], $4::text[])
            AS mapped(tx_id, preset_id, sub_category, efe_category)
          WHERE tx.id = mapped.tx_id AND tx.financial_concept_id IS NULL`, [
          batch.map(item => item.tx.id), batch.map(item => item.preset.id),
          batch.map(item => item.preset.sub_category), batch.map(item => item.preset.efe_category),
        ]);
        updated += rowCount;
      }
      if (updated !== matches.length) throw new Error(`Se esperaban ${matches.length} actualizaciones; hubo ${updated}`);
      await db.query('COMMIT');
      stats.updated = updated;
    } else {
      await db.query('ROLLBACK');
    }
    if (process.argv.includes('--report')) {
      const reportPath = path.resolve('output/financial-concepts-pending-review.csv');
      fs.mkdirSync(path.dirname(reportPath), { recursive: true });
      const csv = value => {
        let text = String(value ?? '');
        if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`;
        return `"${text.replace(/"/g, '""')}"`;
      };
      const header = ['transaction_id', 'motivo', 'concepto_actual', 'categoria_actual',
        'subcategoria_actual', 'tipo_actual', 'efe_actual', 'concepto_precargado',
        'categoria_precargada', 'subcategoria_precargada', 'tipo_precargado', 'efe_precargado'];
      const lines = [header.map(csv).join(',')];
      for (const { tx, reason, preset } of pendingRows) {
        lines.push([tx.id, reason, tx.concept, tx.category, tx.sub_category, tx.type,
          tx.efe_category, preset?.concept, preset?.category, preset?.sub_category,
          preset?.movement_type, preset?.efe_category].map(csv).join(','));
      }
      fs.writeFileSync(reportPath, `\uFEFF${lines.join('\n')}\n`, 'utf8');
      console.log(`Review report: ${reportPath} (${pendingRows.length} rows)`);
    }
    console.log(JSON.stringify({ mode: apply ? 'applied' : 'dry-run', stats,
      topWithoutPreset: [...unresolved].sort((a, b) => b[1] - a[1]).slice(0, 20) }, null, 2));
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await db.end();
  }
}

main().catch(error => { console.error(error.code || error.message); process.exitCode = 1; });
