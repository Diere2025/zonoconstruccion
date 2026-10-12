import type {FinancialConcept} from '@/lib/financialConcepts';
export type GuidedOption={id:string;group:string;concept:string;detail:string;efe:string};
const clean=(text:string)=>text.replace(/^\d{6}\s*-\s*/,'').replace(/\([^)]*\d{4}[^)]*\)/g,'').replace(/\b(?:\d[ -]?){13,19}\b/g,'').replace(/\s+/g,' ').trim();
export function guidedOptions(concepts:FinancialConcept[]):GuidedOption[]{return concepts.filter(c=>c.is_active).map(c=>{const x=c.classification,category=x?.category||c.category,person=x?.person||'',name=x?.concept||c.concept;let group:string,concept=name,detail=[x?.detail,x?.destination].filter(Boolean).join(' · ');
 if(category==='Extracciones'){group='Extracciones '+(person||'personales');}
 else if(category==='Sueldos'&&/extracciones carolina/i.test(c.sub_category)){group='Extracciones Carolina Ibarra';if(/visa|mastercard/i.test(c.concept)){concept='Tarjetas';detail=clean(c.concept).replace(/\s*-\s*CAROLINA$/i,'');}}
 else if(category==='Recaudación'&&/rendici[oó]n flete externo|venta - recorridos|^(IVECO|KIA) /i.test(c.concept)){group='Rendición de fletero';concept='Rendición';detail=[person,x?.detail,x?.destination].filter(Boolean).join(' · ')||(/^rendici[oó]n flete externo$/i.test(c.concept)?'Sin persona especificada':clean(c.concept));}
 else if(category==='Recaudación'){group='Cobros de clientes';concept=/devoluci[oó]n/i.test(c.concept)?'Devoluciones':/cambio/i.test(c.concept)?'Cambio de recorridos':/descuento/i.test(c.concept)?'Descuentos':'Cobro';detail=clean(c.concept);}
 else if(['Proveedores','Proveedores (Deuda)','Insumo de Producto'].includes(category)){group='Pago a proveedor';concept=category==='Proveedores (Deuda)'?'Pago de deuda':/^reserva/i.test(c.concept)?'Reserva o anticipo':'Pago a proveedor';detail=person||clean(c.concept);}
 else if(category==='Servicio de Flete'){group='Pago de flete';concept='Servicio de flete';detail=person||clean(c.concept);}
 else if(['Sueldos','Eventuales'].includes(category)){group='Pago al personal';concept=category==='Eventuales'?'Eventual':/cargas sociales/i.test(c.sub_category)?'Cargas sociales':/acuerdos legales/i.test(c.sub_category)?'Acuerdos legales':'Sueldos y jornales';detail=person||clean(c.concept);}
 else if(['Gastos Operativos','Alquileres','Honorarios','Vehículos','Gasto Peajes'].includes(category)){group='Gasto de la empresa';concept=category==='Gastos Operativos'?(c.sub_category||'Otros gastos'):category==='Gasto Peajes'?'Peajes':category;detail=clean(c.concept);}
 else if(category==='Publicidad'){group='Publicidad';concept=/fee|comisi[oó]n/i.test(c.concept)?'Comisiones':'Carga de saldo';detail=clean(c.concept);}
 else if(['Impuestos','IIGG'].includes(category)){group='Impuestos';concept=c.sub_category||category;detail=clean(c.concept);}
 else if(category==='Movimiento de cuentas'){group='Movimiento entre cajas';concept='Transferencia interna';detail=clean(c.concept);}
 else if(category==='Fondos a rendir'){group='Fondos a rendir';concept=/^rendido/i.test(c.concept)?'Devolución o rendición':'Entrega de fondos';detail=clean(c.concept).replace(/^rendir|^rendido/i,'').trim();}
 else{group='Otros movimientos';concept=category;detail=clean(c.concept);}
 return {id:c.id,group,concept,detail,efe:c.efe_category};}).sort((a,b)=>a.group.localeCompare(b.group,'es')||a.concept.localeCompare(b.concept,'es')||a.detail.localeCompare(b.detail,'es'));}
export function guidedVariants(options:GuidedOption[],group:string,concept:string){return options.filter(x=>x.group===group&&x.concept===concept);}
