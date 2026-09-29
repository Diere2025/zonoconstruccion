// Read-only inventory of the historical ticket source. Never modifies Google Sheets.
const fs = require('node:fs');
const crypto = require('node:crypto');
process.loadEnvFile('.env.local');
const spreadsheetId = '18H-pW18IfljVS8M0ktND0utplFo360dRZgppj2XjThI';
async function token() {
  const creds = process.env.GOOGLE_SERVICE_ACCOUNT_KEY ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY) : {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  };
  if (!creds.client_email || !creds.private_key) throw new Error('Google read credentials are not configured');
  const now = Math.floor(Date.now() / 1000);
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: creds.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/drive.readonly', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  const assertion = `${unsigned}.${crypto.sign('RSA-SHA256', Buffer.from(unsigned), creds.private_key).toString('base64url')}`;
  const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }), signal: AbortSignal.timeout(20000) });
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error(`Google authentication failed (${res.status})`);
  return data.access_token;
}
async function readSheet() {
  const access = await token();
  const headers = { Authorization: `Bearer ${access}` };
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?includeGridData=true`, { headers, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Source spreadsheet access failed (${res.status})`);
  const data = await res.json();
  fs.mkdirSync('output/support-import', { recursive: true });
  fs.writeFileSync('output/support-import/source.json', JSON.stringify(data, null, 2));
  console.log(JSON.stringify({ title: data.properties.title, sheets: data.sheets.map(s => ({ ...s.properties, rows: s.data?.reduce((n, d) => n + (d.rowData?.length || 0), 0), headers: s.data?.[0]?.rowData?.[0]?.values?.map(v => v.formattedValue || '') })) }));
  const exported = await fetch(`https://www.googleapis.com/drive/v3/files/${spreadsheetId}/export?mimeType=application%2Fvnd.openxmlformats-officedocument.spreadsheetml.sheet`, { headers, signal: AbortSignal.timeout(30000) });
  if (exported.ok) {
    fs.writeFileSync('output/support-import/source.xlsx', Buffer.from(await exported.arrayBuffer()));
    console.log(JSON.stringify({ export: 'xlsx downloaded' }));
  } else {
    const failure = await exported.json().catch(() => ({}));
    console.log(JSON.stringify({ export: 'unavailable', status: exported.status, reason: failure.error?.errors?.map(e => e.reason), message: failure.error?.message }));
    const fallback = await fetch(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx`, { headers, signal: AbortSignal.timeout(30000) });
    if (fallback.ok && !fallback.headers.get('content-type')?.includes('text/html')) {
      fs.writeFileSync('output/support-import/source.xlsx', Buffer.from(await fallback.arrayBuffer()));
      console.log(JSON.stringify({ export: 'xlsx downloaded via Sheets export' }));
    } else console.log(JSON.stringify({ fallbackExport: fallback.status }));
  }
  return data;
}
module.exports = { readSheet, spreadsheetId };
if (require.main === module) readSheet().catch(e => { console.error(e.message); process.exitCode = 1; });
