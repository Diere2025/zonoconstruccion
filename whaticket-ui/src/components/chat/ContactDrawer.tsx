import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { X, Phone, Mail, Tag as TagIcon, Clock, Calendar, Copy, Check, Smartphone, FileText } from 'lucide-react';
import { useChatStore } from '../../store/chatStore';
import { formatPhoneNumber, cleanPhoneForCopy } from '../../utils/phone';
import { toast } from 'sonner';
import { Budget } from '../../types';
import { fetchTicketBudgets, updateBudgetStatus } from '../../services/catalogService';

interface ContactDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ContactDrawer: React.FC<ContactDrawerProps> = ({ isOpen, onClose }) => {
  const { activeTicket, whatsapps } = useChatStore();
  const [copied, setCopied] = React.useState(false);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loadingBudgets, setLoadingBudgets] = useState(false);

  const contact = activeTicket?.contact;
  const currentWhatsapp = activeTicket?.whatsapp || whatsapps.find((w) => w.id === activeTicket?.whatsappId);

  const loadBudgets = async () => {
    if (!activeTicket) return;
    setLoadingBudgets(true);
    try {
      const data = await fetchTicketBudgets(activeTicket.id, contact?.id);
      setBudgets(data || []);
    } catch (err) {
      console.error('Error fetching ticket budgets:', err);
    } finally {
      setLoadingBudgets(false);
    }
  };

  useEffect(() => {
    if (activeTicket) {
      loadBudgets();
    }
  }, [activeTicket?.id, contact?.id]);

  useEffect(() => {
    const handleBudgetCreated = (e: any) => {
      const newBudget = e.detail as Budget;
      if (newBudget) {
        setBudgets((prev) => [newBudget, ...prev.filter((b) => b.id !== newBudget.id)]);
      }
    };
    window.addEventListener('whaticket_budget_created', handleBudgetCreated);
    return () => {
      window.removeEventListener('whaticket_budget_created', handleBudgetCreated);
    };
  }, []);

  const handleStatusChange = async (budgetId: number, status: 'open' | 'pending' | 'won' | 'lost') => {
    try {
      await updateBudgetStatus(budgetId, status);
      setBudgets((prev) => prev.map((b) => (b.id === budgetId ? { ...b, status } : b)));
      toast.success('Estado del presupuesto actualizado');
    } catch (err) {
      toast.error('Error al actualizar el estado');
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0,
    }).format(val || 0);
  };

  if (!isOpen || !activeTicket) return null;

  const handleCopy = () => {
    if (contact?.number) {
      const toCopy = cleanPhoneForCopy(contact.number);
      navigator.clipboard.writeText(toCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success(`Copiado: ${toCopy}`);
    }
  };

  return (
    <div className="w-80 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col h-full flex-shrink-0 z-20 select-none animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">
          Detalles del Contacto
        </h3>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 pb-24 flex flex-col items-center gap-4">
        {/* Big Avatar */}
        <div className="w-20 h-20 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-slate-700 dark:text-slate-200 text-2xl overflow-hidden shadow-inner">
          {contact?.profilePicUrl ? (
            <img
              src={contact.profilePicUrl}
              alt={contact.name}
              className="w-full h-full object-cover"
            />
          ) : (
            contact?.name?.slice(0, 2).toUpperCase() || 'ZC'
          )}
        </div>

        {/* Name & Phone */}
        <div className="text-center">
          <h4 className="font-bold text-base text-slate-900 dark:text-slate-100">
            {contact?.name || 'Sin Nombre'}
          </h4>
          <div className="flex items-center justify-center gap-1.5 mt-1 text-xs text-slate-500 font-mono">
            <span>{formatPhoneNumber(contact?.number)}</span>
            <button onClick={handleCopy} title="Copiar número" className="hover:text-blue-600 cursor-pointer">
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Details Card */}
        <div className="w-full bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-200 dark:border-slate-700 flex flex-col gap-2.5 text-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5" /> Teléfono
            </span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {formatPhoneNumber(contact?.number)}
            </span>
          </div>

          {contact?.email && (
            <div className="flex items-center justify-between text-slate-500">
              <span className="flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" /> Email
              </span>
              <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[140px]">
                {contact.email}
              </span>
            </div>
          )}

          {currentWhatsapp && (
            <div className="flex items-center justify-between text-slate-500">
              <span className="flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5" /> Línea
              </span>
              <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[140px]" title={currentWhatsapp.name}>
                {currentWhatsapp.name}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between text-slate-500">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> Creado
            </span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {activeTicket.createdAt ? format(new Date(activeTicket.createdAt), 'dd/MM/yyyy') : '-'}
            </span>
          </div>
        </div>

        {/* Presupuestos Section */}
        <div className="w-full flex flex-col gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase text-slate-400 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-rose-500" /> Presupuestos ({budgets.length})
            </span>
            <button
              type="button"
              onClick={loadBudgets}
              className="text-[10px] text-blue-600 hover:underline cursor-pointer"
            >
              Actualizar
            </button>
          </div>

          {loadingBudgets ? (
            <div className="py-4 text-center text-xs text-slate-400">
              Cargando cotizaciones...
            </div>
          ) : budgets.length === 0 ? (
            <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 text-center text-slate-400 text-xs">
              Sin presupuestos emitidos aún.
            </div>
          ) : (
            <div className="space-y-2.5 w-full">
              {budgets.map((b) => (
                <div
                  key={b.id}
                  className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col gap-2 text-xs shadow-2xs hover:border-slate-300 dark:hover:border-slate-600 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-blue-600 dark:text-blue-400 font-mono text-[11px]">
                      #{b.code}
                    </span>
                    <span className="font-extrabold text-slate-900 dark:text-slate-100 font-mono">
                      {formatCurrency(b.total)}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed break-words" title={b.items?.map(it => `${it.quantity}x ${it.name}`).join(', ')}>
                    {b.items && b.items.length > 0
                      ? b.items.map((it) => `${it.quantity}x ${it.name}`).join(', ')
                      : 'Sin ítems'}
                  </div>

                  <div className="flex items-center justify-between pt-1.5 border-t border-slate-100 dark:border-slate-700/60">
                    <span className="text-[10px] text-slate-400 font-mono">
                      {b.createdAt ? format(new Date(b.createdAt), 'dd/MM/yy HH:mm') : ''}
                    </span>
                    <select
                      value={b.status}
                      onChange={(e) => handleStatusChange(b.id, e.target.value as any)}
                      className="text-[10px] font-bold rounded-md py-0.5 px-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 focus:outline-none cursor-pointer shadow-2xs"
                    >
                      <option value="open">Abierto</option>
                      <option value="pending">En Seguimiento</option>
                      <option value="won">Ganado</option>
                      <option value="lost">Perdido</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
