"use client";

export const runtime = "edge";

import React, { useState, useEffect } from "react";
import { ProductCard } from "@/components/ui/ProductCard";
import { Button } from "@/components/ui/Button";
import { ArrowRight, CheckCircle2, Factory, Phone, Truck, ShieldCheck, Loader2 } from "lucide-react";
import Image from "next/image";
import { cn, formatPrice } from "@/lib/utils";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { Product } from "@/types";

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const [aboutImageUrl, setAboutImageUrl] = useState("https://images.unsplash.com/photo-1565514020179-026b92b84bb6?q=80&w=1200");

  useEffect(() => {
    async function fetchProducts() {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (data) setProducts(data);
      setLoading(false);
    }

    async function fetchSettings() {
      const { data } = await supabase
        .from('site_settings')
        .select('value')
        .eq('id', 'about_image_url')
        .single();
      
      if (data) setAboutImageUrl(data.value);
    }

    fetchProducts();
    fetchSettings();
  }, []);

  const filteredProducts = filter === "all" 
    ? products 
    : products.filter(p => p.category === filter);

  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="relative h-[85vh] flex items-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <Image 
            src="https://images.unsplash.com/photo-1503387762-592deb58ef4e?q=80&w=2000" 
            alt="Hero Background" 
            fill 
            className="object-cover brightness-[0.3]"
          />
        </div>
        
        <div className="container mx-auto px-6 relative z-10">
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="max-w-3xl"
          >
            <span className="inline-block py-2 px-4 rounded-full bg-brand-600/30 border border-brand-500/50 text-brand-100 text-xs font-black mb-8 backdrop-blur-md uppercase tracking-[0.2em]">
              🚀 Envíos a todo el país
            </span>
            <h1 className="text-5xl md:text-7xl font-black text-white mb-8 leading-[1.1] tracking-tighter">
              Construye el futuro con <span className="text-brand-500">calidad profesional</span>
            </h1>
            <p className="text-xl text-slate-300 mb-10 leading-relaxed max-w-2xl font-medium">
              Especialistas en tanques de agua, impermeabilización y soluciones integrales. Venta directa de fábrica y asesoramiento experto.
            </p>
            <div className="flex flex-col sm:flex-row gap-5">
              <Button size="lg" className="rounded-2xl group shadow-2xl shadow-brand-600/40">
                Explorar Catálogo <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
              <a href="#contacto" className="inline-flex h-14 items-center justify-center rounded-2xl border border-white/20 px-8 text-white hover:bg-white/10 hover:border-white/50 transition-all font-bold">
                Ubicación del Local
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="py-12 -mt-16 relative z-20">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <FeatureCard 
              icon={<Factory className="w-8 h-8" />} 
              title="Directo de Fábrica" 
              desc="Mejores precios garantizados sin intermediarios."
              color="bg-blue-50 text-blue-600"
            />
            <FeatureCard 
              icon={<ShieldCheck className="w-8 h-8" />} 
              title="Garantía de Calidad" 
              desc="Productos certificados para larga durabilidad."
              color="bg-amber-50 text-amber-600"
            />
            <FeatureCard 
              icon={<Truck className="w-8 h-8" />} 
              title="Envíos Express" 
              desc="Llegamos a donde estés con logística propia."
              color="bg-green-50 text-green-600"
            />
          </div>
        </div>
      </section>

      {/* Product Catalog */}
      <section id="productos" className="py-32 bg-slate-50">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-20 gap-8">
            <div className="max-w-xl">
              <h2 className="text-sm font-black tracking-[0.3em] text-brand-600 uppercase mb-4">Nuestra Selección</h2>
              <h3 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tighter">Catálogo de Productos</h3>
            </div>
            
          <div className="flex flex-wrap gap-2">
              {["all", ...new Set(products.map(p => p.category))].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFilter(cat)}
                  className={cn(
                    "px-6 py-3 rounded-full text-xs font-black uppercase tracking-widest transition-all",
                    filter === cat 
                      ? "bg-brand-600 text-white shadow-lg shadow-brand-600/30" 
                      : "bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-900 border border-slate-200"
                  )}
                >
                  {cat === "all" ? "Todos" : cat}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 className="w-10 h-10 text-brand-600 animate-spin" />
              <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Cargando catálogo...</p>
            </div>
          ) : filteredProducts.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-10">
              {filteredProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <div className="text-center py-20">
              <p className="text-slate-400 font-bold">No hay productos en esta categoría por ahora.</p>
              <Button variant="link" onClick={() => setFilter("all")}>Ver todos los productos</Button>
            </div>
          )}
        </div>
      </section>

      {/* About Section */}
      <section id="nosotros" className="py-32 bg-white overflow-hidden">
        <div className="container mx-auto px-6">
          <div className="flex flex-col lg:flex-row items-center gap-24">
            <div className="lg:w-1/2 relative">
              <div className="absolute -top-10 -left-10 w-40 h-40 bg-brand-50 rounded-full blur-3xl opacity-60" />
              <div className="relative rounded-[2.5rem] overflow-hidden shadow-2xl rotate-2 hover:rotate-0 transition-transform duration-700">
                <Image 
                  src={aboutImageUrl} 
                  alt="Nuestra Fábrica" 
                  width={600} 
                  height={800} 
                  className="object-cover h-[600px]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-brand-900/60 to-transparent" />
                <div className="absolute bottom-10 left-10 text-white">
                  <p className="text-3xl font-black tracking-tighter">Desde Buenos Aires</p>
                  <p className="text-brand-200 font-bold">Liderando en PASO DEL REY</p>
                </div>
              </div>
            </div>

            <div className="lg:w-1/2">
              <h2 className="text-5xl font-black text-slate-900 tracking-tighter mb-8 leading-tight">
                Somos tu aliado en cada <span className="text-brand-600">proyecto de vida</span>
              </h2>
              <p className="text-xl text-slate-600 mb-10 leading-relaxed font-medium">
                En ZonoHome combinamos la experiencia de fabricantes directos con la innovación tecnológica para ofrecerte las mejores soluciones en construcción y hogar.
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-12">
                <IconCheck text="Fabricación Directa Aquafort" />
                <IconCheck text="Stock Permanente Asegurado" />
                <IconCheck text="Asesoramiento por Expertos" />
                <IconCheck text="Venta Online y Local Físico" />
              </div>

              <Button size="lg" variant="outline" className="rounded-2xl border-brand-200 text-brand-700 hover:bg-brand-50">
                Conocenos más
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contacto" className="py-32 bg-slate-900 text-white relative">
        <div className="container mx-auto px-6">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-black mb-6 tracking-tighter">¿Listo para empezar?</h2>
            <p className="text-slate-400 max-w-2xl mx-auto text-lg font-medium">Visítanos en nuestro local o contáctanos por WhatsApp. Estamos para ayudarte en cada paso.</p>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
            <div className="space-y-8">
              <div className="bg-slate-800/50 p-8 rounded-[2rem] border border-slate-700 hover:border-brand-500 transition-all group">
                <div className="w-14 h-14 bg-brand-600 rounded-2xl flex items-center justify-center mb-6 text-2xl shadow-lg shadow-brand-600/20 group-hover:scale-110 transition-transform">
                  <Factory className="w-7 h-7" />
                </div>
                <h3 className="text-2xl font-black mb-3">Dirección</h3>
                <p className="text-slate-400 font-medium leading-relaxed">Quilmes 4541, Paso del Rey<br />Buenos Aires, Argentina.</p>
              </div>

              <div className="bg-slate-800/50 p-8 rounded-[2rem] border border-slate-700 hover:border-green-500 transition-all group">
                <a href="https://wa.me/5491157694181?text=Hola!%20Te%20contacto%20desde%20la%20p%C3%A1gina%20web%20de%20ZonoHome%20y%20me%20gustar%C3%ADa%20recibir%20asesoramiento." target="_blank" className="inline-block mb-6">
                  <div className="w-14 h-14 bg-green-600 rounded-2xl flex items-center justify-center text-2xl shadow-lg shadow-green-600/20 group-hover:scale-110 transition-transform">
                    <Phone className="w-7 h-7" />
                  </div>
                </a>
                <h3 className="text-2xl font-black mb-3">WhatsApp</h3>
                <p className="text-slate-400 font-medium mb-4">Atención personalizada inmediata.</p>
                <a href="https://wa.me/5491157694181?text=Hola!%20Te%20contacto%20desde%20la%20p%C3%A1gina%20web%20de%20ZonoHome%20y%20me%20gustar%C3%ADa%20recibir%20asesoramiento." target="_blank" className="text-green-400 hover:text-green-300 font-black text-lg">11 5769-4181</a>
              </div>
            </div>

            <div className="lg:col-span-2 h-[500px] rounded-[3rem] overflow-hidden shadow-2xl border border-slate-800 relative group">
              <div className="absolute inset-0 bg-brand-900/10 z-10 pointer-events-none group-hover:opacity-0 transition-opacity" />
              <iframe 
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3284.1132!2d-58.7495!3d-34.6025!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x95bc9431b5d4d337%3A0x6c6e75e4e7d4a4c!2sQuilmes%204541%2C%20Paso%20del%20Rey%2C%20Provincia%20de%20Buenos%20Aires!5e0!3m2!1ses!2sar!4v1710720000000!5m2!1ses!2sar" 
                width="100%" 
                height="100%" 
                style={{ border: 0, filter: 'grayscale(100%) invert(92%) contrast(83%)' }} 
                allowFullScreen={true} 
                loading="lazy" 
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function FeatureCard({ icon, title, desc, color }: { icon: React.ReactNode, title: string, desc: string, color: string }) {
  return (
    <div className="bg-white p-8 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 flex flex-col gap-6 hover:-translate-y-2 transition-transform duration-300">
      <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg shadow-current/10", color)}>
        {icon}
      </div>
      <div>
        <h3 className="text-xl font-black text-slate-900 mb-2">{title}</h3>
        <p className="text-slate-500 font-medium leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

function IconCheck({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3">
      <CheckCircle2 className="w-6 h-6 text-green-500" />
      <span className="text-slate-700 font-bold">{text}</span>
    </div>
  );
}
