"use client";

export const runtime = "edge";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import { Phone, Shield, Truck, Factory, Star, ChevronDown, CheckCircle2, ArrowRight, MessageCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Product } from "@/types";
import { formatPrice } from "@/lib/utils";
import { motion } from "framer-motion";

// Número de WhatsApp
const WHATSAPP_NUMBER = "5491157694181";

// Generar link de WhatsApp con mensaje precargado
function getWhatsAppLink(productName?: string, userName?: string) {
  let msg = "¡Hola! 👋 Te contacto desde la *Landing de Tanques* de ZonoHome.";
  if (productName) msg += `\n\nMe interesa: *${productName}*`;
  if (userName) msg += `\nMi nombre es: ${userName}`;
  msg += "\n\n¿Podrían asesorarme con precio y disponibilidad?";
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
}

// Dispara conversión en Google Ads (si está configurado)
function trackConversion() {
  if (typeof window !== "undefined" && (window as any).gtag) {
    (window as any).gtag("event", "conversion", {
      send_to: "AW-17712339516/IlitCPDnoYscELy08_1B",
    });
  }
  // Facebook Pixel
  if (typeof window !== "undefined" && (window as any).fbq) {
    (window as any).fbq("track", "Lead");
  }
}

export default function TanquesLanding() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [userName, setUserName] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [heroProduct, setHeroProduct] = useState<Product | null>(null);


  useEffect(() => {
    async function fetchLandingData() {
      // 1. Cargar configuración de la landing desde admin
      const { data: settings } = await supabase
        .from("site_settings")
        .select("*")
        .in("id", ["landing_hero_product_id", "landing_categories"]);

      const heroId = settings?.find(s => s.id === "landing_hero_product_id")?.value || "";
      const categoriesStr = settings?.find(s => s.id === "landing_categories")?.value || "";
      const categories = categoriesStr.split(",").filter(Boolean);

      // 2. Cargar productos filtrados por las categorías configuradas para Landing
      let query = supabase.from("products").select("*").order("price", { ascending: true });
      
      if (categories.length > 0) {
        query = query.in("category", categories);
      }
      
      const { data } = await query;

      if (data) {
        const withImages = data.filter(p => p.image_url && p.image_url.trim() !== '');
        setProducts(withImages);

        // 3. Determinar producto hero
        if (heroId) {
          const found = withImages.find(p => p.id === heroId);
          setHeroProduct(found || withImages[0] || null);
        } else {
          setHeroProduct(withImages[0] || null);
        }
      }
      setLoading(false);
    }
    fetchLandingData();

    // Capturar UTM params para analytics
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const utmSource = params.get("utm_source");
      const utmCampaign = params.get("utm_campaign");
      if (utmSource) {
        sessionStorage.setItem("utm_source", utmSource);
        sessionStorage.setItem("utm_campaign", utmCampaign || "");
      }
    }
  }, []);

  const handleCTA = (product?: Product) => {
    if (product) {
      setSelectedProduct(product);
      setShowForm(true);
      // Scroll suave al formulario
      setTimeout(() => {
        document.getElementById("lead-form")?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    } else {
      // CTA general sin producto
      trackConversion();
      window.open(getWhatsAppLink(), "_blank");
    }
  };

  const handleSubmitLead = (e: React.FormEvent) => {
    e.preventDefault();
    trackConversion();
    window.open(
      getWhatsAppLink(selectedProduct?.name, userName),
      "_blank"
    );
  };

  return (
    <div className="flex flex-col">
      {/* ========== HERO BANNER ========== */}
      <section className="relative min-h-[85vh] md:min-h-[70vh] flex items-center bg-slate-950 overflow-hidden">
        {/* Fondo con gradiente */}
        <div className="absolute inset-0 bg-gradient-to-br from-brand-900/90 via-slate-950 to-slate-950" />
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1504307651254-35680f356dfd?q=80&w=2000')] bg-cover bg-center opacity-10" />

        <div className="container mx-auto px-6 relative z-10 py-16">
          <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
            {/* Texto */}
            <motion.div 
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
              className="flex-1 text-center lg:text-left"
            >
              <div className="inline-flex items-center gap-2 bg-brand-600/30 border border-brand-500/50 text-brand-100 rounded-full px-4 py-2 text-xs font-black uppercase tracking-widest mb-8 backdrop-blur-sm shadow-sm shadow-brand-500/10">
                <Factory className="w-4 h-4 text-brand-200" />
                ¡Somos Fabricantes!
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white leading-[1.05] tracking-tighter mb-6">
                Tanques de Agua<br />
                <span className="text-brand-400">al Mejor Precio</span>
              </h1>

              <p className="text-lg text-slate-300 mb-8 max-w-lg mx-auto lg:mx-0 font-medium leading-relaxed">
                BioFort y AquaFort. Desde 300 hasta 3.000 litros. 
                Envíos a todo el país con <strong className="text-white">garantía de fábrica</strong>.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start mb-8">
                <button
                  onClick={() => document.getElementById("productos")?.scrollIntoView({ behavior: "smooth" })}
                  className="h-16 px-10 bg-brand-600 hover:bg-brand-500 text-white rounded-2xl text-lg font-black shadow-2xl shadow-brand-600/30 transition-all flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-[0.98]"
                >
                  Ver Tanques y Precios
                  <ChevronDown className="w-5 h-5 animate-bounce" />
                </button>
                <button 
                  onClick={() => handleCTA()}
                  className="h-16 px-10 bg-green-600 hover:bg-green-500 text-white rounded-2xl text-lg font-black shadow-2xl shadow-green-600/30 transition-all flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-[0.98]"
                >
                  <MessageCircle className="w-5 h-5" />
                  Consultar por WhatsApp
                </button>
              </div>

              {/* Trust Badges */}
              <div className="flex flex-wrap gap-6 justify-center lg:justify-start text-sm text-slate-400">
                <span className="flex items-center gap-2"><Shield className="w-4 h-4 text-brand-400" /> Garantía de Fábrica</span>
                <span className="flex items-center gap-2"><Truck className="w-4 h-4 text-brand-400" /> Envío a Todo el País</span>
                <span className="flex items-center gap-2"><Star className="w-4 h-4 text-brand-400" /> +50.000 Clientes Satisfechos</span>
              </div>
            </motion.div>

            {/* Imagen Hero */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="flex-1 max-w-md lg:max-w-lg"
            >
              <div className="relative">
                <div className="absolute -inset-4 bg-brand-600/20 rounded-[3rem] blur-2xl" />
                {heroProduct?.image_url ? (
                  <Image
                    src={heroProduct.image_url}
                    alt={heroProduct.name || "Tanques de Agua"}
                    width={600}
                    height={600}
                    className="relative rounded-[2rem] shadow-2xl object-contain bg-white p-6"
                    unoptimized
                    priority
                  />
                ) : (
                  <div className="w-full aspect-square max-w-[600px] relative rounded-[2rem] shadow-2xl bg-white flex items-center justify-center">
                    <p className="text-slate-300 font-bold">Cargando...</p>
                  </div>
                )}
                {/* Badge de precio */}
                <div className="absolute -bottom-4 -right-4 bg-white rounded-2xl p-4 shadow-2xl">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Desde</p>
                  <p className="text-2xl font-black text-brand-600">
                    {heroProduct ? formatPrice(heroProduct.price) : "$ --"}
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ========== BENEFICIOS ========== */}
      <section className="py-16 bg-white border-b border-slate-100">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { icon: <Factory className="w-7 h-7" />, title: "Directo de Fábrica", desc: "Sin intermediarios, mejor precio garantizado", color: "bg-blue-50 text-blue-600" },
              { icon: <Truck className="w-7 h-7" />, title: "Envío a Todo el País", desc: "Logística propia, entregas en tiempo récord", color: "bg-green-50 text-green-600" },
              { icon: <Shield className="w-7 h-7" />, title: "Garantía Oficial", desc: "Productos certificados de primera calidad", color: "bg-amber-50 text-amber-600" },
              { icon: <Phone className="w-7 h-7" />, title: "Asesoramiento Gratis", desc: "Te ayudamos a elegir el tanque ideal", color: "bg-purple-50 text-purple-600" },
            ].map((item, i) => (
              <div key={i} className="text-center p-6">
                <div className={`w-16 h-16 ${item.color} rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-sm`}>
                  {item.icon}
                </div>
                <h3 className="font-black text-slate-900 mb-2 text-lg">{item.title}</h3>
                <p className="text-slate-500 text-sm font-medium">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== CATÁLOGO DE TANQUES ========== */}
      <section id="productos" className="py-20 bg-slate-50">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-[10px] font-black tracking-[0.4em] text-brand-600 uppercase mb-3">Catálogo</h2>
            <h3 className="text-4xl font-black text-slate-900 tracking-tighter">Nuestros Tanques de Agua</h3>
            <p className="text-slate-500 mt-4 max-w-xl mx-auto font-medium">
              Elegí el que necesitás y consultanos por WhatsApp. Te respondemos al instante.
            </p>
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <div className="w-10 h-10 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {products.map((product) => (
                <div
                  key={product.id}
                  className="bg-white rounded-3xl border border-slate-100 hover:border-brand-200 hover:shadow-xl hover:shadow-brand-600/5 transition-all duration-300 overflow-hidden group cursor-pointer"
                  onClick={() => handleCTA(product)}
                >
                  {/* Imagen */}
                  <div className="relative aspect-square p-6 bg-white flex items-center justify-center overflow-hidden">
                    {product.dimensions && (
                      <span className="absolute top-3 left-3 bg-brand-600/90 text-white text-[9px] font-black px-3 py-1 rounded-lg uppercase tracking-widest z-10">
                        {product.dimensions}
                      </span>
                    )}
                    {product.is_on_sale && (
                      <span className="absolute top-3 right-3 bg-red-600 text-white text-[9px] font-black px-3 py-1 rounded-lg uppercase tracking-widest z-10 animate-pulse">
                        OFERTA
                      </span>
                    )}
                    <div className="relative w-full h-full transition-transform duration-300 group-hover:scale-105">
                      <Image
                        src={product.image_url && product.image_url.trim() !== "" ? product.image_url : "https://placehold.co/400x400?text=Tanque"}
                        alt={product.name}
                        fill
                        className="object-contain p-4"
                        sizes="300px"
                        unoptimized
                      />
                    </div>
                  </div>

                  {/* Info */}
                  <div className="p-5 border-t border-slate-50">
                    {product.brand && (
                      <span className="text-[9px] font-black text-brand-600 uppercase tracking-widest opacity-70">
                        {product.brand}
                      </span>
                    )}
                    <h4 className="text-sm font-bold text-slate-900 mt-1 line-clamp-2 min-h-[2.5rem] leading-tight">
                      {product.name}
                    </h4>
                    <div className="flex items-center justify-between mt-4">
                      <span className="text-xl font-black text-slate-900">
                        {formatPrice(product.price)}
                      </span>
                      <span className="bg-green-600 text-white text-[10px] font-black px-4 py-2 rounded-xl uppercase tracking-widest group-hover:bg-green-500 transition-colors flex items-center gap-1.5">
                        <MessageCircle className="w-3.5 h-3.5" />
                        Consultar
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ========== FORMULARIO RÁPIDO DE LEAD ========== */}
      {showForm && selectedProduct && (
        <section id="lead-form" className="py-20 bg-white border-t border-slate-100">
          <div className="container mx-auto px-6">
            <div className="max-w-xl mx-auto">
              <div className="bg-slate-50 rounded-[2rem] p-8 md:p-12 border border-slate-100 shadow-xl">
                <div className="text-center mb-8">
                  <div className="inline-flex items-center gap-2 bg-green-100 text-green-700 rounded-full px-4 py-2 text-xs font-black uppercase tracking-widest mb-4">
                    <CheckCircle2 className="w-4 h-4" />
                    Producto Seleccionado
                  </div>
                  <h3 className="text-2xl font-black text-slate-900 tracking-tighter">{selectedProduct.name}</h3>
                  <p className="text-3xl font-black text-brand-600 mt-2">{formatPrice(selectedProduct.price)}</p>
                </div>

                <form onSubmit={handleSubmitLead} className="space-y-5">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">
                      Tu Nombre (opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="¿Cómo te llamás?"
                      className="w-full px-5 py-4 rounded-2xl border border-slate-200 bg-white font-bold text-slate-900 focus:ring-4 focus:ring-brand-500/10 focus:border-brand-300 transition-all"
                      value={userName}
                      onChange={(e) => setUserName(e.target.value)}
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full h-16 bg-green-600 hover:bg-green-500 text-white rounded-2xl text-lg font-black shadow-2xl shadow-green-600/20 transition-all flex items-center justify-center gap-3 hover:scale-[1.01] active:scale-[0.99]"
                  >
                    <MessageCircle className="w-6 h-6" />
                    Consultar por WhatsApp
                    <ArrowRight className="w-5 h-5" />
                  </button>

                  <p className="text-center text-xs text-slate-400 font-medium">
                    Se abrirá WhatsApp con los datos del producto precargados. Sin spam.
                  </p>
                </form>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ========== SOCIAL PROOF / TESTIMONIOS ========== */}
      <section className="py-20 bg-slate-900 text-white">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-[10px] font-black tracking-[0.4em] text-brand-400 uppercase mb-3">Testimonios</h2>
            <h3 className="text-4xl font-black tracking-tighter">Lo que Dicen Nuestros Clientes</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              { name: "Carlos M.", text: "Excelente calidad y el precio fue mucho mejor que en las ferreterías. El envío llegó en 48hs.", stars: 5 },
              { name: "María L.", text: "Me asesoraron por WhatsApp y me ayudaron a elegir el tanque perfecto para mi casa. Super recomendados.", stars: 5 },
              { name: "Roberto G.", text: "Ya compré 3 tanques para distintas obras. Siempre con la mejor atención y precios de fábrica.", stars: 5 },
            ].map((review, i) => (
              <div key={i} className="bg-slate-800/50 rounded-2xl p-8 border border-slate-700/50">
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: review.stars }).map((_, j) => (
                    <Star key={j} className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                  ))}
                </div>
                <p className="text-slate-300 font-medium mb-6 leading-relaxed italic">"{review.text}"</p>
                <p className="font-black text-white">{review.name}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== CTA FINAL ========== */}
      <section className="py-20 bg-brand-600 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-700 to-brand-500" />
        <div className="container mx-auto px-6 relative z-10 text-center">
          <h2 className="text-4xl md:text-5xl font-black tracking-tighter mb-6">
            ¿Necesitás un Tanque de Agua?
          </h2>
          <p className="text-xl text-brand-100 mb-10 max-w-2xl mx-auto font-medium">
            Consultanos ahora por WhatsApp y recibí asesoramiento gratuito. 
            Respondemos en minutos.
          </p>
          <button
            onClick={() => handleCTA()}
            className="h-16 px-12 bg-white text-brand-700 rounded-2xl text-lg font-black shadow-2xl transition-all inline-flex items-center gap-3 hover:scale-[1.02] active:scale-[0.98] hover:bg-brand-50"
          >
            <MessageCircle className="w-6 h-6" />
            Hablar por WhatsApp Ahora
          </button>
          <p className="text-brand-200 mt-6 text-sm font-medium">
            📍 Quilmes 4541, Paso del Rey · ☎ 11 5769-4181
          </p>
        </div>
      </section>

      {/* ========== FOOTER MÍNIMO ========== */}
      <footer className="py-8 bg-slate-950 text-slate-500 text-center text-sm">
        <p>© {new Date().getFullYear()} <strong>Zono Construcción y Hogar</strong> · Todos los derechos reservados</p>
      </footer>

      {/* ========== BOTÓN FLOTANTE DE WHATSAPP ========== */}
      <a
        href={getWhatsAppLink()}
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-50 w-16 h-16 bg-green-600 hover:bg-green-500 text-white rounded-full shadow-2xl shadow-green-600/30 flex items-center justify-center transition-all hover:scale-110 active:scale-95"
      >
        <MessageCircle className="w-7 h-7" />
      </a>
    </div>
  );
}
