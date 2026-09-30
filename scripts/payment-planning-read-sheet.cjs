// Read-only, private snapshot of the planning workbook for reconciliation.
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
process.loadEnvFile('.env.local');
const spreadsheetId = '1WThcC4pw3cxDOppp79ZlC7V_OdUQrBUYUKo32NosFBk';

async function accessToken() {
  const creds = process.env.GOOGLE_SERVICE_ACCOUNT_KEY ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY) : {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  };
  if (!creds.client_email || !creds.private_key) throw new Error('Faltan credenciales de lectura de Google.');
  const now = Math.floor(Date.now() / 1000);
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: creds.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets.readonly', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  const assertion = `${unsigned}.${crypto.sign('RSA-SHA256', Buffer.from(unsigned), creds.private_key).toString('base64url')}`;
  const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }), signal: AbortSignal.timeout(20000) });
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error(`Autenticación de Google falló (${res.status}).`);
  return data.access_token;
}

async function main() {
  const token = await accessToken();
  const headers = { Authorization: `Bearer ${token}` };
  const ranges = ["'Actual'!A1:AC5000", "'Escenarios'!A1:H100"];
  const params = new URLSearchParams({ valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER' });
  for (const range of ranges) params.append('ranges', range);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${params}`;
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`No se pudo leer la planilla (${response.status}).`);
  const body = await response.json();
  const snapshot = { spreadsheetId, capturedAt: new Date().toISOString(), ranges: body.valueRanges };
  const bytes = Buffer.from(JSON.stringify(snapshot));
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
  const dir = path.join('output', 'payment-planning');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `source-${hash.slice(0,12)}.json`);
  fs.writeFileSync(file, bytes, { flag: 'wx' });
  console.log(JSON.stringify({ hash, capturedAt: snapshot.capturedAt, ranges: body.valueRanges.map(range => ({ range: range.range, rows: range.values?.length || 0 })), file }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
