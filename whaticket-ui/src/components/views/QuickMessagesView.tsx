import React, { useState } from 'react';
import { useChatStore } from '../../store/chatStore';
import { Zap, Search, Plus, Trash2, Edit2, Paperclip, FileText, Download } from 'lucide-react';
import { getMediaUrl } from '../../services/api';

export const QuickMessagesView: React.FC = () => {
  const { quickMessages } = useChatStore();
  const [search, setSearch] = useState('');

  const filtered = quickMessages.filter(
    (q) =>
      q.shortcode.toLowerCase().includes(search.toLowerCase()) ||
      q.message.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex-1 bg-slate-50 dark:bg-slate-950 p-6 overflow-y-auto flex flex-col gap-6 select-none">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-500" />
            Respuestas Rápidas
          </h2>
          <p className="text-xs text-slate-500">
            Plantillas predefinidas para agilizar la atención a los clientes
          </p>
        </div>

        {/* Search */}
        <div className="w-72 relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar respuesta rápida..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 bg-white dark:bg-slate-900 text-xs rounded-xl border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Grid of quick messages */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((item) => {
          const mediaUrl = item.mediaPath ? getMediaUrl(item.mediaPath) : null;
          const isPdf = item.mediaPath?.toLowerCase().endsWith('.pdf');

          return (
            <div
              key={item.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex flex-col justify-between gap-3"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-xs bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 px-2.5 py-1 rounded-lg">
                    /{item.shortcode.replace(/^\//, '')}
                  </span>
                  {item.gerall && (
                    <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded-md">
                      General
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                  {item.message}
                </p>
              </div>

              {/* Media Attachment if any */}
              {mediaUrl && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  {isPdf ? (
                    <a
                      href={mediaUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 p-2 bg-rose-50 dark:bg-rose-950/30 rounded-xl text-rose-700 dark:text-rose-300 text-xs"
                    >
                      <FileText className="w-5 h-5 text-rose-500 flex-shrink-0" />
                      <span className="truncate font-semibold">
                        {item.mediaName || 'Documento adjunto'}
                      </span>
                    </a>
                  ) : (
                    <div className="rounded-lg overflow-hidden max-h-32 bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                      <img
                        src={mediaUrl}
                        alt="Adjunto"
                        className="max-h-32 object-contain"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
