import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { useChatStore } from '../../store/chatStore';
import { useAuthStore } from '../../store/authStore';
import { WhatsappConnection } from '../../types';
import { formatPhoneNumber } from '../../utils/phone';
import { 
  Smartphone, 
  RefreshCw, 
  QrCode, 
  CheckCircle2, 
  AlertCircle, 
  Trash2, 
  MoreVertical, 
  Pencil, 
  Pin, 
  RotateCw, 
  Unplug, 
  FileUp, 
  Plus, 
  X, 
  ChevronRight, 
  Copy, 
  Check, 
  MessageSquare, 
  Share2, 
  Phone, 
  Camera, 
  Smile, 
  Paperclip, 
  Globe, 
  Info,
  Send
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { getSocket } from '../../services/socket';

export const ConnectionsView: React.FC = () => {
  const { queues, fetchQueues } = useChatStore();
  const { user } = useAuthStore();
  const companyId = String(user?.companyId || localStorage.getItem('companyId') || '1');

  const [connections, setConnections] = useState<WhatsappConnection[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Estados de Modales
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [showNewQrFlowModal, setShowNewQrFlowModal] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState<number | null>(null);
  const [isRefreshingQr, setIsRefreshingQr] = useState(false);

  // Estado para la conexión activa en edición o QR
  const [selectedConnection, setSelectedConnection] = useState<WhatsappConnection | null>(null);

  // Campos del formulario de Edición
  const [editName, setEditName] = useState('');
  const [editGreeting, setEditGreeting] = useState('');
  const [editFarewell, setEditFarewell] = useState('');
  const [editQueueIds, setEditQueueIds] = useState<number[]>([]);
  const [editToleranceMin, setEditToleranceMin] = useState(15);
  const [editDisplayType, setEditDisplayType] = useState('Números');
  const [editReturnToAgent, setEditReturnToAgent] = useState(true);
  const [editImportOldMessages, setEditImportOldMessages] = useState(false);
  const [editImportOldMessagesDays, setEditImportOldMessagesDays] = useState(30);
  const [editImportRecentUnreadDays, setEditImportRecentUnreadDays] = useState(2);
  const [isSaving, setIsSaving] = useState(false);

  // Campos del formulario de Nueva Conexión QR
  const [newName, setNewName] = useState('');
  const [newGreeting, setNewGreeting] = useState('¡Hola! 👋 ¿En qué podemos ayudarte hoy?');
  const [newQueueId, setNewQueueId] = useState<number | ''>('');
  const [newImportOldMessages, setNewImportOldMessages] = useState(false);
  const [newImportOldMessagesDays, setNewImportOldMessagesDays] = useState(30);
  const [newImportRecentUnreadDays, setNewImportRecentUnreadDays] = useState(2);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [syncProgress, setSyncProgress] = useState<Record<number, { current: number; total: number; percent: number; importedMessages: number }>>({});
  const [stoppingSyncIds, setStoppingSyncIds] = useState<number[]>([]);

  const fetchConnections = async () => {
    setIsLoading(true);
    try {
      const { data } = await api.get('/whatsapp');
      const sorted = Array.isArray(data) ? [...data].sort((a, b) => a.id - b.id) : [];
      setConnections(sorted);
    } catch (err) {
      console.error('Error fetching whatsapp connections:', err);
      toast.error('Error al cargar conexiones');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchConnections();
    fetchQueues();
  }, []);

  // Cerrar menú al hacer clic afuera
  useEffect(() => {
    const handleOutside = () => setActiveMenuId(null);
    window.addEventListener('click', handleOutside);
    return () => window.removeEventListener('click', handleOutside);
  }, []);

  // Abrir modal de edición
  const handleOpenEdit = (conn: WhatsappConnection) => {
    setSelectedConnection(conn);
    setEditName(conn.name || '');
    setEditGreeting(conn.greetingMessage || '');
    setEditFarewell(conn.complationMessage || '');
    setEditImportOldMessages(conn.importOldMessages ?? false);
    setEditImportOldMessagesDays(conn.importOldMessagesDays ?? 30);
    setEditImportRecentUnreadDays(conn.importRecentUnreadDays ?? 2);
    
    // Obtener IDs de colas asociadas
    const qIds = conn.queues?.map(q => q.id) || conn.queueIds || [];
    setEditQueueIds(qIds);
    
    setActiveMenuId(null);
    setShowEditModal(true);
  };

  // Guardar cambios de edición
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConnection) return;

    if (!editName.trim()) {
      toast.error('El nombre de la conexión es obligatorio');
      return;
    }

    setIsSaving(true);
    try {
      await api.put(`/whatsapp/${selectedConnection.id}`, {
        name: editName.trim(),
        greetingMessage: editGreeting,
        complationMessage: editFarewell,
        queueIds: editQueueIds,
        isDefault: selectedConnection.isDefault,
        importOldMessages: editImportOldMessages,
        importOldMessagesDays: editImportOldMessagesDays,
        importRecentUnreadDays: editImportRecentUnreadDays,
      });

      toast.success('Conexión actualizada correctamente');
      setShowEditModal(false);
      fetchConnections();
    } catch (err: any) {
      console.error('Error al actualizar conexión:', err);
      toast.error(err.response?.data?.message || 'Error al guardar conexión');
    } finally {
      setIsSaving(false);
    }
  };

  // Sincronización manual a demanda del historial
  const handleSyncHistory = async (conn: WhatsappConnection) => {
    try {
      toast.info(`Iniciando sincronización de historial para ${conn.name}...`);
      await api.post(`/whatsapp/${conn.id}/sync-history`);
      toast.success(`Sincronización en proceso. Podés seguir el avance o frenarla.`);
      setConnections(prev => prev.map(c => c.id === conn.id ? { ...c, importOldMessagesStatus: 'importing' } : c));
      fetchConnections();
    } catch (err: any) {
      console.error('Error al sincronizar historial:', err);
      toast.error(err.response?.data?.message || 'Error al iniciar sincronización');
    }
  };

  // Frenar o cancelar sincronización de historial
  const handleStopSync = async (conn: WhatsappConnection) => {
    setStoppingSyncIds((prev) => [...prev, conn.id]);
    try {
      toast.info(`Deteniendo sincronización de ${conn.name}...`);
      await api.post(`/whatsapp/${conn.id}/stop-history`);
      toast.success('Sincronización detenida correctamente');
      setConnections((prev) =>
        prev.map((c) =>
          c.id === conn.id ? { ...c, importOldMessagesStatus: 'idle', importOldMessages: false } : c
        )
      );
      if (selectedConnection?.id === conn.id) {
        setSelectedConnection((prev) =>
          prev ? { ...prev, importOldMessagesStatus: 'idle', importOldMessages: false } : null
        );
        setEditImportOldMessages(false);
      }
      setSyncProgress((prev) => {
        const copy = { ...prev };
        delete copy[conn.id];
        return copy;
      });
    } catch (err: any) {
      console.error('Error al detener sincronización:', err);
      toast.error(err.response?.data?.message || 'Error al detener sincronización');
    } finally {
      setStoppingSyncIds((prev) => prev.filter((id) => id !== conn.id));
    }
  };

  // Pausar o activar sincronización de historial
  const handleToggleHistorySync = async (conn: WhatsappConnection) => {
    setActiveMenuId(null);
    const newStatus = !conn.importOldMessages;
    try {
      await api.put(`/whatsapp/${conn.id}`, {
        name: conn.name,
        importOldMessages: newStatus,
        importOldMessagesDays: conn.importOldMessagesDays || 30,
        importRecentUnreadDays: conn.importRecentUnreadDays || 2,
        isDefault: conn.isDefault,
        queueIds: conn.queues?.map((q) => q.id) || conn.queueIds || []
      });
      toast.success(newStatus ? 'Sincronización de historial activada' : 'Sincronización de historial pausada');
      fetchConnections();
    } catch (err: any) {
      console.error('Error toggling history sync:', err);
      toast.error('No se pudo actualizar el estado de sincronización');
    }
  };

  // Eliminar conexión
  const handleDeleteConnection = async (id: number) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar esta conexión?')) return;

    try {
      await api.delete(`/whatsapp/${id}`);
      toast.success('Conexión eliminada');
      if (showEditModal) setShowEditModal(false);
      fetchConnections();
    } catch (err) {
      console.error('Error deleting connection:', err);
      toast.error('No se pudo eliminar la conexión');
    }
  };

  const [showAssignModal, setShowAssignModal] = useState(false);
  const [connectionToAssign, setConnectionToAssign] = useState<WhatsappConnection | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);

  // Reiniciar conexión
  const handleRestartConnection = async () => {
    try {
      try {
        await api.post('/whatsapp-restart/');
      } catch {
        await api.post('/whatsapp-restart');
      }
      toast.success('Sesión de WhatsApp reiniciada');
      setActiveMenuId(null);
      fetchConnections();
    } catch (err: any) {
      console.error('Error restarting connection:', err);
      const msg = err.response?.data?.error || err.response?.data?.message || 'Error al reiniciar sesión';
      toast.error(msg);
    }
  };

  // Desconectar sesión
  const handleDisconnectSession = async (id: number) => {
    if (!window.confirm('¿Deseas desconectar esta sesión de WhatsApp?')) return;
    try {
      await api.delete(`/whatsappsession/${id}`);
      toast.success('Sesión desconectada');
      setActiveMenuId(null);
      fetchConnections();
    } catch (err: any) {
      console.error('Error disconnecting session:', err);
      const msg = err.response?.data?.error || err.response?.data?.message || 'Error al desconectar';
      toast.error(msg);
      fetchConnections();
    }
  };

  // Asignar conexión (abrir modal de confirmación)
  const handleOpenAssignModal = (conn: WhatsappConnection) => {
    setActiveMenuId(null);
    setConnectionToAssign(conn);
    setShowAssignModal(true);
  };

  // Confirmar asignación de conexión
  const handleConfirmAssign = async () => {
    if (!connectionToAssign) return;
    setIsAssigning(true);
    try {
      // 1. Marcar la conexión como default en el backend
      await api.put(`/whatsapp/${connectionToAssign.id}`, {
        name: connectionToAssign.name,
        greetingMessage: connectionToAssign.greetingMessage,
        complationMessage: connectionToAssign.complationMessage,
        isDefault: true,
        queueIds: connectionToAssign.queues?.map(q => q.id) || connectionToAssign.queueIds || []
      });

      // 2. Intentar transferir / actualizar tickets sin conexión si hay tickets compatibles
      try {
        // En Whaticket, si hay endpoint específico de asignación o si se consulta tickets
        const { data: ticketRes } = await api.get('/tickets', {
          params: { pageNumber: 1, status: 'pending' }
        });
        const tickets = ticketRes?.tickets || (Array.isArray(ticketRes) ? ticketRes : []);
        const unassignedTickets = tickets.filter((t: any) => !t.whatsappId || t.whatsappId === 0);
        
        for (const t of unassignedTickets.slice(0, 50)) {
          api.put(`/tickets/${t.id}`, { whatsappId: connectionToAssign.id }).catch(() => {});
        }
      } catch (err) {
        console.warn('Asignación de tickets secundarios en progreso en segundo plano:', err);
      }

      toast.success(`Conexión asignada a todos los chats compatibles.`);
      setShowAssignModal(false);
      setConnectionToAssign(null);
      fetchConnections();
    } catch (err: any) {
      console.error('Error assigning connection:', err);
      const msg = err.response?.data?.error || err.response?.data?.message || 'Error al asignar la conexión';
      toast.error(msg);
    } finally {
      setIsAssigning(false);
    }
  };

  // Abrir visualizador de código QR / Iniciar sesión
  const handleOpenQr = async (conn: WhatsappConnection) => {
    setSelectedConnection(conn);
    setShowQrModal(true);
    setActiveMenuId(null);
    setIsRefreshingQr(!conn.qrcode);

    try {
      if (conn.status !== 'CONNECTED') {
        // En Whaticket, iniciar sesión (POST) o forzar nuevo QR (PUT)
        try {
          await api.post(`/whatsappsession/${conn.id}`);
        } catch (postErr) {
          console.warn('POST whatsappsession fallo, intentando con PUT:', postErr);
          await api.put(`/whatsappsession/${conn.id}`).catch(() => {});
        }
      }

      const { data } = await api.get(`/whatsapp/${conn.id}`);
      if (data) {
        setSelectedConnection(data);
        if (data.qrcode) {
          setIsRefreshingQr(false);
        }
      }
    } catch (e) {
      console.error('Error starting session:', e);
      toast.info('Iniciando sesión de WhatsApp. Generando código QR...');
    }
  };

  // Forzar generación de nuevo código QR (PUT)
  const handleForceNewQr = async (conn: WhatsappConnection) => {
    setActiveMenuId(null);
    setSelectedConnection(conn);
    setShowQrModal(true);
    setIsRefreshingQr(true);
    toast.info('Generando nuevo código QR...');

    try {
      await api.put(`/whatsappsession/${conn.id}`);
      let attempts = 0;
      const interval = setInterval(async () => {
        attempts++;
        try {
          const { data } = await api.get(`/whatsapp/${conn.id}`);
          if (data) {
            setSelectedConnection(data);
            if (data.qrcode || data.status === 'CONNECTED' || attempts >= 8) {
              clearInterval(interval);
              setIsRefreshingQr(false);
            }
          }
        } catch {
          if (attempts >= 8) {
            clearInterval(interval);
            setIsRefreshingQr(false);
          }
        }
      }, 1500);
    } catch (e) {
      console.error('Error refreshing QR:', e);
      toast.error('Error al generar nuevo código QR');
      setIsRefreshingQr(false);
    }
  };

  // Solicitar nuevo código QR desde el modal
  const handleRefreshQr = async () => {
    if (!selectedConnection) return;
    await handleForceNewQr(selectedConnection);
  };

  // Escuchar eventos en vivo de WhatsApp en toda la vista de conexiones
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !companyId) return;

    const handleLiveSession = (data: any) => {
      if (data?.action === 'update' && data?.session) {
        const updated = data.session;
        setConnections((prev) =>
          [...prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c))].sort((a, b) => a.id - b.id)
        );
        if (selectedConnection?.id === updated.id) {
          setSelectedConnection(updated);
          if (updated.qrcode) {
            setIsRefreshingQr(false);
          }
          if (updated.status === 'CONNECTED') {
            toast.success('¡WhatsApp vinculado exitosamente!');
            setShowQrModal(false);
            fetchConnections();
          }
        }
      }

      if (data?.action === 'history-progress' && data?.whatsappId) {
        setSyncProgress((prev) => ({
          ...prev,
          [data.whatsappId]: {
            current: data.current || 0,
            total: data.total || 0,
            percent: data.percent || 0,
            importedMessages: data.importedMessagesCount || 0
          }
        }));
      }

      if ((data?.action === 'history-stopped' || data?.action === 'history-synced') && data?.whatsappId) {
        setSyncProgress((prev) => {
          const copy = { ...prev };
          delete copy[data.whatsappId];
          return copy;
        });
        if (data?.action === 'history-synced') {
          toast.success(`¡Sincronización completada! (${data.importedChatsCount || 0} chats)`);
        }
      }
    };

    const handleLiveWhatsapp = (data: any) => {
      if (data?.action === 'update' && data?.whatsapp) {
        const updated = data.whatsapp;
        setConnections((prev) =>
          [...prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c))].sort((a, b) => a.id - b.id)
        );
        if (selectedConnection?.id === updated.id) {
          setSelectedConnection(updated);
          if (updated.qrcode) {
            setIsRefreshingQr(false);
          }
          if (updated.status === 'CONNECTED') {
            toast.success('¡WhatsApp vinculado exitosamente!');
            setShowQrModal(false);
            fetchConnections();
          }
        }
      }
    };

    const sessionEvent = `company-${companyId}-whatsappSession`;
    const whatsappEvent = `company-${companyId}-whatsapp`;

    socket.on(sessionEvent, handleLiveSession);
    socket.on(whatsappEvent, handleLiveWhatsapp);

    return () => {
      socket.off(sessionEvent, handleLiveSession);
      socket.off(whatsappEvent, handleLiveWhatsapp);
    };
  }, [companyId, selectedConnection?.id]);

  // Polling de respaldo cuando el modal QR está abierto
  useEffect(() => {
    if (!showQrModal || !selectedConnection) return;

    const pollInterval = setInterval(async () => {
      try {
        const { data } = await api.get(`/whatsapp/${selectedConnection.id}`);
        if (data) {
          setSelectedConnection(data);
          if (data.qrcode) {
            setIsRefreshingQr(false);
          }
          if (data.status === 'CONNECTED') {
            toast.success('¡WhatsApp vinculado exitosamente!');
            setShowQrModal(false);
            fetchConnections();
          }
        }
      } catch (err) {
        console.error('Error polling QR status:', err);
      }
    }, 1800);

    return () => {
      clearInterval(pollInterval);
    };
  }, [showQrModal, selectedConnection?.id]);

  // Crear nueva conexión WhatsApp QR
  const handleCreateNewQrConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      toast.error('Por favor ingresa un nombre para la conexión');
      return;
    }

    setIsCreatingNew(true);
    try {
      const qIds = newQueueId ? [Number(newQueueId)] : [];
      const { data } = await api.post('/whatsapp', {
        name: newName.trim(),
        greetingMessage: newGreeting,
        queueIds: qIds,
        isDefault: connections.length === 0,
        importOldMessages: newImportOldMessages,
        importOldMessagesDays: newImportOldMessagesDays,
        importRecentUnreadDays: newImportRecentUnreadDays,
      });

      toast.success('Conexión creada. Generando código QR...');
      setShowNewQrFlowModal(false);
      setShowAddModal(false);
      setNewName('');

      // Solicitar generación de sesión QR
      if (data?.id) {
        await api.post(`/whatsappsession/${data.id}`);
      }

      await fetchConnections();

      // Abrir modal QR con la nueva conexión
      if (data) {
        setSelectedConnection(data);
        setShowQrModal(true);
      }
    } catch (err: any) {
      console.error('Error creating connection:', err);
      toast.error(err.response?.data?.message || 'Error al crear la conexión');
    } finally {
      setIsCreatingNew(false);
    }
  };

  // Helper para alternar colas seleccionadas
  const toggleQueue = (qId: number) => {
    setEditQueueIds(prev => 
      prev.includes(qId) ? prev.filter(id => id !== qId) : [...prev, qId]
    );
  };

  return (
    <div className="flex-1 bg-slate-50 dark:bg-slate-950 p-6 sm:p-8 overflow-y-auto flex flex-col gap-6">
      
      {/* 1. Header estilo Whaticket Moderno */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400">
            Conexiones
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Administra tus números de WhatsApp y canales oficiales de mensajería
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={fetchConnections}
            disabled={isLoading}
            className="py-2 px-3.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2 transition-all shadow-xs cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-blue-500 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>

          {/* Botón Azul Píldora "Agregar" idéntico al screenshot */}
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="py-2.5 px-6 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-full shadow-md shadow-blue-500/25 transition-all active:scale-95 cursor-pointer flex items-center gap-2"
          >
            <span>Agregar</span>
          </button>
        </div>
      </div>

      {/* 2. Contenedor Principal con Cuadrícula de Tarjetas de Conexión */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xs min-h-[500px]">
        {connections.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-500 flex items-center justify-center mb-4">
              <Smartphone className="w-8 h-8" />
            </div>
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-1">
              No hay conexiones activas
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mb-5">
              Haz clic en "Agregar" para vincular tu primera línea de WhatsApp mediante código QR.
            </p>
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="py-2.5 px-5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-md cursor-pointer"
            >
              + Agregar Primera Conexión
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {connections.map((conn) => {
              const isConnected = conn.status === 'CONNECTED';
              const isQr = conn.status === 'qrcode' || conn.status === 'PAIRING';

              return (
                <div
                  key={conn.id}
                  className="bg-gradient-to-b from-emerald-50/40 via-white to-white dark:from-emerald-950/20 dark:via-slate-900 dark:to-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between gap-4 relative group"
                >
                  {/* Fila Superior: Ícono WhatsApp + Nombre + Número + Botón 3 Puntos */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-xs flex-shrink-0">
                        <Smartphone className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-sm text-slate-800 dark:text-slate-100 leading-tight">
                            {conn.name}
                          </h4>
                          {conn.importOldMessages && (
                            <span className="text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.2 rounded-md border border-indigo-200 dark:border-indigo-800">
                              📥 Historial {conn.importOldMessagesDays || 30}d
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                          {conn.number ? formatPhoneNumber(conn.number) : 'Sin número vinculado'}
                        </span>
                        {conn.importOldMessagesStatus === 'importing' && (
                          <div className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold flex items-center gap-1 mt-0.5 animate-pulse">
                            <RefreshCw className="w-3 h-3 animate-spin" /> Sincronizando historial...
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Botón Menú 3 Puntos */}
                    <div className="relative" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => setActiveMenuId(activeMenuId === conn.id ? null : conn.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {/* Menú Desplegable Contextual (Idéntico a media_1789342313955.png) */}
                      {activeMenuId === conn.id && (
                        <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200/80 dark:border-slate-700 py-2 z-30 animate-in fade-in zoom-in-95 duration-150">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(conn)}
                            className="w-full px-4 py-2 text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2.5 transition-colors cursor-pointer"
                          >
                            <Pencil className="w-4 h-4 text-slate-500" />
                            <span>Editar</span>
                          </button>

                          {isConnected && (
                            conn.importOldMessagesStatus === 'importing' ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveMenuId(null);
                                  handleStopSync(conn);
                                }}
                                className="w-full px-4 py-2 text-left text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-2.5 transition-colors cursor-pointer"
                              >
                                <span className="text-sm">⏹</span>
                                <span>Frenar sincronización</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveMenuId(null);
                                  handleSyncHistory(conn);
                                }}
                                className="w-full px-4 py-2 text-left text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 flex items-center gap-2.5 transition-colors cursor-pointer"
                              >
                                <RefreshCw className="w-4 h-4" />
                                <span>Sincronizar historial</span>
                              </button>
                            )
                          )}

                          {!isConnected && (
                            <button
                              type="button"
                              onClick={() => handleOpenQr(conn)}
                              className="w-full px-4 py-2 text-left text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 flex items-center gap-2.5 transition-colors cursor-pointer"
                            >
                              <QrCode className="w-4 h-4" />
                              <span>{isQr ? 'Ver Código QR' : 'Conectar / Cargar QR'}</span>
                            </button>
                          )}

                          {!isConnected && (
                            <button
                              type="button"
                              onClick={() => handleForceNewQr(conn)}
                              className="w-full px-4 py-2 text-left text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 flex items-center gap-2.5 transition-colors cursor-pointer"
                            >
                              <RotateCw className="w-4 h-4" />
                              <span>Generar nuevo QR</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              setActiveMenuId(null);
                              handleDeleteConnection(conn.id);
                            }}
                            className="w-full px-4 py-2 text-left text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-2.5 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                            <span>Borrar</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenAssignModal(conn)}
                            className="w-full px-4 py-2 text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2.5 transition-colors cursor-pointer"
                          >
                            <Pin className="w-4 h-4 text-slate-500" />
                            <span>Asignar conexión</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleToggleHistorySync(conn)}
                            className="w-full px-4 py-2 text-left text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 flex items-center gap-2.5 transition-colors cursor-pointer"
                          >
                            <RefreshCw className="w-4 h-4" />
                            <span>{conn.importOldMessages ? 'Pausar sincronización' : 'Activar sincronización'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleRestartConnection()}
                            className="w-full px-4 py-2 text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2.5 transition-colors cursor-pointer"
                          >
                            <RotateCw className="w-4 h-4 text-slate-500" />
                            <span>Reiniciar</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDisconnectSession(conn.id)}
                            className="w-full px-4 py-2 text-left text-xs font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 flex items-center gap-2.5 transition-colors cursor-pointer"
                          >
                            <Unplug className="w-4 h-4" />
                            <span>Desconectar</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setActiveMenuId(null);
                              toast.info('Función de importación de sesión disponible próximamente');
                            }}
                            className="w-full px-4 py-2 text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2.5 transition-colors cursor-pointer"
                          >
                            <FileUp className="w-4 h-4 text-slate-500" />
                            <span>Importar sesión</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Fila Intermedia: Badge de Estado y QR si está pendiente */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span
                        className={`rounded-full px-3 py-0.5 text-xs font-medium inline-flex items-center gap-1.5 w-fit border ${
                          isConnected
                            ? 'border-emerald-500 text-emerald-700 dark:text-emerald-400 bg-emerald-50/70 dark:bg-emerald-950/40'
                            : isQr
                            ? 'border-amber-500 text-amber-700 dark:text-amber-400 bg-amber-50/70 dark:bg-amber-950/40'
                            : 'border-slate-300 text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800'
                        }`}
                      >
                        {isConnected ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Conectada</span>
                          </>
                        ) : isQr ? (
                          <>
                            <QrCode className="w-3.5 h-3.5 text-amber-600" />
                            <span>Esperando escaneo QR</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-3.5 h-3.5 text-slate-400" />
                            <span>Desconectada</span>
                          </>
                        )}
                      </span>

                      {!isConnected && (
                        <button
                          type="button"
                          onClick={() => handleOpenQr(conn)}
                          className="text-xs font-bold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 flex items-center gap-1 hover:underline cursor-pointer"
                        >
                          <QrCode className="w-3.5 h-3.5" />
                          <span>{isQr ? 'Ver QR' : 'Cargar QR'}</span>
                        </button>
                      )}
                    </div>

                    {/* Departamentos asociados con sus colores oficiales */}
                    {(() => {
                      const assignedQueues = (conn.queues && conn.queues.length > 0)
                        ? conn.queues
                        : (conn.queueIds && conn.queueIds.length > 0)
                          ? queues.filter(q => conn.queueIds?.includes(q.id))
                          : [];
                      if (assignedQueues.length === 0) return null;
                      return (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {assignedQueues.map(q => {
                            const fullQueue = queues.find(item => item.id === q.id) || q;
                            const queueColor = fullQueue.color || q.color || '#3b82f6';
                            return (
                              <span
                                key={q.id}
                                className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-bold rounded-full text-white shadow-2xs"
                                style={{ backgroundColor: queueColor }}
                                title={`Departamento: ${q.name}`}
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-white/75 flex-shrink-0" />
                                <span className="truncate max-w-[140px]">{q.name}</span>
                              </span>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Barra de Progreso y Control de Sincronización en la Tarjeta */}
                  {conn.importOldMessagesStatus === 'importing' && (
                    <div className="w-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <RefreshCw className="w-3.5 h-3.5 text-amber-600 animate-spin flex-shrink-0" />
                          <span className="text-xs font-bold text-amber-900 dark:text-amber-200">
                            Sincronizando Historial
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleStopSync(conn)}
                          disabled={stoppingSyncIds.includes(conn.id)}
                          className="px-2.5 py-1 text-[11px] font-bold text-white bg-red-600 hover:bg-red-700 active:scale-95 rounded-lg shadow-xs transition-all cursor-pointer flex items-center gap-1 disabled:opacity-50"
                          title="Frenar sincronización de historial"
                        >
                          <span>⏹</span>
                          <span>{stoppingSyncIds.includes(conn.id) ? 'Frenando...' : 'Frenar'}</span>
                        </button>
                      </div>

                      {syncProgress[conn.id] && syncProgress[conn.id].total > 0 ? (
                        <div className="space-y-1">
                          <div className="w-full bg-amber-200 dark:bg-amber-900/60 h-2 rounded-full overflow-hidden">
                            <div
                              className="bg-amber-500 h-full rounded-full transition-all duration-300"
                              style={{ width: `${Math.min(100, Math.max(5, syncProgress[conn.id].percent))}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-amber-800 dark:text-amber-300 font-mono">
                            <span>{syncProgress[conn.id].current} de {syncProgress[conn.id].total} chats</span>
                            <span>{syncProgress[conn.id].percent}% ({syncProgress[conn.id].importedMessages} msgs)</span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-[11px] text-amber-700 dark:text-amber-400">
                          Recuperando paquetes de chats desde WhatsApp...
                        </div>
                      )}
                    </div>
                  )}

                  {/* Fila Inferior: Botones de Acción */}
                  <div className="flex items-center gap-2">
                    {!isConnected && (
                      <button
                        type="button"
                        onClick={() => handleOpenQr(conn)}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-all active:scale-95 cursor-pointer"
                      >
                        <QrCode className="w-4 h-4" />
                        <span>{isQr ? 'Escanear QR' : 'Cargar QR'}</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleOpenEdit(conn)}
                      className={`${
                        !isConnected ? 'w-auto' : 'w-full'
                      } bg-[#f0f2f5] hover:bg-[#e4e7eb] dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 text-xs font-semibold py-2 px-3.5 rounded-xl flex items-center justify-between gap-2 transition-colors cursor-pointer`}
                    >
                      <span>Editar</span>
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 3. MODAL "AGREGAR CONEXIÓN" (Idéntico a media_1789342242141.png)           */}
      {/* ========================================================================= */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-150">
            
            {/* Header del Modal */}
            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/25">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Agregar Conexión
                  </h3>
                  <p className="text-xs text-slate-500">
                    Elige por dónde atenderá tu equipo.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Grid de 9 Opciones de Conexión (Idéntico al screenshot) */}
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-3.5 max-h-[70vh] overflow-y-auto">
              
              {/* 1. WhatsApp QR Code (Activo) */}
              <div
                onClick={() => {
                  setShowAddModal(false);
                  setShowNewQrFlowModal(true);
                }}
                className="border border-slate-200 dark:border-slate-800 hover:border-emerald-500 dark:hover:border-emerald-500 rounded-2xl p-4 flex items-start gap-3.5 bg-slate-50/50 dark:bg-slate-850 hover:bg-emerald-50/30 dark:hover:bg-emerald-950/20 transition-all cursor-pointer group"
              >
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-100 group-hover:text-emerald-600 transition-colors">
                    WhatsApp QR Code
                  </h4>
                  <p className="text-[11px] leading-tight text-slate-500 dark:text-slate-400 mt-1">
                    Conexión vía QR Code. Simple y rápida de configurar.
                  </p>
                </div>
              </div>

              {/* 2. WhatsApp API Cloud */}
              <div
                onClick={() => toast.info('WhatsApp API Cloud (Meta Official): disponible para configurar')}
                className="border border-slate-200 dark:border-slate-800 hover:border-blue-500 dark:hover:border-blue-500 rounded-2xl p-4 flex items-start gap-3.5 bg-slate-50/50 dark:bg-slate-850 hover:bg-blue-50/30 dark:hover:bg-slate-800 transition-all cursor-pointer group"
              >
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-100 group-hover:text-blue-600 transition-colors">
                    WhatsApp API Cloud
                  </h4>
                  <p className="text-[11px] leading-tight text-slate-500 dark:text-slate-400 mt-1">
                    API oficial de Meta. Funciones avanzadas y mayor estabilidad.
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-500 self-center" />
              </div>

              {/* 3. WhatsApp API Coexistencia */}
              <div
                onClick={() => toast.info('WhatsApp Coexistencia: disponible para asociar con número Business')}
                className="border border-slate-200 dark:border-slate-800 hover:border-blue-500 dark:hover:border-blue-500 rounded-2xl p-4 flex items-start gap-3.5 bg-slate-50/50 dark:bg-slate-850 hover:bg-blue-50/30 dark:hover:bg-slate-800 transition-all cursor-pointer group"
              >
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-100 group-hover:text-blue-600 transition-colors">
                    WhatsApp API Coexistencia
                  </h4>
                  <p className="text-[11px] leading-tight text-slate-500 dark:text-slate-400 mt-1">
                    API oficial + WhatsApp Business en el celular. Ideal para quien ya usa la app.
                  </p>
                </div>
              </div>

              {/* 4. Facebook */}
              <div
                onClick={() => toast.info('Canal de Facebook Messenger listo para vincular')}
                className="border border-slate-200 dark:border-slate-800 hover:border-blue-600 rounded-2xl p-4 flex items-start gap-3.5 bg-slate-50/50 dark:bg-slate-850 hover:bg-blue-50/30 dark:hover:bg-slate-800 transition-all cursor-pointer group"
              >
                <div className="w-9 h-9 rounded-xl bg-blue-600/10 text-blue-600 flex items-center justify-center flex-shrink-0 font-bold text-base group-hover:scale-110 transition-transform">
                  f
                </div>
                <div>
                  <h4 className="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-100 group-hover:text-blue-600 transition-colors">
                    Facebook
                  </h4>
                  <p className="text-[11px] leading-tight text-slate-500 dark:text-slate-400 mt-1">
                    Recibe mensajes de tu página de Facebook en un solo lugar.
                  </p>
                </div>
              </div>

              {/* 5. Instagram */}
              <div
                onClick={() => toast.info('Canal de Instagram Direct listo para vincular')}
                className="border border-slate-200 dark:border-slate-800 hover:border-pink-500 rounded-2xl p-4 flex items-start gap-3.5 bg-slate-50/50 dark:bg-slate-850 hover:bg-pink-50/30 dark:hover:bg-slate-800 transition-all cursor-pointer group"
              >
                <div className="w-9 h-9 rounded-xl bg-pink-500/10 text-pink-600 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                  <Camera className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-100 group-hover:text-pink-600 transition-colors">
                    Instagram
                  </h4>
                  <p className="text-[11px] leading-tight text-slate-500 dark:text-slate-400 mt-1">
                    Conecta tu cuenta profesional para responder DMs con más agilidad.
                  </p>
                </div>
              </div>

              {/* 6. TikTok */}
              <div
                onClick={() => toast.info('Canal de TikTok Business listo para vincular')}
                className="border border-slate-200 dark:border-slate-800 hover:border-rose-500 rounded-2xl p-4 flex items-start gap-3.5 bg-slate-50/50 dark:bg-slate-850 hover:bg-rose-50/30 dark:hover:bg-slate-800 transition-all cursor-pointer group"
              >
                <div className="w-9 h-9 rounded-xl bg-rose-500/10 text-rose-600 flex items-center justify-center flex-shrink-0 font-bold text-sm group-hover:scale-110 transition-transform">
                  ♪
                </div>
                <div>
                  <h4 className="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-100 group-hover:text-rose-600 transition-colors">
                    TikTok
                  </h4>
                  <p className="text-[11px] leading-tight text-slate-500 dark:text-slate-400 mt-1">
                    Centraliza contactos e interacciones de tu cuenta TikTok for Business.
                  </p>
                </div>
              </div>

              {/* 7. Telegram */}
              <div
                onClick={() => toast.info('Canal de Telegram Bot listo para vincular')}
                className="border border-slate-200 dark:border-slate-800 hover:border-sky-500 rounded-2xl p-4 flex items-start gap-3.5 bg-slate-50/50 dark:bg-slate-850 hover:bg-sky-50/30 dark:hover:bg-slate-800 transition-all cursor-pointer group"
              >
                <div className="w-9 h-9 rounded-xl bg-sky-500/10 text-sky-500 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                  <Send className="w-4 h-4 -rotate-45" />
                </div>
                <div>
                  <h4 className="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-100 group-hover:text-sky-500 transition-colors">
                    Telegram
                  </h4>
                  <p className="text-[11px] leading-tight text-slate-500 dark:text-slate-400 mt-1">
                    Conecta un bot de Telegram creado en @BotFather y atiende desde aquí.
                  </p>
                </div>
              </div>

              {/* 8. Web Chat */}
              <div
                onClick={() => toast.info('Widget de Web Chat para tu sitio web')}
                className="border border-slate-200 dark:border-slate-800 hover:border-indigo-500 rounded-2xl p-4 flex items-start gap-3.5 bg-slate-50/50 dark:bg-slate-850 hover:bg-indigo-50/30 dark:hover:bg-slate-800 transition-all cursor-pointer group"
              >
                <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-100 group-hover:text-indigo-600 transition-colors">
                    Web Chat
                  </h4>
                  <p className="text-[11px] leading-tight text-slate-500 dark:text-slate-400 mt-1">
                    Chat para tu sitio. Captura leads y ofrece soporte en tiempo real.
                  </p>
                </div>
              </div>

              {/* 9. Sandbox */}
              <div
                onClick={() => toast.info('Entorno de pruebas Sandbox')}
                className="border border-slate-200 dark:border-slate-800 hover:border-purple-500 rounded-2xl p-4 flex items-start gap-3.5 bg-slate-50/50 dark:bg-slate-850 hover:bg-purple-50/30 dark:hover:bg-slate-800 transition-all cursor-pointer group"
              >
                <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-600 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                  <Share2 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-100 group-hover:text-purple-600 transition-colors">
                    Sandbox
                  </h4>
                  <p className="text-[11px] leading-tight text-slate-500 dark:text-slate-400 mt-1">
                    Entorno de pruebas. Experimenta sin conectar tu WhatsApp.
                  </p>
                </div>
              </div>

            </div>

            {/* Footer del Modal */}
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                Cancelar
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. MODAL "NUEVA CONEXIÓN QR" (Paso intermedio al elegir WhatsApp QR Code)  */}
      {/* ========================================================================= */}
      {showNewQrFlowModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md overflow-hidden">
            
            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500 text-white flex items-center justify-center">
                  <Smartphone className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Nueva Línea WhatsApp QR
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowNewQrFlowModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateNewQrConnection} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Nombre de la Línea *
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ej: Línea Ventas 2, Depósito, Atención..."
                  required
                  className="w-full px-3.5 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Departamento Inicial (Opcional)
                </label>
                <select
                  value={newQueueId}
                  onChange={(e) => setNewQueueId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full px-3.5 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Sin departamento asignado --</option>
                  {queues.map(q => (
                    <option key={q.id} value={q.id}>
                      {q.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Mensaje de Saludo Automático
                </label>
                <textarea
                  value={newGreeting}
                  onChange={(e) => setNewGreeting(e.target.value)}
                  rows={3}
                  className="w-full px-3.5 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              {/* Opción de Sincronización de Historial */}
              <div className="p-3.5 rounded-2xl border border-blue-200 dark:border-blue-800/60 bg-blue-50/40 dark:bg-blue-900/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <span>📥</span> Importar Historial de Conversaciones
                    </h5>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                      Recupera las conversaciones previas de WhatsApp sin disparar bots ni mensajes de bienvenida.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNewImportOldMessages(!newImportOldMessages)}
                    className={`w-11 h-6 rounded-full transition-colors flex items-center px-0.5 cursor-pointer flex-shrink-0 ${
                      newImportOldMessages ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full bg-white transition-transform ${
                        newImportOldMessages ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {newImportOldMessages && (
                  <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-blue-100 dark:border-blue-800/40">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Días de Historial
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="365"
                        value={newImportOldMessagesDays}
                        onChange={(e) => setNewImportOldMessagesDays(Math.max(1, Number(e.target.value) || 30))}
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-[10px] text-slate-400">Por ej. 30 días (1 mes)</span>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Días Sin Respuesta (En espera)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="30"
                        value={newImportRecentUnreadDays}
                        onChange={(e) => setNewImportRecentUnreadDays(Math.max(1, Number(e.target.value) || 2))}
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-[10px] text-slate-400">Últimos días → Pendientes</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewQrFlowModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isCreatingNew}
                  className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-md shadow-blue-500/20 active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  {isCreatingNew ? 'Creando...' : 'Crear y Vincular QR'}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. MODAL "EDITA CONEXIÓN" (Idéntico a media_1789342337146.png & ...345784)   */}
      {/* ========================================================================= */}
      {showEditModal && selectedConnection && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 z-50 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-5xl overflow-hidden flex flex-col max-h-[92vh]">
            
            {/* Header del Modal */}
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                      Edita Conexión
                    </h3>
                    <Copy
                      className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                      onClick={() => {
                        navigator.clipboard.writeText(selectedConnection.name);
                        toast.success('Nombre copiado al portapapeles');
                      }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Actualice las configuraciones de {selectedConnection.name}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {selectedConnection.status !== 'CONNECTED' && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowEditModal(false);
                      handleOpenQr(selectedConnection);
                    }}
                    className="py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all active:scale-95 cursor-pointer"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    <span>Cargar / Ver QR</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Split Layout: Formulario a la Izquierda (60%) + Vista Previa Celular a la Derecha (40%) */}
            <div className="flex-1 overflow-y-auto flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-slate-100 dark:divide-slate-800">
              
              {/* LADO IZQUIERDO: Formulario de Configuración */}
              <form id="edit-connection-form" onSubmit={handleSaveEdit} className="flex-1 p-6 space-y-5">
                
                {/* Nombre */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Nombre <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                    className="w-full px-3.5 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Mensaje de Saludo con Barra de Formato */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Mensaje de saludo
                  </label>
                  <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-800 focus-within:ring-2 focus-within:ring-blue-500">
                    <textarea
                      value={editGreeting}
                      onChange={(e) => setEditGreeting(e.target.value)}
                      placeholder="¡Hola! 👋 ¿En qué podemos ayudarte hoy?"
                      rows={3}
                      className="w-full p-3 text-xs bg-transparent text-slate-800 dark:text-slate-100 focus:outline-none resize-none"
                    />
                    <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-850 border-t border-slate-100 dark:border-slate-700/60 flex items-center gap-3 text-slate-500 text-xs select-none">
                      <span className="font-bold hover:text-slate-800 cursor-pointer" onClick={() => setEditGreeting(prev => prev + '**')}>B</span>
                      <span className="italic hover:text-slate-800 cursor-pointer" onClick={() => setEditGreeting(prev => prev + '__')}>I</span>
                      <span className="underline hover:text-slate-800 cursor-pointer" onClick={() => setEditGreeting(prev => prev + '~~')}>U</span>
                      <Smile className="w-3.5 h-3.5 hover:text-slate-800 cursor-pointer" onClick={() => setEditGreeting(prev => prev + '👋')} />
                      <Paperclip className="w-3.5 h-3.5 hover:text-slate-800 cursor-pointer" />
                      <span className="font-mono text-[10px] hover:text-slate-800 cursor-pointer" onClick={() => setEditGreeting(prev => prev + '{{name}}')}>&#123; &#125;</span>
                      <Globe className="w-3.5 h-3.5 hover:text-slate-800 cursor-pointer" />
                    </div>
                  </div>
                </div>

                {/* Departamentos */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Departamentos
                  </label>
                  <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-2 bg-white dark:bg-slate-800 flex flex-wrap items-center gap-1.5 min-h-[42px]">
                    {editQueueIds.map(qId => {
                      const q = queues.find(item => item.id === qId);
                      if (!q) return null;
                      return (
                        <span
                          key={q.id}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                        >
                          {q.name}
                          <X
                            className="w-3 h-3 hover:text-emerald-900 cursor-pointer"
                            onClick={() => toggleQueue(q.id)}
                          />
                        </span>
                      );
                    })}

                    {/* Selector de departamentos disponibles */}
                    <select
                      value=""
                      onChange={(e) => {
                        if (e.target.value) toggleQueue(Number(e.target.value));
                      }}
                      className="text-xs text-slate-500 bg-transparent focus:outline-none p-1 cursor-pointer"
                    >
                      <option value="">+ Agregar departamento...</option>
                      {queues
                        .filter(q => !editQueueIds.includes(q.id))
                        .map(q => (
                          <option key={q.id} value={q.id}>
                            {q.name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Con un único departamento, el contacto va directo a él y el menú no se envía.
                  </p>
                </div>

                {/* Mensaje de Despedida */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Mensaje de despedida
                  </label>
                  <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-800 focus-within:ring-2 focus-within:ring-blue-500">
                    <textarea
                      value={editFarewell}
                      onChange={(e) => setEditFarewell(e.target.value)}
                      placeholder="¡Gracias por contactarnos! Siempre estamos aquí. 👋"
                      rows={3}
                      className="w-full p-3 text-xs bg-transparent text-slate-800 dark:text-slate-100 focus:outline-none resize-none"
                    />
                    <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-850 border-t border-slate-100 dark:border-slate-700/60 flex items-center gap-3 text-slate-500 text-xs select-none">
                      <span className="font-bold hover:text-slate-800 cursor-pointer" onClick={() => setEditFarewell(prev => prev + '**')}>B</span>
                      <span className="italic hover:text-slate-800 cursor-pointer" onClick={() => setEditFarewell(prev => prev + '__')}>I</span>
                      <span className="underline hover:text-slate-800 cursor-pointer" onClick={() => setEditFarewell(prev => prev + '~~')}>U</span>
                      <Smile className="w-3.5 h-3.5 hover:text-slate-800 cursor-pointer" onClick={() => setEditFarewell(prev => prev + '👋')} />
                      <Paperclip className="w-3.5 h-3.5 hover:text-slate-800 cursor-pointer" />
                      <span className="font-mono text-[10px] hover:text-slate-800 cursor-pointer" onClick={() => setEditFarewell(prev => prev + '{{name}}')}>&#123; &#125;</span>
                      <Globe className="w-3.5 h-3.5 hover:text-slate-800 cursor-pointer" />
                    </div>
                  </div>
                </div>

                {/* Fila Doble: Período de Tolerancia + Tipo de Visualización */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                      Período de tolerancia para reapertura
                      <Info className="w-3.5 h-3.5 text-slate-400" />
                    </label>
                    <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 px-3 py-2">
                      <input
                        type="number"
                        value={editToleranceMin}
                        onChange={(e) => setEditToleranceMin(Number(e.target.value))}
                        className="w-full text-xs bg-transparent text-slate-800 dark:text-slate-100 focus:outline-none"
                      />
                      <span className="text-xs text-slate-400 ml-2">min</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                      <span>Tipo de visualización de las opciones</span>
                      <span className="text-blue-500 hover:underline cursor-pointer text-[10px]">Aprende más</span>
                    </label>
                    <select
                      value={editDisplayType}
                      onChange={(e) => setEditDisplayType(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none"
                    >
                      <option value="Números">Números</option>
                      <option value="Botones">Botones</option>
                      <option value="Listas">Listas</option>
                    </select>
                  </div>
                </div>

                {/* Card: Volver al último agente */}
                <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-850 flex items-center justify-between gap-4">
                  <div>
                    <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Volver al último agente
                    </h5>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                      Si el contacto vuelve dentro del período de tolerancia y el agente está en línea, el chat se reabre directamente con él, sin pasar por el chatbot.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditReturnToAgent(!editReturnToAgent)}
                    className={`w-11 h-6 rounded-full transition-colors flex items-center px-0.5 cursor-pointer flex-shrink-0 ${
                      editReturnToAgent ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full bg-white transition-transform ${
                        editReturnToAgent ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Card: Sincronización de Historial de Chats */}
                <div className="p-4 rounded-2xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/30 dark:bg-blue-950/20 space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base">📥</span>
                        <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          Sincronización de Historial de Conversaciones
                        </h5>
                        {selectedConnection.importOldMessagesStatus && selectedConnection.importOldMessagesStatus !== 'idle' && (
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                            selectedConnection.importOldMessagesStatus === 'importing'
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 animate-pulse'
                              : selectedConnection.importOldMessagesStatus === 'completed'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                              : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                          }`}>
                            {selectedConnection.importOldMessagesStatus === 'importing' ? 'Sincronizando...' : selectedConnection.importOldMessagesStatus === 'completed' ? 'Completado' : 'Error'}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                        Levanta las conversaciones del WhatsApp vinculado. Las conversaciones antiguas o respondidas ingresan como <b>Resueltas</b>; aquellas con mensajes del cliente sin responder en los últimos días ingresan como <b>En espera</b>. No dispara chatbots ni mensajes de bienvenida.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditImportOldMessages(!editImportOldMessages)}
                      className={`w-11 h-6 rounded-full transition-colors flex items-center px-0.5 cursor-pointer flex-shrink-0 ${
                        editImportOldMessages ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-full bg-white transition-transform ${
                          editImportOldMessages ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {editImportOldMessages && (
                    <div className="pt-3 border-t border-blue-100 dark:border-blue-900/40 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Ventana de Historial a Importar (Días)
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="365"
                            value={editImportOldMessagesDays}
                            onChange={(e) => setEditImportOldMessagesDays(Math.max(1, Number(e.target.value) || 30))}
                            className="w-full px-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <p className="text-[10px] text-slate-400 mt-1">Por defecto: 30 días (1 mes).</p>
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Días para consideración "En Espera"
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="30"
                            value={editImportRecentUnreadDays}
                            onChange={(e) => setEditImportRecentUnreadDays(Math.max(1, Number(e.target.value) || 2))}
                            className="w-full px-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <p className="text-[10px] text-slate-400 mt-1">Si el cliente escribió en este lapso y no tuvo respuesta, entra En Espera.</p>
                        </div>
                      </div>

                      {selectedConnection.importOldMessagesStatus === 'importing' ? (
                        <div className="w-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <RefreshCw className="w-3.5 h-3.5 text-amber-600 animate-spin" />
                              <span className="text-xs font-bold text-amber-900 dark:text-amber-200">
                                Sincronización en curso
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleStopSync(selectedConnection)}
                              disabled={stoppingSyncIds.includes(selectedConnection.id)}
                              className="px-3 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-95"
                            >
                              <span>⏹</span>
                              <span>{stoppingSyncIds.includes(selectedConnection.id) ? 'Frenando...' : 'Frenar Sincronización'}</span>
                            </button>
                          </div>

                          {syncProgress[selectedConnection.id] && syncProgress[selectedConnection.id].total > 0 ? (
                            <div className="space-y-1">
                              <div className="w-full bg-amber-200 dark:bg-amber-900/60 h-2 rounded-full overflow-hidden">
                                <div
                                  className="bg-amber-500 h-full rounded-full transition-all duration-300"
                                  style={{ width: `${Math.min(100, Math.max(5, syncProgress[selectedConnection.id].percent))}%` }}
                                />
                              </div>
                              <div className="flex items-center justify-between text-[10px] text-amber-800 dark:text-amber-300 font-mono">
                                <span>{syncProgress[selectedConnection.id].current} / {syncProgress[selectedConnection.id].total} chats</span>
                                <span>{syncProgress[selectedConnection.id].percent}% ({syncProgress[selectedConnection.id].importedMessages} msgs)</span>
                              </div>
                            </div>
                          ) : (
                            <p className="text-[11px] text-amber-700 dark:text-amber-400">
                              Procesando conversaciones recibidas de WhatsApp...
                            </p>
                          )}
                        </div>
                      ) : selectedConnection.status === 'CONNECTED' ? (
                        <div className="flex items-center justify-between pt-2">
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            ¿Quieres forzar la sincronización ahora mismo?
                          </span>
                          <button
                            type="button"
                            onClick={() => handleSyncHistory(selectedConnection)}
                            className="px-3 py-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 border border-blue-300 dark:border-blue-700 rounded-xl transition-all cursor-pointer"
                          >
                            ⚡ Sincronizar Historial Ahora
                          </button>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>

              </form>

              {/* LADO DERECHO: VISTA PREVIA EN VIVO DE WHATSAPP (Idéntico a media_1789342337146.png) */}
              <div className="w-full lg:w-[380px] p-6 flex flex-col items-center bg-slate-50/50 dark:bg-slate-950/40">
                <div className="w-full flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">
                  <span className="flex items-center gap-1.5">
                    👁 VISTA PREVIA
                  </span>
                </div>

                {/* Mockup Smartphone WhatsApp */}
                <div className="w-full max-w-[280px] rounded-3xl overflow-hidden shadow-2xl border-4 border-slate-800 dark:border-slate-700 bg-[#efeae2] dark:bg-slate-900 flex flex-col text-slate-800 select-none">
                  
                  {/* WhatsApp Top Header Bar */}
                  <div className="bg-[#075e54] text-white px-3 py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2 truncate">
                      <div className="w-7 h-7 rounded-full bg-slate-300 text-slate-700 flex items-center justify-center font-bold text-xs flex-shrink-0">
                        {editName.charAt(0).toUpperCase() || 'W'}
                      </div>
                      <div className="truncate">
                        <h6 className="text-xs font-bold truncate leading-tight">
                          {editName || 'Línea de WhatsApp'}
                        </h6>
                        <span className="text-[9px] text-emerald-200 block leading-tight">
                          en línea
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 text-white/90">
                      <Camera className="w-3.5 h-3.5" />
                      <Phone className="w-3.5 h-3.5" />
                    </div>
                  </div>

                  {/* Chat Area con Fondo Doodle */}
                  <div className="p-3 flex flex-col gap-2 min-h-[260px] max-h-[300px] overflow-y-auto bg-gradient-to-b from-[#efeae2] to-[#e6dfd5] dark:from-slate-900 dark:to-slate-950 text-xs">
                    
                    {/* Fecha Hoy */}
                    <div className="self-center bg-white/80 dark:bg-slate-800/80 px-2 py-0.5 rounded-md text-[9px] font-medium text-slate-600 dark:text-slate-300 shadow-xs">
                      Hoy
                    </div>

                    {/* Burbuja entrante cliente */}
                    <div className="self-start max-w-[85%] bg-white dark:bg-slate-800 rounded-xl rounded-tl-none p-2 shadow-xs text-[11px] text-slate-800 dark:text-slate-100 relative">
                      ¡Hola, buenas tardes!
                      <span className="block text-[8px] text-slate-400 text-right mt-0.5">20:32</span>
                    </div>

                    {/* Burbuja saliente automática (Preview en Vivo) */}
                    <div className="self-end max-w-[85%] bg-[#dcf8c6] dark:bg-emerald-950/80 rounded-xl rounded-tr-none p-2 shadow-xs text-[11px] text-slate-900 dark:text-slate-100 relative">
                      {editGreeting.trim() ? editGreeting : 'Tu mensaje aparecerá aquí.'}
                      <span className="block text-[8px] text-slate-500 dark:text-slate-400 text-right mt-0.5">20:32</span>
                    </div>

                  </div>

                </div>

                <p className="text-[10px] text-slate-400 text-center mt-3 max-w-[260px] leading-tight">
                  Las variables aparecen como marcadores; el valor real se sustituye en el momento del envío.
                </p>

              </div>

            </div>

            {/* Footer del Modal con Borrar, Cancelar y Guardar */}
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between flex-shrink-0 bg-white dark:bg-slate-900">
              <button
                type="button"
                onClick={() => handleDeleteConnection(selectedConnection.id)}
                className="text-xs font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Borrar</span>
              </button>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  form="edit-connection-form"
                  disabled={isSaving}
                  className="px-6 py-2.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-full transition-all shadow-md shadow-blue-500/25 active:scale-95 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{isSaving ? 'Guardando...' : 'Guardar'}</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. MODAL VISUALIZADOR DE CÓDIGO QR PARA ESCANEO CON EL CELULAR              */}
      {/* ========================================================================= */}
      {showQrModal && selectedConnection && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-sm overflow-hidden p-6 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center mb-3">
              <QrCode className="w-6 h-6" />
            </div>

            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Vincular WhatsApp - {selectedConnection.name}
            </h3>
            <p className="text-xs text-slate-500 mt-1 mb-5">
              Escanea este código desde tu teléfono en <br />
              <b>WhatsApp &gt; Dispositivos vinculados</b>
            </p>

            {/* Pasos de vinculación */}
            <div className="w-full text-left bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-3 mb-4 text-[11px] text-slate-600 dark:text-slate-300 space-y-1">
              <p className="font-semibold text-slate-800 dark:text-slate-200 mb-1">Pasos para conectar:</p>
              <p>1. Abrí WhatsApp en tu teléfono celular.</p>
              <p>2. Tocá en <b>Ajustes</b> o <b>Más opciones</b> &gt; <b>Dispositivos vinculados</b>.</p>
              <p>3. Tocá en <b>Vincular un dispositivo</b> y apuntá con tu cámara a este código.</p>
            </div>

            {/* Código QR */}
            <div className="p-4 bg-white rounded-2xl shadow-inner border border-slate-200 mb-4 flex items-center justify-center min-w-[230px] min-h-[230px]">
              {selectedConnection.qrcode ? (
                <div className="flex flex-col items-center">
                  <QRCodeSVG
                    value={selectedConnection.qrcode}
                    size={210}
                    level="M"
                  />
                  {isRefreshingQr && (
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-2 font-semibold flex items-center gap-1 animate-pulse">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      Actualizando código QR...
                    </span>
                  )}
                </div>
              ) : (
                <div className="w-[210px] h-[210px] flex flex-col items-center justify-center text-slate-400 text-xs gap-2">
                  <RefreshCw className="w-7 h-7 animate-spin text-emerald-500" />
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    {isRefreshingQr ? 'Generando código QR...' : 'Iniciando WhatsApp...'}
                  </span>
                  <span className="text-[10px] text-slate-400 text-center px-3">
                    Conectando con el servidor Baileys. El código aparecerá en unos instantes.
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 w-full">
              <button
                type="button"
                onClick={handleRefreshQr}
                disabled={isRefreshingQr}
                className="flex-1 py-2.5 px-3 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold rounded-xl transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingQr ? 'animate-spin' : ''}`} />
                <span>Generar nuevo QR</span>
              </button>
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="py-2.5 px-5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Confirmar asignación de conexión (Idéntico al screenshot) */}
      {showAssignModal && connectionToAssign && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-[28px] max-w-[480px] w-full p-7 shadow-2xl border border-slate-100 dark:border-slate-800 animate-in zoom-in-95 duration-200">
            {/* Cabecera del modal */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                Confirmar asignación
              </h3>
              <button
                type="button"
                onClick={() => {
                  if (!isAssigning) {
                    setShowAssignModal(false);
                    setConnectionToAssign(null);
                  }
                }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-full transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Texto explicativo */}
            <p className="text-[15px] leading-relaxed text-slate-600 dark:text-slate-300 mb-8 font-normal">
              Esta acción asignará la conexión seleccionada a todos los chats sin conexión compatibles con este canal. ¿Deseas continuar?
            </p>

            {/* Acciones */}
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={isAssigning}
                onClick={() => {
                  setShowAssignModal(false);
                  setConnectionToAssign(null);
                }}
                className="px-5 py-2.5 text-[15px] font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50/70 dark:hover:bg-blue-950/30 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isAssigning}
                onClick={handleConfirmAssign}
                className="px-6 py-2.5 text-[15px] font-semibold text-white bg-[#3b66ff] hover:bg-[#2b56ef] active:scale-98 rounded-[22px] shadow-sm transition-all cursor-pointer disabled:opacity-60 flex items-center gap-2"
              >
                {isAssigning && <RefreshCw className="w-4 h-4 animate-spin" />}
                <span>Ok</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
