import React, { useState, useMemo } from 'react';
import { 
  Search, 
  X, 
  Zap, 
  Send, 
  Edit3, 
  FileText, 
  Image as ImageIcon,
  Paperclip,
  Check
} from 'lucide-react';
import { useChatStore } from '../../store/chatStore';
import { QuickMessage, Ticket } from '../../types';
import { getMediaUrl } from '../../services/api';

interface QuickMessagesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertToInput: (text: string, mediaUrl?: string | null) => void;
  onSendDirect: (text: string, mediaUrl?: string | null) => void;
}

export const QuickMessagesModal: React.FC<QuickMessagesModalProps> = ({
  isOpen,
  onClose,
  onInsertToInput,
  onSendDirect,
}) => {
  const { quickMessages, activeTicket } = useChatStore();
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<QuickMessage | null>(null);

  const contactName = activeTicket?.contact?.name || 'Cliente';

  // Filtrar respuestas rápidas por shortcut o contenido
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return quickMessages;
    return quickMessages.filter(
      (item) =>
        item.shortcode.toLowerCase().includes(q) ||
        item.message.toLowerCase().includes(q)
    );
  }, [quickMessages, search]);

  if (!isOpen) return null;

  // Reemplazar variables comunes como {{name}}
  const formatMessageVariables = (text: string) => {
    return text.replace(/\{\{name\}\}/gi, contactName);
  };

  const previewText = selectedItem ? formatMessageVariables(selectedItem.message) : '';
  const mediaUrl = selectedItem?.mediaPath ? getMediaUrl(selectedItem.mediaPath) : null;
  const isPdf = selectedItem?.mediaPath?.toLowerCase().endsWith('.pdf');

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Respuestas Rápidas
              </h3>
              <p className="text-xs text-slate-500">
                Selecciona una respuesta para ver la vista previa antes de enviar
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search input */}
        <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por atajo (ej: /hola, /precio) o palabra clave..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              className="w-full pl-9 pr-4 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Body Split: List + Preview */}
        <div className="flex-1 flex overflow-hidden min-h-[350px]">
          {/* List Column */}
          <div className="w-1/2 border-r border-slate-200 dark:border-slate-800 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                No se encontraron respuestas rápidas con esa búsqueda.
              </div>
            ) : (
              filtered.map((item) => {
                const isSelected = selectedItem?.id === item.id;
                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedItem(item)}
                    className={`p-3 cursor-pointer transition-colors flex flex-col gap-1 ${
                      isSelected
                        ? 'bg-blue-50 dark:bg-blue-950/40 border-l-4 border-blue-600'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-blue-600 dark:text-blue-400 bg-blue-100/50 dark:bg-blue-950 px-2 py-0.5 rounded-md">
                        /{item.shortcode.replace(/^\//, '')}
                      </span>
                      {item.mediaPath && (
                        <span className="text-[11px] text-slate-400 flex items-center gap-0.5">
                          <Paperclip className="w-3 h-3" />
                          Adjunto
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                      {item.message}
                    </p>
                  </div>
                );
              })
            )}
          </div>

          {/* Preview Column */}
          <div className="w-1/2 p-4 bg-slate-50/50 dark:bg-slate-900/30 flex flex-col justify-between overflow-y-auto">
            {selectedItem ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Vista previa para {contactName}
                  </span>
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                    /{selectedItem.shortcode.replace(/^\//, '')}
                  </span>
                </div>

                {/* Media preview */}
                {mediaUrl && (
                  <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2">
                    {isPdf ? (
                      <div className="flex items-center gap-3 p-2 bg-rose-50 dark:bg-rose-950/30 rounded-lg text-rose-700 dark:text-rose-300">
                        <FileText className="w-8 h-8 text-rose-500" />
                        <div className="text-xs truncate">
                          <p className="font-semibold truncate">
                            {selectedItem.mediaName || 'Documento PDF'}
                          </p>
                          <span className="text-[10px] text-slate-400">Archivo adjunto listo</span>
                        </div>
                      </div>
                    ) : (
                      <div className="max-h-40 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                        <img
                          src={mediaUrl}
                          alt="Adjunto"
                          className="max-h-40 object-contain"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Formatted Text Box */}
                <div className="bg-white dark:bg-slate-800 rounded-xl p-3 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed shadow-xs">
                  {previewText}
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs text-center p-6 gap-2">
                <Zap className="w-8 h-8 opacity-40 text-amber-500" />
                <p>Haz clic en una respuesta a la izquierda para ver su contenido y adjuntos antes de enviar.</p>
              </div>
            )}

            {/* Actions Bottom Bar */}
            {selectedItem && (
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2">
                <button
                  onClick={() => {
                    onInsertToInput(previewText, mediaUrl);
                    onClose();
                  }}
                  className="flex-1 py-2 px-3 text-xs font-semibold rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Cargar y modificar
                </button>
                <button
                  onClick={() => {
                    onSendDirect(previewText, mediaUrl);
                    onClose();
                  }}
                  className="flex-1 py-2 px-3 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-1.5 shadow-md shadow-blue-600/20 transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                  Enviar ahora
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
