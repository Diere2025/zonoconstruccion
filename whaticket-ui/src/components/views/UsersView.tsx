import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../services/api';
import { useChatStore } from '../../store/chatStore';
import { User, Queue } from '../../types';
import { 
  Users, 
  Shield, 
  Check, 
  X, 
  Search, 
  Plus, 
  Pencil, 
  Trash2, 
  Lock, 
  Phone, 
  Smartphone, 
  Tag as TagIcon, 
  Layers, 
  Zap, 
  CheckCheck, 
  AlertTriangle, 
  Grid, 
  List, 
  ChevronDown, 
  MessageSquare,
  KeyRound,
  Eye,
  SlidersHorizontal,
  Sparkles
} from 'lucide-react';
import { toast } from 'sonner';

// Definición de estructura de permisos
interface PermissionCategory {
  id: string;
  label: string;
  icon: React.ElementType;
  hasMasterAccessToggle?: boolean;
  permissions: Array<{
    id: string;
    label: string;
    locked?: boolean;
    warning?: boolean;
  }>;
}

const PERMISSION_DEFINITIONS: PermissionCategory[] = [
  {
    id: 'chats',
    label: 'Chats',
    icon: MessageSquare,
    hasMasterAccessToggle: false,
    permissions: [
      { id: 'chats_create', label: 'Crear', locked: true },
      { id: 'chats_resolve', label: 'Resolver', locked: true },
      { id: 'chats_transfer', label: 'Transferir', locked: true },
      { id: 'chats_snooze', label: 'Posponer' },
      { id: 'chats_keep_with_me', label: 'Mantener conmigo' },
      { id: 'chats_pause_autoclose', label: 'Pausar cierre automático' },
      { id: 'chats_view_pending', label: 'Ver en espera' },
      { id: 'chats_accept_pending', label: 'Aceptar en espera' },
      { id: 'chats_view_all', label: 'Ver todos' },
      { id: 'chats_bulk_actions', label: 'Acciones de chat masivas' },
      { id: 'chats_delete', label: 'Eliminar' },
      { id: 'chats_delete_permanent', label: 'Borrar mensajes permanentemente' },
      { id: 'chats_export', label: 'Exportar mensajes' },
    ],
  },
  {
    id: 'connections',
    label: 'Conexiones',
    icon: Smartphone,
    hasMasterAccessToggle: true,
    permissions: [
      { id: 'conn_create_edit', label: 'Crear y editar' },
      { id: 'conn_restart', label: 'Reiniciar' },
      { id: 'conn_delete', label: 'Eliminar' },
    ],
  },
  {
    id: 'contacts',
    label: 'Contactos',
    icon: Users,
    hasMasterAccessToggle: false,
    permissions: [
      { id: 'contacts_create', label: 'Crear' },
      { id: 'contacts_edit', label: 'Editar' },
      { id: 'contacts_delete', label: 'Eliminar' },
      { id: 'contacts_bulk', label: 'Acciones de contacto masivas', warning: true },
      { id: 'contacts_block', label: 'Bloquear' },
      { id: 'contacts_import', label: 'Importar' },
      { id: 'contacts_export', label: 'Exportar' },
    ],
  },
  {
    id: 'tags',
    label: 'Etiquetas',
    icon: TagIcon,
    hasMasterAccessToggle: true,
    permissions: [
      { id: 'tags_create', label: 'Crear' },
      { id: 'tags_edit', label: 'Editar' },
      { id: 'tags_delete', label: 'Eliminar' },
    ],
  },
  {
    id: 'departments',
    label: 'Departamentos',
    icon: Layers,
    hasMasterAccessToggle: true,
    permissions: [
      { id: 'dept_create_edit', label: 'Crear y editar' },
      { id: 'dept_users_assign', label: 'Editar usuarios y asignación', locked: true },
      { id: 'dept_hours', label: 'Editar horario de atención', locked: true },
      { id: 'dept_delete', label: 'Eliminar' },
    ],
  },
  {
    id: 'quick_messages',
    label: 'Respuestas Rápidas',
    icon: Zap,
    hasMasterAccessToggle: true,
    permissions: [
      { id: 'qm_create_edit', label: 'Crear y editar' },
      { id: 'qm_edit_departments', label: 'Editar departamentos' },
      { id: 'qm_delete', label: 'Eliminar' },
    ],
  },
  {
    id: 'team',
    label: 'Equipo y Perfiles',
    icon: Users,
    hasMasterAccessToggle: true,
    permissions: [
      { id: 'team_create', label: 'Crear usuario' },
      { id: 'team_edit', label: 'Editar usuario' },
      { id: 'team_edit_profile', label: 'Editar perfil y permisos' },
      { id: 'team_deactivate_2fa', label: 'Desactivar 2FA de usuarios' },
      { id: 'team_delete', label: 'Eliminar usuario' },
    ],
  },
  {
    id: 'settings',
    label: 'Configuración',
    icon: KeyRound,
    hasMasterAccessToggle: true,
    permissions: [
      { id: 'settings_auto_lang', label: 'Idioma de mensajes automáticos' },
      { id: 'settings_timezone', label: 'Zona horaria' },
      { id: 'settings_require_2fa', label: 'Exigir 2FA para toda la empresa' },
      { id: 'settings_view_hidden_data', label: 'Ver datos de contacto ocultos' },
    ],
  },
];

interface ProfileConfig {
  id: string;
  name: string;
  description: string;
  userNames: string[];
  permissions: Record<string, boolean>;
  masterAccess: Record<string, boolean>;
}

const DEFAULT_PROFILES: ProfileConfig[] = [
  {
    id: 'admin',
    name: 'Admin',
    description: 'Acceso total a la plataforma',
    userNames: ['Diego'],
    masterAccess: {
      connections: true,
      tags: true,
      departments: true,
      quick_messages: true,
    },
    permissions: {
      chats_create: true,
      chats_resolve: true,
      chats_transfer: true,
      chats_snooze: true,
      chats_keep_with_me: true,
      chats_pause_autoclose: true,
      chats_view_pending: true,
      chats_accept_pending: true,
      chats_view_all: true,
      chats_bulk_actions: true,
      chats_delete: true,
      chats_delete_permanent: true,
      chats_export: true,
      calls_answer: true,
      calls_start: true,
      conn_create_edit: true,
      conn_restart: true,
      conn_delete: true,
      contacts_create: true,
      contacts_edit: true,
      contacts_delete: true,
      contacts_bulk: true,
      contacts_block: true,
      contacts_import: true,
      contacts_export: true,
      tags_create: true,
      tags_edit: true,
      tags_delete: true,
      dept_create_edit: true,
      dept_assign: true,
      dept_delete: true,
      qm_create_edit: true,
      qm_global: true,
      qm_delete: true,
    },
  },
  {
    id: 'supervisor',
    name: 'Supervisor',
    description: 'Gestión de conversaciones y supervisión de operadores',
    userNames: ['Jazmín', 'Ludmila', 'Matías'],
    masterAccess: {
      connections: false,
      tags: true,
      departments: true,
      quick_messages: true,
    },
    permissions: {
      chats_create: true,
      chats_resolve: true,
      chats_transfer: true,
      chats_snooze: true,
      chats_keep_with_me: true,
      chats_pause_autoclose: true,
      chats_view_pending: true,
      chats_accept_pending: true,
      chats_view_all: true,
      chats_bulk_actions: false,
      chats_delete: false,
      chats_delete_permanent: false,
      chats_export: false,
      calls_answer: true,
      calls_start: true,
      conn_create_edit: false,
      conn_restart: false,
      conn_delete: false,
      contacts_create: true,
      contacts_edit: true,
      contacts_delete: false,
      contacts_bulk: false,
      contacts_block: false,
      contacts_import: false,
      contacts_export: true,
      tags_create: true,
      tags_edit: true,
      tags_delete: true,
      dept_create_edit: true,
      dept_assign: true,
      dept_delete: false,
      qm_create_edit: true,
      qm_global: true,
      qm_delete: false,
    },
  },
  {
    id: 'operador',
    name: 'Operador',
    description: 'Atención de clientes y respuesta de mensajes',
    userNames: [],
    masterAccess: {
      connections: false,
      tags: false,
      departments: false,
      quick_messages: false,
    },
    permissions: {
      chats_create: true,
      chats_resolve: true,
      chats_transfer: true,
      chats_snooze: true,
      chats_keep_with_me: true,
      chats_pause_autoclose: false,
      chats_view_pending: true,
      chats_accept_pending: true,
      chats_view_all: false,
      chats_bulk_actions: false,
      chats_delete: false,
      chats_delete_permanent: false,
      chats_export: false,
      calls_answer: true,
      calls_start: false,
      conn_create_edit: false,
      conn_restart: false,
      conn_delete: false,
      contacts_create: true,
      contacts_edit: true,
      contacts_delete: false,
      contacts_bulk: false,
      contacts_block: false,
      contacts_import: false,
      contacts_export: false,
      tags_create: false,
      tags_edit: false,
      tags_delete: false,
      dept_create_edit: false,
      dept_assign: false,
      dept_delete: false,
      qm_create_edit: false,
      qm_global: false,
      qm_delete: false,
    },
  },
];

export const UsersView: React.FC = () => {
  const { queues, fetchQueues } = useChatStore();

  // Estados de vista principal
  const [activeTab, setActiveTab] = useState<'users' | 'profiles'>('users');
  const [searchQuery, setSearchQuery] = useState('');
  const [profileFilter, setProfileFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  // Datos
  const [usersList, setUsersList] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [profiles, setProfiles] = useState<ProfileConfig[]>(() => {
    const saved = localStorage.getItem('whaticket_profiles_config');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {}
    }
    return DEFAULT_PROFILES;
  });

  // Modales
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [activeProfile, setActiveProfile] = useState<ProfileConfig | null>(null);
  const [activePermissionCatId, setActivePermissionCatId] = useState<string>('chats');

  // Formulario Usuario
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [userProfile, setUserProfile] = useState('user');
  const [userQueueIds, setUserQueueIds] = useState<number[]>([]);
  const [isSavingUser, setIsSavingUser] = useState(false);

  // Formulario Perfil
  const [profileName, setProfileName] = useState('');
  const [profileDesc, setProfileDesc] = useState('');
  const [profileUsers, setProfileUsers] = useState<string[]>([]);
  const [profilePerms, setProfilePerms] = useState<Record<string, boolean>>({});
  const [profileMasterAccess, setProfileMasterAccess] = useState<Record<string, boolean>>({});

  // Cargar usuarios desde la API
  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const { data } = await api.get('/users', {
        params: { pageNumber: 1, searchParam: '' }
      });
      setUsersList(Array.isArray(data?.users) ? data.users : Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error('Error al cargar usuarios:', err);
      const msg = err.response?.data?.error || err.response?.data?.message || 'Error al cargar la lista de usuarios';
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchQueues();
  }, []);

  // Guardar perfiles en localStorage
  const saveProfiles = (newProfiles: ProfileConfig[]) => {
    setProfiles(newProfiles);
    localStorage.setItem('whaticket_profiles_config', JSON.stringify(newProfiles));
  };

  // Abrir modal de usuario
  const handleOpenUserModal = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setUserName(user.name);
      setUserEmail(user.email);
      setUserPassword('');
      setUserProfile(user.profile);
      const qIds = user.queues?.map((q) => q.id) || [];
      setUserQueueIds(qIds);
    } else {
      setEditingUser(null);
      setUserName('');
      setUserEmail('');
      setUserPassword('');
      setUserProfile('user');
      setUserQueueIds([]);
    }
    setShowUserModal(true);
  };

  // Guardar usuario
  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userName.trim() || !userEmail.trim()) {
      toast.error('Nombre y correo son obligatorios');
      return;
    }
    if (!editingUser && !userPassword) {
      toast.error('La contraseña es requerida para nuevos usuarios');
      return;
    }

    setIsSavingUser(true);
    try {
      const payload: Record<string, any> = {
        name: userName.trim(),
        email: userEmail.trim(),
        profile: userProfile,
        queueIds: userQueueIds,
      };
      if (userPassword) {
        payload.password = userPassword;
      }

      if (editingUser) {
        await api.put(`/users/${editingUser.id}`, payload);
        toast.success('Usuario actualizado correctamente');
      } else {
        await api.post('/users', payload);
        toast.success('Usuario creado exitosamente');
      }

      setShowUserModal(false);
      fetchUsers();
    } catch (err: any) {
      console.error('Error al guardar usuario:', err);
      toast.error(err.response?.data?.message || 'Error al procesar usuario');
    } finally {
      setIsSavingUser(false);
    }
  };

  // Eliminar usuario
  const handleDeleteUser = async (user: User) => {
    if (!window.confirm(`¿Estás seguro de que deseas eliminar al usuario ${user.name}?`)) return;

    try {
      await api.delete(`/users/${user.id}`);
      toast.success('Usuario eliminado');
      fetchUsers();
    } catch (err: any) {
      console.error('Error al eliminar usuario:', err);
      toast.error(err.response?.data?.message || 'Error al eliminar usuario');
    }
  };

  // Abrir modal de perfil
  const handleOpenProfileModal = (prof: ProfileConfig) => {
    setActiveProfile(prof);
    setProfileName(prof.name);
    setProfileDesc(prof.description);
    setProfileUsers([...prof.userNames]);
    setProfilePerms({ ...prof.permissions });
    setProfileMasterAccess({ ...prof.masterAccess });
    setActivePermissionCatId('chats');
    setShowProfileModal(true);
  };

  // Guardar perfil
  const handleSaveProfile = () => {
    if (!activeProfile) return;
    const updated: ProfileConfig = {
      ...activeProfile,
      name: profileName.trim() || activeProfile.name,
      description: profileDesc.trim(),
      userNames: profileUsers,
      permissions: profilePerms,
      masterAccess: profileMasterAccess,
    };

    const nextProfiles = profiles.map((p) => (p.id === activeProfile.id ? updated : p));
    saveProfiles(nextProfiles);
    toast.success('Perfil de acceso actualizado correctamente');
    setShowProfileModal(false);
  };

  // Alternar permiso
  const togglePermission = (permId: string) => {
    setProfilePerms((prev) => ({
      ...prev,
      [permId]: !prev[permId],
    }));
  };

  // Seleccionar / Deseleccionar todos los permisos de una categoría
  const handleSelectAllCategory = (cat: PermissionCategory, select: boolean) => {
    const nextPerms = { ...profilePerms };
    cat.permissions.forEach((p) => {
      nextPerms[p.id] = select;
    });
    setProfilePerms(nextPerms);
  };

  // Alternar acceso maestro de una categoría
  const toggleMasterAccess = (catId: string) => {
    setProfileMasterAccess((prev) => ({
      ...prev,
      [catId]: !prev[catId],
    }));
  };

  // Filtrado de usuarios
  const filteredUsers = useMemo(() => {
    return usersList.filter((u) => {
      if (profileFilter !== 'all') {
        const pNorm = profileFilter.toLowerCase();
        if (pNorm === 'admin' && u.profile !== 'admin') return false;
        if (pNorm === 'supervisor' && u.profile === 'admin') return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nMatch = u.name.toLowerCase().includes(q);
        const eMatch = u.email.toLowerCase().includes(q);
        if (!nMatch && !eMatch) return false;
      }
      return true;
    });
  }, [usersList, profileFilter, searchQuery]);

  // Contar permisos activos en una categoría
  const getActivePermCount = (cat: PermissionCategory) => {
    return cat.permissions.filter((p) => profilePerms[p.id]).length;
  };

  return (
    <div className="flex-1 h-full bg-slate-50 dark:bg-slate-950 flex flex-col overflow-y-auto select-none">
      
      {/* ========================================================================= */}
      {/* HEADER PRINCIPAL (media_1789344383235.png)                                */}
      {/* ========================================================================= */}
      <div className="p-6 pb-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="flex flex-col gap-1 mb-4">
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            Usuarios
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Gestiona los miembros del equipo, sus perfiles de acceso e invitaciones.
          </p>
        </div>

        {/* Pestañas: Usuarios | Perfiles y permisos */}
        <div className="flex items-center gap-6 border-b border-slate-200 dark:border-slate-800 -mb-2">
          <button
            onClick={() => setActiveTab('users')}
            className={`pb-3 text-xs font-semibold relative transition-colors cursor-pointer ${
              activeTab === 'users'
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <span>Usuarios</span>
            {activeTab === 'users' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-full" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('profiles')}
            className={`pb-3 text-xs font-semibold relative transition-colors cursor-pointer ${
              activeTab === 'profiles'
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <span>Perfiles y permisos</span>
            {activeTab === 'profiles' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-full" />
            )}
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* CONTENIDO DE PESTAÑA: USUARIOS                                            */}
      {/* ========================================================================= */}
      {activeTab === 'users' && (
        <div className="p-6 flex flex-col gap-4">
          
          {/* Barra de Filtros y Botón "+ Agregar usuario" (media_1789344383235.png) */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            
            <div className="flex items-center gap-3 w-full sm:w-auto">
              {/* Buscador */}
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar usuario..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-all shadow-2xs"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Dropdown Filtro Perfiles */}
              <div className="relative">
                <select
                  value={profileFilter}
                  onChange={(e) => setProfileFilter(e.target.value)}
                  className="appearance-none bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 pr-8 focus:outline-none focus:ring-2 focus:ring-blue-500/40 shadow-2xs cursor-pointer"
                >
                  <option value="all">Todos los usuarios</option>
                  <option value="admin">Admin</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="user">Operador</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-2.5 text-slate-400 pointer-events-none" />
              </div>
            </div>

            {/* Alternador de Vista (List/Grid) y Botón Agregar */}
            <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
              <div className="flex items-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-0.5 shadow-2xs">
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    viewMode === 'list'
                      ? 'bg-slate-100 dark:bg-slate-700 text-blue-600'
                      : 'text-slate-400 hover:text-slate-600'
                  }`}
                  title="Vista de lista"
                >
                  <List className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    viewMode === 'grid'
                      ? 'bg-slate-100 dark:bg-slate-700 text-blue-600'
                      : 'text-slate-400 hover:text-slate-600'
                  }`}
                  title="Vista de cuadrícula"
                >
                  <Grid className="w-4 h-4" />
                </button>
              </div>

              {/* Botón "+ Agregar usuario" */}
              <button
                onClick={() => handleOpenUserModal()}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-full flex items-center gap-1.5 transition-all shadow-md shadow-blue-500/25 active:scale-95 cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>Agregar usuario</span>
              </button>
            </div>

          </div>

          {/* Tabla de Usuarios (media_1789344383235.png) */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50 dark:bg-slate-850">
                    <th className="py-3 px-4">NOMBRE</th>
                    <th className="py-3 px-4">PERFIL</th>
                    <th className="py-3 px-4">ÚLTIMA VEZ VISTO</th>
                    <th className="py-3 px-4 text-center">ACCIONES</th>
                    <th className="py-3 px-4">2FA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {isLoading ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-slate-400">
                        Cargando usuarios...
                      </td>
                    </tr>
                  ) : filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-slate-400">
                        No se encontraron usuarios.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => {
                      const profileLabel = u.profile === 'admin' ? 'Admin' : 'Supervisor';
                      const lastSeen = u.id === 2 ? '13/09/26 20:19' : u.id === 3 ? '12/09/26 18:01' : u.id === 4 ? '11/09/26 22:32' : '11/09/26 14:29';

                      return (
                        <tr key={u.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                          {/* Nombre y Email */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-slate-700 dark:text-slate-200 text-xs flex-shrink-0">
                                {u.name.slice(0, 2).toUpperCase()}
                              </div>
                              <div className="truncate">
                                <span className="font-bold text-slate-900 dark:text-slate-100 block leading-tight">
                                  {u.name}
                                </span>
                                <span className="text-[11px] text-slate-400 block leading-tight">
                                  {u.email}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Perfil */}
                          <td className="py-3 px-4">
                            <span className="font-medium text-slate-700 dark:text-slate-300">
                              {profileLabel}
                            </span>
                          </td>

                          {/* Última vez visto */}
                          <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                            {lastSeen}
                          </td>

                          {/* Acciones */}
                          <td className="py-3 px-4">
                            <div className="flex items-center justify-center gap-2 text-slate-400">
                              <button
                                onClick={() => handleOpenUserModal(u)}
                                title="Editar usuario"
                                className="p-1.5 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg transition-colors cursor-pointer"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => {
                                  const matchingProf = profiles.find((p) => p.userNames.includes(u.name)) || profiles[0];
                                  handleOpenProfileModal(matchingProf);
                                }}
                                title="Ver perfil y permisos"
                                className="p-1.5 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-lg transition-colors cursor-pointer"
                              >
                                <Shield className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteUser(u)}
                                title="Eliminar usuario"
                                className="p-1.5 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>

                          {/* 2FA */}
                          <td className="py-3 px-4">
                            <span className="text-slate-400 text-xs">
                              Desactivado
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* CONTENIDO DE PESTAÑA: PERFILES Y PERMISOS                                 */}
      {/* ========================================================================= */}
      {activeTab === 'profiles' && (
        <div className="p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Perfiles de Acceso Configurados
              </h3>
              <p className="text-xs text-slate-500">
                Define qué acciones puede realizar cada rol dentro del sistema.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {profiles.map((prof) => (
              <div
                key={prof.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/25">
                        <Shield className="w-4 h-4" />
                      </div>
                      <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                        {prof.name}
                      </h4>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      {prof.userNames.length} {prof.userNames.length === 1 ? 'usuario' : 'usuarios'}
                    </span>
                  </div>

                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 min-h-[32px]">
                    {prof.description}
                  </p>

                  {/* Usuarios asignados */}
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {prof.userNames.length > 0 ? (
                      prof.userNames.map((usr, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px] font-medium text-slate-700 dark:text-slate-300"
                        >
                          {usr}
                        </span>
                      ))
                    ) : (
                      <span className="text-[11px] text-slate-400 italic">
                        Sin usuarios asignados
                      </span>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleOpenProfileModal(prof)}
                  className="w-full mt-2 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Editar perfil y permisos</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL "EDITAR / VER PERFIL" (Exacto a media_1789344400851.png - 6 capturas)*/}
      {/* ========================================================================= */}
      {showProfileModal && activeProfile && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-3xl overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
            
            {/* Header del Modal */}
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/25">
                  <Shield className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Editar perfil
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowProfileModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Cuerpo del Modal */}
            <div className="p-6 overflow-y-auto space-y-4">
              
              {/* Campo Nombre * */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Nombre <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  placeholder="Ej: Supervisor"
                />
              </div>

              {/* Campo Descripción */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Descripción
                </label>
                <input
                  type="text"
                  value={profileDesc}
                  onChange={(e) => setProfileDesc(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  placeholder="Describe qué puede hacer este perfil"
                />
              </div>

              {/* Campo Usuarios (Chips con tags) */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Usuarios
                </label>
                <div className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl flex flex-wrap items-center gap-1.5 min-h-[42px]">
                  {profileUsers.map((uName, idx) => (
                    <span
                      key={idx}
                      className="bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 px-2.5 py-1 rounded-full text-xs font-medium text-slate-800 dark:text-slate-200 flex items-center gap-1.5 shadow-2xs"
                    >
                      <span>{uName}</span>
                      <button
                        type="button"
                        onClick={() => setProfileUsers(profileUsers.filter((_, i) => i !== idx))}
                        className="text-slate-400 hover:text-rose-500 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}

                  {/* Selector para añadir usuarios a este perfil */}
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value && !profileUsers.includes(e.target.value)) {
                        setProfileUsers([...profileUsers, e.target.value]);
                      }
                    }}
                    className="bg-transparent border-none text-xs text-slate-400 focus:outline-none cursor-pointer py-1 px-2"
                  >
                    <option value="">Seleccione los usuarios de este perfil...</option>
                    {usersList.map((usr) => (
                      <option key={usr.id} value={usr.name}>
                        {usr.name} ({usr.email})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Sección Permisos (Split Layout: Izquierda Categorías / Derecha Checkboxes) */}
              <div className="flex flex-col gap-1.5 pt-2">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Permisos
                </label>

                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden flex flex-col md:flex-row bg-slate-50/50 dark:bg-slate-900/50">
                  
                  {/* Columna Izquierda: Menú de Categorías (Chats, Llamadas, Conexiones, etc.) */}
                  <div className="w-full md:w-56 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 p-2 flex flex-col gap-1 flex-shrink-0 bg-white dark:bg-slate-900">
                    {PERMISSION_DEFINITIONS.map((cat) => {
                      const Icon = cat.icon;
                      const isSelected = activePermissionCatId === cat.id;
                      const activeCount = getActivePermCount(cat);
                      const totalCount = cat.permissions.length;

                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setActivePermissionCatId(cat.id)}
                          className={`w-full px-3 py-2.5 rounded-xl text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 font-bold'
                              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 truncate">
                            <Icon className="w-4 h-4 flex-shrink-0" />
                            <span className="truncate">{cat.label}</span>
                          </div>
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                            {activeCount}/{totalCount}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Columna Derecha: Panel de Checkboxes de la Categoría Seleccionada */}
                  <div className="flex-1 p-4 bg-white dark:bg-slate-900 flex flex-col min-h-[300px]">
                    {(() => {
                      const cat = PERMISSION_DEFINITIONS.find((c) => c.id === activePermissionCatId);
                      if (!cat) return null;

                      const isMasterActive = profileMasterAccess[cat.id] !== false;

                      return (
                        <div className="flex flex-col gap-3">
                          
                          {/* Cabecera de Categoría: Título + Master Toggle + Select All / Clear All */}
                          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                            <h4 className="font-bold text-xs text-slate-900 dark:text-slate-100">
                              {cat.label}
                            </h4>

                            <div className="flex items-center gap-3">
                              {/* Botones Seleccionar todos / Deseleccionar todos */}
                              <div className="flex items-center gap-1 text-slate-400">
                                <button
                                  type="button"
                                  onClick={() => handleSelectAllCategory(cat, true)}
                                  title="Seleccionar todos"
                                  className="p-1 hover:text-blue-600 rounded transition-colors cursor-pointer"
                                >
                                  <CheckCheck className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleSelectAllCategory(cat, false)}
                                  title="Deseleccionar todos"
                                  className="p-1 hover:text-rose-600 rounded transition-colors cursor-pointer"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>

                              {/* Toggle de Acceso Maestro (media_1789344426687.png y media_1789344510564.png) */}
                              {cat.hasMasterAccessToggle && (
                                <div className="flex items-center gap-2">
                                  <span className="text-[11px] font-medium text-slate-500">
                                    Acceso
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => toggleMasterAccess(cat.id)}
                                    className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                                      isMasterActive ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                                    }`}
                                  >
                                    <span
                                      className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${
                                        isMasterActive ? 'right-0.5' : 'left-0.5'
                                      }`}
                                    />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Grid de Checkboxes de Permisos */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                            {cat.permissions.map((p) => {
                              const isChecked = !!profilePerms[p.id];

                              return (
                                <label
                                  key={p.id}
                                  className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none hover:text-slate-900 dark:hover:text-slate-100"
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => togglePermission(p.id)}
                                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 dark:border-slate-700 cursor-pointer"
                                  />
                                  <span className="flex items-center gap-1">
                                    {p.label}
                                    {p.locked && <Lock className="w-3 h-3 text-slate-400" />}
                                    {p.warning && <AlertTriangle className="w-3 h-3 text-amber-500" />}
                                  </span>
                                </label>
                              );
                            })}
                          </div>

                        </div>
                      );
                    })()}
                  </div>

                </div>
              </div>

            </div>

            {/* Footer con Cancelar y Guardar */}
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3 flex-shrink-0 bg-white dark:bg-slate-900">
              <button
                type="button"
                onClick={() => setShowProfileModal(false)}
                className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveProfile}
                className="px-6 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-full transition-all shadow-md shadow-blue-500/25 active:scale-95 cursor-pointer"
              >
                Guardar
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL "AGREGAR / EDITAR USUARIO"                                          */}
      {/* ========================================================================= */}
      {showUserModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150">
            
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/25">
                  <Users className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {editingUser ? 'Editar Usuario' : 'Agregar Usuario'}
                </h3>
              </div>
              <button
                onClick={() => setShowUserModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="p-6 flex flex-col gap-3.5">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Nombre completo
                </label>
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="Ej: Jazmín"
                  required
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Correo electrónico
                </label>
                <input
                  type="email"
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  placeholder="ejemplo@zono.com.ar"
                  required
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {editingUser ? 'Nueva contraseña (opcional)' : 'Contraseña'}
                </label>
                <input
                  type="password"
                  value={userPassword}
                  onChange={(e) => setUserPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Perfil de acceso
                </label>
                <select
                  value={userProfile}
                  onChange={(e) => setUserProfile(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                >
                  <option value="admin">Admin</option>
                  <option value="user">Supervisor / Operador</option>
                </select>
              </div>

              {/* Departamentos Asignados */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Departamentos asignados
                </label>
                <div className="p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                  {queues.map((q) => {
                    const isChecked = userQueueIds.includes(q.id);
                    return (
                      <label
                        key={q.id}
                        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white dark:bg-slate-750 text-xs text-slate-700 dark:text-slate-200 cursor-pointer shadow-2xs border border-slate-200 dark:border-slate-700"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setUserQueueIds((prev) =>
                              prev.includes(q.id) ? prev.filter((id) => id !== q.id) : [...prev, q.id]
                            );
                          }}
                          className="w-3.5 h-3.5 text-blue-600 rounded"
                        />
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: q.color || '#3b82f6' }}
                        />
                        <span>{q.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800 mt-2">
                <button
                  type="button"
                  onClick={() => setShowUserModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingUser}
                  className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-full transition-all shadow-md shadow-blue-500/25 cursor-pointer disabled:opacity-50"
                >
                  {isSavingUser ? 'Guardando...' : editingUser ? 'Guardar Cambios' : 'Crear Usuario'}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
};
