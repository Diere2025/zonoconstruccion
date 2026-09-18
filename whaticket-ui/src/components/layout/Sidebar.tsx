import { 
  MessageSquare, 
  Zap, 
  Users, 
  Smartphone, 
  Layers, 
  LogOut, 
  Volume2, 
  VolumeX,
  Sparkles,
  Shield,
  Menu,
  ChevronLeft
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useChatStore } from '../../store/chatStore';

interface SidebarProps {
  currentView: 'chats' | 'quick-messages' | 'contacts' | 'connections' | 'departments' | 'users';
  onSelectView: (view: 'chats' | 'quick-messages' | 'contacts' | 'connections' | 'departments' | 'users') => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  isExpanded?: boolean;
  onToggleExpanded?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onSelectView,
  soundEnabled,
  onToggleSound,
  isExpanded = false,
  onToggleExpanded,
}) => {
  const { user, logout } = useAuthStore();
  const { whatsapps, tickets } = useChatStore();
  const connectionsWithIssues = whatsapps.filter((connection) => connection.status !== 'CONNECTED');
  const unreadTicketsCount = tickets.filter((t) => t.unreadMessages > 0).length;
  const activeTicketsCount = tickets.filter((t) => t.status === 'open' || t.status === 'pending').length;
  const chatsBadgeCount = unreadTicketsCount > 0 ? unreadTicketsCount : activeTicketsCount;

  const navItems = [
    { id: 'chats' as const, label: 'Chats', icon: MessageSquare },
    { id: 'quick-messages' as const, label: 'Respuestas Rápidas', icon: Zap },
    { id: 'contacts' as const, label: 'Contactos', icon: Users },
    { id: 'connections' as const, label: 'Conexiones', icon: Smartphone },
    { id: 'departments' as const, label: 'Departamentos', icon: Layers },
    { id: 'users' as const, label: 'Usuarios', icon: Shield },
  ];

  return (
    <aside 
      className={`${
        isExpanded ? 'w-56 md:w-64' : 'w-16 md:w-20'
      } bg-slate-900 border-r border-slate-800 flex flex-col py-4 justify-between select-none z-30 flex-shrink-0 transition-all duration-200 ease-in-out`}
    >
      {/* Top Brand & Navigation */}
      <div className="flex flex-col w-full">
        {/* Brand & Toggle Header */}
        <div className={`flex items-center ${isExpanded ? 'justify-between px-4' : 'flex-col gap-3 px-2'} mb-4`}>
          {isExpanded ? (
            <>
              <div className="flex items-center gap-2.5 min-w-0">
                <div 
                  className="w-9 h-9 rounded-xl bg-gradient-to-tr from-rose-600 to-red-500 flex items-center justify-center text-white font-bold text-sm shadow-md shadow-red-500/20 flex-shrink-0"
                >
                  ZC
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="font-bold text-sm text-white tracking-tight truncate">ZTicket</span>
                  <span className="text-[10px] text-slate-400 font-medium truncate">Zono Construcción</span>
                </div>
              </div>

              <button
                type="button"
                onClick={onToggleExpanded}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors flex items-center justify-center cursor-pointer"
                title="Colapsar menú"
                aria-label="Colapsar menú"
              >
                <Menu className="w-5 h-5" />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onToggleExpanded}
                className="w-10 h-10 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors flex items-center justify-center cursor-pointer"
                title="Expandir menú"
                aria-label="Expandir menú"
              >
                <Menu className="w-5 h-5" />
              </button>

              <div 
                className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-600 to-red-500 flex items-center justify-center text-white font-bold text-base shadow-lg shadow-red-500/20 cursor-pointer"
                title="Zono Construcción"
                onClick={onToggleExpanded}
              >
                ZC
              </div>
            </>
          )}
        </div>

        {/* Navigation List */}
        <nav className={`flex flex-col gap-1.5 ${isExpanded ? 'px-3' : 'items-center px-2'}`}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            const badgeCount = item.id === 'chats' && chatsBadgeCount > 0 ? chatsBadgeCount : null;
            const issueCount = item.id === 'connections' && connectionsWithIssues.length > 0 ? connectionsWithIssues.length : null;

            if (isExpanded) {
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectView(item.id)}
                  title={item.label}
                  className={`w-full px-3 py-2.5 rounded-xl flex items-center justify-between transition-all duration-150 relative text-left cursor-pointer group ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/80'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon className="w-5 h-5 flex-shrink-0 transition-transform group-hover:scale-110" />
                    <span className="text-sm font-medium truncate">{item.label}</span>
                  </div>

                  {badgeCount && (
                    <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-blue-500 text-white flex-shrink-0 shadow-xs">
                      {badgeCount}
                    </span>
                  )}
                  {issueCount && (
                    <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-red-500 text-white flex-shrink-0">
                      {issueCount}
                    </span>
                  )}
                </button>
              );
            }

            return (
              <button
                key={item.id}
                onClick={() => onSelectView(item.id)}
                title={item.label}
                className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-150 relative cursor-pointer group ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/80'
                }`}
              >
                <Icon className="w-5 h-5 transition-transform group-hover:scale-110" />
                {issueCount && (
                  <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full border-2 border-slate-900 bg-red-500" aria-label={`${issueCount} conexión(es) requiere(n) atención`} />
                )}
                {badgeCount && (
                  <span className="absolute -top-1 -right-1 px-1.5 py-0.2 text-[9px] font-bold rounded-full bg-blue-600 text-white border border-slate-900">
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                )}
                {/* Floating tooltip */}
                <span className="absolute left-16 bg-slate-950 text-slate-100 text-xs font-medium px-2.5 py-1 rounded-md shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 border border-slate-800">
                  {item.id === 'connections' && issueCount
                    ? `Conexiones: ${issueCount} requiere(n) atención`
                    : item.label}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Profile & Actions */}
      <div className={`w-full ${isExpanded ? 'px-3 pt-3 border-t border-slate-800/80' : 'flex flex-col items-center gap-3'}`}>
        {isExpanded ? (
          <div className="flex flex-col gap-2">
            {/* User profile row */}
            <div className="flex items-center justify-between p-2 rounded-xl bg-slate-800/60 border border-slate-700/50">
              <div className="flex items-center gap-2.5 min-w-0">
                <div 
                  className="w-9 h-9 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0 shadow-sm"
                >
                  {user?.name ? user.name.slice(0, 2).toUpperCase() : 'ZC'}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-bold text-slate-200 truncate">
                    {user?.name || 'Diego'}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    <span className="text-[10px] text-slate-400 truncate">
                      {user?.profile === 'admin' ? 'Admin · En línea' : 'Operador · En línea'}
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => logout()}
                title="Cerrar sesión"
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors flex-shrink-0 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>

            {/* Sound toggle button */}
            <button
              type="button"
              onClick={onToggleSound}
              className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2">
                {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
                <span>{soundEnabled ? 'Sonido activado' : 'Sonido silenciado'}</span>
              </span>
              <span className="text-[10px] text-slate-500 font-semibold">{soundEnabled ? 'ON' : 'OFF'}</span>
            </button>
          </div>
        ) : (
          <>
            {/* Sound toggle */}
            <button
              type="button"
              onClick={onToggleSound}
              title={soundEnabled ? 'Silenciar notificaciones' : 'Activar sonido'}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 transition-colors cursor-pointer"
            >
              {soundEnabled ? <Volume2 className="w-5 h-5 text-emerald-400" /> : <VolumeX className="w-5 h-5" />}
            </button>

            {/* User avatar */}
            <div 
              className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-200 font-semibold text-sm cursor-pointer"
              title={`${user?.name || 'Usuario'} (${user?.profile || 'operador'})`}
              onClick={onToggleExpanded}
            >
              {user?.name ? user.name.slice(0, 2).toUpperCase() : 'ZC'}
            </div>

            {/* Logout */}
            <button
              type="button"
              onClick={() => logout()}
              title="Cerrar sesión"
              className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </>
        )}
      </div>
    </aside>
  );
};
