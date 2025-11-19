import React from 'react';
import { Factory, MessageCircle, Truck, ShieldCheck, Droplets, Zap, Hammer } from 'lucide-react';
import { Product, Feature } from './types';

export const NAV_LINKS = [
  { label: 'Productos', href: '#productos' },
  { label: 'Nosotros', href: '#nosotros' },
  { label: 'Contacto', href: '#contacto' },
];

export const WHATSAPP_NUMBER = "5491157694181";

export const FEATURES: Feature[] = [
  {
    icon: <Factory size={24} />,
    title: "Directo de Fábrica",
    description: "Mejores precios garantizados sin intermediarios.",
    colorClass: "bg-blue-100 text-brand-600"
  },
  {
    icon: <MessageCircle size={24} />,
    title: "Atención Personalizada",
    description: "Te asesoramos en tu compra vía WhatsApp.",
    colorClass: "bg-green-100 text-green-600"
  },
  {
    icon: <Truck size={24} />,
    title: "Envíos a Domicilio",
    description: "Consulta zonas de cobertura y logística.",
    colorClass: "bg-orange-100 text-orange-600"
  }
];

export const PRODUCTS: Product[] = [
  // Hogar
  { 
    id: '1', 
    category: 'Hogar y Climatización', 
    name: 'Termotanque Sirena 40L', 
    description: 'Eléctrico de colgar. Alta recuperación. Ideal monoambiente.', 
    imageText: 'Sirena 40L',
    bgColor: 'bg-slate-100'
  },
  { 
    id: '2', 
    category: 'Hogar y Climatización', 
    name: 'Termotanque Sirena 60L', 
    description: 'Eléctrico de colgar. Ideal 2 personas.', 
    imageText: 'Sirena 60L',
    bgColor: 'bg-slate-100'
  },
  { 
    id: '3', 
    category: 'Hogar y Climatización', 
    name: 'Termotanque Sirena 90L', 
    description: 'Eléctrico de colgar. Ideal familia tipo.', 
    imageText: 'Sirena 90L',
    bgColor: 'bg-slate-100'
  },
  // Tanques
  { 
    id: '4', 
    category: 'Tanques de Agua', 
    name: 'Tanque 300L Bicapa Negro', 
    description: 'Aquafort. Resistente UV. Ideal espacios reducidos.', 
    imageText: '300L Negro',
    bgColor: 'bg-slate-200'
  },
  { 
    id: '5', 
    category: 'Tanques de Agua', 
    name: 'Tanque 500L Bicapa Negro', 
    description: 'Aquafort. Estándar domiciliario.', 
    imageText: '500L Negro',
    bgColor: 'bg-slate-200'
  },
  { 
    id: '6', 
    category: 'Tanques de Agua', 
    name: 'Tanque 750L Bicapa Negro', 
    description: 'Aquafort. Gran capacidad de reserva.', 
    imageText: '750L Negro',
    bgColor: 'bg-slate-200'
  },
  { 
    id: '7', 
    category: 'Tanques de Agua', 
    name: 'Tanque 1000L Bicapa Negro', 
    description: 'Aquafort. Máxima reserva para consorcios.', 
    imageText: '1000L Negro',
    bgColor: 'bg-slate-200'
  },
  { 
    id: '8', 
    category: 'Tanques de Agua', 
    name: 'Tanque 500L Tricapa Beige', 
    description: 'Aquafort. Antibacteriano, mantiene el agua fresca.', 
    imageText: '500L Beige',
    bgColor: 'bg-orange-50'
  },
  // Tratamiento
  { 
    id: '9', 
    category: 'Tratamiento de Aguas', 
    name: 'Biodigestor 600L Biofort', 
    description: 'Tratamiento ecológico de efluentes cloacales.', 
    imageText: 'Biodigestor 600L',
    bgColor: 'bg-green-50'
  },
  { 
    id: '10', 
    category: 'Tratamiento de Aguas', 
    name: 'Biodigestor 700L Auto.', 
    description: 'Biofort Autolimpiante. Mantenimiento simple anual.', 
    imageText: 'Biodigestor 700L',
    bgColor: 'bg-green-50'
  },
  // Ferreteria
  { 
    id: '11', 
    category: 'Ferretería', 
    name: 'Escalera Articulada 3x4', 
    description: '12 escalones. Multiposición. Aluminio reforzado.', 
    imageText: 'Escalera 3x4',
    bgColor: 'bg-gray-100'
  },
  { 
    id: '12', 
    category: 'Ferretería', 
    name: 'Escalera Articulada 4x4', 
    description: '16 escalones. Uso profesional intensivo.', 
    imageText: 'Escalera 4x4',
    bgColor: 'bg-gray-100'
  },
];

export const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  'Hogar y Climatización': <Zap size={18} />,
  'Tanques de Agua': <Droplets size={18} />,
  'Tratamiento de Aguas': <ShieldCheck size={18} />,
  'Ferretería': <Hammer size={18} />,
};