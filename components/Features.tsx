import React from 'react';
import { FEATURES } from '../constants';

const Features: React.FC = () => {
  return (
    <section className="py-4 -mt-16 relative z-20">
      <div className="container mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {FEATURES.map((feature, idx) => (
            <div 
              key={idx} 
              className="bg-white p-6 rounded-2xl shadow-xl shadow-slate-200/50 flex items-center gap-4 transition-transform hover:-translate-y-1 duration-300"
            >
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${feature.colorClass} shrink-0`}>
                {feature.icon}
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-lg">{feature.title}</h3>
                <p className="text-sm text-slate-500">{feature.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;