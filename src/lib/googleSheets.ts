import crypto from 'crypto';
import https from 'https';
import fs from 'fs';
import path from 'path';

interface ServiceAccountCredentials {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
}

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function getCredentials(): ServiceAccountCredentials | null {
  // 1. Try file google-credentials.json
  const filePath = path.join(process.cwd(), 'google-credentials.json');
  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    } catch (e) {
      console.error('[GoogleSheets] Failed to parse google-credentials.json:', e);
    }
  }

  // 2. Try env vars
  if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    return {
      type: 'service_account',
      project_id: process.env.GOOGLE_PROJECT_ID || 'cargapedidoszono',
      private_key_id: '',
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      client_id: '',
      auth_uri: 'https://accounts.google.com/o/oauth2/auth',
      token_uri: 'https://oauth2.googleapis.com/token'
    };
  }

  return null;
}

export async function getGoogleAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && tokenExpiresAt > now + 60) {
    return cachedToken;
  }

  const creds = getCredentials();
  if (!creds) {
    throw new Error('Google Service Account credentials not found (missing google-credentials.json or env vars)');
  }

  return new Promise((resolve, reject) => {
    const header = { alg: 'RS256', typ: 'JWT' };
    const claimSet = {
      iss: creds.client_email,
      scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now
    };

    const encHeader = base64UrlEncode(JSON.stringify(header));
    const encClaimSet = base64UrlEncode(JSON.stringify(claimSet));
    const signatureInput = `${encHeader}.${encClaimSet}`;

    const signer = crypto.createSign('RSA-SHA256');
    signer.update(signatureInput);
    const signature = signer
      .sign(creds.private_key, 'base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    const jwt = `${signatureInput}.${signature}`;
    const postData = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`;

    const req = https.request(
      'https://oauth2.googleapis.com/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData)
        }
      },
      res => {
        let body = '';
        res.on('data', chunk => (body += chunk));
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (data.access_token) {
              cachedToken = data.access_token;
              tokenExpiresAt = now + (data.expires_in || 3600);
              resolve(data.access_token);
            } else {
              reject(new Error(`OAuth2 token error: ${body}`));
            }
          } catch (e) {
            reject(e);
          }
        });
      }
    );

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

export async function fetchSpreadsheetValues(
  spreadsheetId: string,
  range: string
): Promise<string[][]> {
  const token = await getGoogleAccessToken();
  return new Promise((resolve, reject) => {
    const encodedRange = encodeURIComponent(range);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}?valueRenderOption=FORMATTED_VALUE`;

    https
      .get(
        url,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        },
        res => {
          let body = '';
          res.on('data', chunk => (body += chunk));
          res.on('end', () => {
            try {
              const json = JSON.parse(body);
              if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                resolve(json.values || []);
              } else {
                reject(new Error(json.error?.message || `Google Sheets API error: ${body}`));
              }
            } catch (e) {
              reject(e);
            }
          });
        }
      )
      .on('error', reject);
  });
}
