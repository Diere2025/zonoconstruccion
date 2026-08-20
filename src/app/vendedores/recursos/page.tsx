"use client";

import React, { useState, useEffect } from "react";
import { Map, MessageCircle, HelpCircle, Search, ChevronDown, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function RecursosPage() {
  const [activeTab, setActiveTab] = useState<'zonas' | 'faqs' | 'respuestas'>('zonas');
  const [searchZone, setSearchZone] = useState("");

  const [localities, setLocalities] = useState<any[]>([]);

  useEffect(() => {
    async function fetchData() {
      const { data: localitiesList } = await supabase.from('localities').select('*, zones(name)');
      const { data: rulesList } = await supabase.from('zone_delivery_rules').select('*');

      if (localitiesList && rulesList) {
        const mapped = localitiesList.map((loc: any) => {
          const zoneRules = rulesList.filter((r: any) => r.zone_id === loc.zone_id);
          const daysStr = zoneRules.map((r: any) => `${r.product_category}: ${r.delivery_time}`).join(" | ");
          return {
            name: loc.name,
            zone: loc.zones?.name || "Sin Zona",
            days: daysStr || "Consultar"
          };
        });
        setLocalities(mapped);
      }
    }
    fetchData();
  }, []);

  const filteredLocalities = localities.filter(l => l.name.toLowerCase().includes(searchZone.toLowerCase()));

  // Mock data for FAQs
  const faqs = [
    { q: "¿Cuánto demora la entrega?", a: "Depende de la zona. En Zona Oeste 1 es de 48hs hábiles. Consultá el buscador de zonas." },
    { q: "¿Los tanques tienen garantía?", a: "Sí, todos los tanques Aquafort cuentan con garantía de fábrica de 5 años por defectos de fabricación." },
    { q: "¿Qué métodos de pago tienen recargo?", a: "Las tarjetas de crédito tienen recargo según la cantidad de cuotas. El cotizador lo calcula automáticamente." }
  ];

  // Mock data for Quick Replies
  const quickReplies = [
    { title: "Saludo Inicial", text: "¡Hola! ¿Cómo estás? Soy asesor de Zono Construcción y Hogar. ¿En qué te puedo ayudar hoy?" },
    { title: "Demora de Entrega", text: "Te comento que para tu zona estamos manejando una demora de entrega aproximada de 48 a 72hs hábiles una vez confirmado el pedido." },
    { title: "Medios de Pago", text: "Aceptamos efectivo, transferencia bancaria, y tarjetas de crédito en hasta 6 cuotas fijas. ¿Cómo preferías abonarlo?" }
  ];

  const copyReply = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("Copiado al portapapeles");
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-black text-slate-900 tracking-tight">Recursos y Herramientas</h1>
        <p className="text-[11px] text-slate-400 font-semibold">Material de apoyo para agilizar tus ventas.</p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        <button 
          onClick={() => setActiveTab('zonas')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs transition-all ${activeTab === 'zonas' ? 'bg-brand-600 text-white shadow-sm' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}
        >
          <Map className="w-3.5 h-3.5" /> Validación de Zonas
        </button>
        <button 
          onClick={() => setActiveTab('respuestas')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs transition-all ${activeTab === 'respuestas' ? 'bg-brand-600 text-white shadow-sm' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}
        >
          <MessageCircle className="w-3.5 h-3.5" /> Respuestas Rápidas
        </button>
        <button 
          onClick={() => setActiveTab('faqs')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs transition-all ${activeTab === 'faqs' ? 'bg-brand-600 text-white shadow-sm' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}
        >
          <HelpCircle className="w-3.5 h-3.5" /> Preguntas Frecuentes
        </button>
      </div>

      <div className="bg-white p-4 rounded-xl border border-slate-200/60 shadow-sm min-h-[400px]">
        
        {activeTab === 'zonas' && (
          <div className="space-y-4 max-w-2xl">
            <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider">Buscador de Zonas y Tipos de Entrega</h2>
            <p className="text-[11px] text-slate-400 font-semibold">Buscá la localidad del cliente para informarle correctamente los días y tipos de entrega disponibles en esa zona.</p>
            
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input 
                type="text" 
                placeholder="Escribe el nombre de la localidad (Ej. Moreno)..." 
                className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500/10 font-bold text-xs outline-none"
                value={searchZone}
                onChange={(e) => setSearchZone(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              {filteredLocalities.length > 0 ? (
                filteredLocalities.map((loc, i) => (
                  <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-100 gap-2">
                    <div>
                      <h3 className="font-black text-slate-800 text-xs">{loc.name}</h3>
                      <span className="text-[9px] uppercase font-black tracking-wider text-brand-500">{loc.zone}</span>
                    </div>
                    <div className="bg-white px-2 py-1 rounded border border-slate-200 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="font-bold text-xs text-slate-700">Entrega: {loc.days}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-xs text-slate-400 font-medium border-2 border-dashed border-slate-100 rounded-lg">
                  No se encontraron localidades con ese nombre.
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'respuestas' && (
          <div className="space-y-4 max-w-3xl">
            <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider">Plantillas para WhatsApp</h2>
            <p className="text-[11px] text-slate-400 font-semibold">Copiá y pegá estos textos para responder más rápido a las consultas comunes.</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {quickReplies.map((reply, i) => (
                <div key={i} className="p-3 rounded-lg bg-slate-50 border border-slate-100 relative group flex flex-col justify-between">
                   <div>
                     <h3 className="font-black text-slate-800 text-xs mb-1">{reply.title}</h3>
                     <p className="text-[11px] text-slate-500 font-medium leading-normal italic">"{reply.text}"</p>
                   </div>
                   <button 
                     onClick={() => copyReply(reply.text)}
                     className="mt-3 px-3 py-1 bg-white text-brand-600 border border-slate-200 rounded text-[10px] font-bold uppercase tracking-wider hover:bg-brand-50 hover:border-brand-200 transition-colors"
                   >
                     Copiar Texto
                   </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'faqs' && (
          <div className="space-y-4 max-w-3xl">
            <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider">Preguntas Frecuentes Internas</h2>
            <p className="text-[11px] text-slate-400 font-semibold">Dudas comunes sobre el proceso de venta o productos.</p>
            
            <div className="space-y-2">
              {faqs.map((faq, i) => (
                <div key={i} className="p-3 rounded-lg bg-white border border-slate-200 shadow-sm">
                   <h3 className="font-black text-slate-800 text-xs flex justify-between items-center cursor-pointer">
                     {faq.q}
                     <ChevronDown className="w-4 h-4 text-slate-400" />
                   </h3>
                   <p className="mt-2 text-slate-500 font-medium text-[11px] leading-normal border-t border-slate-100 pt-2">
                     {faq.a}
                   </p>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
