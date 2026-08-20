import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Initialize Supabase admin client to bypass RLS for sync operations
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

const GOOGLE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1iNciz2d6Do7m7weYP5o9gYLIu_F-15vYL933FrAX2cs/export?format=csv';

export async function GET() {
  try {
    // 1. Fetch CSV from Google Sheets
    const csvRes = await fetch(GOOGLE_SHEET_URL, { cache: 'no-store' });
    if (!csvRes.ok) {
      return NextResponse.json({ error: 'No se pudo descargar la planilla de Google Sheets.' }, { status: 500 });
    }
    const csvText = await csvRes.text();
    const lines = csvText.split('\n');

    // Find the header line "Localidad,Zona"
    let startIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('Localidad,Zona')) {
        startIndex = i;
        break;
      }
    }

    if (startIndex === -1) {
      return NextResponse.json({ error: 'La planilla no contiene el encabezado esperado "Localidad,Zona".' }, { status: 400 });
    }

    const csvLocalities: { name: string; zone: string }[] = [];
    for (let i = startIndex + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const parts = line.split(',');
      if (parts.length >= 2) {
        csvLocalities.push({
          name: parts[0].trim(),
          zone: parts[1].trim()
        });
      }
    }

    // 2. Fetch data from Supabase
    const [dbLocalitiesRes, dbZonesRes] = await Promise.all([
      supabaseAdmin
        .from('localities')
        .select('id, name, zone_id, zones(name)'),
      supabaseAdmin
        .from('zones')
        .select('id, name')
    ]);

    if (dbLocalitiesRes.error) throw dbLocalitiesRes.error;
    if (dbZonesRes.error) throw dbZonesRes.error;

    const dbLocalities = dbLocalitiesRes.data || [];
    const dbZones = dbZonesRes.data || [];

    const zonesMap = new Map(dbZones.map(z => [z.name.toLowerCase(), z.id]));

    // 3. Compare data
    const newLocalities: { name: string; zone: string }[] = [];
    const mismatchedZones: { name: string; csvZone: string; dbZone: string; localityId: string; newZoneId: string }[] = [];
    const nameUpdates: { dbName: string; csvName: string; localityId: string }[] = [];
    const unmappedZones = new Set<string>();
    const matchedDbIds = new Set<string>();

    const normalize = (name: string) => {
      return name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Remove accents
        .replace(/\s*\(.*?\)\s*/g, "")  // Strip parentheses and content
        .replace(/[^a-z0-9]/g, "")      // Strip non-alphanumeric
        .trim();
    };

    csvLocalities.forEach(csvLoc => {
      const csvNorm = normalize(csvLoc.name);
      const zoneNameLower = csvLoc.zone.toLowerCase();
      const zoneId = zonesMap.get(zoneNameLower);
      
      if (!zoneId) {
        unmappedZones.add(csvLoc.zone);
      }

      // First search for exact name match
      let dbLoc = dbLocalities.find(dbl => dbl.name.toLowerCase() === csvLoc.name.toLowerCase());
      
      // If no exact match, search by normalized name
      if (!dbLoc) {
        dbLoc = dbLocalities.find(dbl => !matchedDbIds.has(dbl.id) && normalize(dbl.name) === csvNorm);
        if (dbLoc) {
          nameUpdates.push({
            dbName: dbLoc.name,
            csvName: csvLoc.name,
            localityId: dbLoc.id
          });
        }
      }

      if (dbLoc) {
        matchedDbIds.add(dbLoc.id);
        const rawZones = dbLoc.zones as any;
        const dbZoneName = Array.isArray(rawZones)
          ? (rawZones[0]?.name || '')
          : (rawZones?.name || '');

        if (dbZoneName.toLowerCase() !== csvLoc.zone.toLowerCase() && zoneId) {
          mismatchedZones.push({
            name: csvLoc.name,
            csvZone: csvLoc.zone,
            dbZone: dbZoneName,
            localityId: dbLoc.id,
            newZoneId: zoneId
          });
        }
      } else {
        newLocalities.push(csvLoc);
      }
    });

    const onlyInDb: { id: string; name: string; zone: string }[] = [];
    dbLocalities.forEach(dbLoc => {
      if (!matchedDbIds.has(dbLoc.id)) {
        const rawZones = dbLoc.zones as any;
        const dbZoneName = Array.isArray(rawZones)
          ? (rawZones[0]?.name || 'Sin zona')
          : (rawZones?.name || 'Sin zona');

        onlyInDb.push({
          id: dbLoc.id,
          name: dbLoc.name,
          zone: dbZoneName
        });
      }
    });

    return NextResponse.json({
      newLocalities,
      mismatchedZones,
      nameUpdates,
      onlyInDb,
      unmappedZones: Array.from(unmappedZones)
    });

  } catch (err: any) {
    console.error("Error in sync-localities GET:", err);
    return NextResponse.json({ error: err.message || 'Error interno del servidor.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { newLocalities, mismatchedZones, nameUpdates } = await req.json();

    // 1. Fetch current zones to build mapping
    const { data: dbZones, error: zonesErr } = await supabaseAdmin
      .from('zones')
      .select('id, name');
    if (zonesErr) throw zonesErr;

    const zonesMap = new Map((dbZones || []).map(z => [z.name.toLowerCase(), z.id]));

    // 2. Insert any new zones if needed (if not already mapped)
    const requiredZones = new Set<string>();
    (newLocalities || []).forEach((l: any) => {
      if (l.zone && !zonesMap.has(l.zone.toLowerCase())) {
        requiredZones.add(l.zone);
      }
    });

    for (const zoneName of requiredZones) {
      console.log(`Creating missing zone: ${zoneName}`);
      const { data: newZone, error: insZoneErr } = await supabaseAdmin
        .from('zones')
        .insert({
          name: zoneName,
          color: 'slate-light', // Default fallback color
          delivery_schedule: 'Por definir',
          is_active: true
        })
        .select()
        .single();
      
      if (insZoneErr) throw insZoneErr;
      zonesMap.set(zoneName.toLowerCase(), newZone.id);
    }

    // 3. Apply name updates (renames)
    if (nameUpdates && nameUpdates.length > 0) {
      console.log(`Updating ${nameUpdates.length} localities' names`);
      for (const update of nameUpdates) {
        const { error: nameErr } = await supabaseAdmin
          .from('localities')
          .update({ name: update.csvName })
          .eq('id', update.localityId);
        if (nameErr) throw nameErr;
      }
    }

    // 4. Apply updates to existing localities (mismatched zones)
    if (mismatchedZones && mismatchedZones.length > 0) {
      console.log(`Updating ${mismatchedZones.length} localities' zones`);
      for (const update of mismatchedZones) {
        const { error: updErr } = await supabaseAdmin
          .from('localities')
          .update({ zone_id: update.newZoneId })
          .eq('id', update.localityId);
        if (updErr) throw updErr;
      }
    }

    // 5. Insert new localities
    if (newLocalities && newLocalities.length > 0) {
      console.log(`Inserting ${newLocalities.length} new localities`);
      const inserts = newLocalities.map((l: any) => {
        const zoneId = zonesMap.get(l.zone.toLowerCase());
        return {
          name: l.name,
          zone_id: zoneId,
          is_active: true
        };
      });

      const { error: insErr } = await supabaseAdmin
        .from('localities')
        .insert(inserts);
      
      if (insErr) throw insErr;
    }

    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error("Error in sync-localities POST:", err);
    return NextResponse.json({ error: err.message || 'Error interno al sincronizar.' }, { status: 500 });
  }
}
