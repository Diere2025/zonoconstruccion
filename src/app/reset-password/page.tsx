"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import { Loader2, KeyRound, CheckCircle2, AlertCircle, ArrowRight } from "lucide-react";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const router = useRouter();

  useEffect(() => {
    // Wait a brief moment for the Supabase client to process the hash token from the URL
    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setHasSession(true);
        } else {
          // Double check with a small delay in case Supabase event listener is setting it
          await new Promise(resolve => setTimeout(resolve, 800));
          const { data: { session: delayedSession } } = await supabase.auth.getSession();
          if (delayedSession) {
            setHasSession(true);
          } else {
            setHasSession(false);
          }
        }
      } catch (err) {
        console.error("Error checking session:", err);
        setHasSession(false);
      } finally {
        setCheckingSession(false);
      }
    };

    checkAuth();

    // Listen for auth state changes just in case
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        setHasSession(true);
        setCheckingSession(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    if (password.length < 6) {
      setErrorMessage("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Las contraseñas no coinciden.");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setErrorMessage(error.message);
      } else {
        // Sign out to clear the recovery session token
        await supabase.auth.signOut();
        setSuccess(true);
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Ocurrió un error inesperado.");
    } finally {
      setSubmitting(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <Loader2 className="w-10 h-10 animate-spin text-brand-600 mb-4" />
        <p className="text-slate-500 font-bold text-sm tracking-tight">Verificando enlace de recuperación...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white p-12 rounded-[3rem] shadow-2xl border border-slate-100 w-full max-w-md">
        {!hasSession ? (
          // Error screen (Invalid/Expired token)
          <div className="text-center space-y-6">
            <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto">
              <AlertCircle className="w-8 h-8 text-red-600 animate-pulse" />
            </div>
            <div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tighter">Enlace Inválido</h1>
              <p className="text-slate-500 font-medium text-sm mt-3 leading-relaxed">
                El enlace de recuperación ha expirado, es inválido o ya fue utilizado. 
                Por favor, solicitá un nuevo enlace desde el portal de administración.
              </p>
            </div>
            <div className="pt-4">
              <Button 
                onClick={() => router.push("/admin")} 
                className="w-full py-6 font-bold rounded-2xl bg-slate-900 text-white hover:bg-slate-800"
              >
                Ir a Iniciar Sesión
              </Button>
            </div>
          </div>
        ) : success ? (
          // Success screen
          <div className="text-center space-y-6">
            <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto animate-bounce-slow">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tighter">¡Contraseña Guardada!</h1>
              <p className="text-slate-500 font-medium text-sm mt-2 leading-relaxed">
                Tu contraseña ha sido restablecida con éxito. Ya podés iniciar sesión con tus nuevas credenciales.
              </p>
            </div>
            <div className="pt-4">
              <Button 
                onClick={() => router.push("/admin")} 
                className="w-full py-6 font-black rounded-2xl flex items-center justify-center gap-2"
              >
                Iniciar Sesión <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ) : (
          // Reset password form
          <div className="space-y-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-brand-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <KeyRound className="w-8 h-8 text-brand-600" />
              </div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tighter">Nueva Contraseña</h1>
              <p className="text-slate-500 font-medium mt-2">Ingresá tu nueva clave de acceso para el portal</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {errorMessage && (
                <div className="p-4 bg-red-50 text-red-700 text-xs font-bold rounded-2xl border border-red-100 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Nueva Contraseña</label>
                <input 
                  type="password" 
                  required 
                  placeholder="Mínimo 6 caracteres"
                  className="w-full px-5 py-4 rounded-2xl border border-slate-100 focus:ring-4 focus:ring-brand-500/10 bg-slate-50 font-bold"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Confirmar Contraseña</label>
                <input 
                  type="password" 
                  required 
                  placeholder="Repetir nueva contraseña"
                  className="w-full px-5 py-4 rounded-2xl border border-slate-100 focus:ring-4 focus:ring-brand-500/10 bg-slate-50 font-bold"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>

              <Button type="submit" disabled={submitting} className="w-full py-8 text-lg font-black rounded-2xl">
                {submitting ? <Loader2 className="animate-spin" /> : "Guardar Contraseña"}
              </Button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
