import React from 'react';
import { MessageCircle } from 'lucide-react';
import { Product, NavItem } from '../types'; // Assuming Product type is sufficient
import { WHATSAPP_NUMBER } from '../constants';

interface ProductCardProps {
  product: Product;
}

const ProductCard: React.FC<ProductCardProps> = ({ product }) => {
  const whatsappLink = `https://wa.me/${WHATSAPP_NUMBER}?text=Hola!%20Me%20interesa%20el%20producto:%20${encodeURIComponent(product.name)}`;

  // Using placehold.co for dynamic images based on product data
  const imageUrl = `https://placehold.co/600x600/e2e8f0/475569.png?text=${encodeURIComponent(product.imageText)}&font=montserrat`;

  return (
    <div className="group bg-white rounded-2xl shadow-lg hover:shadow-xl border border-slate-100 overflow-hidden flex flex-col transition-all duration-300 hover:-translate-y-2">
      {/* Image Container */}
      <div className={`relative w-full h-64 ${product.bgColor} border-b border-slate-50 flex items-center justify-center p-6 overflow-hidden`}>
        <span className="absolute top-4 left-4 bg-white/90 backdrop-blur text-slate-600 text-xs font-bold px-3 py-1 rounded-full shadow-sm z-10">
          {product.category}
        </span>
        <img 
          src={imageUrl} 
          alt={product.name} 
          className="w-full h-full object-contain mix-blend-multiply opacity-90 group-hover:scale-105 transition-transform duration-500 ease-in-out"
        />
      </div>

      {/* Content */}
      <div className="p-6 flex flex-col flex-grow relative bg-white">
        <h3 className="text-lg font-bold text-slate-900 group-hover:text-brand-600 transition-colors leading-tight mb-2">
          {product.name}
        </h3>
        <p className="text-sm text-slate-500 mb-6 flex-grow line-clamp-3 leading-relaxed">
          {product.description}
        </p>
        
        <div className="mt-auto pt-2">
          <a 
            href={whatsappLink} 
            target="_blank" 
            rel="noreferrer"
            className="w-full bg-white border-2 border-green-500 text-green-600 hover:bg-green-500 hover:text-white font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all duration-300 group-hover:shadow-lg"
          >
            <MessageCircle size={18} />
            <span>Consultar Precio</span>
          </a>
        </div>
      </div>
    </div>
  );
};

export default ProductCard;