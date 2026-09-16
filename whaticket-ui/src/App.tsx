import React, { useEffect, useState } from 'react';
import { useAuthStore } from './store/authStore';
import { useChatStore } from './store/chatStore';
import { getSocket } from './services/socket';
import { LoginView } from './components/auth/LoginView';
import { Sidebar } from './components/layout/Sidebar';
import { TicketList } from './components/chat/TicketList';
import { ChatArea } from './components/chat/ChatArea';
import { ContactDrawer } from './components/chat/ContactDrawer';
import { QuickMessagesView } from './components/views/QuickMessagesView';
import { ConnectionsView } from './components/views/ConnectionsView';
import { DepartmentsView } from './components/views/DepartmentsView';
import { ContactsView } from './components/views/ContactsView';
import { UsersView } from './components/views/UsersView';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { Toaster } from 'sonner';

export function App() {
  const { user, isAuthenticated, isLoading, checkAuth } = useAuthStore();
  const {
    activeTicket,
    selectTicket,
    loadTicketByIdentifier,
    fetchTickets,
    fetchQueues,
    fetchQuickMessages,
    fetchTags,
    fetchWhatsapps,
    handleSocketTicket,
    handleSocketMessage,
    handleSocketWhatsapp,
  } = useChatStore();

  const [currentView, setCurrentView] = useState<
    'chats' | 'quick-messages' | 'contacts' | 'connections' | 'departments' | 'users'
  >('chats');
  const [isContactDrawerOpen, setIsContactDrawerOpen] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(() => {
    return localStorage.getItem('whaticket_sidebar_expanded') === 'true';
  });

  const handleToggleSidebar = () => {
    setIsSidebarExpanded((prev) => {
      const next = !prev;
      localStorage.setItem('whaticket_sidebar_expanded', String(next));
      return next;
    });
  };

  // 1. Check de autenticación inicial
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // 2. Cargar datos iniciales una vez autenticado y restaurar conversación de la URL al refrescar
  useEffect(() => {
    if (isAuthenticated && user?.companyId) {
      const initData = async () => {
        await Promise.all([
          fetchTickets(true),
          fetchQueues(),
          fetchQuickMessages(),
          fetchTags(),
          fetchWhatsapps(),
        ]);

        // Detectar si hay un ticket en la URL (/tickets/:uuid o /tickets/:id o ?ticketId=...)
        const pathMatch = window.location.pathname.match(/\/tickets\/([^/?#]+)/);
        const searchParams = new URLSearchParams(window.location.search);
        const urlTicketId = pathMatch ? pathMatch[1] : searchParams.get('ticketId');

        if (urlTicketId) {
          setCurrentView('chats');
          await loadTicketByIdentifier(urlTicketId);
        }
      };

      initData();
    }
  }, [isAuthenticated, user?.companyId]);

  // Consulta de respaldo: cubre cambios de conexión cuando el socket se reconecta tarde.
  useEffect(() => {
    if (!isAuthenticated || !user?.companyId) return;
    const timer = window.setInterval(() => { void fetchWhatsapps(); }, 30000);
    return () => window.clearInterval(timer);
  }, [isAuthenticated, user?.companyId, fetchWhatsapps]);

  // Manejar navegación nativa del navegador (atrás / adelante)
  useEffect(() => {
    const handlePopState = () => {
      const pathMatch = window.location.pathname.match(/\/tickets\/([^/?#]+)/);
      const searchParams = new URLSearchParams(window.location.search);
      const urlTicketId = pathMatch ? pathMatch[1] : searchParams.get('ticketId');

      if (urlTicketId) {
        setCurrentView('chats');
        loadTicketByIdentifier(urlTicketId);
      } else if (window.location.pathname === '/' || window.location.pathname === '/tickets') {
        selectTicket(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // 3. Suscripción a eventos WebSockets en tiempo real
  useEffect(() => {
    if (!isAuthenticated || !user?.companyId) return;

    const socket = getSocket();
    if (!socket) return;

    const ticketChannel = `company-${user.companyId}-ticket`;
    const messageChannel = `company-${user.companyId}-appMessage`;
    const sessionChannel = `company-${user.companyId}-whatsappSession`;
    const whatsappChannel = `company-${user.companyId}-whatsapp`;

    const onTicket = (data: any) => {
      handleSocketTicket(data);
    };

    const onMessage = (data: any) => {
      handleSocketMessage(data);
      if (soundEnabled && !data.message?.fromMe) {
        try {
          const audio = new Audio('/alert.mp3');
          audio.play().catch(() => {});
        } catch {}
      }
    };

    const onWhatsapp = (data: any) => {
      handleSocketWhatsapp(data);
    };

    socket.on(ticketChannel, onTicket);
    socket.on(messageChannel, onMessage);
    socket.on(sessionChannel, onWhatsapp);
    socket.on(whatsappChannel, onWhatsapp);

    return () => {
      socket.off(ticketChannel, onTicket);
      socket.off(messageChannel, onMessage);
      socket.off(sessionChannel, onWhatsapp);
      socket.off(whatsappChannel, onWhatsapp);
    };
  }, [isAuthenticated, user?.companyId, soundEnabled]);

  if (isLoading) {
    return (
      <div className="min-h-screen w-full bg-slate-950 flex flex-col items-center justify-center text-slate-400 gap-3">
        <div className="w-10 h-10 border-3 border-rose-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-semibold tracking-wider uppercase text-slate-500">
          Iniciando ZTicket...
        </span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginView />;
  }

  return (
    <div className="h-[100dvh] max-h-[100dvh] w-full flex bg-slate-100 dark:bg-slate-950 overflow-hidden font-sans antialiased text-slate-800 dark:text-slate-100 fixed inset-0">
      {/* 1. Barra lateral de navegación (en móvil se oculta dentro del chat para ganar espacio) */}
      <div className={`${activeTicket && currentView === 'chats' ? 'hidden md:flex' : 'flex'} flex-shrink-0 h-full`}>
        <Sidebar
          currentView={currentView}
          onSelectView={(view) => {
            setCurrentView(view);
            if (view !== 'chats') {
              selectTicket(null);
            }
          }}
          soundEnabled={soundEnabled}
          onToggleSound={() => setSoundEnabled(!soundEnabled)}
          isExpanded={isSidebarExpanded}
          onToggleExpanded={handleToggleSidebar}
        />
      </div>

      {/* 2. Contenido según la vista seleccionada */}
      {currentView === 'chats' && (
        <div className="flex-1 flex h-full w-full min-w-0 overflow-hidden relative">
          {/* Lista de tickets: en móvil se oculta cuando se abre una conversación */}
          <div
            className={`h-full flex-shrink-0 ${
              activeTicket ? 'hidden md:flex md:w-80 lg:w-96' : 'w-full md:w-80 lg:w-96 flex'
            }`}
          >
            <TicketList />
          </div>

          {/* Área del chat activo: en móvil ocupa el 100% de la pantalla cuando se abre */}
          <div
            className={`flex-1 h-full w-full min-w-0 overflow-hidden ${
              activeTicket ? 'flex' : 'hidden md:flex'
            }`}
          >
            <ErrorBoundary fallbackTitle="Error al cargar la conversación">
              <ChatArea
                onToggleContactDrawer={() => setIsContactDrawerOpen(!isContactDrawerOpen)}
                onBackMobile={() => selectTicket(null)}
                isContactDrawerOpen={isContactDrawerOpen}
              />
            </ErrorBoundary>
          </div>

          {/* Panel deslizante de datos de contacto */}
          {activeTicket && isContactDrawerOpen && (
            <ContactDrawer
              isOpen={isContactDrawerOpen}
              onClose={() => setIsContactDrawerOpen(false)}
            />
          )}
        </div>
      )}

      {currentView === 'quick-messages' && <QuickMessagesView />}
      {currentView === 'contacts' && (
        <ContactsView onOpenChat={() => setCurrentView('chats')} />
      )}
      {currentView === 'connections' && <ConnectionsView />}
      {currentView === 'departments' && <DepartmentsView />}
      {currentView === 'users' && <UsersView />}

      <Toaster position="top-right" richColors />
    </div>
  );
}

export default App;
