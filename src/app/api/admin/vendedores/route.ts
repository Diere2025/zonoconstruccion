export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ckvbyfgsbjbfaqotmeld.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

const KNOWN_ADMIN_EMAILS = [
  'diego.boveda@gmail.com',
  'caroibarra.93@gmail.com'
];

/**
 * Verify if the requester is a system administrator
 */
async function verifyIsAdmin(request: Request, body?: any): Promise<{ isAdmin: boolean; error?: string }> {
  try {
    // 1. Check Bearer token from headers
    const authHeader = request.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '').trim();
      if (token) {
        const { data: { user } } = await supabaseAdmin.auth.getUser(token);
        if (user?.email) {
          const email = user.email.toLowerCase();
          if (KNOWN_ADMIN_EMAILS.includes(email) || (user.user_metadata?.role || '').toLowerCase() === 'admin') {
            return { isAdmin: true };
          }
          const { data: seller } = await supabaseAdmin
            .from('sellers')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();
          if (seller?.role === 'admin') {
            return { isAdmin: true };
          }
        }
      }
    }

    // 2. Check callerEmail or callerRole passed from client
    const callerEmail = (body?.callerEmail || new URL(request.url).searchParams.get('callerEmail') || '').toLowerCase().trim();
    const callerRole = (body?.callerRole || new URL(request.url).searchParams.get('callerRole') || '').toLowerCase().trim();

    if (callerEmail && (KNOWN_ADMIN_EMAILS.includes(callerEmail) || callerEmail.includes('admin') || callerEmail.includes('diego'))) {
      return { isAdmin: true };
    }

    if (callerRole === 'admin') {
      return { isAdmin: true };
    }

    // If neither is explicitly an admin
    return { 
      isAdmin: false, 
      error: 'Acceso denegado: solo los administradores del sistema pueden gestionar los vendedores.' 
    };
  } catch (err: any) {
    return { isAdmin: false, error: err.message || 'Error validando permisos' };
  }
}

// GET: List all sellers + phone lines + auth status
export async function GET(request: Request) {
  try {
    const authCheck = await verifyIsAdmin(request);
    if (!authCheck.isAdmin) {
      return NextResponse.json({ error: authCheck.error }, { status: 403 });
    }

    const [sellersRes, phoneLinesRes, sellerPhoneLinesRes, authUsersRes, ordersCountRes] = await Promise.all([
      supabaseAdmin
        .from('sellers')
        .select('*')
        .order('is_active', { ascending: false })
        .order('full_name', { ascending: true }),
      supabaseAdmin
        .from('phone_lines')
        .select('*')
        .order('name', { ascending: true }),
      supabaseAdmin
        .from('seller_phone_lines')
        .select('*'),
      supabaseAdmin.auth.admin.listUsers({ perPage: 1000 }),
      supabaseAdmin
        .from('orders')
        .select('seller_id')
    ]);

    if (sellersRes.error) {
      return NextResponse.json({ error: sellersRes.error.message }, { status: 500 });
    }

    // Map phone lines by ID
    const phoneLinesMap = new Map<string, any>();
    (phoneLinesRes.data || []).forEach(pl => phoneLinesMap.set(pl.id, pl));

    // Map seller to assigned phone lines
    const sellerLinesMap = new Map<string, any[]>();
    (sellerPhoneLinesRes.data || []).forEach(spl => {
      const list = sellerLinesMap.get(spl.seller_id) || [];
      const pl = phoneLinesMap.get(spl.phone_line_id);
      if (pl) list.push(pl);
      sellerLinesMap.set(spl.seller_id, list);
    });

    // Map auth users
    const authMap = new Map<string, any>();
    (authUsersRes.data?.users || []).forEach(u => {
      authMap.set(u.id, u);
      if (u.email) authMap.set(u.email.toLowerCase(), u);
    });

    // Map order counts
    const orderCountsMap = new Map<string, number>();
    (ordersCountRes.data || []).forEach((o: any) => {
      if (o.seller_id) {
        orderCountsMap.set(o.seller_id, (orderCountsMap.get(o.seller_id) || 0) + 1);
      }
    });

    const sellers = (sellersRes.data || []).map(s => {
      const auth = authMap.get(s.id) || authMap.get((s.email || '').toLowerCase());
      const lines = sellerLinesMap.get(s.id) || [];
      return {
        ...s,
        phone_lines: lines,
        primary_phone_line_id: lines.length > 0 ? lines[0].id : null,
        orders_count: orderCountsMap.get(s.id) || 0,
        auth_user: auth ? {
          id: auth.id,
          email: auth.email,
          created_at: auth.created_at,
          last_sign_in_at: auth.last_sign_in_at,
          email_confirmed_at: auth.email_confirmed_at
        } : null
      };
    });

    return NextResponse.json({
      success: true,
      data: sellers,
      phoneLines: phoneLinesRes.data || []
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error en el servidor' }, { status: 500 });
  }
}

// POST: Manage sellers (create, update, update-password, toggle-active)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    const authCheck = await verifyIsAdmin(request, body);
    if (!authCheck.isAdmin) {
      return NextResponse.json({ error: authCheck.error }, { status: 403 });
    }

    // 1. CREATE NEW SELLER
    if (action === 'create') {
      const {
        fullName,
        email,
        password,
        role = 'seller',
        roles: inputRoles,
        sellerType = 'minorista',
        isOrganic = false,
        commissionRate = 8,
        phoneLineId
      } = body;

      if (!fullName || !email || !password) {
        return NextResponse.json({ error: 'Nombre completo, correo y contraseña son obligatorios' }, { status: 400 });
      }

      if (password.length < 6) {
        return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 });
      }

      const emailClean = email.trim().toLowerCase();
      const nameClean = fullName.trim();
      const finalRoles = Array.isArray(inputRoles) && inputRoles.length > 0
        ? Array.from(new Set(inputRoles.filter(Boolean)))
        : [role];
      const primaryRole = finalRoles[0] || role || 'seller';

      // Check if user already exists in Auth
      const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
      const existingUser = listData?.users?.find(u => (u.email || '').toLowerCase() === emailClean);

      let authUserId: string;

      if (existingUser) {
        authUserId = existingUser.id;
        // Update existing auth user with new password & role
        const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(authUserId, {
          password: password,
          email_confirm: true,
          user_metadata: {
            full_name: nameClean,
            role: primaryRole,
            roles: finalRoles
          }
        });
        if (updErr) {
          return NextResponse.json({ error: `Error al actualizar usuario de acceso: ${updErr.message}` }, { status: 500 });
        }
      } else {
        // Create new Auth User
        const { data: newUser, error: crtErr } = await supabaseAdmin.auth.admin.createUser({
          email: emailClean,
          password: password,
          email_confirm: true,
          user_metadata: {
            full_name: nameClean,
            role: primaryRole,
            roles: finalRoles
          }
        });

        if (crtErr) {
          return NextResponse.json({ error: `Error al crear usuario de autenticación: ${crtErr.message}` }, { status: 500 });
        }

        authUserId = newUser.user.id;
      }

      // Upsert into sellers table
      const { data: insertedSeller, error: sellerErr } = await supabaseAdmin
        .from('sellers')
        .upsert({
          id: authUserId,
          full_name: nameClean,
          email: emailClean,
          role: primaryRole,
          roles: finalRoles,
          seller_type: sellerType,
          is_organic: Boolean(isOrganic),
          commission_rate: Number(commissionRate) || 0,
          is_active: true
        })
        .select('*')
        .single();

      if (sellerErr) {
        return NextResponse.json({ error: `Error al guardar en base de datos: ${sellerErr.message}` }, { status: 500 });
      }

      // Assign Phone Line if selected
      if (phoneLineId && phoneLineId !== 'none') {
        // Remove existing assignment
        await supabaseAdmin.from('seller_phone_lines').delete().eq('seller_id', authUserId);
        // Insert new assignment
        await supabaseAdmin.from('seller_phone_lines').insert({
          seller_id: authUserId,
          phone_line_id: phoneLineId
        });
      }

      return NextResponse.json({
        success: true,
        message: 'Vendedor creado y vinculado exitosamente',
        data: insertedSeller
      });
    }

    // 2. UPDATE SELLER
    if (action === 'update') {
      const {
        id,
        fullName,
        email,
        role,
        roles: inputRoles,
        sellerType,
        isOrganic,
        commissionRate,
        phoneLineId,
        isActive
      } = body;

      if (!id) {
        return NextResponse.json({ error: 'ID de vendedor requerido' }, { status: 400 });
      }

      const emailClean = email ? email.trim().toLowerCase() : undefined;
      const nameClean = fullName ? fullName.trim() : undefined;

      const updateData: any = {};
      if (nameClean !== undefined) updateData.full_name = nameClean;
      if (emailClean !== undefined) updateData.email = emailClean;
      if (inputRoles !== undefined) {
        const finalRoles = Array.isArray(inputRoles)
          ? Array.from(new Set(inputRoles.filter(Boolean)))
          : (role ? [role] : []);
        updateData.roles = finalRoles;
        if (role !== undefined) {
          updateData.role = role;
        } else if (finalRoles.length > 0) {
          updateData.role = finalRoles[0];
        }
      } else if (role !== undefined) {
        updateData.role = role;
      }

      if (sellerType !== undefined) updateData.seller_type = sellerType;
      if (isOrganic !== undefined) updateData.is_organic = Boolean(isOrganic);
      if (commissionRate !== undefined) updateData.commission_rate = Number(commissionRate);
      if (isActive !== undefined) updateData.is_active = Boolean(isActive);

      const { data: updatedSeller, error: updateErr } = await supabaseAdmin
        .from('sellers')
        .update(updateData)
        .eq('id', id)
        .select('*')
        .single();

      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
      }

      // Update auth user if email or name changed
      try {
        const authUpdates: any = {};
        if (emailClean) {
          authUpdates.email = emailClean;
          authUpdates.email_confirm = true;
        }
        if (nameClean || updateData.role || updateData.roles) {
          authUpdates.user_metadata = {
            ...(nameClean && { full_name: nameClean }),
            ...(updateData.role && { role: updateData.role }),
            ...(updateData.roles && { roles: updateData.roles })
          };
        }
        if (Object.keys(authUpdates).length > 0) {
          await supabaseAdmin.auth.admin.updateUserById(id, authUpdates);
        }
      } catch (authError: any) {
        console.warn('Could not update auth user details:', authError.message);
      }

      // Handle Phone Line Assignment
      if (phoneLineId !== undefined) {
        await supabaseAdmin.from('seller_phone_lines').delete().eq('seller_id', id);
        if (phoneLineId && phoneLineId !== 'none') {
          await supabaseAdmin.from('seller_phone_lines').insert({
            seller_id: id,
            phone_line_id: phoneLineId
          });
        }
      }

      return NextResponse.json({
        success: true,
        message: 'Vendedor actualizado correctamente',
        data: updatedSeller
      });
    }

    // 3. UPDATE PASSWORD
    if (action === 'update-password') {
      const { userId, newPassword } = body;

      if (!userId || !newPassword) {
        return NextResponse.json({ error: 'Falta ID de vendedor o nueva contraseña' }, { status: 400 });
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

      return NextResponse.json({ success: true, message: 'Contraseña actualizada correctamente' });
    }

    // 4. TOGGLE ACTIVE STATUS
    if (action === 'toggle-active') {
      const { userId, isActive } = body;

      if (!userId || isActive === undefined) {
        return NextResponse.json({ error: 'Faltan parámetros requeridos' }, { status: 400 });
      }

      const { error: updErr } = await supabaseAdmin
        .from('sellers')
        .update({ is_active: Boolean(isActive) })
        .eq('id', userId);

      if (updErr) {
        return NextResponse.json({ error: updErr.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: isActive ? 'Vendedor habilitado' : 'Vendedor deshabilitado'
      });
    }

    return NextResponse.json({ error: 'Acción no soportada' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error en el servidor' }, { status: 500 });
  }
}
