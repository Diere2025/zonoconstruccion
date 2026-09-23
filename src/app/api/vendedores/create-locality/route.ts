import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { appendLocalityToGoogleSheet } from '@/lib/googleSheets';

export const runtime = 'edge';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

function bearerToken(request: NextRequest): string {
  const authorization = request.headers.get('authorization') || '';
  return authorization.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : '';
}

export async function POST(request: NextRequest) {
  try {
    const token = bearerToken(request);
    if (!token) {
      return NextResponse.json({ error: 'Sesión requerida' }, { status: 401 });
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authData.user) {
      return NextResponse.json({ error: 'Sesión inválida o expirada' }, { status: 401 });
    }

    // Verificar que sea vendedor o usuario del sistema
    const { data: seller } = await supabaseAdmin
      .from('sellers')
      .select('id, role, roles, is_active')
      .eq('id', authData.user.id)
      .maybeSingle();

    if (seller && seller.is_active === false) {
      return NextResponse.json({ error: 'Usuario no activo' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const rawName = typeof body?.name === 'string' ? body.name.trim() : '';
    const zoneId = typeof body?.zone_id === 'string' ? body.zone_id.trim() : '';

    if (!rawName) {
      return NextResponse.json({ error: 'El nombre de la localidad es obligatorio' }, { status: 400 });
    }
    if (!zoneId) {
      return NextResponse.json({ error: 'Debes seleccionar una zona para la localidad' }, { status: 400 });
    }

    // Verificar que la zona exista
    const { data: zoneData, error: zoneError } = await supabaseAdmin
      .from('zones')
      .select('id, name, delivery_schedule, delivery_times(name, description, delivery_days)')
      .eq('id', zoneId)
      .maybeSingle();

    if (zoneError || !zoneData) {
      return NextResponse.json({ error: 'La zona seleccionada no es válida' }, { status: 400 });
    }

    // Verificar si ya existe una localidad con el mismo nombre en la misma zona
    const { data: existingLocality, error: searchError } = await supabaseAdmin
      .from('localities')
      .select('id, name, zone_id, is_active, zones(name, delivery_schedule, delivery_time_id, delivery_times(name, description, delivery_days))')
      .ilike('name', rawName)
      .eq('zone_id', zoneId)
      .maybeSingle();

    if (searchError) {
      console.error('[create-locality] Error al buscar duplicado:', searchError);
    }

    if (existingLocality) {
      // Si estaba inactiva, la reactivamos
      if (!existingLocality.is_active) {
        await supabaseAdmin
          .from('localities')
          .update({ is_active: true })
          .eq('id', existingLocality.id);
      }

      const formattedExisting = {
        id: existingLocality.id,
        name: existingLocality.name,
        zone_id: existingLocality.zone_id,
        zones: Array.isArray(existingLocality.zones) ? existingLocality.zones[0] : existingLocality.zones
      };

      return NextResponse.json({
        success: true,
        locality: formattedExisting,
        alreadyExisted: true,
        message: 'La localidad ya existía y fue seleccionada'
      });
    }

    // Insertar nueva localidad
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('localities')
      .insert({
        name: rawName,
        zone_id: zoneId,
        is_active: true
      })
      .select('id, name, zone_id, zones(name, delivery_schedule, delivery_time_id, delivery_times(name, description, delivery_days))')
      .single();

    if (insertError) {
      console.error('[create-locality] Error al insertar:', insertError);
      return NextResponse.json({ error: insertError.message || 'Error al guardar la localidad' }, { status: 500 });
    }

    const formattedLocality = {
      id: inserted.id,
      name: inserted.name,
      zone_id: inserted.zone_id,
      zones: Array.isArray(inserted.zones) ? inserted.zones[0] : inserted.zones
    };

    // Sincronizar automáticamente con la planilla de Google Sheets "Zono - BDLocalidades"
    let sheetSync: { success: boolean; message?: string } | null = null;
    try {
      const zoneName = zoneData.name;
      const dt = Array.isArray(zoneData.delivery_times) ? zoneData.delivery_times[0] : zoneData.delivery_times;
      const schedule = dt?.name || zoneData.delivery_schedule || '';
      sheetSync = await appendLocalityToGoogleSheet(rawName, zoneName, schedule);
    } catch (sheetErr: any) {
      console.warn('[create-locality] Error al sincronizar con Google Sheets:', sheetErr);
      sheetSync = { success: false, message: sheetErr.message || 'Error al conectar con la planilla' };
    }

    return NextResponse.json({
      success: true,
      locality: formattedLocality,
      sheetSync,
      message: sheetSync?.success
        ? 'Localidad creada y agregada a la planilla'
        : 'Localidad creada correctamente en el sistema'
    });

  } catch (error: any) {
    console.error('[create-locality] Excepción no controlada:', error);
    return NextResponse.json({ error: error.message || 'Error interno del servidor' }, { status: 500 });
  }
}
