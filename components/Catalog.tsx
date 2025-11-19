import React, { useState, useMemo } from 'react';
import { PRODUCTS, CATEGORY_ICONS } from '../constants';
import ProductCard from './ProductCard';
import { Grid } from 'lucide-react';

const Catalog: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState('all');

  const categories = useMemo(() => {
    const uniqueCategories = Array.from(new Set(PRODUCTS.map(p => p.category)));
    return ['all', ...uniqueCategories];
  }, []);

  const filteredProducts = useMemo(() => {
    return activeCategory === 'all' 
      ? PRODUCTS 
      : PRODUCTS.filter(p => p.category === activeCategory);
  }, [activeCategory]);

  return (
    <section id="productos" className="py-20 bg-slate-50">
      <div className="container mx-auto px-6">
        <div className="text-center mb-12">
          <h2 className="text-sm font-bold tracking-wide text-brand-600 uppercase mb-2">Nuestra Selección</h2>
          <h3 className="text-3xl md:text-4xl font-bold text-slate-900">Catálogo de Productos</h3>
          <div className="w-20 h-1.5 bg-brand-500 mx-auto mt-4 rounded-full"></div>
        </div>
        
        {/* Filters */}
        <div className="flex flex-wrap justify-center gap-3 mb-12">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setActiveCategory(category)}
              className={`
                flex items-center gap-2 font-medium py-2.5 px-6 rounded-full transition-all duration-300
                ${activeCategory === category 
                  ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/20 transform scale-105' 
                  : 'bg-white text-slate-600 border border-slate-200 hover:border-brand-300 hover:text-brand-600'}
              `}
            >
              {category === 'all' ? <Grid size={16} /> : CATEGORY_ICONS[category]}
              <span className="capitalize">{category === 'all' ? 'Todos' : category}</span>
            </button>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          {filteredProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
        
        {filteredProducts.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            No se encontraron productos en esta categoría.
          </div>
        )}
      </div>
    </section>
  );
};

export default Catalog;