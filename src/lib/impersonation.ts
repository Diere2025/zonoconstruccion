export interface ImpersonationTicket {
  administratorId: string;
  administratorEmail: string;
  administratorName: string;
  targetId: string;
  targetEmail: string;
  targetName: string;
  targetRole: string;
  issuedAt: number;
  expiresAt: number;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(base64);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function hmacKey(secret: string, usage: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    usage
  );
}

export async function signImpersonationTicket(ticket: ImpersonationTicket, secret: string): Promise<string> {
  if (!secret) throw new Error('Falta la clave para firmar la sesión temporal.');
  const body = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(ticket)));
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret, ['sign']), new TextEncoder().encode(body));
  return `${body}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export async function verifyImpersonationTicket(
  token: string,
  secret: string,
  now = Date.now()
): Promise<ImpersonationTicket | null> {
  try {
    const [body, signature] = token.split('.');
    if (!body || !signature || !secret) return null;
    const valid = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(secret, ['verify']),
      toArrayBuffer(base64UrlToBytes(signature)),
      new TextEncoder().encode(body)
    );
    if (!valid) return null;
    const ticket = JSON.parse(new TextDecoder().decode(base64UrlToBytes(body))) as ImpersonationTicket;
    if (!ticket.administratorId || !ticket.targetId || ticket.expiresAt <= now) return null;
    return ticket;
  } catch {
    return null;
  }
}
