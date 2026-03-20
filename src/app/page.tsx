"use client";

export const runtime = "edge";

import React, { useState, useEffect, useRef } from "react";
import { ProductCard } from "@/components/ui/ProductCard";
import { ProductModal } from "@/components/ui/ProductModal";
import { ProductFormModal } from "@/components/ui/ProductFormModal";
import { Button } from "@/components/ui/Button";
import { ArrowRight, Factory, Phone, Truck, ShieldCheck, Loader2, CheckCircle2, ChevronLeft, ChevronRight, Waves, Droplets, Thermometer, Bath, Wrench, Home as HomeIcon, Star, MessageCircle } from "lucide-react";
import Image from "next/image";
import { cn, formatPrice } from "@/lib/utils";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { Product } from "@/types";

// Componente de Categorías Estilo Mercado Libre
const CategorySection = () => {
  const categories = [
    { title: "Tanques de Agua", icon: <Waves className="w-8 h-8" />, desc: "Reserva segura de agua", href: "/tanques", color: "bg-blue-50 text-blue-600" },
    { title: "Impermeablización", icon: <Droplets className="w-8 h-8" />, desc: "Protección total de techos", href: "/#impermeabilización", color: "bg-cyan-50 text-cyan-600" },
    { title: "Termotanques", icon: <Thermometer className="w-8 h-8" />, desc: "Agua caliente siempre", href: "/#termotanques", color: "bg-orange-50 text-orange-600" },
    { title: "Grifería", icon: <Bath className="w-8 h-8" />, desc: "Diseño y funcionalidad", href: "/#grifería", color: "bg-emerald-50 text-emerald-600" },
    { title: "Bombas", icon: <Wrench className="w-8 h-8" />, desc: "Presión y elevación", href: "/#bombas", color: "bg-indigo-50 text-indigo-600" },
    { title: "Hogar y Jardín", icon: <HomeIcon className="w-8 h-8" />, desc: "Todo para tu casa", href: "/#hogar", color: "bg-amber-50 text-amber-600" },
  ];

  return (
    <section className="py-8 md:py-10 bg-slate-50/30">
      <div className="container mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {categories.map((cat, i) => (
            <motion.div
              key={i}
              whileHover={{ y: -5 }}
              className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 flex flex-col items-center text-center group hover:shadow-xl hover:shadow-slate-200/50 transition-all duration-300"
            >
              <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center mb-6 transition-transform group-hover:scale-110", cat.color)}>
                {cat.icon}
              </div>
              <h3 className="text-sm font-black text-slate-900 mb-2 leading-tight">{cat.title}</h3>
              <p className="text-[11px] text-slate-500 font-medium mb-2">{cat.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

// Componente helper para las filas de productos con flechas y márgenes
const ProductRow = ({
  title,
  subTitle,
  products,
  onOpenModal,
  isSale = false,
  bgColor = "",
  accentColor = "text-brand-600",
  autoScroll = false
}: {
  title: string;
  subTitle: string;
  products: Product[];
  onOpenModal: (product: Product) => void;
  isSale?: boolean;
  bgColor?: string;
  accentColor?: string;
  autoScroll?: boolean;
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const id = title.toLowerCase().replace(/\s+/g, '-');

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const { scrollLeft, clientWidth } = scrollRef.current;
      const move = clientWidth * 0.8;
      const scrollTo = direction === 'left' ? scrollLeft - move : scrollLeft + move;
      scrollRef.current.scrollTo({ left: scrollTo, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    if (!autoScroll || !scrollRef.current) return;
    const el = scrollRef.current;
    
    let animationId: number;
    let speed = 0.5; // Pixels per frame
    let paused = false;

    const scrollStep = () => {
      if (!paused && el) {
        el.scrollLeft += speed;
        if (el.scrollLeft >= el.scrollWidth - el.clientWidth - 1) {
          el.scrollLeft = 0;
        }
      }
      animationId = requestAnimationFrame(scrollStep);
    };

    // Timeout para esperar que las imágenes carguen antes de scrollear
    const timeoutId = setTimeout(() => {
      animationId = requestAnimationFrame(scrollStep);
    }, 1000);

    const handleMouseEnter = () => paused = true;
    const handleMouseLeave = () => paused = false;
    
    el.addEventListener('mouseenter', handleMouseEnter);
    el.addEventListener('mouseleave', handleMouseLeave);
    el.addEventListener('touchstart', handleMouseEnter, { passive: true });
    el.addEventListener('touchend', handleMouseLeave, { passive: true });

    return () => {
      clearTimeout(timeoutId);
      cancelAnimationFrame(animationId);
      el.removeEventListener('mouseenter', handleMouseEnter);
      el.removeEventListener('mouseleave', handleMouseLeave);
      el.removeEventListener('touchstart', handleMouseEnter);
      el.removeEventListener('touchend', handleMouseLeave);
    };
  }, [autoScroll]);

  return (
    <section id={id} className={cn("py-8 md:py-10 border-b border-slate-100/60 scroll-mt-20", bgColor)}>
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
          {!autoScroll && (
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
          )}
        </div>

        {/* Carrusel dentro del container para alinear con el titulo */}
        <div
          ref={scrollRef}
          className={cn(
            "flex gap-4 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] pb-4",
            !autoScroll && "snap-x snap-mandatory scroll-smooth"
          )}
        >
          {products.map(product => (
            <div key={product.id} className={cn("w-[75vw] sm:w-[240px] md:w-[220px] lg:w-[210px] flex-shrink-0", !autoScroll && "snap-start")}>
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
  const [landingCategories, setLandingCategories] = useState<string[]>([]);

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
      if (landingCats.length > 0) setLandingCategories(landingCats);

      // 2. Fetch Products
      // We fetch ALL products to ensure Featured and Sale items are always available,
      // and filter category rows later according to settings.
      const { data: productsData } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });
      
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
      {/* Hero Section - Centralizado, Útil y con Contraste */}
      <section className="bg-slate-900 pt-24 pb-20 relative overflow-hidden">
        {/* Patrón de fondo sutil */}
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
        </div>
        
        <div className="container mx-auto px-6 relative z-10 text-center">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-3xl mx-auto"
          >
            <span className="inline-block py-1.5 px-4 rounded-full bg-brand-600/40 text-white text-[10px] font-black uppercase tracking-[0.3em] mb-8 border border-white/20 shadow-lg shadow-brand-500/20 backdrop-blur-md">
              Venta Directa de Fábrica
            </span>
            <h1 className="text-5xl md:text-7xl font-black text-white mb-8 leading-[1.05] tracking-tighter">
              Soluciones para <br /> <span className="text-brand-500">tu Construcción</span>
            </h1>
            <p className="text-xl text-slate-400 font-medium leading-relaxed mb-12 max-w-xl mx-auto">
              Buscá lo que necesitás para tu obra. Desde tanques hasta impermeabilizantes con el mejor precio garantizado.
            </p>
            
            <div className="flex flex-wrap justify-center gap-4">
              <a href="#productos">
                <Button size="lg" className="rounded-2xl h-14 px-10 font-black text-lg bg-brand-600 hover:bg-brand-700">
                  Ver Todo el Catálogo <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </a>
            </div>
          </motion.div>
        </div>
        
        {/* Decoraciones de profundidad */}
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-brand-600/20 rounded-full blur-[120px]" />
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-blue-600/20 rounded-full blur-[120px]" />
      </section>

      {/* Features Bar - Blanco para contrastar con el hero grisáceo */}
      <section className="py-6 md:py-8 bg-white border-b border-slate-100">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <FeatureItem icon={<Factory className="w-5 h-5" />} text="Fábrica Directa Aquafort" />
            <FeatureItem icon={<ShieldCheck className="w-5 h-5" />} text="Garantía de Calidad" />
            <FeatureItem icon={<Truck className="w-5 h-5" />} text="Envíos Express Logística Propia" />
          </div>
        </div>
      </section>

      {/* Categorías Estilo Mercado Libre */}
      <CategorySection />

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
            autoScroll={true}
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
          .filter(cat => landingCategories.length === 0 || landingCategories.includes(cat))
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

              <a href="#contacto">
                <Button size="lg" variant="outline" className="rounded-2xl border-brand-200 text-brand-700 hover:bg-brand-50">
                  Conocenos más
                </Button>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonios / Reseñas de Google */}
      <section className="py-24 bg-slate-50 border-t border-slate-100">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="flex flex-col md:flex-row items-center justify-between mb-16 gap-8 text-center md:text-left">
            <div>
              <div className="flex items-center justify-center md:justify-start gap-2 mb-4">
                <div className="flex">
                  {[1, 2, 3, 4].map((i) => (
                    <Star key={i} className="w-6 h-6 fill-yellow-400 text-yellow-400 drop-shadow-sm" />
                  ))}
                  <Star className="w-6 h-6 fill-yellow-400/50 text-yellow-400 drop-shadow-sm" />
                </div>
                <span className="font-black text-slate-700 text-lg">4.5/5 en Google (251 opiniones)</span>
              </div>
              <h3 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tighter leading-tight">
                Reseñas Reales <br />de Nuestros Clientes
              </h3>
            </div>
            <a
              href="https://www.google.com/search?q=Zono+Construcci%C3%B3n+Quilmes+4541+Paso+del+Rey"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-brand-600 text-white px-8 py-4 rounded-2xl font-black text-lg hover:bg-brand-700 transition-colors shadow-2xl shadow-brand-600/20 whitespace-nowrap"
            >
              Dejanos tu reseña
            </a>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                name: "Juan C.",
                text: "Fui al local a comprar un tanque. Me asesoraron excelente, precios directos de fábrica reales. Lo cargaron en mi camioneta en 5 minutos.",
                date: "Hace 1 mes",
              },
              {
                name: "Mariana L.",
                text: "Compramos toda la grifería para la obra acá. Llegó todo en tiempo y forma, súper rápido y la calidad de los productos es de primera.",
                date: "Hace 2 semanas",
              },
              {
                name: "Gastón R.",
                text: "Muy buena atención por WhatsApp. Tenía dudas sobre las medidas de un termotanque y me respondieron al instante solucionándome todo.",
                date: "Hace 3 meses",
              },
            ].map((review, i) => (
              <div
                key={i}
                className="bg-white p-8 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 flex flex-col justify-between hover:-translate-y-2 transition-transform duration-300"
              >
                <div>
                  <div className="flex justify-between items-start mb-6">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 bg-brand-50 rounded-2xl flex items-center justify-center text-brand-600 font-black text-xl border border-brand-100">
                        {review.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-black text-slate-900 leading-tight text-lg">{review.name}</p>
                        <p className="text-sm text-slate-400 font-medium">{review.date}</p>
                      </div>
                    </div>
                    {/* SVG G de Google */}
                    <svg viewBox="0 0 24 24" className="w-7 h-7 opacity-20"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
                  </div>
                  <div className="flex gap-1 mb-4">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Star key={i} className="w-5 h-5 text-yellow-400 fill-yellow-400 drop-shadow-sm" />
                    ))}
                  </div>
                  <p className="text-slate-600 font-medium leading-relaxed italic text-lg opacity-90">"{review.text}"</p>
                </div>
              </div>
            ))}
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

function FeatureItem({ icon, text }: { icon: React.ReactNode, text: string }) {
  return (
    <div className="flex items-center gap-3 justify-center">
      <div className="text-brand-600">
        {icon}
      </div>
      <span className="text-xs font-black uppercase tracking-widest text-slate-600">{text}</span>
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
