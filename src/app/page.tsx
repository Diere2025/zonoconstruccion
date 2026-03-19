"use client";

export const runtime = "edge";

import React, { useState, useEffect, useRef } from "react";
import { ProductCard } from "@/components/ui/ProductCard";
import { ProductModal } from "@/components/ui/ProductModal";
import { ProductFormModal } from "@/components/ui/ProductFormModal";
import { Button } from "@/components/ui/Button";
import { ArrowRight, Factory, Phone, Truck, ShieldCheck, Loader2, CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import Image from "next/image";
import { cn, formatPrice } from "@/lib/utils";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { Product } from "@/types";

// Componente helper para las filas de productos con flechas y márgenes
const ProductRow = ({
  title,
  subTitle,
  products,
  onOpenModal,
  isSale = false,
  bgColor = "",
  accentColor = "text-brand-600"
}: {
  title: string;
  subTitle: string;
  products: Product[];
  onOpenModal: (product: Product) => void;
  isSale?: boolean;
  bgColor?: string;
  accentColor?: string;
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const { scrollLeft, clientWidth } = scrollRef.current;
      const move = clientWidth * 0.8;
      const scrollTo = direction === 'left' ? scrollLeft - move : scrollLeft + move;
      scrollRef.current.scrollTo({ left: scrollTo, behavior: 'smooth' });
    }
  };

  return (
    <section className={cn("py-14 border-b border-slate-100/60", bgColor)}>
      <div className="container mx-auto px-6">
        {/* Header con título y flechas */}
        <div className="flex items-end justify-between mb-8">
          <div className="flex items-center gap-4">
            {isSale && (
              <div className="bg-red-600 p-2 rounded-xl shadow-lg shadow-red-600/20">
                <ArrowRight className="w-5 h-5 text-white rotate-45" />
              </div>
            )}
            <div>
              <h2 className={cn("text-[10px] font-black tracking-[0.4em] uppercase mb-2", accentColor)}>
                {subTitle}
              </h2>
              <h3 className="text-3xl font-black text-slate-900 tracking-tighter">{title}</h3>
            </div>
          </div>
          <div className="hidden md:flex gap-2">
            <button
              onClick={() => scroll('left')}
              className="p-3 rounded-full border border-slate-200 hover:bg-slate-50 transition-colors shadow-sm bg-white"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => scroll('right')}
              className="p-3 rounded-full border border-slate-200 hover:bg-slate-50 transition-colors shadow-sm bg-white"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Carrusel dentro del container para alinear con el titulo */}
        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] pb-4 scroll-smooth"
        >
          {products.map(product => (
            <div key={product.id} className="w-[75vw] sm:w-[240px] md:w-[220px] lg:w-[210px] snap-start flex-shrink-0">
              <ProductCard product={product} onOpenModal={onOpenModal} />
            </div>
          ))}
          {/* Spacer final para margen derecho */}
          <div className="min-w-[1px] flex-shrink-0" />
        </div>
      </div>
    </section>
  );
};

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const [aboutImageUrl, setAboutImageUrl] = useState("https://images.unsplash.com/photo-1565514020179-026b92b84bb6?q=80&w=1200");

  const openProductModal = (product: Product) => {
    setSelectedProduct(product);
    setIsModalOpen(true);
  };

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      
      // 1. Fetch Settings
      const { data: settings } = await supabase
        .from('site_settings')
        .select('*')
        .in('id', ['about_image_url', 'landing_categories']);
      
      let aboutUrl = '';
      let landingCats: string[] = [];
      
      if (settings) {
        const about = settings.find(s => s.id === 'about_image_url');
        const cats = settings.find(s => s.id === 'landing_categories');
        if (about) aboutUrl = about.value;
        if (cats && cats.value) landingCats = cats.value.split(',').filter(Boolean);
      }
      
      if (aboutUrl) setAboutImageUrl(aboutUrl);

      // 2. Fetch Products filtered by Landing Categories
      let query = supabase.from('products').select('*').order('created_at', { ascending: false });
      
      if (landingCats.length > 0) {
        query = query.in('category', landingCats);
      }

      const { data: productsData } = await query;
      
      if (productsData) {
        setProducts(productsData.filter(p => p.image_url && p.image_url.trim() !== ''));
      }
      setLoading(false);
    }

    async function checkAdmin() {
      const { data: { session } } = await supabase.auth.getSession();
      setIsAdmin(!!session);
    }

    fetchData();
    checkAdmin();
  }, []);


  return (
    <div className="flex flex-col">
      {/* Hero Section - Mas compacto para enfoque e-commerce */}
      <section className="relative h-[65vh] flex items-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <Image
            src="https://images.unsplash.com/photo-1503387762-592deb58ef4e?q=80&w=2000"
            alt="Hero Background"
            fill
            className="object-cover brightness-[0.4]"
            unoptimized
          />
        </div>

        <div className="container mx-auto px-6 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-3xl"
          >
            <span className="inline-block py-2 px-4 rounded-full bg-brand-600/30 border border-brand-500/50 text-brand-100 text-[10px] font-black mb-6 backdrop-blur-md uppercase tracking-[0.2em]">
              🚀 Envíos a todo el país
            </span>
            <h1 className="text-5xl md:text-7xl font-black text-white mb-6 leading-[1.05] tracking-tighter">
              Soluciones en <span className="text-brand-500 text-glow">Construcción</span>
            </h1>
            <p className="text-lg text-slate-300 mb-8 leading-relaxed max-w-xl font-medium">
              Especialistas en tanques de agua e impermeabilización. Venta directa de fábrica con asesoramiento experto para tu proyecto.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <a href="#productos" className="contents">
                <Button size="lg" className="rounded-2xl h-14 px-10 group shadow-2xl shadow-brand-600/40 w-full sm:w-auto text-lg font-black">
                  Ver Productos <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </a>
              <a href="#contacto" className="inline-flex h-14 items-center justify-center rounded-2xl border border-white/20 px-8 text-white hover:bg-white/10 hover:border-white/50 transition-all font-bold">
                Ubicación
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

      {/* Secciones de Productos - Refactorizado con ProductRow */}
      <div id="productos" className="bg-white">
        {/* Carrusel Destacados */}
        {products.some(p => p.is_featured) && (
          <ProductRow
            title="Productos Destacados"
            subTitle="Selección Premium"
            products={products.filter(p => p.is_featured)}
            onOpenModal={openProductModal}
            bgColor="bg-emerald-50/50"
            accentColor="text-emerald-600"
          />
        )}

        {/* Carrusel Liquidación */}
        {products.some(p => p.is_on_sale) && (
          <ProductRow
            title="Liquidación Limitada"
            subTitle="Oportunidades"
            products={products.filter(p => p.is_on_sale)}
            onOpenModal={openProductModal}
            isSale={true}
            bgColor="bg-red-50/50"
            accentColor="text-red-600"
          />
        )}

        {/* Filas por Categoría */}
        {Array.from(new Set(products.map(p => p.category)))
          .sort()
          .map((cat) => (
            <ProductRow
              key={cat}
              title={cat}
              subTitle="Sección"
              products={products.filter(p => p.category === cat)}
              onOpenModal={openProductModal}
            />
          ))}
      </div>

      {/* About Section */}
      <section id="nosotros" className="py-32 bg-white overflow-hidden">
        <div className="container mx-auto px-6">
          <div className="flex flex-col lg:flex-row items-center gap-24">
            <div className="lg:w-1/2 relative">
              <div className="absolute -top-10 -left-10 w-40 h-40 bg-brand-50 rounded-full blur-3xl opacity-60" />
              <div className="relative rounded-[2.5rem] overflow-hidden shadow-2xl rotate-2 hover:rotate-0 transition-transform duration-700">
                <Image 
                  src={aboutImageUrl && aboutImageUrl.trim() !== "" ? aboutImageUrl : "https://images.unsplash.com/photo-1565514020179-026b92b84bb6?q=80&w=1200"} 
                  alt="Nuestra Fábrica" 
                  width={600} 
                  height={800} 
                  className="object-cover h-[600px]"
                  unoptimized
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

      {selectedProduct && (
        <ProductModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          product={selectedProduct}
          allProducts={products}
          isAdmin={isAdmin}
          onEdit={(product) => {
            setEditingProduct(product);
            setIsModalOpen(false);
            setIsEditModalOpen(true);
          }}
        />
      )}

      {/* Admin Edit Modal */}
      {isAdmin && (
        <ProductFormModal 
          isOpen={isEditModalOpen}
          product={editingProduct}
          onClose={() => setIsEditModalOpen(false)}
          onSuccess={() => {
            // Refresh products inline
            const fetchProducts = async () => {
              const { data } = await supabase.from('products').select('*').order('created_at', { ascending: false });
              if (data) setProducts(data.filter(p => p.image_url && p.image_url.trim() !== ''));
            };
            fetchProducts();
          }}
          allProducts={products}
        />
      )}
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
