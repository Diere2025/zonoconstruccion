import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, Check, ChevronDown, X } from 'lucide-react';

export interface MultiSelectOption {
  id: number;
  name: string;
  color?: string;
  subtitle?: string;
  badge?: string;
  icon?: React.ReactNode;
}

interface SearchableMultiSelectProps {
  label: string;
  placeholder?: string;
  searchPlaceholder?: string;
  options: MultiSelectOption[];
  selectedIds: number[];
  onChange: (selectedIds: number[]) => void;
}

const normalizeText = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export const SearchableMultiSelect: React.FC<SearchableMultiSelectProps> = ({
  label,
  placeholder,
  searchPlaceholder = 'Buscar...',
  options,
  selectedIds,
  onChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cerrar al hacer clic afuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Enfocar input de búsqueda al abrir
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    } else {
      setSearch('');
    }
  }, [isOpen]);

  // Cerrar con Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Filtrar opciones
  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const q = normalizeText(search);
    return options.filter((opt) => {
      const nameMatch = normalizeText(opt.name).includes(q);
      const subMatch = opt.subtitle ? normalizeText(opt.subtitle).includes(q) : false;
      return nameMatch || subMatch;
    });
  }, [options, search]);

  const toggleOption = (id: number) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((item) => item !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const handleSelectAll = () => {
    const allFilteredIds = filteredOptions.map((o) => o.id);
    const combined = Array.from(new Set([...selectedIds, ...allFilteredIds]));
    onChange(combined);
  };

  const handleClear = () => {
    onChange([]);
  };

  // Encontrar opción si hay 1 sola seleccionada
  const singleSelectedOption = useMemo(() => {
    if (selectedIds.length === 1) {
      return options.find((o) => o.id === selectedIds[0]);
    }
    return null;
  }, [selectedIds, options]);

  return (
    <div className="relative w-full" ref={containerRef}>
      {/* Botón Trigger */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full border rounded-xl px-3 py-2 text-xs flex items-center justify-between cursor-pointer transition-all ${
          isOpen
            ? 'border-blue-500 ring-2 ring-blue-500/20 bg-white dark:bg-slate-800'
            : selectedIds.length > 0
            ? 'border-blue-300 dark:border-blue-700/60 bg-blue-50/40 dark:bg-blue-950/20'
            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'
        }`}
      >
        <div className="flex items-center gap-2 truncate flex-1 min-w-0 mr-1">
          {selectedIds.length === 0 ? (
            <span className="text-slate-500 dark:text-slate-400 font-medium truncate">
              {placeholder || label}
            </span>
          ) : singleSelectedOption ? (
            <div className="flex items-center gap-1.5 truncate">
              {singleSelectedOption.color && (
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: singleSelectedOption.color }}
                />
              )}
              {singleSelectedOption.icon && (
                <span className="shrink-0">{singleSelectedOption.icon}</span>
              )}
              <span className="font-semibold text-slate-800 dark:text-slate-100 truncate">
                {singleSelectedOption.name}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 truncate">
              <span className="font-medium text-slate-700 dark:text-slate-300 truncate">
                {label}
              </span>
              <span className="bg-blue-600 text-white px-1.5 py-0.2 text-[10px] font-bold rounded-full">
                {selectedIds.length}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {selectedIds.length > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleClear();
              }}
              className="p-0.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              title="Limpiar selección"
            >
              <X className="w-3 h-3" />
            </button>
          )}
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-blue-500' : ''
            }`}
          />
        </div>
      </div>

      {/* Menú Desplegable Flotante */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl z-50 p-2.5 flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-150">
          
          {/* Input de Búsqueda */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-100 dark:bg-slate-750 text-slate-800 dark:text-slate-100 placeholder-slate-400 rounded-xl border border-transparent focus:border-blue-500/40 focus:outline-none focus:ring-1 focus:ring-blue-500/30 transition-all"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Barra de Acciones Rápidas */}
          <div className="flex items-center justify-between px-1 text-[11px] border-b border-slate-100 dark:border-slate-700/60 pb-1.5">
            <span className="text-slate-400 font-medium">
              {selectedIds.length > 0
                ? `${selectedIds.length} seleccionada${selectedIds.length > 1 ? 's' : ''}`
                : `${filteredOptions.length} disponible${filteredOptions.length > 1 ? 's' : ''}`}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-blue-600 dark:text-blue-400 hover:underline font-semibold cursor-pointer"
              >
                Todas
              </button>
              <span className="text-slate-300 dark:text-slate-600">|</span>
              <button
                type="button"
                onClick={handleClear}
                className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer"
              >
                Limpiar
              </button>
            </div>
          </div>

          {/* Lista de Opciones Scrolleable */}
          <div className="max-h-52 overflow-y-auto space-y-0.5 scrollbar-thin pr-0.5">
            {filteredOptions.length === 0 ? (
              <div className="py-4 text-center text-xs text-slate-400">
                No se encontraron resultados
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = selectedIds.includes(opt.id);
                return (
                  <div
                    key={opt.id}
                    onClick={() => toggleOption(opt.id)}
                    className={`w-full px-2.5 py-1.5 rounded-xl text-xs flex items-center gap-2.5 cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-blue-50/70 dark:bg-blue-950/40 text-blue-950 dark:text-blue-100 font-medium'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100/80 dark:hover:bg-slate-700/50'
                    }`}
                  >
                    {/* Checkbox personalizado */}
                    <div
                      className={`w-4 h-4 rounded flex items-center justify-center border transition-all shrink-0 ${
                        isSelected
                          ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                          : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>

                    {/* Dot / Icono opcional */}
                    {opt.color && (
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs"
                        style={{ backgroundColor: opt.color }}
                      />
                    )}
                    {opt.icon && <span className="shrink-0">{opt.icon}</span>}

                    {/* Nombre y subtítulo */}
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="truncate">{opt.name}</span>
                      {opt.subtitle && (
                        <span className="text-[10px] text-slate-400 truncate">
                          {opt.subtitle}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
