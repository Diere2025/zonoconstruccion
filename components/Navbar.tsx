import React, { useState, useEffect } from 'react';
import { Menu, X, Phone } from 'lucide-react';
import { NAV_LINKS, WHATSAPP_NUMBER } from '../constants';

const Navbar: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header 
      className={`fixed w-full top-0 z-50 transition-all duration-300 ${
        scrolled 
          ? 'bg-white/95 backdrop-blur-md shadow-sm py-3 border-b border-white/20' 
          : 'bg-transparent py-5'
      }`}
    >
      <div className="container mx-auto px-6 flex justify-between items-center">
        {/* Logo */}
        <a href="#" className="flex items-center gap-2 group">
          <div className={`font-extrabold text-2xl tracking-tighter ${scrolled ? 'text-brand-900' : 'text-white'} transition-colors`}>
            ZONO<span className="text-brand-500">.</span>
          </div>
        </a>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center space-x-8 font-medium">
          {NAV_LINKS.map((link) => (
            <a 
              key={link.label}
              href={link.href} 
              className={`text-sm font-semibold uppercase tracking-wide hover:text-brand-500 transition-colors relative after:content-[''] after:absolute after:-bottom-1 after:left-0 after:w-0 after:h-0.5 after:bg-brand-500 after:transition-all hover:after:w-full ${scrolled ? 'text-slate-600' : 'text-white/90 hover:text-white'}`}
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* CTA & Mobile Toggle */}
        <div className="flex items-center gap-4">
          <a 
            href={`https://wa.me/${WHATSAPP_NUMBER}`} 
            target="_blank" 
            rel="noreferrer"
            className={`hidden md:flex items-center gap-2 font-semibold py-2.5 px-6 rounded-full transition-all hover:shadow-lg hover:-translate-y-0.5 transform ${
                scrolled ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-white text-brand-900 hover:bg-brand-50'
            }`}
          >
            <Phone size={18} />
            <span>Contactar</span>
          </a>
          
          <button 
            onClick={() => setIsOpen(!isOpen)}
            className={`md:hidden text-2xl focus:outline-none ${scrolled ? 'text-slate-800' : 'text-white'}`}
          >
            {isOpen ? <X /> : <Menu />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <div className={`md:hidden absolute w-full bg-white border-t border-gray-100 shadow-xl transition-all duration-300 ease-in-out origin-top ${isOpen ? 'scale-y-100 opacity-100' : 'scale-y-0 opacity-0 h-0 overflow-hidden'}`}>
        <div className="flex flex-col px-6 py-6 space-y-4">
          {NAV_LINKS.map((link) => (
            <a 
              key={link.label}
              href={link.href} 
              className="text-slate-700 hover:text-brand-600 font-medium text-lg border-b border-gray-50 pb-2"
              onClick={() => setIsOpen(false)}
            >
              {link.label}
            </a>
          ))}
          <a 
            href={`https://wa.me/${WHATSAPP_NUMBER}`} 
            className="text-green-600 font-bold flex items-center gap-2 pt-2"
          >
            <Phone size={20} /> WhatsApp
          </a>
        </div>
      </div>
    </header>
  );
};

export default Navbar;