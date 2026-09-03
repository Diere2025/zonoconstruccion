"use client";

import React, { useState, useEffect, useCallback } from "react";
import { 
  Truck, 
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
  Lock
} from "lucide-react";

interface Fletero {
  id: string;
  full_name: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export default function FleterosManagementPage() {
  const [fleteros, setFleteros] = useState<Fletero[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Modal State: Create Fletero
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newFullName, setNewFullName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("Zono2026!");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Modal State: Change Password
  const [selectedFletero, setSelectedFletero] = useState<Fletero | null>(null);
  const [changedPassword, setChangedPassword] = useState("Zono2026!");
  const [showChangedPassword, setShowChangedPassword] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateSuccess, setUpdateSuccess] = useState(false);

  // Load Fleteros
  const loadFleteros = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/fleteros?action=list");
      const data = await res.json();
      if (data.success) {
        setFleteros(data.data || []);
      }
    } catch (e) {
      console.error("Error loading fleteros:", e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFleteros();
  }, [loadFleteros]);

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

  // Handle Create
  const handleCreateFletero = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    setCreateError(null);

    try {
      const res = await fetch("/api/admin/fleteros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          fullName: newFullName,
          email: newEmail,
          password: newPassword
        })
      });
      const data = await res.json();
      if (!data.success) {
        setCreateError(data.error || "Error al crear fletero");
        setIsCreating(false);
        return;
      }

      setShowCreateModal(false);
      setNewFullName("");
      setNewEmail("");
      setNewPassword("Zono2026!");
      await loadFleteros();
    } catch (err: any) {
      setCreateError(err.message || "Error al conectar con el servidor");
    } finally {
      setIsCreating(false);
    }
  };

  // Handle Update Password
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFletero) return;
    setIsUpdatingPassword(true);
    setUpdateError(null);
    setUpdateSuccess(false);

    try {
      const res = await fetch("/api/admin/fleteros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update-password",
          userId: selectedFletero.id,
          newPassword: changedPassword
        })
      });
      const data = await res.json();
      if (!data.success) {
        setUpdateError(data.error || "Error al actualizar contraseña");
        setIsUpdatingPassword(false);
        return;
      }

      setUpdateSuccess(true);
    } catch (err: any) {
      setUpdateError(err.message || "Error al conectar con el servidor");
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  // Handle Toggle Active
  const handleToggleActive = async (fletero: Fletero) => {
    const nextStatus = !fletero.is_active;
    try {
      const res = await fetch("/api/admin/fleteros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle-active",
          userId: fletero.id,
          isActive: nextStatus
        })
      });
      const data = await res.json();
      if (data.success) {
        setFleteros(prev => prev.map(f => f.id === fletero.id ? { ...f, is_active: nextStatus } : f));
      } else {
        alert("Error al cambiar estado: " + (data.error || "Desconocido"));
      }
    } catch (e: any) {
      alert("Error: " + e.message);
    }
  };

  const filteredFleteros = fleteros.filter(f => 
    (f.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
    (f.email || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 pb-20">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-xs">
            <Truck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black text-slate-900 tracking-tight">Gestión de Fleteros</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">
                Logística
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Administración de cuentas, choferes y contraseñas de transportistas
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => loadFleteros()}
            disabled={isLoading}
            className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all cursor-pointer"
            title="Refrescar Lista"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-indigo-600" : ""}`} />
          </button>

          <button
            onClick={() => {
              setNewFullName("");
              setNewEmail("");
              setNewPassword("Zono2026!");
              setCreateError(null);
              setShowCreateModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Fletero</span>
          </button>
        </div>
      </div>

      {/* Search and Counts */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar fletero por nombre o correo..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200/80 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          />
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
          <span className="px-3 py-1 rounded-lg bg-slate-100 border border-slate-200">
            Total: <strong className="text-slate-900">{fleteros.length}</strong>
          </span>
          <span className="px-3 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
            Activos: <strong>{fleteros.filter(f => f.is_active).length}</strong>
          </span>
        </div>
      </div>

      {/* Fleteros Grid */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-slate-200/80">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-3" />
          <p className="text-xs text-slate-500 font-medium">Cargando lista de fleteros...</p>
        </div>
      ) : filteredFleteros.length === 0 ? (
        <div className="text-center p-12 bg-white rounded-3xl border border-slate-200/80 space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
            <Truck className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">No se encontraron fleteros</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {search ? "No hay fleteros que coincidan con la búsqueda." : "Aún no hay fleteros registrados en el sistema."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredFleteros.map((fletero) => (
            <div 
              key={fletero.id} 
              className={`p-5 rounded-3xl bg-white border transition-all ${
                fletero.is_active ? "border-slate-200/90 shadow-xs hover:border-indigo-300" : "border-slate-200 bg-slate-50/60 opacity-75"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm shrink-0 border ${
                    fletero.is_active 
                      ? "bg-indigo-50 text-indigo-600 border-indigo-200/80" 
                      : "bg-slate-200 text-slate-500 border-slate-300"
                  }`}>
                    {fletero.full_name ? fletero.full_name.charAt(0).toUpperCase() : "F"}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-slate-900 truncate" title={fletero.full_name}>
                      {fletero.full_name}
                    </h3>
                    <p className="text-xs text-slate-500 truncate font-mono" title={fletero.email}>
                      {fletero.email}
                    </p>
                  </div>
                </div>

                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                  fletero.is_active 
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200" 
                    : "bg-slate-100 text-slate-600 border border-slate-200"
                }`}>
                  {fletero.is_active ? "Activo" : "Pausado"}
                </span>
              </div>

              {/* Action Buttons */}
              <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  onClick={() => {
                    setSelectedFletero(fletero);
                    setChangedPassword("Zono2026!");
                    setUpdateError(null);
                    setUpdateSuccess(false);
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-50 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border border-slate-200 hover:border-indigo-200 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Cambiar Clave</span>
                </button>

                <button
                  onClick={() => handleToggleActive(fletero)}
                  className={`p-2 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                    fletero.is_active 
                      ? "bg-rose-50/80 hover:bg-rose-100 border-rose-200 text-rose-700" 
                      : "bg-emerald-50/80 hover:bg-emerald-100 border-emerald-200 text-emerald-700"
                  }`}
                  title={fletero.is_active ? "Pausar acceso" : "Activar acceso"}
                >
                  {fletero.is_active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: Nuevo Fletero */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                  <Truck className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-sm text-slate-900">Agregar Nuevo Fletero</h3>
              </div>
              <button 
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {createError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{createError}</span>
              </div>
            )}

            <form onSubmit={handleCreateFletero} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Nombre Completo del Fletero / Empresa</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Marcelo Gómez o Fletes MG"
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Correo Electrónico (Usuario de acceso)</label>
                <input
                  type="email"
                  required
                  placeholder="ejemplo@zono.com.ar o particular"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700">Contraseña Inicial</label>
                  <button
                    type="button"
                    onClick={() => setNewPassword(generateRandomPassword())}
                    className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold"
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
                    className="w-full pl-3.5 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
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

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Crear Fletero"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Cambiar Contraseña */}
      {selectedFletero && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">Cambiar Contraseña</h3>
                  <p className="text-[11px] text-slate-500">{selectedFletero.full_name}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedFletero(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {updateSuccess ? (
              <div className="space-y-4 py-2 text-center">
                <div className="w-12 h-12 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-2xl flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-900">¡Contraseña Actualizada!</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    La nueva clave para <strong>{selectedFletero.full_name}</strong> es:
                  </p>
                  <div className="mt-3 p-3 bg-slate-100 rounded-xl border border-slate-200 font-mono text-sm font-bold text-slate-800 flex items-center justify-between">
                    <span>{changedPassword}</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(`Hola ${selectedFletero.full_name}, tus credenciales para el ERP Zono son:\nUsuario: ${selectedFletero.email}\nContraseña: ${changedPassword}\nLink: https://zono-erp.pages.dev`, "pwd")}
                      className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-sans font-bold"
                    >
                      {copiedText === "pwd" ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-600">¡Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copiar Datos</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedFletero(null)}
                  className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all"
                >
                  Cerrar
                </button>
              </div>
            ) : (
              <form onSubmit={handleUpdatePassword} className="space-y-4">
                {updateError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{updateError}</span>
                  </div>
                )}

                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600 space-y-1">
                  <p><strong>Usuario:</strong> {selectedFletero.email}</p>
                  <p>Los fleteros no pueden cambiar su clave ellos mismos; solo el personal de Logística o Admin puede definirla.</p>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700">Nueva Contraseña</label>
                    <button
                      type="button"
                      onClick={() => setChangedPassword(generateRandomPassword())}
                      className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold"
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
                      className="w-full pl-3.5 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowChangedPassword(!showChangedPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showChangedPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="pt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedFletero(null)}
                    className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isUpdatingPassword}
                    className="flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isUpdatingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar Clave"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
