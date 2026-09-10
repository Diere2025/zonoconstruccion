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
  User, 
  Phone, 
  ShieldCheck
} from "lucide-react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { formatPrice } from "@/lib/utils";
import { isDiscountItem } from "@/app/vendedores/presupuestos/page";

interface QuoteItem {
  id: string;
  name?: string;
  sku?: string;
  quantity: number;
  customPrice: number;
  basePrice?: number;
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
  isIncludedInKit?: boolean;
}

interface PrintableBudgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  quoteItems: QuoteItem[];
  clientName: string;
  setClientName: (v: string) => void;
  clientPhone: string;
  setClientPhone: (v: string) => void;
  sellerName: string;
  setSellerName?: (v: string) => void;
  budgetNumber: string;
  orderDiscountType: 'percentage' | 'fixed';
  orderDiscountValue: number;
  orderDiscountAmount: number;
  itemsGrossSubtotal: number;
  subtotal: number;
  isFreeShipping: boolean;
  shippingCost: number;
  selectedPaymentMethod: {
    name: string;
    installments: number;
    surcharge_percentage: number;
  };
  surcharge: number;
  includeIVA: boolean;
  ivaAmount: number;
  total: number;
  installmentValue: number;
  totalSavings: number;
  hasAnyItemDiscount: boolean;
  totalItemDiscountAmount: number;
  totalListPrice: number;
  kitDetailText: string;
}

export default function PrintableBudgetModal({
  isOpen,
  onClose,
  quoteItems,
  clientName,
  setClientName,
  clientPhone,
  setClientPhone,
  sellerName,
  setSellerName,
  budgetNumber,
  orderDiscountType,
  orderDiscountValue,
  orderDiscountAmount,
  itemsGrossSubtotal,
  subtotal,
  isFreeShipping,
  shippingCost,
  selectedPaymentMethod,
  surcharge,
  includeIVA,
  ivaAmount,
  total,
  installmentValue,
  totalSavings,
  hasAnyItemDiscount,
  totalItemDiscountAmount,
  totalListPrice,
  kitDetailText,
}: PrintableBudgetModalProps) {
  const printableRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState<"pdf" | "image" | "copy" | null>(null);
  const [copiedSuccess, setCopiedSuccess] = useState(false);

  if (!isOpen) return null;

  const today = new Date();
  const formattedDate = today.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });

  const validUntilDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });

  const cleanClientName = (clientName || "Cliente")
    .replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ_\- ]/g, "")
    .trim()
    .replace(/\s+/g, "_");

  // Genera el canvas optimizado usando html2canvas
  const generateCanvas = async () => {
    if (!printableRef.current) return null;
    return await html2canvas(printableRef.current, {
      scale: 2, // 2x resolution for crisp high-DPI output
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#ffffff",
      logging: false,
      windowWidth: 800,
    });
  };

  // 1. Descargar como PDF
  const handleDownloadPdf = async () => {
    try {
      setIsExporting("pdf");
      const canvas = await generateCanvas();
      if (!canvas) return;

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4"
      });

      const pdfWidth = pdf.internal.pageSize.getWidth(); // 210mm
      const pdfHeight = pdf.internal.pageSize.getHeight(); // 297mm
      const margin = 10;
      const printWidth = pdfWidth - margin * 2; // 190mm
      const printHeight = (canvas.height * printWidth) / canvas.width;

      if (printHeight <= pdfHeight - margin * 2) {
        // Entra en 1 sola página
        pdf.addImage(imgData, "PNG", margin, margin, printWidth, printHeight);
      } else {
        // Multi-página para presupuestos muy extensos
        let heightLeft = printHeight;
        let position = margin;
        pdf.addImage(imgData, "PNG", margin, position, printWidth, printHeight);
        heightLeft -= (pdfHeight - margin * 2);

        while (heightLeft > 0) {
          position = heightLeft - printHeight + margin;
          pdf.addPage();
          pdf.addImage(imgData, "PNG", margin, position, printWidth, printHeight);
          heightLeft -= (pdfHeight - margin * 2);
        }
      }

      pdf.save(`Presupuesto_Zono_${budgetNumber}_${cleanClientName}.pdf`);
    } catch (error) {
      console.error("Error al generar PDF:", error);
      alert("Ocurrió un error al generar el PDF. Por favor intentá nuevamente.");
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
      link.download = `Presupuesto_Zono_${budgetNumber}_${cleanClientName}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (error) {
      console.error("Error al generar Imagen:", error);
      alert("Ocurrió un error al generar la imagen.");
    } finally {
      setIsExporting(null);
    }
  };

  // 3. Copiar Imagen al Portapapeles (para pegar directo en WhatsApp Web)
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
          console.warn("Fallo al escribir en portapapeles, descargando como alternativa...", clipErr);
          // Fallback: descargar
          const link = document.createElement("a");
          link.download = `Presupuesto_Zono_${budgetNumber}_${cleanClientName}.png`;
          link.href = URL.createObjectURL(blob);
          link.click();
          alert("Tu navegador no permitió copiar la imagen directamente al portapapeles. Se descargó el archivo PNG para que lo adjuntes.");
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

  // 4. Imprimir directamente usando el diálogo del navegador
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/70 backdrop-blur-sm overflow-hidden">
      {/* Estilos para impresión limpia en papel */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #printable-budget-document, #printable-budget-document * {
            visibility: visible !important;
          }
          #printable-budget-document {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 10mm !important;
            box-shadow: none !important;
            border: none !important;
            background: #ffffff !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="bg-slate-100 rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[96vh] overflow-hidden border border-slate-200">
        
        {/* Barra superior de control / acciones */}
        <div className="p-3 sm:p-4 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                Exportar / Imprimir Presupuesto
                <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-bold border border-blue-200">
                  {budgetNumber}
                </span>
              </h2>
              <p className="text-[11px] font-semibold text-slate-500">
                Podés descargar en PDF, imagen PNG, copiar al portapapeles para WhatsApp o imprimir en papel.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {/* Copiar Imagen al Portapapeles (ideal WhatsApp Web) */}
            <button
              onClick={handleCopyImage}
              disabled={isExporting !== null}
              className={`px-3 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-sm cursor-pointer ${
                copiedSuccess 
                  ? "bg-emerald-600 text-white hover:bg-emerald-700" 
                  : "bg-emerald-500 hover:bg-emerald-600 text-white"
              }`}
              title="Copia la imagen del presupuesto lista para pegar con Ctrl+V en WhatsApp Web"
            >
              {copiedSuccess ? (
                <>
                  <Check className="w-4 h-4 text-white" />
                  <span>¡Copiada para WhatsApp!</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-emerald-100" />
                  <span>Copiar Imagen (WhatsApp)</span>
                </>
              )}
            </button>

            {/* Descargar Imagen PNG */}
            <button
              onClick={handleDownloadImage}
              disabled={isExporting !== null}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
            >
              <ImageIcon className="w-4 h-4 text-slate-300" />
              <span>{isExporting === "image" ? "Generando..." : "Descargar Imagen"}</span>
            </button>

            {/* Descargar PDF */}
            <button
              onClick={handleDownloadPdf}
              disabled={isExporting !== null}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
            >
              <Download className="w-4 h-4 text-blue-200" />
              <span>{isExporting === "pdf" ? "Generando..." : "Descargar PDF"}</span>
            </button>

            {/* Imprimir */}
            <button
              onClick={handlePrint}
              disabled={isExporting !== null}
              className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
            >
              <Printer className="w-4 h-4 text-slate-500" />
              <span>Imprimir</span>
            </button>

            {/* Cerrar */}
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              title="Cerrar ventana"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Campos rápidos para personalizar nombre de cliente y teléfono antes de exportar */}
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Nombre del Cliente (Ej. Juan Pérez)..."
              className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
            />
          </div>

          <div className="flex items-center gap-2 flex-1 min-w-[180px]">
            <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              type="text"
              value={clientPhone}
              onChange={(e) => setClientPhone(e.target.value)}
              placeholder="Teléfono / Localidad (Opcional)..."
              className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
            />
          </div>

          {setSellerName && (
            <div className="flex items-center gap-2 flex-1 min-w-[180px]">
              <ShieldCheck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <input
                type="text"
                value={sellerName}
                onChange={(e) => setSellerName(e.target.value)}
                placeholder="Nombre del Asesor Comercial..."
                className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
              />
            </div>
          )}
        </div>

        {/* Contenedor con Scroll para previsualizar el documento exacto */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex justify-center bg-slate-200/80">
          
          {/* DOCUMENTO IMPRIMIBLE / EXPORTABLE */}
          <div
            id="printable-budget-document"
            ref={printableRef}
            style={{
              width: "794px", // Ancho estándar A4 a 96 DPI
              minHeight: "1000px",
              backgroundColor: "#ffffff",
              color: "#0f172a",
              fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
              padding: "36px 40px",
              boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
              borderRadius: "8px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between"
            }}
          >
            <div>
              {/* ENCABEZADO INSTITUCIONAL */}
              <div 
                style={{ 
                  display: "flex", 
                  justifyContent: "space-between", 
                  alignItems: "flex-start",
                  borderBottom: "3px solid #001538",
                  paddingBottom: "18px",
                  marginBottom: "20px"
                }}
              >
                {/* Logo & Marca */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div 
                      style={{ 
                        backgroundColor: "#001538", 
                        color: "#ffffff", 
                        fontWeight: 900, 
                        fontSize: "24px", 
                        letterSpacing: "1px",
                        padding: "4px 12px",
                        borderRadius: "6px"
                      }}
                    >
                      ZONO
                    </div>
                    <div>
                      <div style={{ fontSize: "16px", fontWeight: 900, color: "#001538", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        CONSTRUCCIÓN & HOGAR
                      </div>
                      <div style={{ fontSize: "10px", fontWeight: 600, color: "#64748b" }}>
                        Venta Directa de Fábrica y Distribución
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize: "9px", color: "#64748b", marginTop: "6px" }}>
                    www.zono.com.ar • Buenos Aires, Argentina
                  </div>
                </div>

                {/* Número y Fecha de Presupuesto */}
                <div style={{ textAlign: "right" }}>
                  <div 
                    style={{ 
                      fontSize: "18px", 
                      fontWeight: 900, 
                      color: "#001538", 
                      letterSpacing: "1px",
                      textTransform: "uppercase"
                    }}
                  >
                    PRESUPUESTO COMERCIAL
                  </div>
                  <div 
                    style={{ 
                      display: "inline-block",
                      backgroundColor: "#f1f5f9", 
                      color: "#001538", 
                      fontSize: "11px", 
                      fontWeight: 800, 
                      padding: "3px 10px", 
                      borderRadius: "4px",
                      border: "1px solid #cbd5e1",
                      marginTop: "4px"
                    }}
                  >
                    Nº {budgetNumber}
                  </div>
                  <div style={{ fontSize: "11px", color: "#334155", marginTop: "4px" }}>
                    <strong>Emisión:</strong> {formattedDate}
                  </div>
                  <div style={{ fontSize: "10px", color: "#b45309", fontWeight: 700, marginTop: "2px" }}>
                    Vigencia: 7 días corridos (hasta {validUntilDate})
                  </div>
                </div>
              </div>

              {/* DATOS DEL CLIENTE Y ASESOR */}
              <div 
                style={{ 
                  backgroundColor: "#f8fafc", 
                  border: "1px solid #e2e8f0", 
                  borderRadius: "8px", 
                  padding: "14px 18px", 
                  marginBottom: "22px",
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "16px"
                }}
              >
                <div>
                  <div style={{ fontSize: "9px", fontWeight: 900, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    DATOS DEL CLIENTE / DESTINATARIO
                  </div>
                  <div style={{ fontSize: "13px", fontWeight: 800, color: "#0f172a", marginTop: "2px" }}>
                    {clientName.trim() ? clientName : "Consumidor Final"}
                  </div>
                  <div style={{ fontSize: "11px", color: "#475569", marginTop: "2px" }}>
                    {clientPhone.trim() ? clientPhone : "Atención por WhatsApp Oficial"}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: "9px", fontWeight: 900, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    ASESOR COMERCIAL
                  </div>
                  <div style={{ fontSize: "13px", fontWeight: 800, color: "#0f172a", marginTop: "2px" }}>
                    {sellerName.trim() ? sellerName : "Equipo de Ventas Zono"}
                  </div>
                  <div style={{ fontSize: "11px", color: "#475569", marginTop: "2px" }}>
                    Canal: Cotizador Minorista Oficial
                  </div>
                </div>
              </div>

              {/* TABLA DE PRODUCTOS / ÍTEMS */}
              <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "20px" }}>
                <thead>
                  <tr style={{ backgroundColor: "#001538", color: "#ffffff", textAlign: "left", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    <th style={{ padding: "8px 10px", textAlign: "center", width: "55px", borderTopLeftRadius: "6px" }}>Cant.</th>
                    <th style={{ padding: "8px 12px" }}>Descripción del Producto</th>
                    <th style={{ padding: "8px 10px", textAlign: "right", width: "110px" }}>Precio Lista</th>
                    <th style={{ padding: "8px 10px", textAlign: "center", width: "105px" }}>Bonificación</th>
                    <th style={{ padding: "8px 12px", textAlign: "right", width: "115px", borderTopRightRadius: "6px" }}>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {quoteItems.map((item, index) => {
                    const isDisc = isDiscountItem(item);
                    const isKitIncluded = Boolean(item.isIncludedInKit || item.customPrice === 0);
                    const base = item.basePrice !== undefined ? item.basePrice : (item.customPrice);
                    const isDiscounted = !isDisc && !isKitIncluded && base > item.customPrice && item.customPrice > 0;
                    const itemSubtotal = isDisc 
                      ? -Math.abs(item.customPrice * item.quantity) 
                      : (isKitIncluded ? 0 : item.customPrice * item.quantity);
                    const rowBg = index % 2 === 0 ? "#ffffff" : "#f8fafc";

                    return (
                      <tr key={`${item.id}-${index}`} style={{ backgroundColor: rowBg, borderBottom: "1px solid #e2e8f0", fontSize: "11px" }}>
                        {/* Cantidad */}
                        <td style={{ padding: "9px 10px", textAlign: "center", fontWeight: 800, color: "#001538" }}>
                          {item.quantity} u.
                        </td>

                        {/* Descripción */}
                        <td style={{ padding: "9px 12px" }}>
                          <div style={{ fontWeight: 800, color: "#0f172a" }}>
                            {item.name || item.sku || "Producto"}
                          </div>
                          {item.sku && item.sku !== item.name && (
                            <div style={{ fontSize: "9px", color: "#64748b", marginTop: "1px" }}>
                              SKU: {item.sku}
                            </div>
                          )}
                          {isKitIncluded && (
                            <span 
                              style={{ 
                                display: "inline-block", 
                                fontSize: "9px", 
                                fontWeight: 800, 
                                color: "#0284c7", 
                                backgroundColor: "#e0f2fe", 
                                padding: "1px 6px", 
                                borderRadius: "4px",
                                marginTop: "3px" 
                              }}
                            >
                              Incluido en el Kit
                            </span>
                          )}
                        </td>

                        {/* Precio Lista */}
                        <td style={{ padding: "9px 10px", textAlign: "right", color: "#475569" }}>
                          {isDisc ? (
                            "-"
                          ) : isKitIncluded ? (
                            <span style={{ color: "#94a3b8" }}>$0</span>
                          ) : isDiscounted ? (
                            <span style={{ textDecoration: "line-through", color: "#94a3b8", fontSize: "10px" }}>
                              {formatPrice(base)}
                            </span>
                          ) : (
                            formatPrice(item.customPrice)
                          )}
                        </td>

                        {/* Bonificación */}
                        <td style={{ padding: "9px 10px", textAlign: "center" }}>
                          {isDisc ? (
                            <span style={{ fontSize: "10px", fontWeight: 800, color: "#b45309", backgroundColor: "#fef3c7", padding: "2px 6px", borderRadius: "4px" }}>
                              DESCUENTO
                            </span>
                          ) : isDiscounted ? (
                            <span style={{ fontSize: "10px", fontWeight: 800, color: "#047857", backgroundColor: "#ecfdf5", padding: "2px 6px", borderRadius: "4px" }}>
                              {item.discountValue || Math.round(((base - item.customPrice) / base) * 100)}% OFF
                            </span>
                          ) : isKitIncluded ? (
                            <span style={{ fontSize: "10px", color: "#64748b" }}>Bonificado</span>
                          ) : (
                            <span style={{ color: "#94a3b8" }}>-</span>
                          )}
                        </td>

                        {/* Subtotal */}
                        <td 
                          style={{ 
                            padding: "9px 12px", 
                            textAlign: "right", 
                            fontWeight: 800, 
                            color: isDisc ? "#b45309" : "#001538" 
                          }}
                        >
                          {isDisc ? `-${formatPrice(Math.abs(itemSubtotal))}` : isKitIncluded ? "$0" : formatPrice(itemSubtotal)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* SECCIÓN INFERIOR: CONDICIONES COMERCIALES Y TOTALES */}
              <div style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: "20px", marginTop: "10px" }}>
                
                {/* Columna Izquierda: Medio de pago, Envío y Aclaraciones */}
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  
                  {/* Tarjeta de Medio de Pago y Cuotas */}
                  <div 
                    style={{ 
                      backgroundColor: "#f8fafc", 
                      border: "1px solid #e2e8f0", 
                      borderRadius: "8px", 
                      padding: "12px 14px" 
                    }}
                  >
                    <div style={{ fontSize: "9px", fontWeight: 900, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      CONDICIÓN DE PAGO
                    </div>
                    <div style={{ fontSize: "12px", fontWeight: 800, color: "#0f172a", marginTop: "3px" }}>
                      {selectedPaymentMethod.name}
                    </div>

                    {selectedPaymentMethod.installments > 1 && (
                      <div 
                        style={{ 
                          backgroundColor: "#eff6ff", 
                          border: "1px solid #bfdbfe", 
                          color: "#1d4ed8", 
                          fontWeight: 800, 
                          fontSize: "12px", 
                          padding: "6px 10px", 
                          borderRadius: "6px", 
                          marginTop: "6px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between"
                        }}
                      >
                        <span>Financiación:</span>
                        <span>{selectedPaymentMethod.installments} cuotas fijas de {formatPrice(installmentValue)}</span>
                      </div>
                    )}
                  </div>

                  {/* Tarjeta de Logística / Envío */}
                  <div 
                    style={{ 
                      backgroundColor: "#f8fafc", 
                      border: "1px solid #e2e8f0", 
                      borderRadius: "8px", 
                      padding: "10px 14px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between"
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "9px", fontWeight: 900, color: "#64748b", textTransform: "uppercase" }}>
                        LOGÍSTICA & ENTREGA
                      </div>
                      <div style={{ fontSize: "11px", fontWeight: 700, color: "#334155", marginTop: "2px" }}>
                        Coordinación directa a domicilio
                      </div>
                    </div>
                    {isFreeShipping ? (
                      <span 
                        style={{ 
                          backgroundColor: "#ecfdf5", 
                          color: "#047857", 
                          fontWeight: 900, 
                          fontSize: "10px", 
                          padding: "3px 10px", 
                          borderRadius: "6px",
                          border: "1px solid #a7f3d0"
                        }}
                      >
                        ENVÍO GRATIS
                      </span>
                    ) : (
                      <span style={{ fontSize: "11px", fontWeight: 800, color: "#0f172a" }}>
                        {formatPrice(shippingCost)}
                      </span>
                    )}
                  </div>

                  {/* Aclaraciones / Detalle adicional del combo */}
                  {kitDetailText && kitDetailText.trim() && (
                    <div 
                      style={{ 
                        backgroundColor: "#fffbeb", 
                        border: "1px solid #fde68a", 
                        borderRadius: "8px", 
                        padding: "10px 14px" 
                      }}
                    >
                      <div style={{ fontSize: "9px", fontWeight: 900, color: "#b45309", textTransform: "uppercase" }}>
                        OBSERVACIONES / DETALLE COMERCIAL
                      </div>
                      <div style={{ fontSize: "11px", fontWeight: 600, color: "#92400e", marginTop: "3px", whiteSpace: "pre-wrap" }}>
                        {kitDetailText}
                      </div>
                    </div>
                  )}

                  {/* Banner de Ahorro Total */}
                  {totalSavings > 0 && (
                    <div 
                      style={{ 
                        backgroundColor: "#ecfdf5", 
                        border: "1px solid #6ee7b7", 
                        borderRadius: "8px", 
                        padding: "8px 12px",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        color: "#047857",
                        fontWeight: 800,
                        fontSize: "11px"
                      }}
                    >
                      <span>🎉</span>
                      <span>¡Ahorro total aplicado en esta cotización: {formatPrice(totalSavings)}!</span>
                    </div>
                  )}
                </div>

                {/* Columna Derecha: Desglose de Totales */}
                <div 
                  style={{ 
                    backgroundColor: "#f8fafc", 
                    border: "1px solid #cbd5e1", 
                    borderRadius: "8px", 
                    padding: "16px",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between"
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    
                    {/* Subtotal Productos */}
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#475569" }}>
                      <span>Subtotal Productos:</span>
                      <span style={{ fontWeight: 700, color: "#0f172a" }}>{formatPrice(itemsGrossSubtotal)}</span>
                    </div>

                    {/* Descuento General del Presupuesto si aplica */}
                    {orderDiscountAmount > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#b45309", fontWeight: 700 }}>
                        <span>Descuento Presupuesto ({orderDiscountType === 'percentage' ? `${orderDiscountValue}%` : 'Monto'}):</span>
                        <span>-{formatPrice(orderDiscountAmount)}</span>
                      </div>
                    )}

                    {/* Envío */}
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#475569" }}>
                      <span>Costo de Envío:</span>
                      <span style={{ fontWeight: 700, color: isFreeShipping ? "#047857" : "#0f172a" }}>
                        {isFreeShipping ? "GRATIS" : formatPrice(shippingCost)}
                      </span>
                    </div>

                    {/* Recargo por cuotas */}
                    {surcharge > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#dc2626", fontWeight: 700 }}>
                        <span>Recargo Cuotas ({selectedPaymentMethod.surcharge_percentage}%):</span>
                        <span>+{formatPrice(surcharge)}</span>
                      </div>
                    )}

                    {/* IVA si está marcado */}
                    {includeIVA && (
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#475569" }}>
                        <span>IVA (21%):</span>
                        <span style={{ fontWeight: 700, color: "#0f172a" }}>+{formatPrice(ivaAmount)}</span>
                      </div>
                    )}
                  </div>

                  {/* CAJA DESTACADA DEL TOTAL */}
                  <div 
                    style={{ 
                      marginTop: "16px",
                      paddingTop: "12px",
                      borderTop: "2px solid #001538"
                    }}
                  >
                    <div style={{ fontSize: "10px", fontWeight: 900, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      TOTAL A ABONAR
                    </div>
                    <div 
                      style={{ 
                        fontSize: "26px", 
                        fontWeight: 900, 
                        color: "#001538", 
                        letterSpacing: "-0.5px",
                        marginTop: "2px"
                      }}
                    >
                      {formatPrice(total)}
                    </div>
                    {selectedPaymentMethod.installments > 1 && (
                      <div style={{ fontSize: "11px", fontWeight: 800, color: "#1d4ed8", marginTop: "2px" }}>
                        {selectedPaymentMethod.installments} cuotas fijas de {formatPrice(installmentValue)}
                      </div>
                    )}
                  </div>

                </div>
              </div>
            </div>

            {/* PIE INSTITUCIONAL / CONDICIONES */}
            <div 
              style={{ 
                borderTop: "1px solid #e2e8f0", 
                paddingTop: "14px", 
                marginTop: "28px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: "9px",
                color: "#64748b"
              }}
            >
              <div>
                <div>• Precios expresados en pesos argentinos (ARS). Presupuesto válido por 7 días o hasta agotar stock disponible.</div>
                <div>• Para confirmar este pedido o coordinar el despacho, comuníquese con su asesor de ventas de Zono.</div>
              </div>
              <div style={{ textAlign: "right", fontWeight: 700, color: "#001538" }}>
                ZONO CONSTRUCCIÓN & HOGAR<br />
                <span style={{ color: "#64748b", fontWeight: 500 }}>Venta Oficial Directa</span>
              </div>
            </div>

          </div>

        </div>

        {/* Barra inferior con advertencia amigable / botón de cierre */}
        <div className="p-3 bg-white border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
            <span>Documento formateado en alta resolución (2x DPI) listo para enviar a tus clientes.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg font-bold text-xs text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            Cerrar Vista Previa
          </button>
        </div>

      </div>
    </div>
  );
}
