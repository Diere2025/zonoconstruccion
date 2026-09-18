import React, { useEffect, useMemo, useState } from 'react';
import { Bot, Check, Clock3, Layers, Plus, Save, Trash2, Users, X } from 'lucide-react';
import { useChatStore } from '../../store/chatStore';
import { Queue, User } from '../../types';
import { api } from '../../services/api';
import { toast } from 'sonner';

type Tab = 'chatbot' | 'team' | 'hours';
type Rules = { autoAssign: boolean; assignOffline: boolean; redistribute: boolean; delegateBot: boolean; automaticAgents: number[]; memberIds?: number[] };
const KEY = 'whaticket_department_rules';
const EMPTY_RULES: Rules = { autoAssign: false, assignOffline: false, redistribute: false, delegateBot: false, automaticAgents: [] };

const Switch = ({ checked, disabled, onClick }: { checked: boolean; disabled?: boolean; onClick: () => void }) => <button type="button" disabled={disabled} onClick={onClick} className={`inline-flex h-6 w-11 items-center rounded-full p-0.5 transition ${checked ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'} disabled:opacity-40`}><span className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`} /></button>;

export const DepartmentsView: React.FC = () => {
  const { queues, users, whatsapps, fetchQueues, fetchUsers, fetchWhatsapps } = useChatStore();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Queue | 'new' | null>(null);
  const [tab, setTab] = useState<Tab>('chatbot');
  const [form, setForm] = useState({ name: '', color: '#2563eb', greetingMessage: '', outOfHoursMessage: '', whatsappIds: [] as number[] });
  const [members, setMembers] = useState<number[]>([]);
  const [rules, setRules] = useState<Rules>(EMPTY_RULES);
  const [rulesByQueue, setRulesByQueue] = useState<Record<number, Rules>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void Promise.all([fetchQueues(), fetchUsers(), fetchWhatsapps()]);
    try { setRulesByQueue(JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { setRulesByQueue({}); }
  }, []);

  const filtered = useMemo(() => queues.filter((queue) => queue.name.toLowerCase().includes(search.trim().toLowerCase())), [queues, search]);
  const open = (queue?: Queue) => {
    const linked = queue ? whatsapps.filter((w) => w.queueIds?.includes(queue.id) || w.queues?.some((item: Queue) => item.id === queue.id)).map((w) => w.id) : [];
    setEditing(queue || 'new'); setTab('chatbot');
    setForm({ name: queue?.name || '', color: queue?.color || '#2563eb', greetingMessage: queue?.greetingMessage || '', outOfHoursMessage: (queue as any)?.outOfHoursMessage || '', whatsappIds: linked });
    const savedRules = queue ? rulesByQueue[queue.id] : undefined;
    const isSales = queue?.name.trim().toLowerCase() === 'ventas';
    const salesMemberIds = users.filter((user) => ['diego', 'jazmin', 'jazmín', 'ludmila'].includes(user.name.trim().toLowerCase())).map((user) => user.id);
    const jazminId = users.find((user) => ['jazmin', 'jazmín'].includes(user.name.trim().toLowerCase()))?.id;
    const backendMembers = queue ? users.filter((u) => u.queues?.some((item) => item.id === queue.id)).map((u) => u.id) : [];
    setMembers(savedRules?.memberIds || (isSales ? salesMemberIds : backendMembers));
    setRules(savedRules || (isSales ? { autoAssign: true, assignOffline: true, redistribute: false, delegateBot: false, automaticAgents: jazminId ? [jazminId] : [], memberIds: salesMemberIds } : EMPTY_RULES));
  };
  const toggle = <T,>(items: T[], item: T) => items.includes(item) ? items.filter((value) => value !== item) : [...items, item];
  const setRule = (key: keyof Omit<Rules, 'automaticAgents'>) => setRules((current) => ({ ...current, [key]: !current[key] }));

  const save = async () => {
    if (!form.name.trim()) { toast.error('Indicá un nombre para el departamento.'); return; }
    setSaving(true);
    try {
      const payload = { name: form.name.trim(), color: form.color, greetingMessage: form.greetingMessage, outOfHoursMessage: form.outOfHoursMessage };
      let id = editing !== 'new' && editing ? editing.id : undefined;
      if (id) await api.put(`/queue/${id}`, payload);
      else { const { data } = await api.post('/queue', payload); id = data?.id || data?.queue?.id; }
      if (!id) throw new Error('El servidor no devolvió el departamento.');

      await Promise.all(users.map((user: User) => {
        const oldIds = user.queues?.map((queue) => queue.id) || []; const wanted = members.includes(user.id);
        if (wanted === oldIds.includes(id!)) return Promise.resolve();
        const queueIds = wanted ? [...oldIds, id!] : oldIds.filter((item) => item !== id);
        return api.put(`/users/${user.id}`, {
          name: user.name,
          email: user.email,
          profile: user.profile,
          companyId: user.companyId || 1,
          queueIds
        });
      }));
      await Promise.all(whatsapps.map((whatsapp) => {
        const oldIds = whatsapp.queueIds || whatsapp.queues?.map((queue: Queue) => queue.id) || []; const wanted = form.whatsappIds.includes(whatsapp.id);
        if (wanted === oldIds.includes(id!)) return Promise.resolve();
        const queueIds = wanted ? [...oldIds, id!] : oldIds.filter((item: number) => item !== id);
        return api.put(`/whatsapp/${whatsapp.id}`, { name: whatsapp.name, greetingMessage: whatsapp.greetingMessage, complationMessage: whatsapp.complationMessage, isDefault: whatsapp.isDefault, queueIds });
      }));
      const next = { ...rulesByQueue, [id]: { ...rules, memberIds: members } }; localStorage.setItem(KEY, JSON.stringify(next)); setRulesByQueue(next);
      await Promise.all([fetchQueues(), fetchUsers(), fetchWhatsapps()]); setEditing(null); toast.success('Departamento guardado.');
    } catch (error: any) { toast.error(error?.response?.data?.message || error?.message || 'No se pudo guardar el departamento.'); }
    finally { setSaving(false); }
  };
  const remove = async () => { if (!editing || editing === 'new' || !window.confirm(`¿Eliminar ${editing.name}?`)) return; try { await api.delete(`/queue/${editing.id}`); setEditing(null); await fetchQueues(); toast.success('Departamento eliminado.'); } catch (error: any) { toast.error(error?.response?.data?.message || 'No se pudo eliminar.'); } };

  return <div className="flex-1 overflow-y-auto bg-slate-50 p-6 dark:bg-slate-950">
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800"><div><h2 className="flex items-center gap-2 text-xl font-bold"><Layers className="h-5 w-5 text-blue-500" />Departamentos y chatbots</h2><p className="mt-1 text-xs text-slate-500">Áreas de atención, líneas vinculadas, agentes y asignación.</p></div><button type="button" onClick={() => open()} className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"><Plus className="h-4 w-4" />Nuevo departamento</button></div>
    <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar departamento..." className="mb-4 w-full max-w-sm rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900" />
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{filtered.map((queue) => <button key={queue.id} type="button" onClick={() => open(queue)} className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-blue-300 dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold text-white" style={{ backgroundColor: queue.color }}>{queue.name.slice(0, 2).toUpperCase()}</span><span><b className="block">{queue.name}</b><small className="text-slate-500">{queue.greetingMessage || 'Sin mensaje de saludo'}</small></span></div><div className="mt-3 flex gap-2 text-xs text-slate-500"><span className="rounded bg-slate-100 px-2 py-1 dark:bg-slate-800">{users.filter((u) => u.queues?.some((item) => item.id === queue.id)).length} agentes</span><span className="rounded bg-slate-100 px-2 py-1 dark:bg-slate-800">{whatsapps.filter((w) => w.queueIds?.includes(queue.id) || w.queues?.some((item: Queue) => item.id === queue.id)).length} líneas</span></div></button>)}</div>
    {!filtered.length && <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No hay departamentos para mostrar.</p>}

    {editing && (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4 sm:p-6 animate-in fade-in duration-150">
        <div className="flex flex-col w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200 dark:border-slate-800 dark:bg-slate-900">
          {/* Header */}
          <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold text-white shadow-xs transition-colors"
                style={{ backgroundColor: form.color || '#2563eb' }}
              >
                {form.name ? form.name.slice(0, 2).toUpperCase() : 'DP'}
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {editing === 'new' ? 'Nuevo departamento' : form.name || 'Departamento'}
                </h3>
                <p className="text-xs text-slate-500">
                  Configuración de atención, asignación y chatbot
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          {/* Navigation Tabs */}
          <nav className="flex border-b border-slate-200 bg-slate-50/70 px-6 dark:border-slate-800 dark:bg-slate-900/50">
            {[
              { id: 'chatbot', label: 'Chatbot', icon: Bot },
              { id: 'team', label: 'Equipo y asignación', icon: Users },
              { id: 'hours', label: 'Horario de atención', icon: Clock3 },
            ].map((item) => {
              const Icon = item.icon;
              const isActive = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id as Tab)}
                  className={`flex items-center gap-2 border-b-2 py-3 px-3 text-xs sm:text-sm font-semibold transition ${
                    isActive
                      ? 'border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400'
                      : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Body */}
          <main className="flex-1 overflow-y-auto p-6">
            {tab === 'chatbot' && (
              <div className="space-y-5">
                {/* Nombre y Color */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Nombre del departamento
                    </label>
                    <input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="Ej: Ventas, Soporte, Facturación..."
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-blue-900/30"
                    />
                  </div>

                  <div className="sm:w-44">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Color
                    </label>
                    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 dark:border-slate-700 dark:bg-slate-800">
                      <input
                        type="color"
                        value={form.color}
                        onChange={(e) => setForm({ ...form, color: e.target.value })}
                        className="h-7 w-8 cursor-pointer rounded-lg border-0 bg-transparent p-0"
                      />
                      <span className="font-mono text-xs font-medium uppercase text-slate-600 dark:text-slate-300">
                        {form.color}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Colores predeterminados */}
                <div>
                  <span className="text-[11px] text-slate-400 block mb-1.5 font-medium">Colores sugeridos:</span>
                  <div className="flex flex-wrap items-center gap-2">
                    {['#2563eb', '#059669', '#7c3aed', '#d97706', '#dc2626', '#0891b2', '#db2777', '#475569'].map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setForm({ ...form, color: c })}
                        className={`h-6 w-6 rounded-full transition-transform hover:scale-110 ${
                          form.color.toLowerCase() === c.toLowerCase() ? 'ring-2 ring-offset-2 ring-blue-500 scale-105' : ''
                        }`}
                        style={{ backgroundColor: c }}
                        title={c}
                      />
                    ))}
                  </div>
                </div>

                {/* Líneas vinculadas */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Líneas de WhatsApp vinculadas
                    </label>
                    <span className="text-[11px] font-medium text-slate-400">
                      {form.whatsappIds.length} de {whatsapps.length} seleccionada{form.whatsappIds.length === 1 ? '' : 's'}
                    </span>
                  </div>

                  {whatsapps.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400 dark:border-slate-800">
                      No hay líneas de WhatsApp conectadas actualmente.
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto rounded-xl border border-slate-200 p-2 dark:border-slate-800 dark:bg-slate-900/40">
                      {whatsapps.map((w) => {
                        const isChecked = form.whatsappIds.includes(w.id);
                        const isConnected = w.status === 'CONNECTED';
                        return (
                          <label
                            key={w.id}
                            className={`flex cursor-pointer items-center justify-between rounded-xl px-3 py-2.5 transition border ${
                              isChecked
                                ? 'border-blue-200 bg-blue-50/60 dark:border-blue-900/40 dark:bg-blue-950/20'
                                : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/60'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <span className={`h-2.5 w-2.5 rounded-full ${isConnected ? 'bg-emerald-500 ring-2 ring-emerald-100 dark:ring-emerald-950' : 'bg-slate-300 dark:bg-slate-600'}`} />
                              <div>
                                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{w.name}</span>
                                <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                                  isConnected ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'
                                }`}>
                                  {w.status}
                                </span>
                              </div>
                            </div>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => setForm({ ...form, whatsappIds: toggle(form.whatsappIds, w.id) })}
                              className="h-4 w-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Mensaje de saludo */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Mensaje de saludo / bienvenida
                  </label>
                  <textarea
                    value={form.greetingMessage}
                    onChange={(e) => setForm({ ...form, greetingMessage: e.target.value })}
                    rows={4}
                    placeholder="¡Hola! Gracias por comunicarte con nuestro departamento. ¿En qué podemos ayudarte hoy?"
                    className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-blue-900/30"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">
                    Este mensaje se enviará automáticamente cuando un cliente seleccione este departamento en el menú de bienvenida.
                  </p>
                </div>
              </div>
            )}

            {tab === 'team' && (
              <div className="space-y-5">
                {/* Reglas automáticas */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-2 dark:border-slate-800 dark:bg-slate-800/30">
                  {([
                    { key: 'autoAssign', label: 'Habilitar asignación automática', text: 'Distribuye nuevos chats equitativamente entre los agentes habilitados.' },
                    { key: 'assignOffline', label: 'Asignar a usuarios fuera de línea', text: 'Incluye agentes aunque no tengan la sesión activa.' },
                    { key: 'redistribute', label: 'Redistribuir chats si no hay respuesta', text: 'Mueve el ticket a otro agente si el asignado está ausente.' },
                    { key: 'delegateBot', label: 'Delegar al chatbot tras la asignación', text: 'Permite que el bot continúe respondiendo después de asignar.' },
                  ] as const).map((item, index) => (
                    <div
                      key={item.key}
                      className="flex items-center justify-between gap-3 rounded-lg p-2.5 transition hover:bg-slate-100/70 dark:hover:bg-slate-800/60"
                    >
                      <div className="pr-2">
                        <b className="block text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200">{item.label}</b>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">{item.text}</p>
                      </div>
                      <Switch
                        checked={rules[item.key]}
                        disabled={index > 0 && !rules.autoAssign}
                        onClick={() => setRule(item.key)}
                      />
                    </div>
                  ))}
                </div>

                {/* Tabla de usuarios */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    Agentes asignados ({members.length} de {users.length})
                  </label>
                  <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
                    <div className="max-h-56 overflow-y-auto">
                      <table className="w-full border-collapse text-left">
                        <thead className="sticky top-0 z-10 bg-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-500 shadow-xs dark:bg-slate-800">
                          <tr>
                            <th className="py-2.5 px-4 font-semibold">Agente</th>
                            <th className="w-24 py-2.5 px-2 text-center font-semibold">Miembro</th>
                            <th className="w-32 py-2.5 px-3 text-center font-semibold">Asign. Auto</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {users.map((user) => {
                            const isMember = members.includes(user.id);
                            const isAuto = rules.automaticAgents.includes(user.id);
                            return (
                              <tr
                                key={user.id}
                                className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition"
                              >
                                <td className="py-2.5 px-4">
                                  <span className="block font-semibold text-sm text-slate-800 dark:text-slate-200">
                                    {user.name}
                                  </span>
                                  <span className="block text-[11px] text-slate-400">
                                    {user.email}
                                  </span>
                                </td>
                                <td className="w-24 py-2.5 px-2 text-center align-middle">
                                  <input
                                    type="checkbox"
                                    checked={isMember}
                                    onChange={() => setMembers(toggle(members, user.id))}
                                    className="h-4 w-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer align-middle"
                                  />
                                </td>
                                <td className="w-32 py-2.5 px-3 text-center align-middle">
                                  <input
                                    type="checkbox"
                                    disabled={!rules.autoAssign || !isMember}
                                    checked={isAuto}
                                    onChange={() => setRules({ ...rules, automaticAgents: toggle(rules.automaticAgents, user.id) })}
                                    className="h-4 w-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-30 align-middle"
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300">
                  ℹ️ <b>Reglas de asignación:</b> La distribución de tickets se calcula entre los agentes marcados en «Asign. Auto» que pertenezcan al departamento.
                </div>
              </div>
            )}

            {tab === 'hours' && (
              <div className="space-y-4">
                <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3.5 text-xs text-blue-800 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-300">
                  ⏰ <b>Horario de atención del departamento:</b> Cuando un cliente escriba fuera del horario comercial, recibirá automáticamente el mensaje configurado a continuación.
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Mensaje fuera de horario
                  </label>
                  <textarea
                    value={form.outOfHoursMessage}
                    onChange={(e) => setForm({ ...form, outOfHoursMessage: e.target.value })}
                    rows={5}
                    placeholder="Hola, en este momento nos encontramos fuera del horario de atención. Dejanos tu consulta y te responderemos lo antes posible."
                    className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-blue-900/30"
                  />
                </div>
              </div>
            )}
          </main>

          {/* Footer */}
          <footer className="flex items-center justify-between border-t border-slate-200 bg-slate-50/70 px-6 py-4 dark:border-slate-800 dark:bg-slate-900/60">
            <div>
              {editing !== 'new' && (
                <button
                  type="button"
                  onClick={() => void remove()}
                  className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs sm:text-sm font-semibold text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-950/40 transition"
                >
                  <Trash2 className="h-4 w-4" />
                  Eliminar
                </button>
              )}
            </div>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-xl px-4 py-2 text-xs sm:text-sm font-medium text-slate-600 hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-slate-800 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2 text-xs sm:text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 transition"
              >
                <Save className="h-4 w-4" />
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </footer>
        </div>
      </div>
    )}
  </div>;
};
