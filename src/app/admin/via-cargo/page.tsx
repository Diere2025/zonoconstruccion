'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { createAuthenticatedRequester } from '@/lib/authenticatedRequest';
import { emptyViaCargoDispatch } from '@/lib/viaCargo';

const request = createAuthenticatedRequester(supabase);

export default function ViaCargoConfigPage() {
  const [value, setValue] = useState(emptyViaCargoDispatch);
  const [localities, setLocalities] = useState<{ id: string; name: string }[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [data, cities] = await Promise.all([request('/api/logistica/via-cargo-config'), supabase.from('localities').select('id,name').order('name')]);
        if (cities.error) throw cities.error;
        if (!cancelled) { setValue(data.dispatch); setCanEdit(data.canEdit); setLocalities(cities.data || []); }
      } catch (error) { if (!cancelled) setMessage(error instanceof Error ? error.message : 'No se pudo cargar la configuración.'); }
      finally { if (!cancelled) setBusy(false); }
    })();
    return () => { cancelled = true; };
  }, []);
  const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
  return <main className="mx-auto max-w-2xl space-y-5 p-6">
    <h1 className="text-2xl font-bold text-slate-900">Vía Cargo · Punto de despacho</h1>
    <p className="text-sm text-slate-600">Dirección donde nuestro reparto deja los pedidos. Se precarga en los nuevos pedidos de Vía Cargo; los vendedores cargan el destino final del destinatario.</p>
    <form className="space-y-4 rounded-xl border bg-white p-5" onSubmit={async e => {
      e.preventDefault(); setBusy(true); setMessage('');
      try {
        const data = await request('/api/logistica/via-cargo-config', { method: 'PUT', body: JSON.stringify(value) });
        setValue(data.dispatch); setMessage('Punto de despacho guardado. Se aplicará al cargar nuevos envíos.');
      } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo guardar.'); }
      finally { setBusy(false); }
    }}>
      <fieldset disabled={busy || !canEdit} className="space-y-4">
        {([['branch', 'Sucursal de despacho'], ['address', 'Dirección']] as const).map(([key, label]) => <label key={key} className="grid gap-1 text-sm font-medium">{label} *<input className={input} required value={value[key]} onChange={e => setValue({ ...value, [key]: e.target.value })} /></label>)}
        <label className="grid gap-1 text-sm font-medium">Localidad *<select required className={input} value={value.locality_id} onChange={e => setValue({ ...value, locality_id: e.target.value })}><option value="">Seleccionar localidad</option>{localities.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        <label className="grid gap-1 text-sm font-medium">Link de Google Maps<input type="url" className={input} value={value.maps_url} onChange={e => setValue({ ...value, maps_url: e.target.value })} /></label>
        <label className="grid gap-1 text-sm font-medium">Indicaciones para el despacho<textarea className={input} value={value.references} onChange={e => setValue({ ...value, references: e.target.value })} /></label>
        <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white" type="submit">{busy ? 'Guardando…' : 'Guardar punto de despacho'}</button>
      </fieldset>
      {message && <p role="status" className="text-sm text-slate-700">{message}</p>}
    </form>
  </main>;
}
