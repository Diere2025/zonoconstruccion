import React from 'react';
import { format } from 'date-fns';
import { X, Phone, Mail, Tag as TagIcon, Clock, Calendar, Copy, Check, Smartphone } from 'lucide-react';
import { useChatStore } from '../../store/chatStore';
import { formatPhoneNumber, cleanPhoneForCopy } from '../../utils/phone';
import { toast } from 'sonner';

interface ContactDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ContactDrawer: React.FC<ContactDrawerProps> = ({ isOpen, onClose }) => {
  const { activeTicket, whatsapps } = useChatStore();
  const [copied, setCopied] = React.useState(false);

  if (!isOpen || !activeTicket) return null;

  const contact = activeTicket.contact;
  const currentWhatsapp = activeTicket.whatsapp || whatsapps.find((w) => w.id === activeTicket.whatsappId);

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
      <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center gap-4">
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

        {/* Tags */}
        {contact?.tags && contact.tags.length > 0 && (
          <div className="w-full flex flex-col gap-1.5">
            <span className="text-[11px] font-bold uppercase text-slate-400">
              Etiquetas
            </span>
            <div className="flex flex-wrap gap-1">
              {contact.tags.map((tag) => (
                <span
                  key={tag.id}
                  className="px-2 py-0.5 rounded-md text-[11px] font-semibold text-white"
                  style={{ backgroundColor: tag.color || '#3b82f6' }}
                >
                  {tag.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
