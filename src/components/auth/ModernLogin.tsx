"use client";

import React, { useState } from "react";
import { supabase } from "@/lib/supabase";
import { 
  Mail, 
  Lock, 
  Eye, 
  EyeOff, 
  ArrowLeft, 
  CheckCircle2, 
  Sparkles, 
  AlertCircle, 
  Loader2, 
  ShieldCheck, 
  BarChart3, 
  Coins, 
  ShoppingCart, 
  Package, 
  Truck 
} from "lucide-react";
import { Button } from "@/components/ui/Button";

interface ModernLoginProps {
  onLoginSuccess?: (session: any) => void | Promise<void>;
  defaultEmail?: string;
}

export function ModernLogin({ onLoginSuccess, defaultEmail = "" }: ModernLoginProps) {
  // Login form state
  const [loginEmail, setLoginEmail] = useState(defaultEmail);
  const [loginPassword, setLoginPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Forgot password state
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      const emailClean = loginEmail.trim().toLowerCase();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailClean,
        password: loginPassword,
      });

      if (error) {
        setLoginError("Correo o contraseña incorrectos. Por favor, verificá tus datos.");
        setIsLoggingIn(false);
        return;
      }

      if (data?.session && onLoginSuccess) {
        await onLoginSuccess(data.session);
      }
    } catch (err: any) {
      setLoginError("Error al iniciar sesión: " + (err.message || "Error desconocido"));
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSendingReset(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) {
        alert("Error al enviar el correo: " + error.message);
      } else {
        setResetSent(true);
      }
    } catch (err: any) {
      alert("Error inesperado: " + err.message);
    } finally {
      setIsSendingReset(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-white flex flex-col justify-between relative overflow-hidden font-sans selection:bg-indigo-500 selection:text-white">
      {/* Ambient background gradients and subtle grid */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,rgba(59,130,246,0.15),rgba(255,255,255,0))] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,rgba(99,102,241,0.1),transparent_50%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-15 pointer-events-none" />

      {/* Top Minimal Header */}
      <header className="relative z-10 w-full max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 ring-1 ring-white/20">
            <span className="font-black text-lg tracking-tighter text-white">Z</span>
          </div>
          <div>
            <div className="font-black text-base tracking-tight text-white flex items-center gap-1.5">
              ZONO <span className="text-blue-400 font-extrabold text-xs px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20">ERP</span>
            </div>
            <p className="text-[10px] text-slate-400 font-semibold tracking-wider uppercase">Plataforma Empresarial</p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400 font-medium bg-slate-900/60 border border-slate-800 px-3.5 py-1.5 rounded-full backdrop-blur-md">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Servidores Operativos</span>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 flex-grow flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md">
          {/* Main Glass Card */}
          <div className="bg-slate-900/70 border border-slate-800/80 backdrop-blur-xl p-8 sm:p-10 rounded-[2.5rem] shadow-2xl shadow-black/60 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-cyan-400" />

            {isForgotPassword ? (
              resetSent ? (
                /* Success password recovery screen */
                <div className="text-center space-y-6 py-4">
                  <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto text-emerald-400">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-white tracking-tight">Enlace Enviado</h2>
                    <p className="text-slate-400 font-medium text-xs mt-2 leading-relaxed">
                      Revisá tu bandeja de entrada en: <br />
                      <strong className="text-white text-sm break-all font-bold">{forgotEmail}</strong>
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setIsForgotPassword(false);
                      setResetSent(false);
                    }}
                    className="flex items-center justify-center gap-2 w-full py-4 text-xs font-black uppercase tracking-widest bg-slate-800 hover:bg-slate-700 text-white rounded-2xl transition-all cursor-pointer border border-slate-700"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Volver al Inicio de Sesión
                  </button>
                </div>
              ) : (
                /* Forgot password request screen */
                <div className="space-y-6">
                  <div className="text-center">
                    <div className="w-14 h-14 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4 text-indigo-400">
                      <Mail className="w-7 h-7" />
                    </div>
                    <h2 className="text-2xl font-black text-white tracking-tight">Recuperar Acceso</h2>
                    <p className="text-xs text-slate-400 font-medium mt-1">Ingresá tu correo para enviarte las instrucciones de restablecimiento</p>
                  </div>

                  <form onSubmit={handleForgotPasswordSubmit} className="space-y-5">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Correo Electrónico</label>
                      <div className="relative">
                        <Mail className="w-5 h-5 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
                        <input
                          type="email"
                          required
                          placeholder="nombre@zono.com.ar"
                          className="w-full pl-12 pr-4 py-3.5 rounded-2xl border border-slate-800 bg-slate-950/60 focus:bg-slate-950 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-white placeholder-slate-500 text-sm font-medium transition-all"
                          value={forgotEmail}
                          onChange={(e) => setForgotEmail(e.target.value)}
                        />
                      </div>
                    </div>

                    <Button
                      type="submit"
                      disabled={isSendingReset}
                      className="w-full py-4 text-sm font-black bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-2xl shadow-lg shadow-indigo-600/30 transition-all active:scale-[0.98]"
                    >
                      {isSendingReset ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Enviar Enlace de Recuperación"}
                    </Button>

                    <button
                      type="button"
                      onClick={() => setIsForgotPassword(false)}
                      className="flex items-center justify-center gap-2 w-full py-3 text-xs font-black uppercase tracking-wider text-slate-400 hover:text-white transition-colors cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      Cancelar y Volver
                    </button>
                  </form>
                </div>
              )
            ) : (
              /* Standard Login Form */
              <div className="space-y-6">
                <div className="text-center">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[11px] font-bold tracking-wide mb-4">
                    <Sparkles className="w-3 h-3" /> ZONO ENTERPRISE ERP
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Iniciar Sesión</h1>
                  <p className="text-xs text-slate-400 font-medium mt-1">Portal Central de Administración y Operaciones</p>
                </div>

                {loginError && (
                  <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold flex items-start gap-2.5 animate-in fade-in slide-in-from-top-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-400" />
                    <span>{loginError}</span>
                  </div>
                )}

                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Usuario / Correo</label>
                    <div className="relative">
                      <Mail className="w-5 h-5 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
                      <input
                        type="email"
                        required
                        placeholder="usuario@zono.com.ar"
                        className="w-full pl-12 pr-4 py-3.5 rounded-2xl border border-slate-800 bg-slate-950/60 focus:bg-slate-950 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-white placeholder-slate-600 text-sm font-medium transition-all"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Contraseña</label>
                      <button
                        type="button"
                        onClick={() => {
                          setForgotEmail(loginEmail);
                          setIsForgotPassword(true);
                        }}
                        className="text-[10px] font-black uppercase tracking-wider text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
                      >
                        ¿La olvidaste?
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="w-5 h-5 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        placeholder="••••••••••••"
                        className="w-full pl-12 pr-12 py-3.5 rounded-2xl border border-slate-800 bg-slate-950/60 focus:bg-slate-950 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-white placeholder-slate-600 text-sm font-medium transition-all"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors focus:outline-none cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={isLoggingIn}
                    className="w-full py-4 text-sm font-black bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-500 text-white rounded-2xl shadow-xl shadow-indigo-600/25 transition-all active:scale-[0.98] mt-2 cursor-pointer"
                  >
                    {isLoggingIn ? (
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Autenticando...</span>
                      </div>
                    ) : (
                      "Ingresar al Sistema"
                    )}
                  </Button>
                </form>

                {/* Modules Pills */}
                <div className="pt-4 border-t border-slate-800/80">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 text-center mb-2.5">Módulos Integrados</p>
                  <div className="flex flex-wrap items-center justify-center gap-1.5">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400 bg-slate-800/50 border border-slate-700/50 px-2 py-0.5 rounded-lg">
                      <BarChart3 className="w-3 h-3 text-blue-400" /> Dashboard
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400 bg-slate-800/50 border border-slate-700/50 px-2 py-0.5 rounded-lg">
                      <Coins className="w-3 h-3 text-emerald-400" /> Finanzas
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400 bg-slate-800/50 border border-slate-700/50 px-2 py-0.5 rounded-lg">
                      <ShoppingCart className="w-3 h-3 text-orange-400" /> Compras
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400 bg-slate-800/50 border border-slate-700/50 px-2 py-0.5 rounded-lg">
                      <Package className="w-3 h-3 text-indigo-400" /> Stock
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400 bg-slate-800/50 border border-slate-700/50 px-2 py-0.5 rounded-lg">
                      <Truck className="w-3 h-3 text-cyan-400" /> Logística
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Security Guarantee Footnote */}
          <div className="mt-6 text-center">
            <p className="text-[11px] text-slate-400 font-medium flex items-center justify-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Acceso restringido • Autenticación segura SSL
            </p>
          </div>
        </div>
      </main>

      {/* Bottom Footer */}
      <footer className="relative z-10 w-full max-w-6xl mx-auto px-6 py-4 text-center text-xs text-slate-400 font-medium">
        &copy; {new Date().getFullYear()} ZONO Construcción y Hogar. Todos los derechos reservados.
      </footer>
    </div>
  );
}
