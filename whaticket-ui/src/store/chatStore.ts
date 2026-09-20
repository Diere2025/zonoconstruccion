import { create } from 'zustand';
import { Ticket, Message, Queue, Tag, QuickMessage, User } from '../types';
import { api, BACKEND_URL, getMediaUrl } from '../services/api';
import { joinTicketRoom, leaveTicketRoom, getSocket } from '../services/socket';
import { createMediaSendPlan } from '../utils/mediaSendPlan';

// Only the most recent request may update the currently visible list/chat.
let ticketsRequestVersion = 0;
let messagesRequestVersion = 0;
let selectionVersion = 0;

interface ChatState {
  tickets: Ticket[];
  activeTicket: Ticket | null;
  activeTab: 'open' | 'pending' | 'closed' | 'all';
  selectedQueueId: number | 'all';
  searchQuery: string;
  hasMoreTickets: boolean;
  pageNumber: number;

  messages: Message[];
  hasMoreMessages: boolean;
  messagesPage: number;

  queues: Queue[];
  tags: Tag[];
  quickMessages: QuickMessage[];
  users: User[];
  whatsapps: any[];

  // Filter States (matching Whaticket)
  filterUser: 'all' | 'me' | 'unassigned' | number;
  filterUnreadOnly: boolean;
  filterTagId: number | 'all';
  filterTagIds: number[];
  filterWhatsappId: number | 'all';
  filterWhatsappIds: number[];
  selectedQueueIds: number[];
  filterDateRange: { start?: string; end?: string } | null;
  isInternalOnly: boolean;

  isLoadingTickets: boolean;
  ticketsError: string | null;
  isLoadingMessages: boolean;
  messagesError: string | null;
  isSendingMessage: boolean;

  // Actions
  setActiveTab: (tab: 'open' | 'pending' | 'closed' | 'all') => void;
  setSelectedQueueId: (queueId: number | 'all') => void;
  setSelectedQueueIds: (queueIds: number[]) => void;
  setFilterUser: (user: 'all' | 'me' | 'unassigned' | number) => void;
  setFilterUnreadOnly: (unreadOnly: boolean) => void;
  setFilterTagId: (tagId: number | 'all') => void;
  setFilterTagIds: (tagIds: number[]) => void;
  setFilterWhatsappId: (whatsappId: number | 'all') => void;
  setFilterWhatsappIds: (whatsappIds: number[]) => void;
  setFilterDateRange: (range: { start?: string; end?: string } | null) => void;
  setIsInternalOnly: (internalOnly: boolean) => void;
  resetAllFilters: () => void;
  setSearchQuery: (query: string) => void;
  selectTicket: (ticket: Ticket | null) => Promise<void>;
  loadTicketByIdentifier: (identifier: string | number) => Promise<void>;
  
  fetchTickets: (reset?: boolean) => Promise<void>;
  fetchTicketsSilent: () => Promise<void>;
  fetchMessages: (ticketId: number, reset?: boolean) => Promise<void>;
  fetchQueues: () => Promise<void>;
  fetchQuickMessages: () => Promise<void>;
  fetchTags: () => Promise<void>;
  fetchUsers: () => Promise<void>;
  fetchWhatsapps: () => Promise<void>;

  sendMessage: (data: {
    body: string;
    media?: File | null;
    medias?: File[];
    mediaUrl?: string | null;
    isPrivate?: boolean;
    quotedMsg?: Message | null;
  }) => Promise<void>;

  updateTicketStatus: (ticketId: number, status: 'open' | 'pending' | 'closed') => Promise<void>;
  updateTicketQueue: (ticketId: number, queueId: number | null) => Promise<void>;
  updateTicketUser: (ticketId: number, userId: number | null) => Promise<void>;
  updateTicketWhatsapp: (ticketId: number, whatsappId: number) => Promise<void>;
  findTicketsByPhone: (phone: string) => Promise<Ticket[]>;
  createTicket: (data: { name?: string; phone: string; whatsappId: number; userId?: number | null }) => Promise<Ticket>;

  // Socket handlers
  handleSocketTicket: (data: { action: string; ticket?: Ticket; ticketId?: number }) => void;
  handleSocketMessage: (data: { action: string; message: Message; ticket?: Ticket; contact?: any }) => void;
  handleSocketWhatsapp: (data: { action?: string; whatsapp?: any; session?: any }) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  tickets: [],
  activeTicket: null,
  activeTab: 'open',
  selectedQueueId: 'all',
  searchQuery: '',
  hasMoreTickets: false,
  pageNumber: 1,

  messages: [],
  hasMoreMessages: false,
  messagesPage: 1,

  queues: [],
  tags: [],
  quickMessages: [],
  users: [],
  whatsapps: [],

  // Filter States
  filterUser: 'all',
  filterUnreadOnly: false,
  filterTagId: 'all',
  filterTagIds: [],
  filterWhatsappId: 'all',
  filterWhatsappIds: [],
  selectedQueueIds: [],
  filterDateRange: null,
  isInternalOnly: false,

  isLoadingTickets: false,
  ticketsError: null,
  isLoadingMessages: false,
  messagesError: null,
  isSendingMessage: false,

  setActiveTab: (tab) => {
    set({ activeTab: tab, pageNumber: 1 });
    get().fetchTickets(true);
  },

  setSelectedQueueId: (queueId) => {
    set({ 
      selectedQueueId: queueId, 
      selectedQueueIds: queueId === 'all' ? [] : [queueId],
      pageNumber: 1 
    });
    get().fetchTickets(true);
  },

  setSelectedQueueIds: (queueIds) => {
    set({ 
      selectedQueueIds: queueIds,
      selectedQueueId: queueIds.length === 1 ? queueIds[0] : (queueIds.length === 0 ? 'all' : queueIds[0]),
      pageNumber: 1 
    });
    get().fetchTickets(true);
  },

  setFilterUser: (user) => {
    set({ filterUser: user, pageNumber: 1 });
    get().fetchTickets(true);
  },

  setFilterUnreadOnly: (unreadOnly) => {
    set({ filterUnreadOnly: unreadOnly, pageNumber: 1 });
    get().fetchTickets(true);
  },

  setFilterTagId: (tagId) => {
    set({ 
      filterTagId: tagId, 
      filterTagIds: tagId === 'all' ? [] : [tagId],
      pageNumber: 1 
    });
    get().fetchTickets(true);
  },

  setFilterTagIds: (tagIds) => {
    set({ 
      filterTagIds: tagIds,
      filterTagId: tagIds.length === 1 ? tagIds[0] : (tagIds.length === 0 ? 'all' : tagIds[0]),
      pageNumber: 1 
    });
    get().fetchTickets(true);
  },

  setFilterWhatsappId: (whatsappId) => {
    set({ 
      filterWhatsappId: whatsappId, 
      filterWhatsappIds: whatsappId === 'all' ? [] : [whatsappId],
      pageNumber: 1 
    });
    get().fetchTickets(true);
  },

  setFilterWhatsappIds: (whatsappIds) => {
    set({ 
      filterWhatsappIds: whatsappIds,
      filterWhatsappId: whatsappIds.length === 1 ? whatsappIds[0] : (whatsappIds.length === 0 ? 'all' : whatsappIds[0]),
      pageNumber: 1 
    });
    get().fetchTickets(true);
  },

  setFilterDateRange: (range) => {
    set({ filterDateRange: range, pageNumber: 1 });
    get().fetchTickets(true);
  },

  setIsInternalOnly: (internalOnly) => {
    set({ isInternalOnly: internalOnly });
  },

  resetAllFilters: () => {
    set({
      selectedQueueId: 'all',
      selectedQueueIds: [],
      filterUser: 'all',
      filterUnreadOnly: false,
      filterTagId: 'all',
      filterTagIds: [],
      filterWhatsappId: 'all',
      filterWhatsappIds: [],
      filterDateRange: null,
      searchQuery: '',
      pageNumber: 1,
    });
    get().fetchTickets(true);
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query, pageNumber: 1 });
    get().fetchTickets(true);
  },

  fetchQueues: async () => {
    try {
      const { data } = await api.get('/queue');
      set({ queues: Array.isArray(data) ? data : [] });
    } catch (err) {
      console.error('Error fetching queues:', err);
    }
  },

  fetchTags: async () => {
    try {
      const { data } = await api.get('/tags');
      set({ tags: Array.isArray(data?.tags) ? data.tags : Array.isArray(data) ? data : [] });
    } catch (err) {
      console.error('Error fetching tags:', err);
    }
  },

  fetchQuickMessages: async () => {
    try {
      const { data } = await api.get('/quick-messages/list');
      set({ quickMessages: Array.isArray(data) ? data : Array.isArray(data?.records) ? data.records : [] });
    } catch (err) {
      console.error('Error fetching quick messages:', err);
    }
  },

  fetchUsers: async () => {
    try {
      const { data } = await api.get('/users');
      set({ users: Array.isArray(data?.users) ? data.users : Array.isArray(data) ? data : [] });
    } catch (err) {
      console.error('Error fetching users:', err);
    }
  },

  fetchWhatsapps: async () => {
    try {
      const { data } = await api.get('/whatsapp');
      set({ whatsapps: Array.isArray(data) ? data : [] });
    } catch (err) {
      console.error('Error fetching whatsapps:', err);
    }
  },

  fetchTickets: async (reset = false) => {
    const { 
      activeTab, 
      selectedQueueId, 
      selectedQueueIds,
      searchQuery, 
      filterUser, 
      filterUnreadOnly, 
      filterTagId,
      filterTagIds,
      filterWhatsappId,
      filterWhatsappIds,
      filterDateRange, 
      pageNumber, 
      isLoadingTickets 
    } = get();
    if (isLoadingTickets && !reset) return;
    const requestVersion = ++ticketsRequestVersion;

    set({
      isLoadingTickets: true,
      ticketsError: null,
      ...(reset ? { tickets: [], hasMoreTickets: false } : {}),
    });
    try {
      const currentPage = reset ? 1 : pageNumber;
      const params: Record<string, any> = {
        pageNumber: currentPage,
        showAll: 'true',
        searchParam: searchQuery,
      };

      if (activeTab !== 'all') {
        params.status = activeTab;
      }

      // Departamentos (Queue IDs)
      const effectiveQueueIds = selectedQueueIds?.length > 0 
        ? selectedQueueIds 
        : (selectedQueueId !== 'all' ? [selectedQueueId] : []);
      if (effectiveQueueIds.length > 0) {
        params.queueIds = JSON.stringify(effectiveQueueIds);
      }

      // Etiquetas (Tags)
      const effectiveTagIds = filterTagIds?.length > 0 
        ? filterTagIds 
        : (filterTagId !== 'all' ? [filterTagId] : []);
      if (effectiveTagIds.length > 0) {
        params.tags = JSON.stringify(effectiveTagIds);
      }

      // Conexiones (Whatsapps)
      const effectiveWhatsappIds = filterWhatsappIds?.length > 0 
        ? filterWhatsappIds 
        : (filterWhatsappId !== 'all' ? [filterWhatsappId] : []);
      if (effectiveWhatsappIds.length > 0) {
        params.whatsappIds = JSON.stringify(effectiveWhatsappIds);
      }

      if (filterUnreadOnly) {
        params.withUnreadMessages = 'true';
      }

      if (typeof filterUser === 'number') {
        params.users = JSON.stringify([filterUser]);
      }

      if (filterDateRange?.start) {
        params.date = filterDateRange.start;
      }

      const { data } = await api.get('/tickets', { params });
      if (requestVersion !== ticketsRequestVersion) return;
      const newTickets: Ticket[] = data.tickets || [];

      set((state) => {
        const combinedTickets = reset ? newTickets : [...state.tickets, ...newTickets];
        const ticketIds = new Set<number>();
        const uniqueTickets = combinedTickets.filter((ticket) => {
          if (ticketIds.has(ticket.id)) return false;
          ticketIds.add(ticket.id);
          return true;
        });

        return {
        tickets: uniqueTickets,
        hasMoreTickets: data.hasMore || false,
        pageNumber: currentPage + 1,
        isLoadingTickets: false,
        ticketsError: null,
      };
      });
    } catch (err) {
      if (requestVersion !== ticketsRequestVersion) return;
      console.error('Error fetching tickets:', err);
      set({
        isLoadingTickets: false,
        ticketsError: 'No se pudieron cargar las conversaciones. Intentá nuevamente.',
      });
    }
  },

  fetchTicketsSilent: async () => {
    const { 
      activeTab, 
      selectedQueueId, 
      selectedQueueIds,
      searchQuery, 
      filterUser, 
      filterUnreadOnly, 
      filterTagId,
      filterTagIds,
      filterWhatsappId,
      filterWhatsappIds,
      filterDateRange,
    } = get();

    try {
      const params: Record<string, any> = {
        pageNumber: 1,
        showAll: 'true',
        searchParam: searchQuery,
      };

      if (activeTab !== 'all') {
        params.status = activeTab;
      }

      const effectiveQueueIds = selectedQueueIds?.length > 0 
        ? selectedQueueIds 
        : (selectedQueueId !== 'all' ? [selectedQueueId] : []);
      if (effectiveQueueIds.length > 0) {
        params.queueIds = JSON.stringify(effectiveQueueIds);
      }

      const effectiveTagIds = filterTagIds?.length > 0 
        ? filterTagIds 
        : (filterTagId !== 'all' ? [filterTagId] : []);
      if (effectiveTagIds.length > 0) {
        params.tags = JSON.stringify(effectiveTagIds);
      }

      const effectiveWhatsappIds = filterWhatsappIds?.length > 0 
        ? filterWhatsappIds 
        : (filterWhatsappId !== 'all' ? [filterWhatsappId] : []);
      if (effectiveWhatsappIds.length > 0) {
        params.whatsappIds = JSON.stringify(effectiveWhatsappIds);
      }

      if (filterUnreadOnly) {
        params.withUnreadMessages = 'true';
      }

      if (typeof filterUser === 'number') {
        params.users = JSON.stringify([filterUser]);
      }

      if (filterDateRange?.start) {
        params.date = filterDateRange.start;
      }

      const { data } = await api.get('/tickets', { params });
      const freshTickets: Ticket[] = data.tickets || [];
      if (!Array.isArray(freshTickets)) return;

      set((state) => {
        const map = new Map<number, Ticket>();
        for (const t of state.tickets) {
          map.set(t.id, t);
        }
        for (const ft of freshTickets) {
          const existing = map.get(ft.id);
          map.set(ft.id, existing ? { ...existing, ...ft } : ft);
        }

        const merged = Array.from(map.values()).sort((a, b) => {
          const timeA = new Date(a.updatedAt || a.createdAt).getTime();
          const timeB = new Date(b.updatedAt || b.createdAt).getTime();
          return timeB - timeA;
        });

        let activeTicket = state.activeTicket;
        if (activeTicket) {
          const freshActive = freshTickets.find((t) => t.id === activeTicket?.id);
          if (freshActive) {
            activeTicket = { ...activeTicket, ...freshActive };
          }
        }

        return {
          tickets: merged,
          activeTicket,
        };
      });
    } catch {
      // Sincronización silenciosa sin alterar UI
    }
  },

  selectTicket: async (ticket) => {
    ++selectionVersion;
    ++messagesRequestVersion;
    const prevTicket = get().activeTicket;
    if (prevTicket?.id) {
      leaveTicketRoom(prevTicket.id);
    }

    set({
      activeTicket: ticket,
      messages: [],
      messagesPage: 1,
      hasMoreMessages: false,
      isLoadingMessages: false,
      messagesError: null,
    });

    if (ticket?.id) {
      // Sincronizar URL del navegador al estilo Whaticket (/tickets/:uuid o /tickets/:id)
      const ticketIdentifier = ticket.uuid || ticket.id;
      const targetUrl = `/tickets/${ticketIdentifier}`;
      if (window.location.pathname !== targetUrl) {
        window.history.pushState({ ticketId: ticket.id }, '', targetUrl);
      }

      joinTicketRoom(ticket.id);

      // Si el ticket tenía mensajes no leídos, actualizamos localmente
      if (ticket.unreadMessages > 0) {
        set((state) => ({
          tickets: state.tickets.map((t) =>
            t.id === ticket.id ? { ...t, unreadMessages: 0 } : t
          ),
          activeTicket: { ...ticket, unreadMessages: 0 },
        }));
      }
      await get().fetchMessages(ticket.id, true);
    } else {
      if (window.location.pathname.startsWith('/tickets/')) {
        window.history.pushState({}, '', '/');
      }
    }
  },

  loadTicketByIdentifier: async (identifier: string | number) => {
    if (!identifier) return;
    const strId = String(identifier).trim();
    if (!strId) return;
    const requestedSelection = ++selectionVersion;

    // 1. Si ya está en memoria en la lista de tickets
    const existing = get().tickets.find((t) =>
      String(t.id) === strId || (t.uuid && t.uuid === strId)
    );
    if (existing) {
      await get().selectTicket(existing);
      return;
    }

    // 2. Si no está en la lista inicial (ej. ticket viejo o cerrado), buscar en la API
    try {
      const isNumeric = /^\d+$/.test(strId);
      const url = isNumeric ? `/tickets/${strId}` : `/tickets/u/${strId}`;
      const { data: ticketData } = await api.get(url);
      if (requestedSelection !== selectionVersion) return;

      if (ticketData?.id) {
        set((state) => ({
          tickets: state.tickets.some((t) => t.id === ticketData.id)
            ? state.tickets
            : [ticketData, ...state.tickets],
        }));
        await get().selectTicket(ticketData);
      }
    } catch (err) {
      console.error(`Error al cargar ticket ${identifier}:`, err);
    }
  },

  fetchMessages: async (ticketId: number, reset = false) => {
    const { messagesPage, isLoadingMessages, activeTicket } = get();
    if (activeTicket?.id !== ticketId || (isLoadingMessages && !reset)) return;
    const requestVersion = ++messagesRequestVersion;
    const isCurrent = () => requestVersion === messagesRequestVersion && get().activeTicket?.id === ticketId;

    set({ isLoadingMessages: true, messagesError: null });
    try {
      const currentPage = reset ? 1 : messagesPage;
      const contactId = activeTicket.contactId || activeTicket.contact?.id || 0;

      const [msgResponse, notesResponse] = await Promise.allSettled([
        api.get(`/messages/${ticketId}`, {
          params: { pageNumber: currentPage },
        }),
        reset || currentPage === 1
          ? api.get('/ticket-notes/list', {
              params: { contactId, ticketId },
            })
          : Promise.resolve({ data: [] }),
      ]);

      if (!isCurrent()) return;

      if (msgResponse.status === 'rejected') {
        throw msgResponse.reason;
      }

      const loadedMessages: Message[] =
        msgResponse.status === 'fulfilled' ? msgResponse.value.data?.messages || [] : [];
      const loadedNotes: any[] =
        notesResponse.status === 'fulfilled' ? notesResponse.value.data || [] : [];

      const noteMessages: Message[] = Array.isArray(loadedNotes)
        ? loadedNotes.map((n: any) => ({
            id: `note-${n.id}`,
            ticketId: n.ticketId,
            body: n.note,
            fromMe: true,
            read: true,
            isPrivate: true,
            createdAt: n.createdAt,
            updatedAt: n.updatedAt,
            ack: 1,
            mediaUrl: null,
            mediaType: null,
            senderName: n.user?.name,
          }))
        : [];

      set((state) => {
        const now = Date.now();
        // Preservar mensajes optimistas recientes que aún no hayan sido confirmados por el backend
        const pendingTemp = state.messages.filter((m) => {
          if (!String(m.id).startsWith('temp-')) return false;
          // Si loadedMessages ya contiene un mensaje equivalente, se considera confirmado
          const isConfirmed = loadedMessages.some((lm) =>
            lm.id === m.id ||
            (lm.fromMe && m.fromMe && (
              lm.body === m.body ||
              (m.mediaType === 'audio' && lm.mediaType === 'audio') ||
              (m.mediaType && lm.mediaType === m.mediaType && lm.body === m.body)
            ))
          );
          if (isConfirmed) return false;
          // Descartar solo si tiene más de 60 segundos
          const parts = String(m.id).split('-');
          const ts = parseInt(parts[1], 10);
          if (!isNaN(ts) && now - ts > 60000) return false;
          return true;
        });

        const nonTemp = state.messages.filter((m) => !String(m.id).startsWith('temp-'));
        // Refresh the newest page without discarding previously loaded history.
        const combined = [...loadedMessages, ...noteMessages, ...nonTemp, ...pendingTemp];

        // Deduplicar mensajes por ID preservando orden
        const seen = new Set<string | number>();
        const uniqueMessages: Message[] = [];
        for (const m of combined) {
          if (!seen.has(m.id)) {
            seen.add(m.id);
            uniqueMessages.push(m);
          }
        }

        return {
          messages: uniqueMessages.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)),
          hasMoreMessages: reset && messagesPage > 2 ? state.hasMoreMessages : (msgResponse.status === 'fulfilled' ? msgResponse.value.data?.hasMore : false) || false,
          messagesPage: reset ? Math.max(messagesPage, 2) : currentPage + 1,
          isLoadingMessages: false,
        };
      });
    } catch (err) {
      if (!isCurrent()) return;
      console.error('Error fetching messages:', err);
      set({ isLoadingMessages: false, messagesError: 'No se pudieron cargar los mensajes. Intentá nuevamente.' });
    }
  },

  sendMessage: async ({ body, media, medias, mediaUrl, isPrivate, quotedMsg }: {
    body: string;
    media?: File | null;
    medias?: File[];
    mediaUrl?: string | null;
    isPrivate?: boolean;
    quotedMsg?: Message | null;
  }) => {
    const { activeTicket } = get();
    if (!activeTicket?.id) return;

    // Si es nota interna, se guarda en /ticket-notes y NUNCA se envía por WhatsApp
    if (isPrivate) {
      set({ isSendingMessage: true });
      try {
        const contactId = activeTicket.contactId || activeTicket.contact?.id || 0;
        const { data: createdNote } = await api.post('/ticket-notes', {
          note: body,
          ticketId: activeTicket.id,
          contactId,
        });

        const noteMessage: Message = {
          id: `note-${createdNote?.id || Date.now()}`,
          ticketId: activeTicket.id,
          body: createdNote?.note || body,
          fromMe: true,
          read: true,
          isPrivate: true,
          createdAt: createdNote?.createdAt || new Date().toISOString(),
          updatedAt: createdNote?.updatedAt || new Date().toISOString(),
          ack: 1,
          mediaUrl: null,
          mediaType: null,
          senderName: createdNote?.user?.name,
        };

        set((state) => ({
          isSendingMessage: false,
          messages: [
            ...state.messages.filter((m) => !String(m.id).startsWith('temp-')),
            noteMessage,
          ].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)),
        }));
        return;
      } catch (err) {
        set({ isSendingMessage: false });
        console.error('Error al guardar nota interna:', err);
        throw err;
      }
    }

    set({ isSendingMessage: true });

    let filesToSend: File[] = [];
    if (medias && medias.length > 0) {
      filesToSend = medias;
    } else if (media) {
      filesToSend = [media];
    } else if (mediaUrl) {
      try {
        const resolvedUrl = getMediaUrl(mediaUrl);
        let res = await fetch(resolvedUrl);
        if (!res.ok) {
          const filename = mediaUrl.split('/').pop() || '';
          res = await fetch(getMediaUrl(`quickMessage/${filename}`));
        }
        if (res.ok) {
          const blob = await res.blob();
          const filename = mediaUrl.split('/').pop() || 'adjunto';
          let cleanName = filename.replace(/\.jfif$/i, '.jpeg');
          let mimeType = blob.type;
          const lower = cleanName.toLowerCase();
          if (!mimeType || mimeType === 'application/octet-stream' || lower.endsWith('.pdf')) {
            if (lower.endsWith('.pdf')) mimeType = 'application/pdf';
            else if (lower.endsWith('.png')) mimeType = 'image/png';
            else if (lower.endsWith('.webp')) mimeType = 'image/webp';
            else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) mimeType = 'image/jpeg';
          }
          filesToSend = [new File([blob], cleanName, { type: mimeType })];
        } else {
          console.error(`Error HTTP ${res.status} al descargar mediaUrl:`, mediaUrl);
        }
      } catch (e) {
        console.error('Error fetching mediaUrl as file:', e);
      }
    }

    // Mensajes optimistas para feedback visual instantáneo (0ms)
    const optimisticMessages: Message[] = [];
    const tempIds: string[] = [];

    if (filesToSend.length > 0) {
      filesToSend.forEach((file, idx) => {
        const tempId = `temp-${Date.now()}-${idx}`;
        tempIds.push(tempId);
        const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
        const isAudio = file.type.startsWith('audio/') || 
          file.name.toLowerCase().endsWith('.mp3') || 
          file.name.toLowerCase().endsWith('.ogg') || 
          file.name.toLowerCase().endsWith('.m4a') || 
          file.name.toLowerCase().endsWith('.webm') ||
          file.name.includes('audio-record');
        const isVideo = file.type.startsWith('video/') || file.name.toLowerCase().endsWith('.mp4');
        const mediaType = isPdf ? 'application' : isAudio ? 'audio' : isVideo ? 'video' : 'image';

        optimisticMessages.push({
          id: tempId,
          ticketId: activeTicket.id,
          body: idx === 0 ? body : '',
          fromMe: true,
          read: true,
          isPrivate: isPrivate || false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          ack: 1,
          mediaUrl: URL.createObjectURL(file),
          mediaType,
        });
      });
    } else {
      const tempId = `temp-${Date.now()}`;
      tempIds.push(tempId);
      optimisticMessages.push({
        id: tempId,
        ticketId: activeTicket.id,
        body,
        fromMe: true,
        read: true,
        isPrivate: isPrivate || false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ack: 1,
        mediaUrl: null,
        mediaType: null,
      });
    }

    set((state) => ({
      messages: [...state.messages, ...optimisticMessages],
    }));

    try {
      if (filesToSend.length > 0) {
        for (const step of createMediaSendPlan(filesToSend, body)) {
          const formData = new FormData();
          formData.append('fromMe', 'true');
          formData.append('body', step.body);
          formData.append('medias', step.file, step.file.name);
          if (isPrivate) formData.append('isPrivate', 'true');
          if (quotedMsg) formData.append('quotedMsg', JSON.stringify(quotedMsg));

          const token = localStorage.getItem('whaticket_token');
          const res = await fetch(`${BACKEND_URL}/messages/${activeTicket.id}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          });

          if (!res.ok) throw new Error(`Error al enviar multimedia: HTTP ${res.status}`);
        }
      } else {
        await api.post(`/messages/${activeTicket.id}`, {
          body,
          fromMe: true,
          read: true,
          isPrivate: isPrivate || false,
          quotedMsg,
        });
      }

      // Una respuesta del equipo retoma una conversación que estaba en espera.
      // No bloqueamos el envío si el cambio de estado falla: el mensaje ya fue aceptado.
      if (activeTicket.status === 'pending') {
        try {
          await get().updateTicketStatus(activeTicket.id, 'open');
        } catch (statusError) {
          console.error('Message sent but ticket could not be reopened:', statusError);
        }
      }

      // Sincronizar mensajes en background tras enviar dando margen para la conversión y envío
      setTimeout(() => {
        if (get().activeTicket?.id === activeTicket.id) {
          get().fetchMessages(activeTicket.id, true);
        }
      }, 2500);
    } catch (err) {
      console.error('Error sending message:', err);
      // Revertir mensaje optimista si hubo error
      set((state) => ({
        messages: state.messages.filter((m) => !tempIds.includes(String(m.id))),
      }));
      throw err;
    } finally {
      set({ isSendingMessage: false });
    }
  },

  updateTicketStatus: async (ticketId: number, status: 'open' | 'pending' | 'closed') => {
    try {
      await api.put(`/tickets/${ticketId}`, { status });
      set((state) => {
        const updatedTicket = (state.tickets.find((ticket) => ticket.id === ticketId) || state.activeTicket);
        const ticketWithStatus = updatedTicket ? { ...updatedTicket, status } : null;
        const remainsInCurrentTab = state.activeTab === 'all' || state.activeTab === status;
        return {
          tickets: remainsInCurrentTab
            ? state.tickets.map((ticket) => ticket.id === ticketId ? { ...ticket, status } : ticket)
            : state.tickets.filter((ticket) => ticket.id !== ticketId),
          activeTicket: state.activeTicket?.id === ticketId && ticketWithStatus
            ? { ...state.activeTicket, status }
            : state.activeTicket,
        };
      });
    } catch (err) {
      console.error('Error updating ticket status:', err);
      throw err;
    }
  },

  updateTicketQueue: async (ticketId: number, queueId: number | null) => {
    try {
      await api.put(`/tickets/${ticketId}`, { queueId });
      const targetQueue = get().queues.find((q) => q.id === queueId) || null;
      set((state) => ({
        tickets: state.tickets.map((t) =>
          t.id === ticketId ? { ...t, queueId, queue: targetQueue } : t
        ),
        activeTicket:
          state.activeTicket?.id === ticketId
            ? { ...state.activeTicket, queueId, queue: targetQueue }
            : state.activeTicket,
      }));
    } catch (err) {
      console.error('Error updating ticket queue:', err);
      throw err;
    }
  },

  updateTicketUser: async (ticketId: number, userId: number | null) => {
    try {
      const payload: any = { userId };
      if (userId !== null) {
        payload.status = 'open';
      }
      const res = await api.put(`/tickets/${ticketId}`, payload);
      const updatedTicket = res?.data?.ticket || res?.data;
      const targetUser = get().users.find((candidate) => candidate.id === userId) || updatedTicket?.user || null;
      set((state) => {
        const nextStatus = userId !== null ? 'open' : undefined;
        return {
          tickets: state.tickets.map((ticket) =>
            ticket.id === ticketId
              ? {
                  ...ticket,
                  ...(updatedTicket && updatedTicket.id ? updatedTicket : {}),
                  userId,
                  user: targetUser,
                  ...(nextStatus ? { status: nextStatus } : {}),
                }
              : ticket
          ),
          activeTicket:
            state.activeTicket?.id === ticketId
              ? {
                  ...state.activeTicket,
                  ...(updatedTicket && updatedTicket.id ? updatedTicket : {}),
                  userId,
                  user: targetUser,
                  ...(nextStatus ? { status: nextStatus } : {}),
                }
              : state.activeTicket,
        };
      });
      void get().fetchTicketsSilent();
    } catch (err) {
      console.error('Error updating ticket user:', err);
      throw err;
    }
  },

  updateTicketWhatsapp: async (ticketId: number, whatsappId: number) => {
    try {
      await api.put(`/tickets/${ticketId}`, { whatsappId });
      set((state) => ({
        tickets: state.tickets.map((ticket) => ticket.id === ticketId ? { ...ticket, whatsappId } : ticket),
        activeTicket: state.activeTicket?.id === ticketId ? { ...state.activeTicket, whatsappId } : state.activeTicket,
      }));
    } catch (err) {
      console.error('Error updating ticket WhatsApp:', err);
      throw err;
    }
  },

  findTicketsByPhone: async (phone: string) => {
    const normalizedPhone = phone.replace(/\D/g, '');
    if (!normalizedPhone) return [];
    const { data } = await api.get('/tickets', {
      params: { searchParam: normalizedPhone, status: 'all', pageNumber: 1 },
    });
    const remoteTickets: Ticket[] = Array.isArray(data?.tickets) ? data.tickets : Array.isArray(data) ? data : [];
    const combined = [...remoteTickets, ...get().tickets];
    const seen = new Set<number>();
    return combined.filter((ticket) => {
      if (seen.has(ticket.id)) return false;
      seen.add(ticket.id);
      return ticket.contact?.number?.replace(/\D/g, '') === normalizedPhone;
    });
  },

  createTicket: async ({ name, phone, whatsappId, userId }) => {
    const normalizedPhone = phone.replace(/\D/g, '');
    let contactId: number | undefined;
    const { data: contactsData } = await api.get('/contacts', { params: { searchParam: normalizedPhone } });
    const contacts = Array.isArray(contactsData?.contacts) ? contactsData.contacts : Array.isArray(contactsData) ? contactsData : [];
    const existingContact = contacts.find((contact: any) => contact.number?.replace(/\D/g, '') === normalizedPhone);

    if (existingContact?.id) {
      contactId = existingContact.id;
    } else {
      const { data: createdContact } = await api.post('/contacts', {
        name: name?.trim() || normalizedPhone,
        number: normalizedPhone,
      });
      contactId = createdContact?.id || createdContact?.contact?.id;
    }

    if (!contactId) throw new Error('No se pudo crear el contacto para la conversación.');

    const { data } = await api.post('/tickets', { contactId, whatsappId, userId: userId ?? null, status: 'open' });
    const ticket: Ticket = data?.ticket || data;
    if (!ticket?.id) throw new Error('El servidor no devolvió la conversación creada.');
    set((state) => ({ tickets: state.tickets.some((item) => item.id === ticket.id) ? state.tickets : [ticket, ...state.tickets] }));
    return ticket;
  },

  handleSocketWhatsapp: ({ action, whatsapp, session }) => {
    const updated = whatsapp || session;
    if (action !== 'update' || !updated?.id) return;
    set((state) => ({
      whatsapps: state.whatsapps.some((item) => item.id === updated.id)
        ? state.whatsapps.map((item) => item.id === updated.id ? { ...item, ...updated } : item)
        : [...state.whatsapps, updated],
    }));
  },

  handleSocketTicket: (data: { action: string; ticket?: Ticket; ticketId?: number }) => {
    const ticketId = data.ticket?.id || data.ticketId;
    if (!ticketId) return;

    const { action, ticket } = data;
    const { activeTab, selectedQueueId, selectedQueueIds } = get();

    set((state) => {
      const existsIndex = state.tickets.findIndex((t) => t.id === ticketId);

      if (action === 'delete') {
        return {
          tickets: state.tickets.filter((t) => t.id !== ticketId),
          activeTicket: state.activeTicket?.id === ticketId && state.activeTicket.status === 'closed'
            ? null
            : state.activeTicket,
        };
      }

      if (!ticket) return state;

      // Comprobar si corresponde mostrar en la pestaña y cola actual
      const updatedTicket: Ticket = { ...state.tickets[existsIndex], ...ticket };
      const activeTicket = state.activeTicket?.id === ticket.id
        ? { ...state.activeTicket, ...ticket } : state.activeTicket;

      const isClosed = updatedTicket.status === 'closed';
      const hasAgent = !!updatedTicket.userId || !!updatedTicket.user;
      const matchesTab =
        activeTab === 'all' ||
        (activeTab === 'open' && !isClosed && (updatedTicket.status === 'open' || hasAgent)) ||
        (activeTab === 'pending' && updatedTicket.status === 'pending' && !hasAgent) ||
        (activeTab === 'closed' && isClosed);

      const queueIds = selectedQueueIds.length > 0
        ? selectedQueueIds : selectedQueueId === 'all' ? [] : [selectedQueueId];
      const ticketQueueId = updatedTicket.queueId === undefined ? updatedTicket.queue?.id : updatedTicket.queueId;
      const matchesQueue = queueIds.length === 0 || (ticketQueueId != null && queueIds.includes(ticketQueueId));

      if (!matchesTab || !matchesQueue) {
        if (existsIndex >= 0) {
          // Si ya no cumple la condición del tab (ej: pasó de pending a closed), lo quitamos de esta lista
          return {
            tickets: state.tickets.filter((t) => t.id !== ticket.id),
            activeTicket,
          };
        }
        return { activeTicket };
      }

      if (existsIndex >= 0) {
        // Actualizar ticket existente y moverlo arriba si hay mensaje nuevo
        const updatedList = [...state.tickets];
        updatedList[existsIndex] = updatedTicket;
        const [moved] = updatedList.splice(existsIndex, 1);
        return {
          tickets: [moved, ...updatedList],
          activeTicket,
        };
      } else {
        // Nuevo ticket que entra a la pestaña actual
        return {
          tickets: [updatedTicket, ...state.tickets],
          activeTicket,
        };
      }
    });
  },

  handleSocketMessage: (data: { action: string; message: Message; ticket?: Ticket; contact?: any }) => {
    const { message, ticket: socketTicket, contact: socketContact } = data;
    const { activeTicket } = get();
    if (!message?.ticketId) return;

    const messageTicketId = String(message.ticketId);
    const activeTicketId = activeTicket ? String(activeTicket.id) : null;

    // Si el mensaje pertenece al ticket actualmente abierto en pantalla
    if (activeTicketId && activeTicketId === messageTicketId) {
      set((state) => {
        // Filtrar mensajes temporales que coincidan en body o en mediaType (especialmente audios fromMe)
        const filtered = state.messages.filter((m) => {
          if (!String(m.id).startsWith('temp-')) return true;
          if (m.body === message.body) return false;
          if (m.fromMe && message.fromMe) {
            if (m.mediaType === 'audio' && message.mediaType === 'audio') return false;
            if (m.mediaType && m.mediaType === message.mediaType) return false;
          }
          return true;
        });

        const exists = filtered.some((m) => m.id === message.id);
        if (exists) {
          return {
            messages: filtered.map((m) => (m.id === message.id ? message : m)),
          };
        }
        return {
          messages: [...filtered, message],
        };
      });
    }

    // Actualizar el último mensaje en la lista de tickets lateral
    set((state) => {
      const idx = state.tickets.findIndex((t) => String(t.id) === messageTicketId);
      const isNotActive = !activeTicketId || activeTicketId !== messageTicketId;

      if (idx >= 0) {
        const updated = [...state.tickets];
        const ticket = updated[idx];
        const newUnread = isNotActive && !message.fromMe ? (ticket.unreadMessages || 0) + 1 : ticket.unreadMessages;

        const updatedTicket: Ticket = {
          ...ticket,
          ...(socketTicket || {}),
          lastMessage: message.body,
          updatedAt: message.createdAt || new Date().toISOString(),
          unreadMessages: newUnread,
        };

        updated.splice(idx, 1);
        return {
          tickets: [updatedTicket, ...updated],
        };
      } else if (socketTicket) {
        // El ticket no estaba cargado pero vino en el payload del socket
        const newTicket: Ticket = {
          ...socketTicket,
          contact: socketContact || socketTicket.contact,
          lastMessage: message.body,
          updatedAt: message.createdAt || new Date().toISOString(),
          unreadMessages: isNotActive && !message.fromMe ? 1 : 0,
        };
        return {
          tickets: [newTicket, ...state.tickets],
        };
      }
      return state;
    });

    // Si el ticket no estaba en la lista local y no vino en socketTicket, sincronizar silenciosamente en background
    const ticketInState = get().tickets.some((t) => String(t.id) === messageTicketId);
    if (!ticketInState && !socketTicket) {
      void get().fetchTicketsSilent();
    }
  },
}));
