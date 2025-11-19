import React from 'react';
import { CheckCircle, ArrowRight } from 'lucide-react';

const About: React.FC = () => {
  return (
    <section id="nosotros" className="py-20 bg-white relative overflow-hidden">
      {/* Decorative top curve inverted */}
      <div className="absolute top-0 left-0 w-full overflow-hidden leading-[0] rotate-180">
        <svg className="relative block w-[calc(100%+1.3px)] h-[40px] text-slate-50" fill="currentColor" viewBox="0 0 1200 120" preserveAspectRatio="none">
          <path d="M321.39,56.44c58-10.79,114.16-30.13,172-41.86,82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53,26.09,214.34,3V0H0V27.35A600.21,600.21,0,0,0,321.39,56.44Z"></path>
        </svg>
      </div>

      <div className="absolute top-0 right-0 w-1/3 h-full bg-brand-50 skew-x-12 translate-x-20 z-0 hidden lg:block"></div>
      
      <div className="container mx-auto px-6 relative z-10 mt-10">
        <div className="flex flex-col lg:flex-row items-center gap-16">
          <div className="lg:w-1/2 relative">
            <div className="absolute -top-4 -left-4 w-24 h-24 bg-slate-100 rounded-full opacity-50 blur-xl"></div>
            <div className="relative rounded-2xl overflow-hidden shadow-2xl rotate-2 hover:rotate-0 transition-all duration-500">
              <img 
                src="https://images.unsplash.com/photo-1504307651254-35680f356dfd?q=80&w=1000&auto=format&fit=crop" 
                alt="Zono Storefront Concept" 
                className="w-full h-96 object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent"></div>
              <div className="absolute bottom-6 left-6 text-white">
                <p className="font-bold text-xl">Desde Buenos Aires</p>
                <p className="text-sm opacity-90">Calidad garantizada</p>
              </div>
            </div>
          </div>
          
          <div className="lg:w-1/2">
            <h2 className="text-4xl font-bold text-slate-900 mb-6">Sobre <span className="text-brand-600">Zono</span></h2>
            <p className="text-slate-600 mb-6 text-lg leading-relaxed">
              Somos tu aliado estratégico en construcción y mejoramiento del hogar. Nacimos con la misión de simplificar tus proyectos, combinando la comodidad de la venta online con el respaldo de un local físico y asesoramiento humano.
            </p>
            <ul className="space-y-4 mb-8">
              {[
                "Fabricantes directos de tanques Aquafort.",
                "Stock permanente y variedad de marcas.",
                "Asesoramiento técnico vía WhatsApp."
              ].map((item, index) => (
                <li key={index} className="flex items-center gap-3">
                  <CheckCircle className="text-green-500 shrink-0" size={24} />
                  <span className="text-slate-700 font-medium">{item}</span>
                </li>
              ))}
            </ul>
            <a href="#contacto" className="text-brand-600 font-bold hover:text-brand-800 flex items-center gap-2 group">
              Conocenos más 
              <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};

export default About;