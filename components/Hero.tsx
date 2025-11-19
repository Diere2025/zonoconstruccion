import React from 'react';
import { ArrowRight, MapPin } from 'lucide-react';

const Hero: React.FC = () => {
  return (
    <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-40 overflow-hidden">
      {/* Background Image with Overlay */}
      <div className="absolute inset-0 z-0">
        <img 
          src="https://images.unsplash.com/photo-1503387762-592deb58ef4e?q=80&w=2000&auto=format&fit=crop" 
          alt="Background Construction" 
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-900/95 via-slate-900/80 to-slate-900/50"></div>
      </div>

      <div className="container mx-auto px-6 relative z-10 text-center lg:text-left">
        <div className="max-w-3xl">
          <span className="inline-block py-1 px-3 rounded-full bg-brand-600/30 border border-brand-500/50 text-brand-100 text-sm font-semibold mb-6 backdrop-blur-sm animate-fade-in-up">
            🚀 Envíos a todo el país
          </span>
          <h1 className="text-4xl md:text-6xl font-extrabold text-white mb-6 leading-tight tracking-tight">
            Construye tus sueños con <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-400 to-brand-200">calidad profesional</span>
          </h1>
          <p className="text-lg md:text-xl text-slate-300 mb-10 leading-relaxed max-w-2xl">
            Especialistas en tanques de agua, impermeabilización y soluciones integrales para el hogar. Venta directa de fábrica y asesoramiento experto.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
            <a 
              href="#productos" 
              className="bg-brand-600 hover:bg-brand-700 text-white font-bold py-4 px-8 rounded-xl transition-all shadow-lg shadow-brand-600/30 hover:-translate-y-1 flex items-center justify-center gap-2 group"
            >
              Ver Catálogo
              <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </a>
            <a 
              href="#contacto" 
              className="bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/30 text-white font-bold py-4 px-8 rounded-xl transition-all hover:-translate-y-1 flex items-center justify-center gap-2"
            >
              <MapPin size={20} />
              Ubicación
            </a>
          </div>
        </div>
      </div>

      {/* Decorative Curve */}
      <div className="absolute bottom-0 left-0 w-full overflow-hidden leading-[0]">
        <svg className="relative block w-[calc(100%+1.3px)] h-[60px] text-slate-50" fill="currentColor" viewBox="0 0 1200 120" preserveAspectRatio="none">
          <path d="M321.39,56.44c58-10.79,114.16-30.13,172-41.86,82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53,26.09,214.34,3V0H0V27.35A600.21,600.21,0,0,0,321.39,56.44Z"></path>
        </svg>
      </div>
    </section>
  );
};

export default Hero;