import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Search, 
  X, 
  Check, 
  ChevronDown, 
  MessageSquare, 
  Users, 
  MoreVertical, 
  SlidersHorizontal, 
  Calendar, 
  CheckCircle2, 
  Tag as TagIcon, 
  Smartphone, 
  Layers, 
  Clock, 
  ExternalLink, 
  Eye, 
  RotateCcw,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Plus,
  AlertTriangle
} from 'lucide-react';
import { useChatStore } from '../../store/chatStore';
import { useAuthStore } from '../../store/authStore';
import { Ticket, Queue, Tag } from '../../types';
import { SearchableMultiSelect, MultiSelectOption } from '../common/SearchableMultiSelect';
import { format, isToday, isYesterday, parseISO, isWithinInterval, startOfDay, endOfDay, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatPhoneNumber } from '../../utils/phone';

export const TicketList: React.FC = () => {
  const { user: currentUser } = useAuthStore();
  const {
    tickets,
    activeTicket,
    activeTab,
    selectedQueueId,
    selectedQueueIds,
    filterUser,
    filterUnreadOnly,
    filterTagId,
    filterTagIds,
    filterWhatsappId,
    filterWhatsappIds,
    filterDateRange,
    isInternalOnly,
    searchQuery,
    queues,
    tags,
    users,
    whatsapps,
    isLoadingTickets,
    hasMoreTickets,
    ticketsError,
    setActiveTab,
    setSelectedQueueId,
    setSelectedQueueIds,
    setFilterUser,
    setFilterUnreadOnly,
    setFilterTagId,
    setFilterTagIds,
    setFilterWhatsappId,
    setFilterWhatsappIds,
    setFilterDateRange,
    setIsInternalOnly,
    resetAllFilters,
    setSearchQuery,
    selectTicket,
    updateTicketQueue,
    findTicketsByPhone,
    createTicket,
    fetchTickets,
    fetchQueues,
    fetchTags,
    fetchUsers,
    fetchWhatsapps,
  } = useChatStore();

  // Estados de menús flotantes
  const [showTeamMenu, setShowTeamMenu] = useState(false);
  const [showStatusExtraMenu, setShowStatusExtraMenu] = useState(false);
  const [showFilterPopover, setShowFilterPopover] = useState(false);
  const [showOptionsDotsMenu, setShowOptionsDotsMenu] = useState(false);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [queueMenuTicketId, setQueueMenuTicketId] = useState<number | null>(null);
  const [showNewConversationModal, setShowNewConversationModal] = useState(false);
  const [newConversationPhone, setNewConversationPhone] = useState('');
  const [newConversationName, setNewConversationName] = useState('');
  const [newConversationWhatsappId, setNewConversationWhatsappId] = useState<number | null>(null);
  const [matchingTickets, setMatchingTickets] = useState<Ticket[]>([]);
  const [isCheckingNumber, setIsCheckingNumber] = useState(false);
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
  const [newConversationError, setNewConversationError] = useState<string | null>(null);

  // Estado del selector de fecha en calendario
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [tempRangeStart, setTempRangeStart] = useState<Date | null>(null);
  const [tempRangeEnd, setTempRangeEnd] = useState<Date | null>(null);

  const teamMenuRef = useRef<HTMLDivElement>(null);
  const filterPopoverRef = useRef<HTMLDivElement>(null);
  const statusMenuRef = useRef<HTMLDivElement>(null);
  const optionsDotsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchQueues();
    fetchTags();
    fetchUsers();
    fetchWhatsapps();
    fetchTickets(true);
  }, []);

  // Cerrar menús al hacer clic afuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (teamMenuRef.current && !teamMenuRef.current.contains(target)) {
        setShowTeamMenu(false);
      }
      if (filterPopoverRef.current && !filterPopoverRef.current.contains(target)) {
        setShowFilterPopover(false);
      }
      if (statusMenuRef.current && !statusMenuRef.current.contains(target)) {
        setShowStatusExtraMenu(false);
      }
      if (optionsDotsRef.current && !optionsDotsRef.current.contains(target)) {
        setShowOptionsDotsMenu(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Formato de hora amigable
  const formatTicketTime = (dateString?: string) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      if (isToday(date)) {
        return format(date, 'HH:mm');
      }
      if (isYesterday(date)) {
        return 'Ayer';
      }
      return format(date, 'dd/MM', { locale: es });
    } catch {
      return '';
    }
  };

  // Filtrado reactivo en el cliente
  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      // 1. Pestaña de estado
      // "los que ya tienen conversación activa con un agente no están en espera"
      if (activeTab === 'open' && (t.status === 'closed' || (t.status !== 'open' && !t.userId && !t.user))) return false;
      if (activeTab === 'pending' && (t.status !== 'pending' || !!t.userId || !!t.user)) return false;
      if (activeTab === 'closed' && t.status !== 'closed') return false;

      // 2. Filtro de Departamentos
      const effQueueIds = selectedQueueIds.length > 0 
        ? selectedQueueIds 
        : (selectedQueueId !== 'all' ? [selectedQueueId] : []);
      if (effQueueIds.length > 0) {
        const tQueueId = t.queueId || t.queue?.id;
        if (!tQueueId || !effQueueIds.includes(tQueueId)) return false;
      }

      // 3. Filtro de Usuario / Responsable
      if (filterUser === 'me') {
        if (!currentUser || t.userId !== currentUser.id) return false;
      } else if (filterUser === 'unassigned') {
        if (t.userId != null) return false;
      } else if (typeof filterUser === 'number') {
        if (t.userId !== filterUser) return false;
      }

      // 4. Solo no leídos
      if (filterUnreadOnly && (!t.unreadMessages || t.unreadMessages <= 0)) {
        return false;
      }

      // 5. Filtro de Etiquetas
      const effTagIds = filterTagIds.length > 0 
        ? filterTagIds 
        : (filterTagId !== 'all' ? [filterTagId] : []);
      if (effTagIds.length > 0) {
        const hasTag = t.tags?.some((tg) => effTagIds.includes(tg.id));
        if (!hasTag) return false;
      }

      // 6. Filtro de Conexión WhatsApp
      const effWhatsappIds = filterWhatsappIds.length > 0 
        ? filterWhatsappIds 
        : (filterWhatsappId !== 'all' ? [filterWhatsappId] : []);
      if (effWhatsappIds.length > 0) {
        if (!t.whatsappId || !effWhatsappIds.includes(t.whatsappId)) return false;
      }

      // 7. Filtro por rango de fechas
      if (filterDateRange?.start) {
        try {
          const tDate = new Date(t.updatedAt || t.createdAt);
          const start = startOfDay(parseISO(filterDateRange.start));
          const end = filterDateRange.end ? endOfDay(parseISO(filterDateRange.end)) : endOfDay(start);
          if (!isWithinInterval(tDate, { start, end })) return false;
        } catch {
          // ignore date parse error
        }
      }

      // 8. Búsqueda de texto
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = t.contact?.name?.toLowerCase().includes(q);
        const numberMatch = t.contact?.number?.toLowerCase().includes(q);
        const msgMatch = t.lastMessage?.toLowerCase().includes(q);
        if (!nameMatch && !numberMatch && !msgMatch) return false;
      }

      return true;
    });
  }, [
    tickets, 
    activeTab, 
    selectedQueueId,
    selectedQueueIds,
    filterUser, 
    filterUnreadOnly, 
    filterTagId,
    filterTagIds,
    filterWhatsappId,
    filterWhatsappIds,
    filterDateRange, 
    searchQuery, 
    currentUser
  ]);

  // Contadores para las pestañas
  const openCount = useMemo(
    () => tickets.filter((t) => t.status !== 'closed' && (t.status === 'open' || !!t.userId || !!t.user)).length,
    [tickets]
  );
  const pendingCount = useMemo(
    () => tickets.filter((t) => t.status === 'pending' && !t.userId && !t.user).length,
    [tickets]
  );
  const closedCount = useMemo(() => tickets.filter((t) => t.status === 'closed').length, [tickets]);
  const allCount = tickets.length;

  // Opciones para SearchableMultiSelect
  const tagOptions: MultiSelectOption[] = useMemo(
    () => tags.map((tg) => ({ id: tg.id, name: tg.name, color: tg.color })),
    [tags]
  );

  const queueOptions: MultiSelectOption[] = useMemo(
    () => queues.map((q) => ({ id: q.id, name: q.name, color: q.color })),
    [queues]
  );

  const whatsappOptions: MultiSelectOption[] = useMemo(
    () =>
      whatsapps.map((w) => ({
        id: w.id,
        name: w.name,
        subtitle: w.number ? `+${w.number}` : undefined,
        color: w.status === 'CONNECTED' ? '#22c55e' : '#f59e0b',
      })),
    [whatsapps]
  );

  // Texto dinámico para el botón de [Equipo ▾]
  const teamButtonLabel = useMemo(() => {
    if (filterUser === 'all') return 'Equipo';
    if (filterUser === 'me') return 'Míos';
    if (filterUser === 'unassigned') return 'Sin usuario';
    const u = users.find((usr) => usr.id === filterUser);
    return u ? u.name : 'Equipo';
  }, [filterUser, users]);

  // Comprobar si hay filtros activos en el popover '≡'
  const isAnyAdvancedFilterActive = useMemo(() => {
    return (
      selectedQueueIds.length > 0 ||
      selectedQueueId !== 'all' ||
      filterTagIds.length > 0 ||
      filterTagId !== 'all' ||
      filterWhatsappIds.length > 0 ||
      filterWhatsappId !== 'all' ||
      filterDateRange !== null
    );
  }, [selectedQueueIds, selectedQueueId, filterTagIds, filterTagId, filterWhatsappIds, filterWhatsappId, filterDateRange]);

  // Manejador del rango de fechas del calendario
  const handleCalendarDayClick = (day: Date) => {
    if (!tempRangeStart || (tempRangeStart && tempRangeEnd)) {
      setTempRangeStart(day);
      setTempRangeEnd(null);
    } else if (tempRangeStart && !tempRangeEnd) {
      if (day < tempRangeStart) {
        setTempRangeStart(day);
        setTempRangeEnd(null);
      } else {
        setTempRangeEnd(day);
      }
    }
  };

  const applyDateRange = () => {
    if (tempRangeStart) {
      const startStr = format(tempRangeStart, 'yyyy-MM-dd');
      const endStr = tempRangeEnd ? format(tempRangeEnd, 'yyyy-MM-dd') : startStr;
      setFilterDateRange({ start: startStr, end: endStr });
    } else {
      setFilterDateRange(null);
    }
    setShowCalendarModal(false);
  };

  const connectedWhatsapps = useMemo(
    () => whatsapps.filter((whatsapp) => whatsapp.status === 'CONNECTED'),
    [whatsapps]
  );

  const openNewConversation = () => {
    setNewConversationPhone('');
    setNewConversationName('');
    setMatchingTickets([]);
    setNewConversationError(null);
    setNewConversationWhatsappId(connectedWhatsapps.find((whatsapp) => whatsapp.isDefault)?.id || connectedWhatsapps[0]?.id || null);
    setShowNewConversationModal(true);
  };

  const checkExistingConversation = async (): Promise<Ticket[]> => {
    const phone = newConversationPhone.replace(/\D/g, '');
    if (phone.length < 8) {
      setNewConversationError('Ingresá un número válido, con código de país si corresponde.');
      return [];
    }
    setIsCheckingNumber(true);
    setNewConversationError(null);
    try {
      const matches = await findTicketsByPhone(phone);
      setMatchingTickets(matches);
      return matches;
    } catch (error) {
      console.error('Error checking existing conversation:', error);
      setNewConversationError('No se pudo verificar si ya existe una conversación. Intentá nuevamente.');
      return [];
    } finally {
      setIsCheckingNumber(false);
    }
  };

  const startNewConversation = async () => {
    const phone = newConversationPhone.replace(/\D/g, '');
    if (phone.length < 8) {
      setNewConversationError('Ingresá un número válido, con código de país si corresponde.');
      return;
    }
    if (!newConversationWhatsappId) {
      setNewConversationError('Elegí una línea de WhatsApp conectada.');
      return;
    }
    const matches = await checkExistingConversation();
    if (matches.length > 0) return;

    setIsCreatingConversation(true);
    try {
      const ticket = await createTicket({
        name: newConversationName,
        phone,
        whatsappId: newConversationWhatsappId,
        userId: currentUser?.id,
      });
      setShowNewConversationModal(false);
      await selectTicket(ticket);
    } catch (error: any) {
      console.error('Error creating conversation:', error);
      setNewConversationError(error?.response?.data?.error || error?.response?.data?.message || error?.message || 'No se pudo iniciar la conversación.');
    } finally {
      setIsCreatingConversation(false);
    }
  };

  return (
    <div className="w-full h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col flex-shrink-0 select-none">
      {/* ========================================================================= */}
      {/* 1. CABECERA SUPERIOR (Exacta a Whaticket: media_1789343494890.png)          */}
      {/* ========================================================================= */}
      <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex flex-col gap-2.5">
        
        {/* Fila 1: [Equipo ▾] | [Interno] | [No leídos] | ⋮ */}
        <div className="flex items-center justify-between gap-1.5">
          
          {/* Botón [Equipo ▾] con Dropdown (media_1789343511004.png) */}
          <div className="relative" ref={teamMenuRef}>
            <button
              onClick={() => setShowTeamMenu(!showTeamMenu)}
              className="bg-blue-50/90 hover:bg-blue-100/90 dark:bg-blue-950/50 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 font-semibold px-2.5 py-1.5 rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span className="truncate max-w-[85px]">{teamButtonLabel}</span>
              <ChevronDown className="w-3.5 h-3.5 opacity-70" />
            </button>

            {/* Menú desplegable Responsable / Equipo */}
            {showTeamMenu && (
              <div className="absolute left-0 top-9 w-48 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-700 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                <button
                  onClick={() => {
                    setFilterUser('me');
                    setShowTeamMenu(false);
                  }}
                  className={`w-full px-3.5 py-2 text-xs font-medium text-left flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 ${
                    filterUser === 'me' ? 'text-blue-600 font-bold bg-blue-50/50 dark:bg-blue-950/30' : 'text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <span>Míos</span>
                  {filterUser === 'me' && <Check className="w-3.5 h-3.5 text-blue-600" />}
                </button>

                <button
                  onClick={() => {
                    setFilterUser('all');
                    setShowTeamMenu(false);
                  }}
                  className={`w-full px-3.5 py-2 text-xs font-medium text-left flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 ${
                    filterUser === 'all' ? 'text-blue-600 font-bold bg-blue-50/50 dark:bg-blue-950/30' : 'text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <span>Equipo</span>
                  {filterUser === 'all' && <Check className="w-3.5 h-3.5 text-blue-600" />}
                </button>

                <div className="border-t border-slate-100 dark:border-slate-700 my-1 px-3.5 pt-1.5 pb-0.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Responsable
                  </span>
                </div>

                <button
                  onClick={() => {
                    setFilterUser('unassigned');
                    setShowTeamMenu(false);
                  }}
                  className={`w-full px-3.5 py-1.5 text-xs text-left flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 ${
                    filterUser === 'unassigned' ? 'text-blue-600 font-bold bg-blue-50/50' : 'text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <span>Sin usuario</span>
                  {filterUser === 'unassigned' && <Check className="w-3.5 h-3.5 text-blue-600" />}
                </button>

                {users.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => {
                      setFilterUser(u.id);
                      setShowTeamMenu(false);
                    }}
                    className={`w-full px-3.5 py-1.5 text-xs text-left flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 ${
                      filterUser === u.id ? 'text-blue-600 font-bold bg-blue-50/50' : 'text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <span className="truncate">{u.name}</span>
                    {filterUser === u.id && <Check className="w-3.5 h-3.5 text-blue-600" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Botón [Interno] */}
          <button
            onClick={() => setIsInternalOnly(!isInternalOnly)}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
              isInternalOnly
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                : 'bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Interno</span>
          </button>

          {/* Botón [No leídos] */}
          <button
            onClick={() => setFilterUnreadOnly(!filterUnreadOnly)}
            className={`px-2.5 py-1.5 rounded-full text-xs font-medium border flex items-center gap-1.5 transition-all cursor-pointer ${
              filterUnreadOnly
                ? 'border-blue-600 bg-blue-50 text-blue-600 font-bold shadow-xs dark:bg-blue-950/50 dark:text-blue-400 dark:border-blue-500'
                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>No leídos</span>
          </button>

          {/* Botón ⋮ Opciones */}
          <div className="relative" ref={optionsDotsRef}>
            <button
              onClick={() => setShowOptionsDotsMenu(!showOptionsDotsMenu)}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {showOptionsDotsMenu && (
              <div className="absolute right-0 top-8 w-44 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-100 dark:border-slate-700 py-1 z-50 animate-in fade-in zoom-in-95 duration-150">
                <button
                  onClick={() => {
                    fetchTickets(true);
                    setShowOptionsDotsMenu(false);
                  }}
                  className="w-full px-3 py-1.5 text-xs text-left text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                  <span>Actualizar lista</span>
                </button>
                <button
                  onClick={() => {
                    resetAllFilters();
                    setShowOptionsDotsMenu(false);
                  }}
                  className="w-full px-3 py-1.5 text-xs text-left text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
                >
                  <X className="w-3.5 h-3.5 text-slate-400" />
                  <span>Limpiar filtros</span>
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={openNewConversation}
            title="Nueva conversación"
            className="w-7 h-7 rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-xs flex items-center justify-center transition-all active:scale-95 cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
          </button>

        </div>

        {/* Fila 2: Input de Búsqueda (Nombre, número o email) */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Nombre, número o email"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-xs bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 rounded-full border-none focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Fila 3: Tabs de Estado + Botón de Filtros ≡ */}
        <div className="flex items-center justify-between gap-1 relative">
          
          {/* Pestañas de estado estilo pastilla */}
          <div className="flex items-center gap-1 flex-1 relative overflow-visible">
            {/* En atención */}
            <button
              onClick={() => setActiveTab('open')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-full flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'open'
                  ? 'bg-slate-200/90 dark:bg-slate-750 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <span>En atención</span>
              {openCount > 0 && (
                <span className="bg-emerald-700 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                  {openCount > 99 ? '99+' : openCount}
                </span>
              )}
            </button>

            {/* En espera */}
            <button
              onClick={() => setActiveTab('pending')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-full flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'pending'
                  ? 'bg-slate-200/90 dark:bg-slate-750 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <span>En espera</span>
              {pendingCount > 0 && (
                <span className="bg-amber-600 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                  {pendingCount}
                </span>
              )}
            </button>

            {/* Aplazados */}
            <button
              onClick={() => setActiveTab('delayed' as any)}
              className={`px-2 py-1 text-xs font-medium rounded-full transition-all cursor-pointer whitespace-nowrap ${
                (activeTab as string) === 'delayed'
                  ? 'bg-slate-200/90 dark:bg-slate-750 text-slate-900 dark:text-slate-100'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              Aplazados
            </button>

            {/* +2 ▾ Dropdown (Resueltos, Todos) */}
            <div className="relative" ref={statusMenuRef}>
              <button
                type="button"
                onClick={() => setShowStatusExtraMenu((prev) => !prev)}
                className={`px-2.5 py-1 text-xs font-medium rounded-full flex items-center gap-1 transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'all' || activeTab === 'closed'
                    ? 'bg-slate-200/90 dark:bg-slate-750 text-slate-900 dark:text-slate-100 font-semibold shadow-xs ring-1 ring-slate-300 dark:ring-slate-600'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <span>+2</span>
                <ChevronDown className={`w-3 h-3 opacity-60 transition-transform ${showStatusExtraMenu ? 'rotate-180' : ''}`} />
              </button>

              {showStatusExtraMenu && (
                <div className="absolute right-0 top-full mt-1.5 w-36 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('closed');
                      setShowStatusExtraMenu(false);
                    }}
                    className={`w-full px-4 py-2 text-xs font-medium text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center justify-between transition-colors cursor-pointer ${
                      activeTab === 'closed'
                        ? 'text-blue-600 font-bold bg-blue-50/50 dark:bg-blue-950/30'
                        : 'text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Resueltos</span>
                      {closedCount > 0 && (
                        <span className="text-[10px] text-slate-400 font-normal">
                          ({closedCount})
                        </span>
                      )}
                    </div>
                    {activeTab === 'closed' && <Check className="w-3.5 h-3.5 text-blue-600" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('all');
                      setShowStatusExtraMenu(false);
                    }}
                    className={`w-full px-4 py-2 text-xs font-medium text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center justify-between transition-colors cursor-pointer ${
                      activeTab === 'all'
                        ? 'text-blue-600 font-bold bg-blue-50/50 dark:bg-blue-950/30'
                        : 'text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Todos</span>
                      {allCount > 0 && (
                        <span className="text-[10px] text-slate-400 font-normal">
                          ({allCount})
                        </span>
                      )}
                    </div>
                    {activeTab === 'all' && <Check className="w-3.5 h-3.5 text-blue-600" />}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Botón Filtros ≡ (media_1789343525545.png) */}
          <div className="relative flex-shrink-0" ref={filterPopoverRef}>
            <button
              onClick={() => setShowFilterPopover(!showFilterPopover)}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer relative ${
                isAnyAdvancedFilterActive
                  ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              title="Filtrar por Departamentos, Etiquetas, Conexiones o Período"
            >
              <SlidersHorizontal className="w-4 h-4" />
              {/* Indicador azul si hay filtro activo */}
              {isAnyAdvancedFilterActive && (
                <span className="w-2 h-2 bg-blue-600 rounded-full absolute -top-0.5 -right-0.5" />
              )}
            </button>

            {/* Popover de Filtros Avanzados (media_1789343525545.png) */}
            {showFilterPopover && (
              <div className="absolute right-0 top-8 w-80 bg-white dark:bg-slate-850 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 p-4 z-50 flex flex-col gap-3.5 animate-in fade-in zoom-in-95 duration-150">
                
                {/* 1. Etiquetas ▾ (Multi-select Searchable) */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Etiquetas
                  </label>
                  <SearchableMultiSelect
                    label="Etiquetas"
                    placeholder="Todas las etiquetas"
                    searchPlaceholder="Buscar etiqueta..."
                    options={tagOptions}
                    selectedIds={filterTagIds}
                    onChange={setFilterTagIds}
                  />
                </div>

                {/* 2. Departamentos ▾ (Multi-select Searchable) */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Departamentos
                  </label>
                  <SearchableMultiSelect
                    label="Departamentos"
                    placeholder="Todos los departamentos"
                    searchPlaceholder="Buscar departamento..."
                    options={queueOptions}
                    selectedIds={selectedQueueIds}
                    onChange={setSelectedQueueIds}
                  />
                </div>

                {/* 3. Conexiones ▾ (Multi-select Searchable) */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Conexiones
                  </label>
                  <SearchableMultiSelect
                    label="Conexiones"
                    placeholder="Todas las conexiones"
                    searchPlaceholder="Buscar conexión..."
                    options={whatsappOptions}
                    selectedIds={filterWhatsappIds}
                    onChange={setFilterWhatsappIds}
                  />
                </div>

                {/* 4. Período (media_1789343525545.png y media_1789343536122.png) */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Período
                  </label>
                  <div
                    onClick={() => setShowCalendarModal(true)}
                    className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl px-3 py-2 text-xs text-slate-700 dark:text-slate-200 cursor-pointer flex items-center justify-between hover:border-blue-500 transition-colors"
                  >
                    <span className="font-mono text-[11px]">
                      {filterDateRange?.start
                        ? `${format(parseISO(filterDateRange.start), 'dd/MM/yyyy')} – ${
                            filterDateRange.end
                              ? format(parseISO(filterDateRange.end), 'dd/MM/yyyy')
                              : format(parseISO(filterDateRange.start), 'dd/MM/yyyy')
                          }`
                        : 'DD/MM/YYYY – DD/MM/YYYY'}
                    </span>
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                  <span className="text-[10px] text-slate-400 leading-tight mt-0.5">
                    Considera la última actividad del chat.
                  </span>
                </div>

                {/* Limpiar Filtros */}
                {isAnyAdvancedFilterActive && (
                  <button
                    onClick={() => {
                      resetAllFilters();
                      setShowFilterPopover(false);
                    }}
                    className="w-full mt-1 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Limpiar filtros</span>
                  </button>
                )}

              </div>
            )}
          </div>

        </div>

      </div>

      {/* ========================================================================= */}
      {/* 2. LISTA DE CONVERSACIONES (Items con estilo exacto de Whaticket)          */}
      {/* ========================================================================= */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
        {isLoadingTickets && tickets.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            Cargando conversaciones...
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
            <span>{ticketsError || 'No hay conversaciones en esta sección.'}</span>
            {ticketsError && (
              <button
                type="button"
                onClick={() => fetchTickets(tickets.length === 0)}
                disabled={isLoadingTickets}
                className="text-blue-600 dark:text-blue-400 underline font-semibold text-xs mt-1 disabled:opacity-50"
              >
                Reintentar carga
              </button>
            )}
            {isAnyAdvancedFilterActive && (
              <button
                onClick={resetAllFilters}
                className="text-blue-600 dark:text-blue-400 underline font-semibold text-xs mt-1"
              >
                Limpiar filtros activos
              </button>
            )}
          </div>
        ) : (
          <>
          {filteredTickets.map((ticket) => {
            const isSelected = activeTicket?.id === ticket.id;
            const contact = ticket.contact;
            const queue = ticket.queue || queues.find((q) => q.id === ticket.queueId);
            const isMenuOpen = queueMenuTicketId === ticket.id;
            const assignedUser = ticket.user || users.find((u) => u.id === ticket.userId);
            const ticketWhatsapp = ticket.whatsapp || whatsapps.find((w) => w.id === ticket.whatsappId);

            return (
              <div
                key={ticket.id}
                onClick={() => selectTicket(ticket)}
                className={`p-3 cursor-pointer transition-colors relative flex items-start gap-2.5 group ${
                  isSelected
                    ? 'bg-[#f0f7ff] dark:bg-blue-950/40 border-l-[3.5px] border-[#0c797d]'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                {/* Avatar del Contacto con Iniciales o Foto */}
                <div className="relative flex-shrink-0">
                  <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-slate-700 dark:text-slate-200 text-xs overflow-hidden">
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
                  {/* Mini foto / avatar del agente asignado */}
                  {assignedUser ? (
                    <div
                      className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full ring-2 ring-blue-500 bg-blue-600 text-white flex items-center justify-center text-[9px] font-bold overflow-hidden shadow-xs"
                      title={`Agente: ${assignedUser.name}`}
                    >
                      {(assignedUser as any).profilePicUrl ? (
                        <img
                          src={(assignedUser as any).profilePicUrl}
                          alt={assignedUser.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        assignedUser.name.slice(0, 1).toUpperCase()
                      )}
                    </div>
                  ) : (
                    <span
                      className="w-3 h-3 bg-amber-500 rounded-full border-2 border-white dark:border-slate-900 absolute -bottom-0.5 -right-0.5"
                      title="En espera de asignación"
                    />
                  )}
                </div>

                {/* Contenido Central: Nombre, Fecha, Badges, Mensaje */}
                <div className="flex-1 min-w-0">
                  {/* Fila Nombre y Hora */}
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-bold text-xs text-slate-900 dark:text-slate-100 truncate">
                      {contact?.name || formatPhoneNumber(contact?.number) || 'Sin Nombre'}
                    </span>
                    <span className="text-[10px] text-slate-400 whitespace-nowrap ml-1 font-mono">
                      {formatTicketTime(ticket.updatedAt)}
                    </span>
                  </div>

                  {/* Fila de Badges: Etiquetas, Departamentos y Línea de WhatsApp */}
                  <div className="flex items-center flex-wrap gap-1 mb-1 relative">
                    {/* Badge de Etiqueta (si tiene) */}
                    {ticket.tags && ticket.tags.length > 0 && (
                      ticket.tags.map((tg) => (
                        <span
                          key={tg.id}
                          className="px-2 py-0.2 rounded-full text-[9px] font-bold text-white shadow-2xs"
                          style={{ backgroundColor: tg.color || '#35baf6' }}
                        >
                          {tg.name}
                        </span>
                      ))
                    )}

                    {/* Badge de Departamento (Clickable para cambio rápido) */}
                    {queue ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setQueueMenuTicketId(isMenuOpen ? null : ticket.id);
                        }}
                        className="inline-flex items-center gap-1 px-2 py-0.2 rounded-full text-[9px] font-bold text-white transition-opacity hover:opacity-90 shadow-2xs cursor-pointer"
                        style={{ backgroundColor: queue.color || '#64a420' }}
                        title="Clic para cambiar de departamento"
                      >
                        <span className="truncate max-w-[110px]">{queue.name}</span>
                        <ChevronDown className="w-2.5 h-2.5 opacity-80" />
                      </button>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setQueueMenuTicketId(isMenuOpen ? null : ticket.id);
                        }}
                        className="inline-flex items-center gap-1 px-2 py-0.2 rounded-full text-[9px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
                      >
                        Sin depto
                        <ChevronDown className="w-2.5 h-2.5 opacity-80" />
                      </button>
                    )}

                    {/* Badge de Línea de WhatsApp vinculada */}
                    {ticketWhatsapp && (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.2 rounded-full text-[9px] font-bold text-white shadow-2xs bg-emerald-600"
                        title={`Línea: ${ticketWhatsapp.name}`}
                      >
                        <span className="truncate max-w-[110px]">{ticketWhatsapp.name}</span>
                      </span>
                    )}

                    {/* Menú flotante de cambio rápido de departamento */}
                    {isMenuOpen && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="absolute left-0 top-5 w-48 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 p-1.5 z-50 flex flex-col gap-0.5"
                      >
                        <span className="text-[9px] uppercase font-bold text-slate-400 px-2 py-0.5">
                          Cambiar departamento:
                        </span>
                        {queues.map((q) => (
                          <button
                            key={q.id}
                            onClick={async () => {
                              await updateTicketQueue(ticket.id, q.id);
                              setQueueMenuTicketId(null);
                            }}
                            className="flex items-center gap-2 px-2 py-1.5 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-left"
                          >
                            <span
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ backgroundColor: q.color || '#3b82f6' }}
                            />
                            <span className="truncate">{q.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Fila Inferior: Extracto de Mensaje + Iconos Whaticket (media_1789343494890.png) */}
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[170px] leading-tight">
                      {ticket.lastMessage || 'Sin mensajes recientes'}
                    </p>

                    {/* Fila de Iconos de Acción Rápidos (ExternalLink, WhatsApp, Eye, Unread Badge, Chevron) */}
                    <div className="flex items-center gap-1.5 text-slate-400 flex-shrink-0">
                      <ExternalLink className="w-3 h-3 hover:text-slate-600 dark:hover:text-slate-200 transition-colors" />
                      <span className="w-3 h-3 text-emerald-500">
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
                          <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2z" />
                        </svg>
                      </span>
                      <Eye className="w-3 h-3 hover:text-slate-600 dark:hover:text-slate-200 transition-colors" />

                      {/* Contador de no leídos */}
                      {ticket.unreadMessages > 0 && (
                        <span className="min-w-4 h-4 px-1 bg-emerald-600 text-white rounded-full text-[9px] font-bold flex items-center justify-center shadow-xs">
                          {ticket.unreadMessages}
                        </span>
                      )}

                      <ChevronDown className="w-3 h-3 hover:text-slate-600 dark:hover:text-slate-200 transition-colors" />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {(hasMoreTickets || ticketsError) && (
            <div className="p-3 flex justify-center border-t border-slate-100 dark:border-slate-800/60">
              <button
                type="button"
                onClick={() => fetchTickets(false)}
                disabled={isLoadingTickets}
                className="rounded-lg bg-white dark:bg-slate-800 px-4 py-2 text-xs font-semibold text-blue-600 dark:text-blue-400 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoadingTickets ? 'Cargando conversaciones...' : ticketsError ? 'Reintentar carga' : 'Cargar más conversaciones'}
              </button>
            </div>
          )}
          </>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 3. MODAL DE SELECTOR DE RANGO DE FECHAS (media_1789343536122.png)           */}
      {/* ========================================================================= */}
      {showCalendarModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-2xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-150">
            
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 mb-4">
              <div>
                <h4 className="font-bold text-sm text-slate-800 dark:text-slate-100">
                  Seleccionar Período
                </h4>
                <p className="text-xs text-slate-400">
                  Filtra conversaciones por la fecha de última actividad.
                </p>
              </div>
              <button
                onClick={() => setShowCalendarModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Navegación de Meses */}
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => setCalendarMonth((m) => subMonths(m, 1))}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 capitalize">
                {format(calendarMonth, 'MMMM yyyy', { locale: es })}
              </span>
              <button
                onClick={() => setCalendarMonth((m) => addMonths(m, 1))}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Grid de Días de la Semana */}
            <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-slate-400 mb-2">
              <span>L</span>
              <span>M</span>
              <span>M</span>
              <span>J</span>
              <span>V</span>
              <span>S</span>
              <span>D</span>
            </div>

            {/* Días del Mes */}
            <div className="grid grid-cols-7 gap-1 text-xs">
              {eachDayOfInterval({
                start: startOfMonth(calendarMonth),
                end: endOfMonth(calendarMonth),
              }).map((day, idx) => {
                const isSelectedStart = tempRangeStart && isSameDay(day, tempRangeStart);
                const isSelectedEnd = tempRangeEnd && isSameDay(day, tempRangeEnd);
                const isInRange = tempRangeStart && tempRangeEnd && day > tempRangeStart && day < tempRangeEnd;
                const isCurrent = isToday(day);

                return (
                  <button
                    key={idx}
                    onClick={() => handleCalendarDayClick(day)}
                    className={`h-8 rounded-full flex items-center justify-center font-medium transition-colors cursor-pointer ${
                      isSelectedStart || isSelectedEnd
                        ? 'bg-blue-600 text-white font-bold'
                        : isInRange
                        ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400'
                        : isCurrent
                        ? 'border border-blue-500 text-blue-600'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {format(day, 'd')}
                  </button>
                );
              })}
            </div>

            {/* Footer con Acciones */}
            <div className="flex items-center justify-between pt-5 border-t border-slate-100 dark:border-slate-800 mt-5">
              <button
                type="button"
                onClick={() => {
                  setTempRangeStart(null);
                  setTempRangeEnd(null);
                  setFilterDateRange(null);
                  setShowCalendarModal(false);
                }}
                className="text-xs text-rose-600 hover:underline font-medium cursor-pointer"
              >
                Quitar filtro de fecha
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowCalendarModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={applyDateRange}
                  className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-full transition-all shadow-md shadow-blue-500/25 cursor-pointer"
                >
                  Aplicar Período
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {showNewConversationModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="new-conversation-title" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 id="new-conversation-title" className="font-bold text-slate-900 dark:text-slate-100">Nueva conversación</h3>
                <p className="mt-1 text-xs text-slate-500">Primero verificamos si el número ya tiene un chat abierto.</p>
              </div>
              <button type="button" onClick={() => setShowNewConversationModal(false)} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Cerrar"><X className="h-5 w-5" /></button>
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Número de destino
                <div className="mt-1 flex gap-2">
                  <input value={newConversationPhone} onChange={(event) => { setNewConversationPhone(event.target.value); setMatchingTickets([]); }} onBlur={() => { void checkExistingConversation(); }} placeholder="Ej. 5491121635943"
                    className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800" />
                  <button type="button" onClick={() => { void checkExistingConversation(); }} disabled={isCheckingNumber} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">{isCheckingNumber ? 'Buscando...' : 'Verificar'}</button>
                </div>
              </label>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Nombre <span className="font-normal text-slate-400">(opcional)</span>
                <input value={newConversationName} onChange={(event) => setNewConversationName(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800" />
              </label>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Enviar desde
                <select value={newConversationWhatsappId || ''} onChange={(event) => setNewConversationWhatsappId(Number(event.target.value) || null)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800">
                  <option value="">Elegí una línea conectada</option>
                  {connectedWhatsapps.map((whatsapp) => <option key={whatsapp.id} value={whatsapp.id}>{whatsapp.name}{whatsapp.number ? ` · +${whatsapp.number}` : ''}</option>)}
                </select>
              </label>
              {connectedWhatsapps.length === 0 && <p className="flex items-center gap-1.5 rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200"><AlertTriangle className="h-4 w-4" /> No hay líneas de WhatsApp conectadas.</p>}
              {newConversationError && <p role="alert" className="rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">{newConversationError}</p>}
              {matchingTickets.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-900 dark:text-amber-200"><AlertTriangle className="h-4 w-4" /> Ya hay conversación para este número</p>
                  <div className="mt-2 space-y-1.5">
                    {matchingTickets.map((ticket) => <button key={ticket.id} type="button" onClick={() => { setShowNewConversationModal(false); void selectTicket(ticket); }} className="flex w-full items-center justify-between rounded-lg bg-white px-2.5 py-2 text-left text-xs text-slate-700 hover:bg-amber-100 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"><span>{ticket.contact?.name || ticket.contact?.number}</span><span className="capitalize text-slate-500">{ticket.status}</span></button>)}
                  </div>
                </div>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setShowNewConversationModal(false)} disabled={isCreatingConversation} className="rounded-xl px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800">Cancelar</button>
              <button type="button" onClick={() => { void startNewConversation(); }} disabled={isCreatingConversation || matchingTickets.length > 0 || connectedWhatsapps.length === 0} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"><Smartphone className="h-4 w-4" />{isCreatingConversation ? 'Iniciando...' : 'Iniciar conversación'}</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
