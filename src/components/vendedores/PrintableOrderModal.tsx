"use client";

import React, { useRef, useState } from "react";
import { 
  X, 
  Download, 
  Printer, 
  Check, 
  FileText, 
  Image as ImageIcon, 
  Sparkles, 
  MapPin,
  Calendar,
  Truck,
  CreditCard,
  User,
  AlertCircle
} from "lucide-react";
import html2canvas from "html2canvas-pro";
import { createPrintablePdf } from "@/lib/printablePdf";
import { formatPrice } from "@/lib/utils";

export interface PrintableOrderItem {
  id?: string;
  product_id?: string;
  product_name?: string;
  name?: string;
  sku?: string;
  quantity: number;
  unit_price?: number;
  customPrice?: number;
  basePrice?: number;
}

export interface PrintableOrderData {
  id: string;
  legacy_code?: string;
  created_at?: string;
  order_date?: string;
  customer_name?: string;
  client_phone?: string;
  client_phone_secondary?: string;
  address?: string;
  locality?: string;
  zone_name?: string;
  google_maps_link?: string;
  whaticket_link?: string;
  seller_name?: string;
  status?: string;
  channel?: string;
  advertising_source_name?: string;
  order_medium_name?: string;
  freight_type?: string;
  initial_delivery_date?: string;
  max_delivery_date?: string;
  delivery_notes?: string;
  delivery_detail?: string;
  payment_method_name?: string;
  payment_status?: string;
  total_amount: number;
  subtotal?: number;
  order_discount_type?: 'percentage' | 'fixed';
  order_discount_value?: number;
  order_discount_amount?: number;
  freight_cost?: number;
  surcharges?: number;
  tax?: number;
  deposit_amount?: number;
  deposit_receipt_url?: string;
  pending_balance?: number;
  order_items: PrintableOrderItem[];
}

interface PrintableOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: PrintableOrderData | null;
  onEdit?: (order: PrintableOrderData) => void;
}

export default function PrintableOrderModal({
  isOpen,
  onClose,
  order,
  onEdit
}: PrintableOrderModalProps) {
  const printableRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState<"pdf" | "image" | "copy" | null>(null);
  const [copiedSuccess, setCopiedSuccess] = useState(false);

  if (!isOpen || !order) return null;

  const isWholesale = order.channel === 'mayorista';
  const companyName = isWholesale ? 'AQUAFORT' : 'ZONO CONSTRUCCIÓN';
  const documentPrefix = isWholesale ? 'Aquafort' : 'Zono';
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
    : new Date().toLocaleDateString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      });

  const cleanClientName = (order.customer_name || "Cliente")
    .replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ_\- ]/g, "")
    .trim()
    .replace(/\s+/g, "_");

  // Canvas generator optimizado para impresión nítida
  const generateCanvas = async () => {
    if (!printableRef.current) return null;
    return await html2canvas(printableRef.current, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#ffffff",
      logging: false,
      windowWidth: 800
    });
  };

  // 1. Descargar como PDF
  const handleDownloadPdf = async () => {
    try {
      setIsExporting("pdf");
      const canvas = await generateCanvas();
      if (!canvas) return;

      const pdf = createPrintablePdf(canvas, printableRef.current!);

      pdf.save(`Comprobante_Pedido_${documentPrefix}_${orderNumber}_${cleanClientName}.pdf`);
    } catch (error) {
      console.error("Error al generar PDF:", error);
      alert("Ocurrió un error al generar el PDF del comprobante.");
    } finally {
      setIsExporting(null);
    }
  };

  // 2. Descargar como Imagen (PNG)
  const handleDownloadImage = async () => {
    try {
      setIsExporting("image");
      const canvas = await generateCanvas();
      if (!canvas) return;

      const link = document.createElement("a");
      link.download = `Comprobante_Pedido_${documentPrefix}_${orderNumber}_${cleanClientName}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (error) {
      console.error("Error al generar imagen:", error);
      alert("Ocurrió un error al generar la imagen del comprobante.");
    } finally {
      setIsExporting(null);
    }
  };

  // 3. Copiar Imagen al Portapapeles (para pegar directo en WhatsApp)
  const handleCopyImage = async () => {
    try {
      setIsExporting("copy");
      const canvas = await generateCanvas();
      if (!canvas) return;

      canvas.toBlob(async (blob) => {
        if (!blob) {
          throw new Error("No se pudo crear el blob de la imagen");
        }
        try {
          if (navigator.clipboard && window.ClipboardItem) {
            await navigator.clipboard.write([
              new ClipboardItem({ "image/png": blob })
            ]);
            setCopiedSuccess(true);
            setTimeout(() => setCopiedSuccess(false), 3000);
          } else {
            throw new Error("Clipboard API no soportada");
          }
        } catch (clipErr) {
          console.warn("Fallo en portapapeles, descargando PNG...", clipErr);
          const link = document.createElement("a");
          link.download = `Comprobante_Pedido_${documentPrefix}_${orderNumber}_${cleanClientName}.png`;
          link.href = URL.createObjectURL(blob);
          link.click();
          alert("Tu navegador no permitió copiar directamente al portapapeles. Se descargó la imagen PNG para que la compartas.");
        } finally {
          setIsExporting(null);
        }
      }, "image/png");
    } catch (error) {
      console.error("Error al copiar imagen:", error);
      setIsExporting(null);
      alert("No se pudo copiar la imagen.");
    }
  };

  // 4. Imprimir directamente usando el navegador
  const handlePrint = () => {
    window.print();
  };

  // Cálculo de totales y balances
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
  const deposit = order.deposit_amount || 0;
  const balance = order.pending_balance !== undefined 
    ? order.pending_balance 
    : (order.payment_status === 'Abonado' ? 0 : Math.max(0, finalTotal - deposit));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/70 backdrop-blur-sm overflow-hidden">
      {/* Estilos para impresión en papel */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #printable-order-document, #printable-order-document * {
            visibility: visible !important;
          }
          #printable-order-document {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 8mm !important;
            box-shadow: none !important;
            border: none !important;
            background: #ffffff !important;
          }
        }
      `}</style>

      <div className="bg-slate-100 rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[96vh] overflow-hidden border border-slate-200">
        
        {/* Barra superior de control y acciones */}
        <div className="p-3 sm:p-4 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white shadow-xs">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                Comprobante de Pedido
                <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-bold border border-emerald-200">
                  {orderNumber}
                </span>
              </h2>
              <p className="text-[11px] font-semibold text-slate-500">
                Descargá en PDF, imagen PNG, copialo para WhatsApp o imprimilo en papel.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {/* Copiar Imagen al Portapapeles (WhatsApp) */}
            <button
              onClick={handleCopyImage}
              disabled={isExporting !== null}
              className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-xs cursor-pointer ${
                copiedSuccess 
                  ? "bg-emerald-600 text-white hover:bg-emerald-700" 
                  : "bg-emerald-500 hover:bg-emerald-600 text-white"
              }`}
              title="Copia la imagen del comprobante lista para pegar con Ctrl+V en WhatsApp"
            >
              {copiedSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5 text-white" />
                  <span>¡Copiada!</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-emerald-100" />
                  <span>Copiar Imagen (WhatsApp)</span>
                </>
              )}
            </button>

            {/* Descargar Imagen PNG */}
            <button
              onClick={handleDownloadImage}
              disabled={isExporting !== null}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
            >
              <ImageIcon className="w-3.5 h-3.5 text-slate-300" />
              <span>{isExporting === "image" ? "Generando..." : "Descargar Imagen"}</span>
            </button>

            {/* Descargar PDF */}
            <button
              onClick={handleDownloadPdf}
              disabled={isExporting !== null}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-blue-200" />
              <span>{isExporting === "pdf" ? "Generando..." : "Descargar PDF"}</span>
            </button>

            {/* Imprimir */}
            <button
              onClick={handlePrint}
              disabled={isExporting !== null}
              className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-slate-500" />
              <span>Imprimir</span>
            </button>

            {/* Editar Pedido si viene callback */}
            {onEdit && (
              <button
                onClick={() => {
                  onClose();
                  onEdit(order);
                }}
                className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                ✏️ Editar
              </button>
            )}

            {/* Cerrar */}
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer ml-1"
              title="Cerrar modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Contenedor con Scroll para Visualización */}
        <div className="flex-1 min-h-0 overflow-auto p-4 sm:p-6 flex items-start justify-center bg-slate-200/60 custom-scrollbar">
          
          {/* DOCUMENTO IMPRIMIBLE OFICIAL DE ZONO */}
          <div
            id="printable-order-document"
            ref={printableRef}
            style={{
              width: "740px",
              height: "max-content",
              alignSelf: "flex-start",
              backgroundColor: "#ffffff",
              color: "#0f172a",
              fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
              padding: "26px 30px",
              boxSizing: "border-box",
              borderRadius: "12px",
              boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.08)",
              position: "relative",
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-start",
              gap: "24px",
              overflow: "visible",
              // Keep the export width stable inside narrow viewports.
              flexShrink: 0
            }}
          >
            <div>
              {/* ENCABEZADO INSTITUCIONAL */}
              <div 
                style={{ 
                  display: "flex", 
                  justifyContent: "space-between", 
                  alignItems: "flex-start", 
                  borderBottom: "2px solid #001538", 
                  paddingBottom: "14px", 
                  marginBottom: "16px" 
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div 
                      style={{ 
                        width: "36px", 
                        height: "36px", 
                        borderRadius: "8px", 
                        backgroundColor: "#001538", 
                        display: "flex", 
                        alignItems: "center", 
                        justifyContent: "center",
                        color: "#ffffff",
                        fontWeight: 900,
                        fontSize: "18px"
                      }}
                    >
                      {isWholesale ? 'A' : 'Z'}
                    </div>
                    <div>
                      <div style={{ fontSize: "19px", fontWeight: 900, color: "#001538", letterSpacing: "-0.5px", lineHeight: 1.1 }}>
                        {companyName}
                      </div>
                      <div style={{ fontSize: "9.5px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        {isWholesale ? 'Canal Mayorista' : 'Venta Directa & Distribución Oficial'}
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize: "9px", color: "#64748b", marginTop: "4px" }}>
                    {isWholesale
                      ? 'Quilmes 4541, Paso del Rey • AquaFort'
                      : 'Quilmes 4541, Paso del Rey • Tel: 11-5769-4181 • www.zono.com.ar'}
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div 
                    style={{ 
                      display: "inline-block",
                      backgroundColor: "#001538",
                      color: "#ffffff",
                      fontSize: "10px",
                      fontWeight: 900,
                      letterSpacing: "1px",
                      padding: "4px 10px",
                      borderRadius: "6px",
                      textTransform: "uppercase"
                    }}
                  >
                    COMPROBANTE DE PEDIDO
                  </div>
                  <div style={{ fontSize: "14px", fontWeight: 900, color: "#001538", marginTop: "4px" }}>
                    Nº {orderNumber}
                  </div>
                  <div style={{ fontSize: "9.5px", color: "#64748b", marginTop: "1px" }}>
                    Fecha: <strong style={{ color: "#0f172a" }}>{orderDateFormatted}</strong>
                  </div>
                </div>
              </div>

              {/* BLOQUE DE DATOS: CLIENTE Y VENTA */}
              <div 
                style={{ 
                  display: "grid", 
                  gridTemplateColumns: "1.1fr 0.9fr", 
                  gap: "12px", 
                  backgroundColor: "#f8fafc", 
                  border: "1px solid #e2e8f0", 
                  borderRadius: "8px", 
                  padding: "12px 14px", 
                  marginBottom: "14px" 
                }}
              >
                {/* Destinatario */}
                <div>
                  <div style={{ fontSize: "8.5px", fontWeight: 900, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    DATOS DEL CLIENTE / DESTINATARIO
                  </div>
                  <div style={{ fontSize: "13px", fontWeight: 800, color: "#0f172a", marginTop: "2px" }}>
                    {order.customer_name || "Consumidor Final"}
                  </div>
                  <div style={{ fontSize: "10.5px", color: "#334155", marginTop: "2px" }}>
                    <strong>Dirección:</strong> {order.address || "A coordinar"}
                  </div>
                  {(order.client_phone || order.client_phone_secondary) && (
                    <div style={{ fontSize: "10px", color: "#475569", marginTop: "2px" }}>
                      <strong>Teléfono:</strong> {[order.client_phone, order.client_phone_secondary].filter(Boolean).join(" / ")}
                    </div>
                  )}
                </div>

                {/* Datos de atención */}
                <div style={{ borderLeft: "1px solid #e2e8f0", paddingLeft: "12px" }}>
                  <div style={{ fontSize: "8.5px", fontWeight: 900, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    DATOS DE ATENCIÓN
                  </div>
                  <div style={{ fontSize: "11px", color: "#334155", marginTop: "2px" }}>
                    <strong>Asesor Comercial:</strong> <span style={{ fontWeight: 800, color: "#0f172a" }}>{order.seller_name || "Equipo Zono"}</span>
                  </div>
                  {(order.initial_delivery_date || order.max_delivery_date) && (
                    <div style={{ fontSize: "10.5px", color: "#334155", marginTop: "1px" }}>
                      <strong>Fecha Entrega:</strong>{" "}
                      {order.initial_delivery_date 
                        ? new Date(order.initial_delivery_date + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })
                        : "A definir"}
                      {order.max_delivery_date && order.max_delivery_date !== order.initial_delivery_date
                        ? ` al ${new Date(order.max_delivery_date + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })}`
                        : ""}
                    </div>
                  )}
                </div>
              </div>

              {/* TABLA DE PRODUCTOS DEL PEDIDO */}
              <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "14px" }}>
                <thead>
                  <tr style={{ backgroundColor: "#001538", color: "#ffffff", textAlign: "left", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    <th style={{ padding: "7px 10px", textAlign: "center", width: "50px", borderTopLeftRadius: "6px" }}>Cant.</th>
                    <th style={{ padding: "7px 12px" }}>SKU</th>
                    <th style={{ padding: "7px 10px", textAlign: "right", width: "110px" }}>Precio Unitario</th>
                    <th style={{ padding: "7px 12px", textAlign: "right", width: "120px", borderTopRightRadius: "6px" }}>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {(order.order_items || []).map((item, index) => {
                    const qty = item.quantity || 1;
                    const unitPrice = item.unit_price ?? item.customPrice ?? 0;
                    const subtotal = qty * unitPrice;
                    const rowBg = index % 2 === 0 ? "#ffffff" : "#f8fafc";
                    const displaySku = (item.sku && !item.sku.startsWith("AUTO-")) 
                      ? item.sku 
                      : (item.sku || item.product_name || item.name || "Producto");

                    return (
                      <tr key={index} style={{ backgroundColor: rowBg, borderBottom: "1px solid #e2e8f0", fontSize: "10.5px" }}>
                        <td style={{ padding: "7px 10px", textAlign: "center", fontWeight: 900, color: "#001538" }}>
                          {qty} u.
                        </td>
                        <td style={{ padding: "7px 12px" }}>
                          <div style={{ fontWeight: 800, color: "#0f172a" }}>
                            {displaySku}
                          </div>
                        </td>
                        <td style={{ padding: "7px 10px", textAlign: "right", color: "#475569", fontFamily: "monospace" }}>
                          {formatPrice(unitPrice)}
                        </td>
                        <td style={{ padding: "7px 12px", textAlign: "right", fontWeight: 900, color: "#0f172a", fontFamily: "monospace" }}>
                          {formatPrice(subtotal)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* SECCIÓN INFERIOR: CONDICIÓN DE PAGO Y TOTALES */}
              <div data-pdf-keep-together style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: "14px", alignItems: "start" }}>
                
                {/* Izquierda: Forma de Pago y Estado de Cobro */}
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div 
                    style={{ 
                      backgroundColor: "#f8fafc", 
                      border: "1px solid #e2e8f0", 
                      borderRadius: "8px", 
                      padding: "10px 12px" 
                    }}
                  >
                    <div style={{ fontSize: "8.5px", fontWeight: 900, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      MÉTODO DE PAGO
                    </div>
                    <div style={{ fontSize: "11.5px", fontWeight: 800, color: "#0f172a", marginTop: "2px" }}>
                      {order.payment_method_name || "Efectivo / Transferencia"}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "5px" }}>
                      <span style={{ fontSize: "9px", color: "#64748b", fontWeight: 700 }}>Estado de Pago:</span>
                      <span 
                        style={{ 
                          fontSize: "8.5px", 
                          fontWeight: 900, 
                          padding: "2px 7px", 
                          borderRadius: "4px",
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                          backgroundColor: order.payment_status === 'Abonado' ? '#ecfdf5' : (order.payment_status === 'Seniado' ? '#fef3c7' : '#fee2e2'),
                          color: order.payment_status === 'Abonado' ? '#047857' : (order.payment_status === 'Seniado' ? '#b45309' : '#b91c1c'),
                          border: `1px solid ${order.payment_status === 'Abonado' ? '#a7f3d0' : (order.payment_status === 'Seniado' ? '#fde68a' : '#fecaca')}`
                        }}
                      >
                        {order.payment_status === 'Abonado' ? 'Totalmente Abonado' : (order.payment_status === 'Seniado' ? 'Señado' : 'Pendiente de Cobro')}
                      </span>
                    </div>
                  </div>

                  {/* Saldo y Seña */}
                  {deposit > 0 && (
                    <div 
                      style={{ 
                        backgroundColor: "#ecfdf5", 
                        border: "1px solid #a7f3d0", 
                        borderRadius: "8px", 
                        padding: "8px 12px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center"
                      }}
                    >
                      <span style={{ fontSize: "10px", fontWeight: 800, color: "#047857" }}>Seña Recibida:</span>
                      <span style={{ fontSize: "11px", fontWeight: 900, color: "#047857", fontFamily: "monospace" }}>
                        {formatPrice(deposit)}
                      </span>
                    </div>
                  )}

                  {balance > 0 ? (
                    <div 
                      style={{ 
                        backgroundColor: "#fff1f2", 
                        border: "1px solid #fecdd3", 
                        borderRadius: "8px", 
                        padding: "8px 12px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center"
                      }}
                    >
                      <span style={{ fontSize: "10px", fontWeight: 900, color: "#be123c", textTransform: "uppercase" }}>
                        SALDO A COBRAR EN DOMICILIO:
                      </span>
                      <span style={{ fontSize: "12px", fontWeight: 900, color: "#be123c", fontFamily: "monospace" }}>
                        {formatPrice(balance)}
                      </span>
                    </div>
                  ) : (
                    <div 
                      style={{ 
                        backgroundColor: "#ecfdf5", 
                        border: "1px solid #a7f3d0", 
                        borderRadius: "8px", 
                        padding: "6px 10px",
                        textAlign: "center",
                        fontSize: "9.5px",
                        fontWeight: 900,
                        color: "#047857",
                        textTransform: "uppercase"
                      }}
                    >
                      ✓ Sin saldo pendiente al momento de la entrega
                    </div>
                  )}
                </div>

                {/* Derecha: Desglose Financiero */}
                <div 
                  style={{ 
                    backgroundColor: "#f8fafc", 
                    border: "1px solid #e2e8f0", 
                    borderRadius: "8px", 
                    padding: "10px 14px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "5px"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#475569" }}>
                    <span>Subtotal Artículos:</span>
                    <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{formatPrice(itemsSubtotal)}</span>
                  </div>

                  {orderDiscountAmount > 0 && (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#b45309", fontWeight: 700 }}>
                        <span>{discountLabel}:</span>
                        <span style={{ fontFamily: "monospace" }}>-{formatPrice(orderDiscountAmount)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#475569", fontWeight: 700 }}>
                        <span>Subtotal Neto:</span>
                        <span style={{ fontFamily: "monospace" }}>{formatPrice(netSubtotal)}</span>
                      </div>
                    </>
                  )}

                  {Boolean(order.surcharges && order.surcharges > 0) && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#b91c1c" }}>
                      <span>Recargo Financiero:</span>
                      <span style={{ fontFamily: "monospace", fontWeight: 700 }}>+{formatPrice(order.surcharges || 0)}</span>
                    </div>
                  )}

                  {Boolean(order.freight_cost && order.freight_cost > 0) && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#475569" }}>
                      <span>Costo de Envío / Flete:</span>
                      <span style={{ fontFamily: "monospace", fontWeight: 700 }}>+{formatPrice(order.freight_cost || 0)}</span>
                    </div>
                  )}

                  {Boolean(order.tax && order.tax > 0) && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#475569" }}>
                      <span>IVA (21%):</span>
                      <span style={{ fontFamily: "monospace", fontWeight: 700 }}>+{formatPrice(order.tax || 0)}</span>
                    </div>
                  )}

                  <div 
                    style={{ 
                      display: "flex", 
                      justifyContent: "space-between", 
                      fontSize: "14px", 
                      fontWeight: 900, 
                      color: "#001538", 
                      borderTop: "2px solid #001538", 
                      paddingTop: "6px",
                      marginTop: "4px"
                    }}
                  >
                    <span>TOTAL DEL PEDIDO:</span>
                    <span style={{ fontFamily: "monospace" }}>{formatPrice(finalTotal)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* PIE DE PÁGINA INSTITUCIONAL CON FIRMAS */}
            <div
              data-pdf-keep-together
              style={{
                borderTop: "1px solid #cbd5e1",
                paddingTop: "14px",
                breakInside: "avoid",
                pageBreakInside: "avoid",
                flexShrink: 0
              }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginBottom: "12px" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ borderTop: "1px solid #94a3b8", width: "70%", margin: "0 auto 4px" }} />
                  <div style={{ fontSize: "8.5px", fontWeight: 900, color: "#334155", textTransform: "uppercase" }}>
                    Firma Conforme Destinatario
                  </div>
                  <div style={{ fontSize: "7.5px", color: "#64748b" }}>
                    Aclaración, DNI y Fecha
                  </div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ borderTop: "1px solid #94a3b8", width: "70%", margin: "0 auto 4px" }} />
                  <div style={{ fontSize: "8.5px", fontWeight: 900, color: "#334155", textTransform: "uppercase" }}>
                    {companyName}
                  </div>
                  <div style={{ fontSize: "7.5px", color: "#64748b" }}>
                    Comprobante Operativo de Entrega
                  </div>
                </div>
              </div>

              <div style={{ textAlign: "center", fontSize: "8px", color: "#94a3b8" }}>
                Este documento es un comprobante interno de pedido y control de entrega emitido por {companyName}.
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
