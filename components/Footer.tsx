import React from 'react';

const Footer: React.FC = () => {
  return (
    <footer className="bg-black text-white py-8 border-t border-slate-800">
      <div className="container mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="text-slate-400 text-sm text-center md:text-left">
          &copy; {new Date().getFullYear()} <strong>Zono Construcción y Hogar</strong>. Todos los derechos reservados.
        </div>
        <div className="flex space-x-6 text-sm font-medium text-slate-500">
          <a href="#" className="hover:text-white transition-colors">Términos</a>
          <a href="#" className="hover:text-white transition-colors">Privacidad</a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;