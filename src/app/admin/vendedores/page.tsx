"use client";

import React, { useState, useEffect, useCallback } from "react";
import { 
  Users, 
  KeyRound, 
  Plus, 
  Search, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  RefreshCw, 
  Eye, 
  EyeOff, 
  Copy, 
  Check, 
  Shield, 
  UserCheck, 
  UserX,
  X,
  Phone,
  Edit,
  Sparkles,
  Percent,
  ShoppingCart,
  CheckCircle,
  Filter
} from "lucide-react";
import { supabase } from "@/lib/supabase";

interface PhoneLine {
  id: string;
  name: string;
  phone_number: string;
  is_active: boolean;
}

interface Seller {
  id: string;
  full_name: string;
  email: string;
  role: string;
  seller_type: string;
  is_organic: boolean;
  commission_rate: number;
  is_active: boolean;
  created_at: string;
  phone_lines: PhoneLine[];
  primary_phone_line_id: string | null;
  orders_count: number;
  auth_user: {
    id: string;
    email: string;
    created_at: string;
    last_sign_in_at?: string;
    email_confirmed_at?: string;
  } | null;
}

export default function VendedoresManagementPage() {
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [phoneLines, setPhoneLines] = useState<PhoneLine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("todos");
  const [filterType, setFilterType] = useState("todos");
  const [filterStatus, setFilterStatus] = useState("todos");
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Auth User / Admin Check
  const [currentUserEmail, setCurrentUserEmail] = useState<string>("");

  // Modal: Create Seller
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newFullName, setNewFullName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("Zono2026!");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [newRole, setNewRole] = useState("seller");
  const [newSellerType, setNewSellerType] = useState("minorista");
  const [newIsOrganic, setNewIsOrganic] = useState(false);
  const [newCommissionRate, setNewCommissionRate] = useState<number>(8);
  const [newPhoneLineId, setNewPhoneLineId] = useState<string>("none");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Modal: Edit Seller
  const [selectedSellerForEdit, setSelectedSellerForEdit] = useState<Seller | null>(null);
  const [editFullName, setEditFullName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState("seller");
  const [editSellerType, setEditSellerType] = useState("minorista");
  const [editIsOrganic, setEditIsOrganic] = useState(false);
  const [editCommissionRate, setEditCommissionRate] = useState<number>(8);
  const [editPhoneLineId, setEditPhoneLineId] = useState<string>("none");
  const [editIsActive, setEditIsActive] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Modal: Change Password
  const [selectedSellerForPassword, setSelectedSellerForPassword] = useState<Seller | null>(null);
  const [changedPassword, setChangedPassword] = useState("Zono2026!");
  const [showChangedPassword, setShowChangedPassword] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  // Load User Email & Token
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) {
        setCurrentUserEmail(user.email);
      }
    });
  }, []);

  const getAuthHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || "";
    return {
      "Content-Type": "application/json",
      ...(token ? { "Authorization": `Bearer ${token}` } : {})
    };
  };

  // Load Sellers
  const loadSellers = useCallback(async () => {
    setIsLoading(true);
    try {
      const headers = await getAuthHeaders();
      const email = currentUserEmail || sessionStorage.getItem('zono_user_email') || 'diego.boveda@gmail.com';
      const res = await fetch(`/api/admin/vendedores?callerEmail=${encodeURIComponent(email)}`, {
        headers
      });
      const data = await res.json();
      if (data.success) {
        setSellers(data.data || []);
        setPhoneLines(data.phoneLines || []);
      } else {
        console.error("Error al cargar vendedores:", data.error);
      }
    } catch (e) {
      console.error("Error loading sellers:", e);
    } finally {
      setIsLoading(false);
    }
  }, [currentUserEmail]);

  useEffect(() => {
    loadSellers();
  }, [loadSellers]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(id);
    setTimeout(() => setCopiedText(null), 2500);
  };

  const generateRandomPassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
    let pwd = "Zono";
    for (let i = 0; i < 4; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    pwd += "!";
    return pwd;
  };

  // Open Edit Modal
  const handleOpenEdit = (seller: Seller) => {
    setSelectedSellerForEdit(seller);
    setEditFullName(seller.full_name);
    setEditEmail(seller.email);
    setEditRole(seller.role);
    setEditSellerType(seller.seller_type || "minorista");
    setEditIsOrganic(Boolean(seller.is_organic));
    setEditCommissionRate(seller.commission_rate ?? 8);
    setEditPhoneLineId(seller.primary_phone_line_id || "none");
    setEditIsActive(seller.is_active);
    setEditError(null);
  };

  // Handle Create Seller
  const handleCreateSeller = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    setCreateError(null);

    try {
      const headers = await getAuthHeaders();
      const email = currentUserEmail || sessionStorage.getItem('zono_user_email') || 'diego.boveda@gmail.com';
      const res = await fetch("/api/admin/vendedores", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "create",
          callerEmail: email,
          fullName: newFullName,
          email: newEmail,
          password: newPassword,
          role: newRole,
          sellerType: newSellerType,
          isOrganic: newIsOrganic,
          commissionRate: Number(newCommissionRate) || 0,
          phoneLineId: newPhoneLineId !== "none" ? newPhoneLineId : null
        })
      });
      const data = await res.json();
      if (!data.success) {
        setCreateError(data.error || "Error al crear vendedor");
        setIsCreating(false);
        return;
      }

      setShowCreateModal(false);
      setNewFullName("");
      setNewEmail("");
      setNewPassword("Zono2026!");
      setNewRole("seller");
      setNewSellerType("minorista");
      setNewIsOrganic(false);
      setNewCommissionRate(8);
      setNewPhoneLineId("none");
      await loadSellers();
    } catch (err: any) {
      setCreateError(err.message || "Error al conectar con el servidor");
    } finally {
      setIsCreating(false);
    }
  };

  // Handle Update Seller
  const handleUpdateSeller = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSellerForEdit) return;
    setIsUpdating(true);
    setEditError(null);

    try {
      const headers = await getAuthHeaders();
      const email = currentUserEmail || sessionStorage.getItem('zono_user_email') || 'diego.boveda@gmail.com';
      const res = await fetch("/api/admin/vendedores", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "update",
          callerEmail: email,
          id: selectedSellerForEdit.id,
          fullName: editFullName,
          email: editEmail,
          role: editRole,
          sellerType: editSellerType,
          isOrganic: editIsOrganic,
          commissionRate: Number(editCommissionRate) || 0,
          phoneLineId: editPhoneLineId !== "none" ? editPhoneLineId : null,
          isActive: editIsActive
        })
      });
      const data = await res.json();
      if (!data.success) {
        setEditError(data.error || "Error al actualizar vendedor");
        setIsUpdating(false);
        return;
      }

      setSelectedSellerForEdit(null);
      await loadSellers();
    } catch (err: any) {
      setEditError(err.message || "Error al conectar con el servidor");
    } finally {
      setIsUpdating(false);
    }
  };

  // Handle Update Password
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSellerForPassword) return;
    setIsUpdatingPassword(true);
    setPasswordError(null);
    setPasswordSuccess(false);

    try {
      const headers = await getAuthHeaders();
      const email = currentUserEmail || sessionStorage.getItem('zono_user_email') || 'diego.boveda@gmail.com';
      const res = await fetch("/api/admin/vendedores", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "update-password",
          callerEmail: email,
          userId: selectedSellerForPassword.id,
          newPassword: changedPassword
        })
      });
      const data = await res.json();
      if (!data.success) {
        setPasswordError(data.error || "Error al actualizar contraseña");
        setIsUpdatingPassword(false);
        return;
      }

      setPasswordSuccess(true);
      setTimeout(() => {
        setSelectedSellerForPassword(null);
        setPasswordSuccess(false);
      }, 1800);
    } catch (err: any) {
      setPasswordError(err.message || "Error en el servidor");
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  // Handle Toggle Active
  const handleToggleActive = async (seller: Seller) => {
    const nextStatus = !seller.is_active;
    const confirmMsg = nextStatus
      ? `¿Habilitar acceso al sistema para ${seller.full_name}?`
      : `¿Pausar acceso para ${seller.full_name}? No podrá iniciar sesión hasta que sea reactivado.`;
    
    if (!confirm(confirmMsg)) return;

    try {
      const headers = await getAuthHeaders();
      const email = currentUserEmail || sessionStorage.getItem('zono_user_email') || 'diego.boveda@gmail.com';
      const res = await fetch("/api/admin/vendedores", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "toggle-active",
          callerEmail: email,
          userId: seller.id,
          isActive: nextStatus
        })
      });
      const data = await res.json();
      if (data.success) {
        setSellers(prev => prev.map(s => s.id === seller.id ? { ...s, is_active: nextStatus } : s));
      } else {
        alert(data.error || "Error al cambiar estado");
      }
    } catch (e: any) {
      alert("Error: " + e.message);
    }
  };

  // Filtered Sellers
  const filteredSellers = sellers.filter(s => {
    const searchMatch = 
      (s.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
      (s.email || "").toLowerCase().includes(search.toLowerCase());

    const roleMatch = filterRole === "todos" || s.role === filterRole;
    const typeMatch = filterType === "todos" || s.seller_type === filterType;
    const statusMatch = 
      filterStatus === "todos" ||
      (filterStatus === "activos" && s.is_active) ||
      (filterStatus === "inactivos" && !s.is_active);

    return searchMatch && roleMatch && typeMatch && statusMatch;
  });

  // Metrics
  const totalCount = sellers.length;
  const activeCount = sellers.filter(s => s.is_active).length;
  const minoristasCount = sellers.filter(s => s.seller_type === "minorista" || s.seller_type === "ambos").length;
  const mayoristasCount = sellers.filter(s => s.seller_type === "mayorista" || s.seller_type === "ambos").length;

  return (
    <div className="space-y-6 pb-20">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-xs">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black text-slate-900 tracking-tight">Gestión de Vendedores</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
                Solo Administradores
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Creación de cuentas, vinculación comercial, líneas telefónicas y contraseñas
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => loadSellers()}
            disabled={isLoading}
            className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all cursor-pointer"
            title="Refrescar Lista"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-blue-600" : ""}`} />
          </button>

          <button
            onClick={() => {
              setNewFullName("");
              setNewEmail("");
              setNewPassword("Zono2026!");
              setNewRole("seller");
              setNewSellerType("minorista");
              setNewIsOrganic(false);
              setNewCommissionRate(8);
              setNewPhoneLineId("none");
              setCreateError(null);
              setShowCreateModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-600/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Vendedor</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Cuentas</p>
            <p className="text-2xl font-black text-slate-900 mt-0.5">{totalCount}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">Activos</p>
            <p className="text-2xl font-black text-emerald-700 mt-0.5">{activeCount}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <UserCheck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-blue-600 uppercase tracking-wider">Minoristas</p>
            <p className="text-2xl font-black text-blue-700 mt-0.5">{minoristasCount}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <ShoppingCart className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider">Mayoristas</p>
            <p className="text-2xl font-black text-indigo-700 mt-0.5">{mayoristasCount}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Sparkles className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nombre o correo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Role Filter */}
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="todos">Todos los Roles</option>
            <option value="seller">Vendedor (Seller)</option>
            <option value="admin">Administrador</option>
            <option value="logistica">Logística</option>
            <option value="fletero">Fletero</option>
            <option value="administracion">Administración</option>
          </select>

          {/* Type Filter */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="todos">Todos los Canales</option>
            <option value="minorista">Minorista</option>
            <option value="mayorista">Mayorista</option>
            <option value="ambos">Ambos Canales</option>
          </select>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="todos">Todos los Estados</option>
            <option value="activos">Solo Activos</option>
            <option value="inactivos">Solo Inactivos</option>
          </select>
        </div>
      </div>

      {/* Sellers Table / Grid */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-500 mb-2" />
            <p className="text-xs font-medium">Cargando nómina de vendedores...</p>
          </div>
        ) : filteredSellers.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <UserX className="w-10 h-10 mx-auto text-slate-300 mb-2" />
            <p className="text-sm font-bold text-slate-600">No se encontraron vendedores</p>
            <p className="text-xs text-slate-400 mt-1">Intentá cambiar los filtros o el término de búsqueda.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200/80 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3.5 px-4">Vendedor / Usuario</th>
                  <th className="py-3.5 px-4">Rol en Sistema</th>
                  <th className="py-3.5 px-4">Canal Comercial</th>
                  <th className="py-3.5 px-4">Línea Telefónica</th>
                  <th className="py-3.5 px-4 text-center">Comisión</th>
                  <th className="py-3.5 px-4 text-center">Pedidos</th>
                  <th className="py-3.5 px-4 text-center">Acceso</th>
                  <th className="py-3.5 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSellers.map((seller) => {
                  const phoneLine = seller.phone_lines && seller.phone_lines.length > 0 ? seller.phone_lines[0] : null;

                  return (
                    <tr 
                      key={seller.id} 
                      className={`hover:bg-slate-50/60 transition-colors ${!seller.is_active ? "bg-slate-50/30 opacity-70" : ""}`}
                    >
                      {/* Name & Email */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs ${
                            seller.role === 'admin' 
                              ? 'bg-purple-100 text-purple-700' 
                              : seller.is_organic 
                              ? 'bg-emerald-100 text-emerald-700' 
                              : 'bg-blue-100 text-blue-700'
                          }`}>
                            {seller.full_name ? seller.full_name.substring(0, 2).toUpperCase() : "VE"}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-900 text-xs">{seller.full_name}</span>
                              {seller.is_organic && (
                                <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  Orgánico
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono mt-0.5">
                              <span>{seller.email}</span>
                              <button 
                                onClick={() => copyToClipboard(seller.email, `email-${seller.id}`)}
                                className="text-slate-400 hover:text-slate-600 transition-colors"
                                title="Copiar correo"
                              >
                                {copiedText === `email-${seller.id}` ? (
                                  <Check className="w-3 h-3 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Role Badge */}
                      <td className="py-3 px-4">
                        {seller.role === "admin" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-200">
                            <Shield className="w-3 h-3" /> Admin
                          </span>
                        ) : seller.role === "logistica" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-cyan-50 text-cyan-700 border border-cyan-200">
                            Logística
                          </span>
                        ) : seller.role === "fletero" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">
                            Fletero
                          </span>
                        ) : seller.role === "administracion" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
                            Administración
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
                            <UserCheck className="w-3 h-3" /> Vendedor
                          </span>
                        )}
                      </td>

                      {/* Canal */}
                      <td className="py-3 px-4">
                        <span className={`inline-block px-2 py-0.5 rounded-lg text-[10px] font-bold capitalize ${
                          seller.seller_type === "mayorista"
                            ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                            : seller.seller_type === "ambos"
                            ? "bg-amber-50 text-amber-700 border border-amber-200"
                            : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        }`}>
                          {seller.seller_type || "minorista"}
                        </span>
                      </td>

                      {/* Phone Line */}
                      <td className="py-3 px-4">
                        {phoneLine ? (
                          <div className="flex items-center gap-1.5 text-slate-700">
                            <Phone className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            <div>
                              <p className="font-bold text-[11px] leading-tight">{phoneLine.name}</p>
                              <p className="text-[10px] text-slate-400 font-mono leading-tight">{phoneLine.phone_number}</p>
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px] italic">Sin línea</span>
                        )}
                      </td>

                      {/* Commission */}
                      <td className="py-3 px-4 text-center font-mono font-bold text-slate-700">
                        {seller.commission_rate ?? 8}%
                      </td>

                      {/* Orders Count */}
                      <td className="py-3 px-4 text-center">
                        <span className="inline-block px-2.5 py-1 bg-slate-100 rounded-xl font-bold font-mono text-slate-800 text-[11px]">
                          {seller.orders_count.toLocaleString("es-AR")}
                        </span>
                      </td>

                      {/* Auth Status / Active */}
                      <td className="py-3 px-4 text-center">
                        <div className="inline-flex flex-col items-center">
                          {seller.is_active ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                              <CheckCircle className="w-3 h-3" /> Habilitado
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                              <UserX className="w-3 h-3" /> Pausado
                            </span>
                          )}
                          {seller.auth_user?.last_sign_in_at ? (
                            <span className="text-[9px] text-slate-400 mt-0.5">
                              {new Date(seller.auth_user.last_sign_in_at).toLocaleDateString("es-AR")}
                            </span>
                          ) : (
                            <span className="text-[9px] text-slate-400 mt-0.5">Sin accesos</span>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Edit Details */}
                          <button
                            onClick={() => handleOpenEdit(seller)}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-600 text-slate-600 transition-all cursor-pointer"
                            title="Editar Datos del Vendedor"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>

                          {/* Change Password */}
                          <button
                            onClick={() => {
                              setSelectedSellerForPassword(seller);
                              setChangedPassword("Zono2026!");
                              setPasswordError(null);
                              setPasswordSuccess(false);
                            }}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-amber-50 hover:text-amber-600 text-slate-600 transition-all cursor-pointer"
                            title="Cambiar Contraseña"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                          </button>

                          {/* Toggle Active */}
                          <button
                            onClick={() => handleToggleActive(seller)}
                            className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                              seller.is_active
                                ? "bg-slate-100 hover:bg-red-50 hover:text-red-600 text-slate-600"
                                : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                            }`}
                            title={seller.is_active ? "Pausar Vendedor" : "Habilitar Vendedor"}
                          >
                            {seller.is_active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL: Nuevo Vendedor */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Plus className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-black text-slate-900">Crear Nuevo Vendedor</h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {createError && (
              <div className="p-3 mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{createError}</span>
              </div>
            )}

            <form onSubmit={handleCreateSeller} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Nombre Completo *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Sofía Martínez"
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Correo Electrónico (Usuario de acceso) *</label>
                <input
                  type="email"
                  required
                  placeholder="sofia.martinez@zono.com.ar"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700">Contraseña Inicial *</label>
                  <button
                    type="button"
                    onClick={() => setNewPassword(generateRandomPassword())}
                    className="text-[10px] text-blue-600 hover:text-blue-800 font-bold"
                  >
                    Generar aleatoria
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full pl-3.5 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Rol en el Sistema</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="seller">Vendedor (Seller)</option>
                    <option value="admin">Administrador</option>
                    <option value="logistica">Logística</option>
                    <option value="fletero">Fletero</option>
                    <option value="administracion">Administración</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Canal Comercial</label>
                  <select
                    value={newSellerType}
                    onChange={(e) => setNewSellerType(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="minorista">Minorista</option>
                    <option value="mayorista">Mayorista</option>
                    <option value="ambos">Ambos Canales</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Línea Telefónica</label>
                  <select
                    value={newPhoneLineId}
                    onChange={(e) => setNewPhoneLineId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="none">Sin línea asignada</option>
                    {phoneLines.map((pl) => (
                      <option key={pl.id} value={pl.id}>
                        {pl.name} ({pl.phone_number})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">% Comisión Vendedor</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="100"
                    value={newCommissionRate}
                    onChange={(e) => setNewCommissionRate(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              {/* Organic Lead Checkbox */}
              <div className="pt-1">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={newIsOrganic}
                    onChange={(e) => setNewIsOrganic(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                  />
                  <div>
                    <p className="text-xs font-bold text-slate-800">Atiende Leads Orgánicos (Web / WhatsApp Directo)</p>
                    <p className="text-[10px] text-slate-400">Habilita asignación automática de leads no pagos.</p>
                  </div>
                </label>
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Crear Vendedor"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Editar Vendedor */}
      {selectedSellerForEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Edit className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-black text-slate-900">Editar Vendedor</h3>
              </div>
              <button
                onClick={() => setSelectedSellerForEdit(null)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {editError && (
              <div className="p-3 mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleUpdateSeller} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Nombre Completo *</label>
                <input
                  type="text"
                  required
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Correo Electrónico *</label>
                <input
                  type="email"
                  required
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Rol en el Sistema</label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="seller">Vendedor (Seller)</option>
                    <option value="admin">Administrador</option>
                    <option value="logistica">Logística</option>
                    <option value="fletero">Fletero</option>
                    <option value="administracion">Administración</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Canal Comercial</label>
                  <select
                    value={editSellerType}
                    onChange={(e) => setEditSellerType(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="minorista">Minorista</option>
                    <option value="mayorista">Mayorista</option>
                    <option value="ambos">Ambos Canales</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Línea Telefónica</label>
                  <select
                    value={editPhoneLineId}
                    onChange={(e) => setEditPhoneLineId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="none">Sin línea asignada</option>
                    {phoneLines.map((pl) => (
                      <option key={pl.id} value={pl.id}>
                        {pl.name} ({pl.phone_number})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">% Comisión</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="100"
                    value={editCommissionRate}
                    onChange={(e) => setEditCommissionRate(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={editIsOrganic}
                    onChange={(e) => setEditIsOrganic(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                  />
                  <div>
                    <p className="text-xs font-bold text-slate-800">Atiende Leads Orgánicos (Web / WhatsApp Directo)</p>
                  </div>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={editIsActive}
                    onChange={(e) => setEditIsActive(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
                  />
                  <div>
                    <p className="text-xs font-bold text-slate-800">Cuenta Habilitada</p>
                    <p className="text-[10px] text-slate-400">Si se desmarca, el usuario no podrá acceder al sistema.</p>
                  </div>
                </label>
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedSellerForEdit(null)}
                  className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar Cambios"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Cambiar Contraseña */}
      {selectedSellerForPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">Restablecer Contraseña</h3>
                  <p className="text-[10px] text-slate-400 font-medium truncate max-w-[200px]">
                    {selectedSellerForPassword.full_name}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedSellerForPassword(null)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {passwordError && (
              <div className="p-3 mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{passwordError}</span>
              </div>
            )}

            {passwordSuccess && (
              <div className="p-3 mb-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>¡Contraseña actualizada con éxito!</span>
              </div>
            )}

            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700">Nueva Contraseña</label>
                  <button
                    type="button"
                    onClick={() => setChangedPassword(generateRandomPassword())}
                    className="text-[10px] text-blue-600 hover:text-blue-800 font-bold cursor-pointer"
                  >
                    Generar aleatoria
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showChangedPassword ? "text" : "password"}
                    required
                    value={changedPassword}
                    onChange={(e) => setChangedPassword(e.target.value)}
                    className="w-full pl-3.5 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowChangedPassword(!showChangedPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showChangedPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400">Mínimo 6 caracteres.</p>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedSellerForPassword(null)}
                  className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingPassword || passwordSuccess}
                  className="flex-1 py-2.5 px-4 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-amber-500/20"
                >
                  {isUpdatingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar Contraseña"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
