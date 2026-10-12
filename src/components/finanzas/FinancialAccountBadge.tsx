import {financialAccountLabel} from '@/lib/financialAccountLabels';
const colors:Record<string,[string,string,string]>={
 'MP1':['#9d174d','#fdf2f8','#fbcfe8'],
 'MP2':['#3730a3','#eef2ff','#c7d2fe'],
 'MP3':['#075985','#f0f9ff','#bae6fd'],
 'MP4':['#5b21b6','#f5f3ff','#ddd6fe'],
 'MP5':['#92400e','#fffbeb','#fde68a'],
 'MP3 Reserva Diego':['#155e75','#ecfeff','#a5f3fc'],
 'Efectivo Pesos':['#166534','#f0fdf4','#bbf7d0'],
 'Efectivo Dólares':['#334155','#f1f5f9','#cbd5e1'],
 'Galicia':['#065f46','#ecfdf5','#a7f3d0'],
 'Galicia.Mas':['#115e59','#f0fdfa','#99f6e4'],
 'Santander':['#991b1b','#fef2f2','#fecaca'],
 'ICBC':['#9a3412','#fff7ed','#fed7aa'],
 'Visa.Galicia':['#86198f','#fdf4ff','#f5d0fe'],
 'Inversiones':['#3f6212','#f7fee7','#d9f99d'],
 'Reserva Efectivo (Proveedores)':['#78350f','#fef3c7','#fcd34d'],
 'Reserva Efectivo (Sueldos)':['#6b21a8','#faf5ff','#e9d5ff'],
};
const palette=Object.values(colors);
export function financialAccountColor(name:string|null|undefined){
 const label=financialAccountLabel(name);let hash=0;for(const character of label)hash=(hash*31+character.charCodeAt(0))>>>0;
 return colors[label]||palette[hash%palette.length];
}
export default function FinancialAccountBadge({name,className=''}:{name:string|null|undefined;className?:string}){
 const label=financialAccountLabel(name);
 const [color,backgroundColor,borderColor]=financialAccountColor(name);
 return <span className={'inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] font-semibold leading-4 '+className} style={{color,backgroundColor,borderColor}} title={label}><span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-current"/>{label}</span>;
}
