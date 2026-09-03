export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ckvbyfgsbjbfaqotmeld.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy';

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

const USERS_TO_PROVISION = [
  {
    email: 'pablojara@zono.com.ar',
    fullName: 'Pablo Jara',
    role: 'logistica',
    isOrganic: false
  },
  {
    email: 'matiasvega@zono.com.ar',
    fullName: 'Matías Vega',
    role: 'logistica',
    isOrganic: false
  },
  {
    email: 'pablolavayen@zono.com.ar',
    fullName: 'Pablo Lavayen',
    role: 'fletero',
    isOrganic: false
  },
  {
    email: 'jorgesalcedo@zono.com.ar',
    fullName: 'Jorge Salcedo',
    role: 'fletero',
    isOrganic: false
  },
  {
    email: 'fletesgyv@zono.com.ar',
    fullName: 'Fletes G&V',
    role: 'fletero',
    isOrganic: false
  },
  {
    email: 'facundopaz@zono.com.ar',
    fullName: 'Facundo Paz',
    role: 'seller',
    isOrganic: false
  }
];

export async function GET(request: Request) {
  try {
    const results: any[] = [];
    const defaultPassword = 'Zono2026!';

    // List existing auth users to avoid duplicate calls
    const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
    const existingAuthUsers = listData?.users || [];

    for (const targetUser of USERS_TO_PROVISION) {
      const emailLower = targetUser.email.toLowerCase();
      let authUserId: string | null = null;
      let actionTaken = 'created';

      const foundAuth = existingAuthUsers.find(u => (u.email || '').toLowerCase() === emailLower);

      if (foundAuth) {
        authUserId = foundAuth.id;
        actionTaken = 'updated';
        await supabaseAdmin.auth.admin.updateUserById(authUserId, {
          email_confirm: true,
          user_metadata: {
            full_name: targetUser.fullName,
            role: targetUser.role
          }
        });
      } else {
        const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
          email: emailLower,
          password: defaultPassword,
          email_confirm: true,
          user_metadata: {
            full_name: targetUser.fullName,
            role: targetUser.role
          }
        });

        if (createErr) {
          results.push({ email: targetUser.email, status: 'error', error: createErr.message });
          continue;
        }

        authUserId = newUser.user.id;
      }

      // Upsert into sellers table
      if (authUserId) {
        const { error: sellerErr } = await supabaseAdmin.from('sellers').upsert({
          id: authUserId,
          full_name: targetUser.fullName,
          email: emailLower,
          role: targetUser.role,
          is_active: true,
          is_organic: targetUser.isOrganic
        });

        results.push({
          email: targetUser.email,
          fullName: targetUser.fullName,
          role: targetUser.role,
          authId: authUserId,
          action: actionTaken,
          status: sellerErr ? 'error_seller_table' : 'success',
          sellerError: sellerErr?.message
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Usuarios aprovisionados correctamente',
      defaultPassword,
      results
    });
  } catch (err: any) {
    console.error('Error provisioning users:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
