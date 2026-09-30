// One-off reconciliation of the Cooper rows visible in the 2026-09-29 screenshot.
// Dry run by default. --apply links existing cash movements and records historical
// merchandise charges without creating stock or a new cash transaction.
const { Client } = require('pg');

const supplierName = 'Cooper';
const charges = [
  [1119, '2026-08-14', 3842760],
  [1121, '2026-08-14', 7394430],
  [1180, '2026-08-28', 7176810],
  [1216, '2026-09-04', 7767360],
  [1277, '2026-09-14', 4015740],
  [1324, '2026-09-21', 3959940],
  [1355, '2026-09-25', 7583220],
  [1371, '2026-09-29', 6946170],
];
const payments = [
  [1113, '2026-08-14', 3842760],
  [1137, '2026-08-21', 7394430],
  [1174, '2026-08-28', 2220000],
  [1183, '2026-08-29', 3800000],
  [1184, '2026-08-29', 1156810],
  [1220, '2026-09-04', 1000000],
  [1228, '2026-09-05', 1664200],
  [1229, '2026-09-05', 1000000],
  [1246, '2026-09-08', 1500000],
  [1252, '2026-09-09', 2342776.60],
  [1253, '2026-09-09', 260383.40],
  [1287, '2026-09-15', 1300000],
  [1288, '2026-09-15', 1604800],
  [1296, '2026-09-16', 1110940],
  [1320, '2026-09-19', 1500000],
  [1321, '2026-09-19', 845000],
];
const unresolvedPayments = [
  [1327, '2026-09-21', 1614940],
  [1349, '2026-09-24', 1400000],
  [1364, '2026-09-26', 1100000],
  [1368, '2026-09-26', 1100000],
  [1369, '2026-09-28', 1500000],
  [1370, '2026-09-29', 2500000],
];

async function main() {
  if (!['', '--apply'].includes(process.argv[2] || '') || process.argv.length > 3) throw Error('Uso: node scripts/import-cooper-cc-2026-09.cjs [--apply]');
  process.loadEnvFile('.env.local');
  const dbUrl = new URL(process.env.DATABASE_URL);
  const project = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
  if (!dbUrl.username.endsWith(`.${project}`)) throw Error('La base no corresponde al proyecto configurado');
  const apply = process.argv[2] === '--apply';
  const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000, query_timeout: 120000, application_name: apply ? 'cooper_cc_import_apply' : 'cooper_cc_import_dry_run' });
  await db.connect();
  try {
    await db.query('begin');
    await db.query("set local lock_timeout = '5s'");
    const suppliers = await db.query('select id from public.suppliers where lower(name)=lower($1) for update', [supplierName]);
    if (suppliers.rowCount !== 1) throw Error('Cooper no es un proveedor único');
    const supplierId = suppliers.rows[0].id;
    const matched = [];
    for (const [sheetRow, date, amount] of payments) {
      const result = await db.query(`
        select c.id,c.amount,c.currency,c.payment_method_id,c.financial_account_id,c.created_by,c.created_at,
          sp.id as linked_id,sp.supplier_id as linked_supplier_id,sp.amount as linked_amount
        from public.cash_transactions c
        left join public.supplier_payments sp on sp.cash_transaction_id=c.id
        where (c.created_at at time zone 'America/Argentina/Buenos_Aires')::date=$1::date
          and c.amount=$2 and c.currency='ARS' and c.type='egreso'
          and c.category='Proveedores' and trim(lower(c.concept))='cooper'
        for update of c`, [date, amount]);
      if (result.rowCount !== 1) throw Error(`Fila ${sheetRow}: se esperó un único egreso Cooper; hay ${result.rowCount}`);
      const movement = result.rows[0];
      if (movement.linked_id && (movement.linked_supplier_id !== supplierId || Number(movement.linked_amount) !== amount)) {
        throw Error(`Fila ${sheetRow}: el movimiento ya tiene otro vínculo`);
      }
      if (!movement.payment_method_id || !movement.created_by) throw Error(`Fila ${sheetRow}: faltan datos para vincular el movimiento`);
      matched.push({ sheetRow, movement, alreadyLinked: Boolean(movement.linked_id) });
    }
    const purchaser = matched[0].movement.created_by;
    const existingCharges = [];
    for (const [sheetRow, date, amount] of charges) {
      const reference = `CC-COOPER-${sheetRow}`;
      const result = await db.query('select id,total_amount,(purchase_date at time zone $3)::date as local_date from public.supplier_purchases where supplier_id=$1 and invoice_number=$2 for update', [supplierId, reference, 'America/Argentina/Buenos_Aires']);
      if (result.rowCount > 1 || (result.rowCount === 1 && (Number(result.rows[0].total_amount) !== amount || result.rows[0].local_date.toISOString().slice(0, 10) !== date))) {
        throw Error(`Fila ${sheetRow}: el cargo existente no coincide con la planilla`);
      }
      existingCharges.push({ sheetRow, date, amount, reference, exists: result.rowCount === 1 });
    }
    const expectedChargeTotal = 48686430;
    const expectedMatchedPaymentTotal = 32542100;
    if (charges.reduce((sum, row) => sum + row[2], 0) !== expectedChargeTotal || payments.reduce((sum, row) => sum + row[2], 0) !== expectedMatchedPaymentTotal) throw Error('La transcripción no cuadra');
    const toLink = matched.filter(row => !row.alreadyLinked);
    const toCharge = existingCharges.filter(row => !row.exists);
    console.log(JSON.stringify({ supplier: supplierName, chargesToAdd: toCharge.length, chargesAmount: toCharge.reduce((sum, row) => sum + row.amount, 0), existingPaymentsToLink: toLink.length, linkedPaymentAmount: toLink.reduce((sum, row) => sum + Number(row.movement.amount), 0), unresolvedPayments: unresolvedPayments.length, unresolvedAmount: unresolvedPayments.reduce((sum, row) => sum + row[2], 0), apply }));
    if (apply) {
      for (const row of toCharge) {
        await db.query(`insert into public.supplier_purchases
          (supplier_id,invoice_number,purchase_date,total_amount,paid_amount,currency,status,document_type,notes,created_by)
          values($1,$2,($3::date + time '12:00') at time zone 'America/Argentina/Buenos_Aires',$4,0,'ARS','Pendiente','Remito',$5,$6)`,
        [supplierId, row.reference, row.date, row.amount, `Extracto externo Cooper.Cuenta2, hoja Proveedores, fila ${row.sheetRow}. Mercadería recibida; sin número de remito, artículos ni OC. Pendiente de conciliación y asociación. No impacta stock.`, purchaser]);
      }
      for (const row of toLink) {
        const m = row.movement;
        await db.query(`insert into public.supplier_payments
          (supplier_id,purchase_id,amount,currency,payment_method_id,cash_transaction_id,financial_account_id,notes,created_by,created_at)
          values($1,null,$2,'ARS',$3,$4,$5,$6,$7,$8)`,
        [supplierId, m.amount, m.payment_method_id, m.id, m.financial_account_id, `Vínculo al egreso existente; extracto externo Cooper.Cuenta2, fila ${row.sheetRow}. Pendiente de imputar a comprobante.`, m.created_by, m.created_at]);
      }
      const counts = await db.query('select (select count(*)::int from public.supplier_purchases where supplier_id=$1 and invoice_number like $2) as charges, (select count(*)::int from public.supplier_payments where supplier_id=$1) as payments', [supplierId, 'CC-COOPER-%']);
      if (counts.rows[0].charges !== 8 || counts.rows[0].payments !== 16) throw Error('La verificación final no coincide');
      await db.query('commit');
      console.log('Importación confirmada:', counts.rows[0]);
    } else await db.query('rollback');
  } catch (error) { try { await db.query('rollback'); } catch {} throw error; }
  finally { await db.end(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
