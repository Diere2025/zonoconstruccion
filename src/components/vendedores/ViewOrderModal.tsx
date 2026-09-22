"use client";

import React from "react";
import { 
  X, 
  Printer, 
  Edit, 
  MapPin, 
  Calendar, 
  Truck, 
  CreditCard, 
  User, 
  Phone, 
  FileText, 
  Package, 
  Clock, 
  AlertCircle,
  ExternalLink,
  MessageSquare
} from "lucide-react";
import { formatPrice, cleanDeliveryNotes } from "@/lib/utils";
import { PrintableOrderData } from "./PrintableOrderModal";
import { calculateCascadingDiscounts } from "@/lib/orderDiscounts";

interface ViewOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: PrintableOrderData | null;
  onEdit: (order: PrintableOrderData) => void;
  onPrint: (order: PrintableOrderData) => void;
}

export default function ViewOrderModal({
  isOpen,
  onClose,
  order,
  onEdit,
  onPrint
}: ViewOrderModalProps) {
  if (!isOpen || !order) return null;

  const orderNumber = order.legacy_code || order.id.substring(0, 8).toUpperCase();
  const orderDateFormatted = order.order_date
    ? new Date(order.order_date + "T00:00:00").toLocaleDateString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      })
    : order.created_at
    ? new Date(order.created_at).toLocaleDateString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      })
    : "No registrada";

  const itemsSubtotal = (order.order_items || []).reduce((acc, it) => {
    const qty = it.quantity || 1;
    const price = it.unit_price ?? it.customPrice ?? 0;
    return acc + (qty * price);
  }, 0);

  const finalTotal = order.total_amount || itemsSubtotal;
  const orderDiscountAmount = Math.max(0, Number(order.order_discount_amount) || 0);
  const netSubtotal = order.subtotal !== undefined
    ? Number(order.subtotal)
    : Math.max(0, itemsSubtotal - orderDiscountAmount);
  const discountLabel = order.order_discount_type === 'percentage'
    ? `Descuento Pedido (${order.order_discount_value || 0}%)`
    : 'Descuento Pedido (Monto Fijo)';
  const discountBreakdown = calculateCascadingDiscounts(itemsSubtotal, order.order_discounts || [])
    .filter(discount => discount.amount > 0);
  const deposit = order.deposit_amount || 0;
  const balance = order.pending_balance !== undefined 
    ? order.pending_balance 
    : (order.payment_status === 'Abonado' ? 0 : Math.max(0, finalTotal - deposit));

  const isWholesale = order.channel === 'mayorista' || (order.legacy_code && (order.legacy_code.toUpperCase().startsWith("AQ-") || order.legacy_code.toUpperCase().startsWith("POW") || order.legacy_code.toUpperCase().startsWith("AQU")));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/70 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[92vh] overflow-hidden border border-slate-200 my-auto animate-in zoom-in-95 duration-200">
        
        {/* Header con Estado y Acciones Rápidas */}
        <div className="p-4 sm:p-5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-brand-600 flex items-center justify-center text-white shadow-sm font-black text-sm">
              <Package className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-black text-slate-900 leading-none">
                  Detalle del Pedido
                </h2>
                <span className="text-xs font-mono font-bold bg-white text-slate-700 px-2 py-0.5 rounded-lg border border-slate-200 shadow-2xs">
                  {orderNumber}
                </span>
                {isWholesale && (
                  <span className="text-[10px] font-black bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full border border-purple-200">
                    👑 Mayorista
                  </span>
                )}
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider border ${
                  order.status === 'Entregado' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                  order.status === 'Cancelado' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                  order.status === 'En Revisión' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                  'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                  {order.status || 'Pendiente'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium mt-1">
                Fecha del Pedido: <strong>{orderDateFormatted}</strong> • Asesor: <strong>{order.seller_name || 'No asignado'}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Botón de Impresión de Comprobante */}
            <button
              type="button"
              onClick={() => onPrint(order)}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer"
              title="Exportar comprobante en PDF o Imagen"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir Comprobante</span>
            </button>

            {/* Botón de Editar */}
            <button
              type="button"
              onClick={() => {
                onClose();
                onEdit(order);
              }}
              className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs active:scale-95 cursor-pointer"
              title="Modificar los datos de este pedido"
            >
              <Edit className="w-3.5 h-3.5 text-slate-500" />
              <span>Editar</span>
            </button>

            {/* Cerrar */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 rounded-full transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Cuerpo del Pedido (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 custom-scrollbar bg-white">
          
          {/* Tarjetas de Información: Cliente & Logística */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Tarjeta Cliente */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-black text-slate-500 uppercase tracking-wider border-b border-slate-200/60 pb-1.5">
                <User className="w-3.5 h-3.5 text-brand-600" />
                <span>Cliente y Contacto</span>
              </div>
              <div>
                <p className="text-sm font-extrabold text-slate-900">{order.customer_name || "Sin nombre"}</p>
                <div className="mt-2 space-y-1 text-xs text-slate-600">
                  <p className="flex items-start gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <span>{order.address || "Dirección no informada"}</span>
                  </p>
                  <p className="flex items-center gap-1.5 font-bold text-slate-800">
                    <span className="text-slate-400">Localidad:</span> {order.locality || "Sin Localidad"}
                    {order.zone_name && (
                      <span className="text-[10px] bg-brand-50 text-brand-700 border border-brand-200 px-1.5 py-0.2 rounded font-black uppercase">
                        {order.zone_name}
                      </span>
                    )}
                  </p>
                  {(order.client_phone || order.client_phone_secondary) && (
                    <p className="flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{[order.client_phone, order.client_phone_secondary].filter(Boolean).join(" / ")}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Links externos (Maps / Whaticket) */}
              <div className="flex items-center gap-2 pt-2 border-t border-slate-200/50 flex-wrap">
                {order.google_maps_link && (
                  <a
                    href={order.google_maps_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-1 rounded-lg border border-blue-200 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Ver en Maps
                  </a>
                )}
                {order.whaticket_link && (
                  <a
                    href={order.whaticket_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-900 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200 transition-colors"
                  >
                    <MessageSquare className="w-3 h-3" />
                    Abrir Whaticket
                  </a>
                )}
              </div>
            </div>

            {/* Tarjeta Entrega y Logística */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-black text-slate-500 uppercase tracking-wider border-b border-slate-200/60 pb-1.5">
                <Truck className="w-3.5 h-3.5 text-brand-600" />
                <span>Logística y Entrega</span>
              </div>
              
              <div className="space-y-1.5 text-xs text-slate-700">
                <p>
                  <strong>Tipo de Flete:</strong> <span className="font-bold text-slate-900">{order.freight_type || "Flete Regular"}</span>
                </p>
                <p>
                  <strong>Fechas de Entrega:</strong>{" "}
                  <span className="font-bold text-slate-900">
                    {order.initial_delivery_date 
                      ? new Date(order.initial_delivery_date + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })
                      : "A coordinar"}
                    {order.max_delivery_date && order.max_delivery_date !== order.initial_delivery_date
                      ? ` al ${new Date(order.max_delivery_date + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })}`
                      : ""}
                  </span>
                </p>
                {order.advertising_source_name && (
                  <p>
                    <strong>Origen / Procedencia:</strong> <span>{order.advertising_source_name}</span>
                  </p>
                )}
                {order.order_medium_name && (
                  <p>
                    <strong>Medio de Contacto:</strong> <span>{order.order_medium_name}</span>
                  </p>
                )}
              </div>

              {(() => {
                const cleanObs = [
                  cleanDeliveryNotes(order.delivery_notes),
                  cleanDeliveryNotes(order.delivery_detail)
                ].filter(Boolean).join(" / ");
                if (!cleanObs) return null;
                return (
                  <div className="p-2 bg-amber-50/80 border border-amber-200 rounded-xl text-[11px] text-amber-900">
                    <span className="font-black uppercase tracking-wider text-[9px] block text-amber-700">
                      Aclaraciones de Entrega:
                    </span>
                    <p className="mt-0.5 font-medium leading-tight">
                      {cleanObs}
                    </p>
                  </div>
                );
              })()}
            </div>

          </div>

          {/* Tabla de Artículos del Pedido */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
            <div className="bg-slate-900 text-white px-4 py-2.5 flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-brand-400" />
                Artículos ({order.order_items?.length || 0})
              </span>
              <span className="text-[11px] text-slate-300 font-medium">Precios con IVA incluido</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-black uppercase text-[10px] tracking-wider select-none">
                    <th className="py-2.5 px-3 text-center w-14">Cant.</th>
                    <th className="py-2.5 px-3">SKU</th>
                    <th className="py-2.5 px-3 text-right w-28">P. Unitario</th>
                    <th className="py-2.5 px-3 text-right w-32">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                  {(order.order_items || []).map((item, idx) => {
                    const qty = item.quantity || 1;
                    const price = item.unit_price ?? item.customPrice ?? 0;
                    const subtotal = qty * price;
                    const displaySku = (item.sku && !item.sku.startsWith("AUTO-")) 
                      ? item.sku 
                      : (item.sku || item.product_name || item.name || "Producto");

                    return (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-3 text-center font-black text-slate-900 bg-slate-50/30">
                          {qty} u.
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-extrabold text-slate-900">{displaySku}</div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                          {formatPrice(price)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-black text-slate-900">
                          {formatPrice(subtotal)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bloque Financiero y Estado de Cobro */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            
            {/* Estado de Cobro */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-500 uppercase tracking-wider">
                  Condición de Cobro
                </span>
                <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider border ${
                  order.payment_status === 'Abonado' 
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                    : order.payment_status === 'Seniado'
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-rose-50 text-rose-700 border-rose-200'
                }`}>
                  {order.payment_status === 'Abonado' ? 'Abonado Completo' : (order.payment_status === 'Seniado' ? 'Señado' : 'Pendiente de Cobro')}
                </span>
              </div>

              <div className="text-xs space-y-1 text-slate-700">
                <p><strong>Forma de Pago:</strong> <span className="font-bold text-slate-900">{order.payment_method_name || "Efectivo"}</span></p>
                {deposit > 0 && (
                  <p className="text-emerald-700 font-bold">
                    Seña Recibida: <span className="font-mono font-black">{formatPrice(deposit)}</span>
                  </p>
                )}
                {balance > 0 ? (
                  <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs font-black text-rose-800 flex justify-between items-center mt-2">
                    <span>SALDO A COBRAR EN ENTREGA:</span>
                    <span className="text-sm font-mono">{formatPrice(balance)}</span>
                  </div>
                ) : (
                  <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-800 text-center">
                    ✓ Sin saldo pendiente para cobrar al entregar
                  </div>
                )}

                {/* Comprobantes adjuntos */}
                {(() => {
                  const breakdown = (order as any).totals?.payments_breakdown;
                  const receipts: Array<{ url: string; amount?: number; notes?: string }> = [];
                  if (Array.isArray(breakdown)) {
                    breakdown.forEach((p: any) => {
                      if (p.receipt_url) receipts.push({ url: p.receipt_url, amount: p.amount, notes: p.notes });
                    });
                  }
                  if (receipts.length === 0 && (order as any).totals?.deposit_receipt_url) {
                    receipts.push({ url: (order as any).totals.deposit_receipt_url, amount: deposit });
                  }
                  if (receipts.length === 0) return null;
                  return (
                    <div className="pt-2 mt-2 border-t border-slate-200/70 space-y-1.5">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
                        Comprobante{receipts.length > 1 ? 's' : ''} Adjunto{receipts.length > 1 ? 's' : ''}:
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {receipts.map((r, i) => (
                          <a
                            key={i}
                            href={r.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-brand-50 border border-brand-200 text-brand-700 hover:bg-brand-100 rounded-lg text-xs font-bold transition-colors"
                          >
                            <FileText className="w-3.5 h-3.5 text-brand-600" />
                            <span>Comprobante #{i + 1}{r.amount ? ` (${formatPrice(r.amount)})` : ''}</span>
                            <ExternalLink className="w-3 h-3 text-brand-500" />
                          </a>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Totales Resumen */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-2 text-xs">
              <div className="flex justify-between text-slate-600 font-semibold">
                <span>Subtotal Artículos:</span>
                <span className="font-mono">{formatPrice(itemsSubtotal)}</span>
              </div>
              {orderDiscountAmount > 0 && (
                <>
                  {discountBreakdown.length > 0 ? discountBreakdown.map(discount => (
                    <div key={discount.id} className="flex justify-between text-amber-700 font-semibold">
                      <span>{discount.description} ({discount.type === 'percentage' ? `${discount.value}%` : 'Monto Fijo'}):</span>
                      <span className="font-mono">-{formatPrice(discount.amount)}</span>
                    </div>
                  )) : (
                    <div className="flex justify-between text-amber-700 font-semibold">
                      <span>{discountLabel}:</span>
                      <span className="font-mono">-{formatPrice(orderDiscountAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-600 font-semibold">
                    <span>Subtotal Neto:</span>
                    <span className="font-mono">{formatPrice(netSubtotal)}</span>
                  </div>
                </>
              )}
              {Boolean(order.surcharges && order.surcharges > 0) && (
                <div className="flex justify-between text-red-600 font-semibold">
                  <span>Recargos por Pago:</span>
                  <span className="font-mono">+{formatPrice(order.surcharges || 0)}</span>
                </div>
              )}
              {Boolean(order.freight_cost && order.freight_cost > 0) && (
                <div className="flex justify-between text-slate-600 font-semibold">
                  <span>Flete / Envío:</span>
                  <span className="font-mono">+{formatPrice(order.freight_cost || 0)}</span>
                </div>
              )}
              {Boolean(order.tax && order.tax > 0) && (
                <div className="flex justify-between text-slate-600 font-semibold">
                  <span>IVA (21%):</span>
                  <span className="font-mono">+{formatPrice(order.tax || 0)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-black text-slate-900 border-t border-slate-200 pt-2 mt-1">
                <span>Total del Pedido:</span>
                <span className="font-mono text-brand-700">{formatPrice(finalTotal)}</span>
              </div>
            </div>

          </div>

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
          <span className="text-xs text-slate-400 font-medium">
            Vista de lectura (sin edición directa)
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onPrint(order)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Ver Comprobante</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
