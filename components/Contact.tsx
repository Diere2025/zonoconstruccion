import React from 'react';
import { MapPin, Phone, Mail, Facebook, Instagram } from 'lucide-react';
import { WHATSAPP_NUMBER } from '../constants';

const Contact: React.FC = () => {
  return (
    <section id="contacto" className="py-20 bg-slate-900 text-white relative">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">¿Listo para empezar tu proyecto?</h2>
          <p className="text-slate-400 max-w-2xl mx-auto">Visítanos en nuestro local o contáctanos directamente. Estamos para ayudarte a construir mejor.</p>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Info Cards */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-slate-800 p-6 rounded-xl shadow-lg border border-slate-700 hover:border-brand-500 transition-colors">
              <div className="w-12 h-12 bg-brand-600 rounded-lg flex items-center justify-center mb-4 text-white">
                <MapPin size={24} />
              </div>
              <h3 className="text-xl font-bold mb-2">Dirección</h3>
              <p className="text-slate-400">Quilmes 4550, Paso del Rey<br/>Buenos Aires, Argentina.</p>
            </div>

            <div className="bg-slate-800 p-6 rounded-xl shadow-lg border border-slate-700 hover:border-green-500 transition-colors">
              <div className="w-12 h-12 bg-green-600 rounded-lg flex items-center justify-center mb-4 text-white">
                <Phone size={24} />
              </div>
              <h3 className="text-xl font-bold mb-2">WhatsApp</h3>
              <p className="text-slate-400 mb-2">Atención rápida y personalizada.</p>
              <a 
                href={`https://wa.me/${WHATSAPP_NUMBER}`} 
                className="text-green-400 hover:text-green-300 font-semibold text-lg"
              >
                11 5769-4181
              </a>
            </div>
            
            <div className="flex gap-4 mt-4">
              <a href="https://facebook.com/zonoconstruccion" className="flex-1 bg-blue-600 hover:bg-blue-700 py-3 rounded-lg text-center transition-colors flex justify-center">
                <Facebook size={20} />
              </a>
              <a href="https://www.instagram.com/zonoconstruccion" className="flex-1 bg-pink-600 hover:bg-pink-700 py-3 rounded-lg text-center transition-colors flex justify-center">
                <Instagram size={20} />
              </a>
              <a href="mailto:comercial@zono.com.ar" className="flex-1 bg-slate-600 hover:bg-slate-700 py-3 rounded-lg text-center transition-colors flex justify-center">
                <Mail size={20} />
              </a>
            </div>
          </div>

          {/* Map */}
          <div className="lg:col-span-2 h-full min-h-[400px] rounded-2xl overflow-hidden shadow-2xl border border-slate-700">
            <iframe 
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3284.016704782089!2d-58.7499168847698!3d-34.6037388804595!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x95bc9431b5d4d337%3A0x6c6e75e4e7d4a4c!2sQuilmes%204550%2C%20Paso%20del%20Rey%2C%20Provincia%20de%20Buenos%20Aires!5e0!3m2!1ses!2sar!4v1678886400000!5m2!1ses!2sar" 
              width="100%" 
              height="100%" 
              style={{ border: 0, filter: 'grayscale(100%) invert(92%) contrast(83%)' }} 
              allowFullScreen 
              loading="lazy" 
              referrerPolicy="no-referrer-when-downgrade"
              title="Google Map Location"
            ></iframe>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Contact;