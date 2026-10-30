import type { SupabaseClient } from '@supabase/supabase-js';
import { validateViaCargo, type ViaCargoDestination } from './viaCargo';

/** Save automatically with the order, updating only a destination owned by this client. */
export async function saveViaCargoDestination(client: SupabaseClient, clientId: string, destination: ViaCargoDestination, selectedId: string): Promise<string> {
  const invalid = validateViaCargo(destination);
  if (invalid) throw new Error(invalid);
  const values = {
    client_id: clientId, alias: 'Vía Cargo · ' + destination.name.trim(),
    full_address: destination.mode === 'home' ? destination.address : (destination.mode === 'branch' ? destination.branch : 'A definir'),
    locality_id: null, map_link: destination.maps_url || null,
    delivery_notes: destination.references || null, postal_code: destination.postal_code.trim(),
    via_cargo: { ...destination }, is_default: false,
  };
  if (selectedId) {
    const { data, error } = await client.from('addresses').update(values)
      .eq('id', selectedId).eq('client_id', clientId).not('via_cargo', 'is', null).select('id').maybeSingle();
    if (error) throw error;
    if (data) return data.id;
  }
  const { data, error } = await client.from('addresses').insert(values).select('id').single();
  if (error) throw error;
  return data.id;
}
