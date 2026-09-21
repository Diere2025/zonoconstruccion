const crypto = require("crypto");
const { Client } = require("pg");

const spreadsheetId = "1NEXHZbDJhXCHpsZEyKq3k3rq_O_foLDtct-hvsFeifI";
const denominations = [
  [20000, "bill"], [10000, "bill"], [2000, "bill"], [1000, "bill"],
  [500, "bill"], [200, "bill"], [100, "bill"], [50, "bill"],
  [20, "bill"], [10, "bill"], [10, "coin"], [5, "coin"], [2, "coin"], [1, "coin"],
];

function amount(value) {
  const parsed = Number(String(value ?? "").trim().replace(/\s/g, "").replace(/\$/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function sheetDate(value) {
  const match = String(value ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function credentials() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  return {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  };
}

async function accessToken() {
  const creds = credentials();
  const now = Math.floor(Date.now() / 1000);
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
    iss: creds.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(unsigned), creds.private_key).toString("base64url");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
  });
  const payload = await response.json();
  if (!payload.access_token) throw new Error(`No se pudo acceder a Google Sheets: ${JSON.stringify(payload)}`);
  return payload.access_token;
}

async function readRanges() {
  const token = await accessToken();
  const ranges = ["'Entregas'!A2:AT3232", "'Cuenta Dinero'!A2:S4252"];
  const query = ranges.map(range => `ranges=${encodeURIComponent(range)}`).join("&");
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${query}&valueRenderOption=FORMATTED_VALUE`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Google Sheets respondió ${response.status}: ${await response.text()}`);
  const payload = await response.json();
  return payload.valueRanges.map(range => range.values || []);
}

async function main() {
  const [settlementRows, countRows] = await readRanges();
  const dateParts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  const year = Number(dateParts.find(part => part.type === "year").value);
  const month = Number(dateParts.find(part => part.type === "month").value);
  const currentRows = settlementRows.map((row, index) => ({ row, sourceRow: index + 2, date: sheetDate(row[2]) })).filter(item => {
    if (!item.date || !String(item.row[1] || "").trim()) return false;
    const [rowYear, rowMonth] = item.date.split("-").map(Number);
    return rowYear === year && rowMonth === month;
  });
  const countsByCode = new Map(countRows.map(row => [String(row[0] || "").trim().toUpperCase(), row]).filter(([code]) => code));

  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query("begin");
  let associated = 0;
  try {
    for (const item of currentRows) {
      const row = item.row;
      const code = String(row[1]).trim().toUpperCase();
      const countRow = countsByCode.get(code);
      const countDate = sheetDate(countRow?.[1]);
      const confirmed = /^(true|verdadero|si|sí|x)$/i.test(String(row[0] || "").trim());
      const result = await client.query(`
        insert into public.treasury_settlements (
          code, route_sheet_id, settlement_date, carrier_name, route_detail, source,
          source_spreadsheet_id, source_row, status, change_fund, shortage_recovered,
          deliveries_total, electronic_total, tolls_total, extraordinary_total,
          expected_cash, counted_cash, difference, whatsapp_message, notes,
          count_date, counted_at, confirmed_at, updated_at
        ) values (
          $1, null, $2, $3, $4, 'spreadsheet', $5, $6, $7, $8, $9,
          $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
          case when $19::date is null then null else ($19::date + time '12:00') end,
          case when $7 = 'confirmed' then now() else null end, now()
        )
        on conflict (code) do update set
          route_sheet_id = null, settlement_date = excluded.settlement_date,
          carrier_name = excluded.carrier_name, route_detail = excluded.route_detail,
          source = excluded.source, source_spreadsheet_id = excluded.source_spreadsheet_id,
          source_row = excluded.source_row, status = excluded.status,
          change_fund = excluded.change_fund, shortage_recovered = excluded.shortage_recovered,
          deliveries_total = excluded.deliveries_total, electronic_total = excluded.electronic_total,
          tolls_total = excluded.tolls_total, extraordinary_total = excluded.extraordinary_total,
          expected_cash = excluded.expected_cash, counted_cash = excluded.counted_cash,
          difference = excluded.difference, whatsapp_message = excluded.whatsapp_message,
          notes = excluded.notes, count_date = excluded.count_date, counted_at = excluded.counted_at,
          confirmed_at = excluded.confirmed_at, updated_at = now()
        returning id
      `, [
        code, item.date, String(row[3] || countRow?.[2] || "Sin fletero").trim() || "Sin fletero",
        String(row[4] || "").trim() || null, spreadsheetId, item.sourceRow,
        confirmed ? "confirmed" : "draft", amount(row[6]), amount(row[36]), amount(row[5]),
        amount(row[23]), amount(row[7]), amount(row[17]), amount(row[34]), amount(row[35]),
        amount(row[37]), String(row[42] || "").trim() || null, String(row[45] || "").trim() || null, countDate,
      ]);
      const settlementId = result.rows[0].id;
      await client.query("delete from public.treasury_settlement_expenses where settlement_id = $1", [settlementId]);
      await client.query("delete from public.treasury_settlement_cash_counts where settlement_id = $1", [settlementId]);

      const tollValues = row.slice(8, 17).map(amount);
      const extras = row.slice(18, 23).map(amount);
      const expenses = [];
      tollValues.forEach((value, index) => { if (value > 0) expenses.push(["toll", value, `Ticket peaje ${index + 1}`]); });
      const tollRemainder = Math.max(0, amount(row[7]) - tollValues.reduce((sum, value) => sum + value, 0));
      if (tollRemainder > 0) expenses.push(["toll", tollRemainder, "Peajes sin detalle"]);
      const labels = ["Alimento personal", "Combustible", "Gasto policial", "Insumos de computación", "Arreglos / repuestos"];
      extras.forEach((value, index) => { if (value > 0) expenses.push(["extraordinary", value, labels[index]]); });
      const extraRemainder = Math.max(0, amount(row[17]) - extras.reduce((sum, value) => sum + value, 0));
      if (extraRemainder > 0) expenses.push(["extraordinary", extraRemainder, "Gasto extraordinario"]);
      for (let index = 0; index < expenses.length; index += 1) {
        const expense = expenses[index];
        await client.query("insert into public.treasury_settlement_expenses (settlement_id, expense_type, amount, reference, sort_order) values ($1,$2,$3,$4,$5)", [settlementId, expense[0], expense[1], expense[2], index]);
      }

      if (countRow) {
        associated += 1;
        for (let index = 0; index < denominations.length; index += 1) {
          const quantity = Math.max(0, Math.trunc(amount(countRow[index + 3])));
          if (quantity > 0) {
            await client.query("insert into public.treasury_settlement_cash_counts (settlement_id, money_kind, denomination, quantity) values ($1,$2,$3,$4)", [settlementId, denominations[index][1], denominations[index][0], quantity]);
          }
        }
      }
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
  console.log(JSON.stringify({ imported: currentRows.length, countsAssociated: associated, month: `${String(month).padStart(2, "0")}/${year}` }));
}

main().catch(error => { console.error(error); process.exit(1); });
