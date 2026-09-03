export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ckvbyfgsbjbfaqotmeld.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

// GET: List all Fleteros
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'list';

    if (action === 'list') {
      const { data: fleteros, error } = await supabaseAdmin
        .from('sellers')
        .select('id, full_name, email, role, is_active, is_organic, created_at')
        .eq('role', 'fletero')
        .order('full_name', { ascending: true });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, data: fleteros || [] });
    }

    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error en el servidor' }, { status: 500 });
  }
}

// POST: Actions on Fleteros (create, update-password, toggle-active)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    // 1. Create a new Fletero
    if (action === 'create') {
      const { fullName, email, password } = body;

      if (!fullName || !email || !password) {
        return NextResponse.json({ error: 'Nombre, correo y contraseña son obligatorios' }, { status: 400 });
      }

      const emailClean = email.trim().toLowerCase();
      const nameClean = fullName.trim();

      // Check if user already exists in Auth
      const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
      const existingUser = listData?.users?.find(u => (u.email || '').toLowerCase() === emailClean);

      let authUserId: string;

      if (existingUser) {
        authUserId = existingUser.id;
        // Update existing auth user to fletero with new password
        const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(authUserId, {
          password: password,
          email_confirm: true,
          user_metadata: {
            full_name: nameClean,
            role: 'fletero'
          }
        });
        if (updErr) {
          return NextResponse.json({ error: `Error al actualizar auth: ${updErr.message}` }, { status: 500 });
        }
      } else {
        // Create new Auth User
        const { data: newUser, error: crtErr } = await supabaseAdmin.auth.admin.createUser({
          email: emailClean,
          password: password,
          email_confirm: true,
          user_metadata: {
            full_name: nameClean,
            role: 'fletero'
          }
        });

        if (crtErr) {
          return NextResponse.json({ error: `Error al crear usuario: ${crtErr.message}` }, { status: 500 });
        }

        authUserId = newUser.user.id;
      }

      // Upsert into sellers table
      const { error: sellerErr } = await supabaseAdmin.from('sellers').upsert({
        id: authUserId,
        full_name: nameClean,
        email: emailClean,
        role: 'fletero',
        is_active: true,
        is_organic: false
      });

      if (sellerErr) {
        return NextResponse.json({ error: `Error al registrar en vendedores: ${sellerErr.message}` }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: 'Fletero creado correctamente',
        data: { id: authUserId, full_name: nameClean, email: emailClean, role: 'fletero', is_active: true }
      });
    }

    // 2. Update Fletero Password
    if (action === 'update-password') {
      const { userId, newPassword } = body;

      if (!userId || !newPassword) {
        return NextResponse.json({ error: 'Falta userId o nueva contraseña' }, { status: 400 });
      }

      if (newPassword.length < 6) {
        return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 });
      }

      const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: newPassword
      });

      if (updErr) {
        return NextResponse.json({ error: `Error al cambiar contraseña: ${updErr.message}` }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: 'Contraseña del fletero actualizada correctamente' });
    }

    // 3. Toggle Fletero Active Status
    if (action === 'toggle-active') {
      const { userId, isActive } = body;

      if (!userId || isActive === undefined) {
        return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 });
      }

      const { error: updErr } = await supabaseAdmin
        .from('sellers')
        .update({ is_active: isActive })
        .eq('id', userId);

      if (updErr) {
        return NextResponse.json({ error: updErr.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: isActive ? 'Fletero activado' : 'Fletero pausado' });
    }

    return NextResponse.json({ error: 'Acción no soportada' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error en el servidor' }, { status: 500 });
  }
}
