'use client';
import { useEffect, useState } from 'react';
import { commandBody, errorMessage, supportRequest } from '@/lib/support/client';
import type { SupportMe } from '@/lib/support/types';
import { selectableSupportPeople } from '@/lib/support/memberDirectory';
import { Alert, fieldClass, Loading, primaryClass, secondaryClass, useSupport } from './SupportShell';
interface Settings {
    me: SupportMe;
    admins: {
        user_id: string;
        active: boolean;
    }[];
    members: {
        sector_id: string;
        user_id: string;
        active: boolean;
    }[];
}
export function SupportSettings() {
    const { me, refresh } = useSupport();
    const [settings, setSettings] = useState<Settings | null>(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [revision, setRevision] = useState(0);
    const [sector, setSector] = useState('');
    const [user, setUser] = useState('');
    useEffect(() => { if (!me.is_admin)
        return; let alive = true; void supportRequest<Settings>('settings').then(result => { if (alive)
        setSettings(result); }).catch(e => { if (alive)
        setError(errorMessage(e)); }); return () => { alive = false; }; }, [me.is_admin, revision]);
    const save = async (action: string, payload: Record<string, unknown>) => { if (busy)
        return; setBusy(true); setError(''); try {
        await supportRequest('settings', { method: 'POST', body: commandBody(payload, undefined, action) });
        setRevision(n => n + 1);
        await refresh();
    }
    catch (e) {
        setError(errorMessage(e));
    }
    finally {
        setBusy(false);
    } };
    if (!me.is_admin)
        return <Alert>Solo el administrador puede configurar incidencias.</Alert>;
    if (!settings)
        return <>{error ? <Alert>{error}</Alert> : <Loading />}</>;
    const person = (id: string) => settings.me.people.find(p => p.id === id)?.name || 'Usuario';
    const selectablePeople = selectableSupportPeople(settings.me.people);
    const areaMembers = (id: string) => settings.members.filter(m => m.active && m.sector_id === id).sort((a, b) => person(a.user_id).localeCompare(person(b.user_id), 'es'));
    const shownAreas = settings.me.sectors.filter(s => !sector || s.id === sector);
    const selectedArea = settings.me.sectors.find(s => s.id === sector);
    const availablePeople = selectablePeople.filter(p => !areaMembers(sector).some(m => m.user_id === p.id));
    return <div className="space-y-5"><div><h2 className="text-xl font-bold">Áreas responsables e integrantes</h2><p className="mt-1 text-sm text-slate-500">Cada área agrupa a las personas que pueden atender sus tickets. El área o módulo afectado se indica por separado en la solicitud.</p></div>{error && <Alert>{error}</Alert>}
    <div className="grid gap-5 lg:grid-cols-2"><section className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="mb-4 font-bold">Áreas responsables</h3><form className="mb-5 flex gap-2" onSubmit={e => { e.preventDefault(); const input = e.currentTarget; const name = String(new FormData(input).get('name') || ''); void save('sector_save', { name }).then(() => input.reset()); }}><input name="name" required minLength={2} maxLength={100} className={fieldClass} placeholder="Nombre de una nueva área responsable" aria-label="Nombre de nueva área responsable" disabled={busy}/><button className={primaryClass} disabled={busy || me.impersonating}>Agregar</button></form><div className="divide-y divide-slate-100">{settings.me.sectors.map(s => <div key={s.id} className="flex items-center justify-between gap-2 py-3"><button type="button" aria-pressed={sector === s.id} onClick={() => { setSector(s.id); setUser(''); }} className={`min-w-0 flex-1 rounded-lg px-2 py-2 text-left text-sm hover:bg-indigo-50 ${sector === s.id ? 'bg-indigo-50 font-semibold text-indigo-700' : ''}`}>{s.name}<span className="mt-1 block text-xs text-slate-500">{areaMembers(s.id).length} integrantes{!s.active ? ' · Área inactiva' : ''}</span></button><div className="flex gap-1"><button disabled={busy || me.impersonating} className="px-2 text-xs font-semibold text-indigo-600" onClick={() => { const name = window.prompt('Nuevo nombre del sector:', s.name); if (name?.trim())
        void save('sector_save', { id: s.id, name, active: s.active }); }}>Renombrar</button><button disabled={busy || me.impersonating} className="px-2 text-xs text-slate-500" onClick={() => void save('sector_save', { id: s.id, name: s.name, active: !s.active })}>{s.active ? 'Desactivar' : 'Activar'}</button></div></div>)}</div></section>
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">{selectedArea ? selectedArea.name : 'Integrantes por área'}</h3>{sector && <button type="button" className="text-sm font-semibold text-indigo-600" onClick={() => { setSector(''); setUser(''); }}>Ver todas las áreas</button>}</div>
      <p className="mb-4 text-sm text-slate-500">Elegí un área para ver su equipo y agregar integrantes. Una persona puede pertenecer a varias áreas.</p>
      <label className="block text-sm">Área responsable<select className={`${fieldClass} mt-1`} value={sector} onChange={e => { setSector(e.target.value); setUser(''); }}><option value="">Todas las áreas</option>{settings.me.sectors.map(s => <option key={s.id} value={s.id}>{s.name}{!s.active ? ' (inactiva)' : ''}</option>)}</select></label>
      <div className="mt-5 space-y-4">{shownAreas.map(area => {
        const members = areaMembers(area.id);
        return <section key={area.id} className="overflow-hidden rounded-xl border border-slate-200">
          <div className="flex items-center justify-between gap-2 bg-slate-50 px-4 py-3"><h4 className="text-sm font-semibold">{area.name}{!area.active && <span className="ml-2 text-xs text-slate-500">Inactiva</span>}</h4><span className="text-xs text-slate-500">{members.length} integrantes</span></div>
          {members.length === 0 && <p className="px-4 py-4 text-sm text-slate-500">Sin integrantes asignados.</p>}
          <ul className="divide-y divide-slate-100">{members.map(m => <li className="flex items-center justify-between gap-3 px-4 py-3" key={m.user_id}><div className="text-sm">{person(m.user_id)}{!settings.me.people.find(p => p.id === m.user_id)?.active && <span className="ml-2 text-xs text-slate-500">Usuario inactivo</span>}</div><button type="button" aria-label={`Quitar a ${person(m.user_id)} de ${area.name}`} className="text-xs font-semibold text-rose-600 disabled:opacity-50" disabled={busy || me.impersonating || !area.active} onClick={() => { if (window.confirm(`¿Quitar a ${person(m.user_id)} de ${area.name}? Sus tickets quedarán a cargo del equipo del área si pierde el permiso.`)) void save('member_save', { ...m, active: false }); }}>Quitar</button></li>)}</ul>
        </section>;
      })}</div>
      {selectedArea?.active && <form className="mt-5 rounded-xl bg-indigo-50 p-4" onSubmit={e => { e.preventDefault(); void save('member_save', { sector_id: sector, user_id: user, active: true }); }}><label className="block text-sm font-semibold">Agregar integrante a {selectedArea.name}<select className={`${fieldClass} mt-2`} required value={user} onChange={e => setUser(e.target.value)} disabled={busy || me.impersonating}><option value="">Elegir usuario</option>{availablePeople.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><button className={`${primaryClass} mt-3`} disabled={busy || me.impersonating || !user || !availablePeople.some(p => p.id === user)}>Agregar integrante</button>{availablePeople.length === 0 && <p className="mt-2 text-xs text-slate-500">Todos los usuarios disponibles ya pertenecen a esta área.</p>}</form>}
    </section></div>
    <section className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="mb-2 font-bold">Administradores de incidencias</h3><p className="mb-4 text-sm text-slate-500">Un administrador ve todos los tickets, configura áreas y puede realizar cierres excepcionales. Recibe avisos de sus solicitudes, de los tickets asignados a él y de los equipos a los que pertenece.</p><div className="mb-4 flex flex-wrap gap-2">{settings.admins.filter(a => a.active).map(a => <span className="inline-flex items-center gap-3 rounded-xl bg-indigo-50 px-3 py-2 text-sm text-indigo-800" key={a.user_id}>{person(a.user_id)}<button aria-label={`Quitar administrador ${person(a.user_id)}`} disabled={busy || me.impersonating} className="text-xs font-semibold" onClick={() => { if (window.confirm('¿Quitar este permiso de administrador?'))
        void save('admin_save', { user_id: a.user_id, active: false }); }}>Quitar</button></span>)}</div><form className="flex max-w-xl gap-3" onSubmit={e => { e.preventDefault(); const id = new FormData(e.currentTarget).get('user_id'); if (window.confirm('¿Otorgar acceso a todas las incidencias a este usuario?'))
        void save('admin_save', { user_id: id, active: true }); }}><select aria-label="Nuevo administrador" required name="user_id" className={fieldClass}><option value="">Elegir usuario</option>{selectablePeople.filter(p => !settings.admins.some(a => a.user_id === p.id && a.active)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><button className={secondaryClass} disabled={busy || me.impersonating}>Agregar administrador</button></form></section>
  </div>;
}
