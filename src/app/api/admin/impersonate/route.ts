export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient, User } from '@supabase/supabase-js';
import {
  ImpersonationTicket,
  signImpersonationTicket,
  verifyImpersonationTicket
} from '@/lib/impersonation';

const COOKIE_NAME = 'zono_impersonation';
const SESSION_SECONDS = 8 * 60 * 60;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const knownAdminEmails = new Set(['diego.boveda@gmail.com', 'caroibarra.93@gmail.com']);

function response(data: unknown, status = 200): NextResponse {
  const result = NextResponse.json(data, { status });
  result.headers.set('Cache-Control', 'no-store, max-age=0');
  return result;
}

function adminClient() {
  if (!supabaseUrl || !serviceRoleKey) throw new Error('La suplantación requiere la clave de servicio configurada.');
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function authenticatedAdministrator(request: NextRequest): Promise<User | null> {
  const user = await authenticatedUser(request);
  if (!user?.email) return null;
  const client = adminClient();
  if (knownAdminEmails.has(user.email.toLowerCase())) return user;
  const { data: seller } = await client.from('sellers').select('role').eq('id', user.id).maybeSingle();
  return seller?.role === 'admin' ? user : null;
}

async function authenticatedUser(request: NextRequest): Promise<User | null> {
  const bearer = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer) return null;
  const client = adminClient();
  const { data: { user }, error } = await client.auth.getUser(bearer);
  return error ? null : user;
}

async function magicToken(email: string) {
  const client = adminClient();
  const { data, error } = await client.auth.admin.generateLink({ type: 'magiclink', email });
  if (error || !data.properties?.hashed_token) throw new Error(error?.message || 'No se pudo crear la sesión temporal.');
  return data.properties.hashed_token;
}

function setTicketCookie(request: NextRequest, result: NextResponse, value: string, maxAge: number) {
  result.cookies.set(COOKIE_NAME, value, {
    httpOnly: true,
    secure: request.nextUrl.protocol === 'https:',
    sameSite: 'strict',
    path: '/',
    maxAge
  });
}

async function currentTicket(request: NextRequest): Promise<ImpersonationTicket | null> {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  return token ? verifyImpersonationTicket(token, serviceRoleKey) : null;
}

export async function GET(request: NextRequest) {
  try {
    const ticket = await currentTicket(request);
    if (!ticket) return response({ active: false });
    const user = await authenticatedUser(request);
    if (!user || user.id !== ticket.targetId) {
      const result = response({ active: false });
      setTicketCookie(request, result, '', 0);
      return result;
    }
    return response({
      active: true,
      administratorName: ticket.administratorName,
      targetName: ticket.targetName,
      targetEmail: ticket.targetEmail,
      targetRole: ticket.targetRole,
      expiresAt: ticket.expiresAt
    });
  } catch (error) {
    return response({ active: false, error: error instanceof Error ? error.message : 'No se pudo leer la sesión temporal.' }, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { action?: string; targetUserId?: string; targetAuthUserId?: string };
    if (body.action === 'start') {
      if (await currentTicket(request)) return response({ error: 'Ya existe una sesión Ver como activa.' }, 409);
      const administrator = await authenticatedAdministrator(request);
      if (!administrator?.email) return response({ error: 'Solo un administrador autenticado puede usar Ver como.' }, 403);
      const targetAuthUserId = body.targetAuthUserId || body.targetUserId;
      if (!body.targetUserId || !targetAuthUserId || targetAuthUserId === administrator.id) return response({ error: 'Seleccioná otro usuario.' }, 400);

      const client = adminClient();
      const [{ data: targetSeller, error: sellerError }, { data: targetAuth, error: authError }, { data: adminSeller }] = await Promise.all([
        client.from('sellers').select('id, full_name, email, role, is_active').eq('id', body.targetUserId).maybeSingle(),
        client.auth.admin.getUserById(targetAuthUserId),
        client.from('sellers').select('full_name').eq('id', administrator.id).maybeSingle()
      ]);
      if (sellerError || authError || !targetSeller || !targetAuth.user?.email) return response({ error: 'El usuario seleccionado no tiene una cuenta válida.' }, 404);
      const sellerEmail = (targetSeller.email || '').trim().toLowerCase();
      const authEmail = targetAuth.user.email.trim().toLowerCase();
      if (targetSeller.id !== targetAuth.user.id && sellerEmail !== authEmail) {
        return response({ error: 'La cuenta de acceso no coincide con el usuario seleccionado.' }, 400);
      }
      if (targetSeller.is_active === false) return response({ error: 'No se puede ingresar como un usuario deshabilitado.' }, 400);

      const now = Date.now();
      const ticket: ImpersonationTicket = {
        administratorId: administrator.id,
        administratorEmail: administrator.email,
        administratorName: adminSeller?.full_name || administrator.user_metadata?.full_name || administrator.email,
        targetId: targetAuth.user.id,
        targetEmail: targetAuth.user.email,
        targetName: targetSeller.full_name || targetAuth.user.email,
        targetRole: targetSeller.role || targetAuth.user.user_metadata?.role || 'seller',
        issuedAt: now,
        expiresAt: now + SESSION_SECONDS * 1000
      };
      const tokenHash = await magicToken(ticket.targetEmail);
      const result = response({
        success: true,
        tokenHash,
        targetName: ticket.targetName,
        targetEmail: ticket.targetEmail,
        targetRole: ticket.targetRole,
        expiresAt: ticket.expiresAt
      });
      setTicketCookie(request, result, await signImpersonationTicket(ticket, serviceRoleKey), SESSION_SECONDS);
      return result;
    }

    if (body.action === 'cancel') {
      const administrator = await authenticatedAdministrator(request);
      if (!administrator) return response({ error: 'Solo un administrador autenticado puede cancelar Ver como.' }, 403);
      const result = response({ success: true });
      setTicketCookie(request, result, '', 0);
      return result;
    }

    if (body.action === 'stop') {
      const ticket = await currentTicket(request);
      if (!ticket) return response({ error: 'No hay una sesión Ver como activa o ya venció.' }, 400);
      const tokenHash = await magicToken(ticket.administratorEmail);
      return response({ success: true, tokenHash, administratorName: ticket.administratorName });
    }

    if (body.action === 'finish') {
      const ticket = await currentTicket(request);
      const administrator = await authenticatedAdministrator(request);
      if (!ticket || !administrator || administrator.id !== ticket.administratorId) {
        return response({ error: 'No se pudo validar el regreso a la sesión administradora.' }, 403);
      }
      const result = response({ success: true });
      setTicketCookie(request, result, '', 0);
      return result;
    }

    return response({ error: 'Acción no válida.' }, 400);
  } catch (error) {
    console.error('[Impersonate] Error:', error);
    return response({ error: error instanceof Error ? error.message : 'No se pudo cambiar la sesión.' }, 500);
  }
}
