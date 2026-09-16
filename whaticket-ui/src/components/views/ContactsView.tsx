import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import { Contact } from '../../types';
import { Users, Search, Phone, Copy, Check, Plus, Pencil, Trash2, X } from 'lucide-react';
import { formatPhoneNumber, cleanPhoneForCopy } from '../../utils/phone';
import { toast } from 'sonner';

export const ContactsView: React.FC<{ onOpenChat: () => void }> = ({ onOpenChat }) => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: '', number: '', email: '' });
  const contactsRequestVersion = useRef(0);

  const handleCopy = (c: Contact) => {
    if (c.number) {
      const toCopy = cleanPhoneForCopy(c.number);
      navigator.clipboard.writeText(toCopy);
      setCopiedId(c.id);
      setTimeout(() => setCopiedId(null), 2000);
      toast.success(`Copiado: ${toCopy}`);
    }
  };

  const fetchContacts = async (query = '') => {
    const requestVersion = ++contactsRequestVersion.current;
    setIsLoading(true);
    setLoadError(null);
    try {
      const { data } = await api.get('/contacts', {
        params: { searchParam: query },
      });
      if (requestVersion === contactsRequestVersion.current) {
        setContacts(data?.contacts || (Array.isArray(data) ? data : []));
      }
    } catch (err) {
      console.error(err);
      if (requestVersion === contactsRequestVersion.current) {
        setLoadError('No se pudieron cargar los contactos. Intentá nuevamente.');
      }
    } finally {
      if (requestVersion === contactsRequestVersion.current) setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchContacts(search);
  }, [search]);

  const openNewContact = () => {
    setEditingContact(null);
    setForm({ name: '', number: '', email: '' });
    setIsEditorOpen(true);
  };

  const openEditContact = (contact: Contact) => {
    setEditingContact(contact);
    setForm({ name: contact.name || '', number: contact.number || '', email: contact.email || '' });
    setIsEditorOpen(true);
  };

  const saveContact = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = form.name.trim();
    const number = cleanPhoneForCopy(form.number);
    if (!name || !number) {
      toast.error('Completá el nombre y el teléfono del contacto.');
      return;
    }

    setIsSaving(true);
    try {
      const payload = { name, number, email: form.email.trim() || undefined };
      if (editingContact) {
        await api.put(`/contacts/${editingContact.id}`, payload);
        toast.success('Contacto actualizado');
      } else {
        await api.post('/contacts', payload);
        toast.success('Contacto creado');
      }
      setIsEditorOpen(false);
      await fetchContacts(search);
    } catch (err) {
      console.error('Error saving contact:', err);
      toast.error('No se pudo guardar el contacto. Revisá los datos e intentá nuevamente.');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteContact = async (contact: Contact) => {
    if (!window.confirm(`¿Eliminar a ${contact.name || contact.number}? Esta acción no se puede deshacer.`)) return;
    setIsDeletingId(contact.id);
    try {
      await api.delete(`/contacts/${contact.id}`);
      setContacts((current) => current.filter((item) => item.id !== contact.id));
      toast.success('Contacto eliminado');
    } catch (err) {
      console.error('Error deleting contact:', err);
      toast.error('No se pudo eliminar el contacto. Intentá nuevamente.');
    } finally {
      setIsDeletingId(null);
    }
  };

  return (
    <div className="flex-1 bg-slate-50 dark:bg-slate-950 p-6 overflow-y-auto flex flex-col gap-6 select-none">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-500" />
            Contactos
          </h2>
          <p className="text-xs text-slate-500">
            Directorio de clientes y números registrados
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-72 relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nombre o teléfono..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 bg-white dark:bg-slate-900 text-xs rounded-xl border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button type="button" onClick={openNewContact} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
            <Plus className="h-3.5 w-3.5" /> Nuevo contacto
          </button>
        </div>
      </div>

      {/* Contacts Grid */}
      {loadError && (
        <div role="alert" className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          <span>{loadError}</span>
          <button type="button" onClick={() => fetchContacts(search)} className="font-semibold underline">Reintentar</button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {contacts.map((contact) => (
          <div
            key={contact.id}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-slate-700 dark:text-slate-200 text-sm overflow-hidden flex-shrink-0">
                {contact.profilePicUrl ? (
                  <img
                    src={contact.profilePicUrl}
                    alt={contact.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  contact.name?.slice(0, 2).toUpperCase() || 'ZC'
                )}
              </div>
              <div className="truncate">
                <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">
                  {contact.name || formatPhoneNumber(contact.number)}
                </h4>
                <div className="text-xs text-slate-500 font-mono flex items-center gap-1.5 mt-0.5">
                  <Phone className="w-3 h-3 text-slate-400" />
                  <span>{formatPhoneNumber(contact.number)}</span>
                  <button
                    onClick={() => handleCopy(contact)}
                    title="Copiar teléfono"
                    className="hover:text-blue-600 transition-colors ml-1 cursor-pointer"
                  >
                    {copiedId === contact.id ? (
                      <Check className="w-3 h-3 text-emerald-500" />
                    ) : (
                      <Copy className="w-3 h-3 text-slate-400" />
                    )}
                  </button>
                </div>
              </div>
            </div>
            <div className="flex flex-shrink-0 items-center gap-1">
              <button type="button" onClick={() => openEditContact(contact)} title="Editar contacto" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-slate-800">
                <Pencil className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => deleteContact(contact)} disabled={isDeletingId === contact.id} title="Eliminar contacto" className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/30">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {!isLoading && contacts.length === 0 && !loadError && (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">No hay contactos para mostrar.</p>
      )}

      {isEditorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <form onSubmit={saveContact} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 dark:text-slate-100">{editingContact ? 'Editar contacto' : 'Nuevo contacto'}</h3>
              <button type="button" onClick={() => setIsEditorOpen(false)} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Cerrar"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Nombre
                <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800" />
              </label>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Teléfono
                <input required value={form.number} onChange={(event) => setForm({ ...form, number: event.target.value })} placeholder="Ej. 11 2163-5943" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800" />
              </label>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Email <span className="font-normal text-slate-400">(opcional)</span>
                <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800" />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setIsEditorOpen(false)} disabled={isSaving} className="rounded-xl px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800">Cancelar</button>
              <button type="submit" disabled={isSaving} className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{isSaving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
