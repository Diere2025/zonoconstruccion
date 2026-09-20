"use client";

import React, { useRef, useState } from "react";
import { Check, Copy, Download, Loader2, X } from "lucide-react";
import html2canvas from "html2canvas-pro";
import { Button } from "@/components/ui/Button";
import { formatDateDDMMYYYY, formatPrice } from "@/lib/utils";

interface SupplierOrder {
  oc_code?: string;
  order_date?: string;
  estimated_delivery_date?: string;
  payment_condition?: string;
  payment_term_days?: number;
  supplier?: { name?: string };
}

interface SupplierOrderItem {
  id?: string;
  raw_product_name?: string;
  quantity_ordered?: number;
  unit_cost?: number;
  subtotal?: number;
  product?: { sku?: string };
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  order: SupplierOrder | null;
  items: SupplierOrderItem[];
}

export default function SupplierPurchaseOrderImageModal({ isOpen, onClose, order, items }: Props) {
  const documentRef = useRef<HTMLDivElement>(null);
  const [action, setAction] = useState<"copy" | "download" | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen || !order) return null;

  const totalUnits = items.reduce((sum, item) => sum + (Number(item.quantity_ordered) || 0), 0);
  const totalAmount = items.reduce(
    (sum, item) => sum + (Number(item.subtotal) || ((Number(item.quantity_ordered) || 0) * (Number(item.unit_cost) || 0))),
    0
  );
  const safeCode = (order.oc_code || "orden-compra").replace(/[^a-zA-Z0-9_-]/g, "-");

  const generateCanvas = async () => {
    if (!documentRef.current) throw new Error("No se encontró la vista para proveedor");
    return html2canvas(documentRef.current, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      windowWidth: 900
    });
  };

  const downloadBlob = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = `Orden_de_Compra_${safeCode}.png`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  const canvasToBlob = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("No se pudo generar la imagen")), "image/png");
  });

  const handleCopy = async () => {
    try {
      setAction("copy");
      setCopied(false);
      const blob = await canvasToBlob(await generateCanvas());
      if (!navigator.clipboard || typeof ClipboardItem === "undefined") {
        downloadBlob(blob);
        alert("El navegador no permitió copiar la imagen. Se descargó el PNG para compartirlo.");
        return;
      }
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 3000);
    } catch (error) {
      console.error("Error al copiar la orden para el proveedor:", error);
      alert("No se pudo copiar la imagen. Probá con Descargar PNG.");
    } finally {
      setAction(null);
    }
  };

  const handleDownload = async () => {
    try {
      setAction("download");
      downloadBlob(await canvasToBlob(await generateCanvas()));
    } catch (error) {
      console.error("Error al descargar la orden para el proveedor:", error);
      alert("No se pudo descargar la imagen.");
    } finally {
      setAction(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm">
      <div className="flex max-h-[96vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-slate-100 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
          <div>
            <h3 className="font-black text-slate-900">Vista para enviar al proveedor</h3>
            <p className="text-xs text-slate-500">La imagen no incluye estados, recepción, botones ni notas internas.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-3 sm:p-6">
          <div ref={documentRef} className="mx-auto w-[820px] max-w-full bg-white p-10 text-slate-900 shadow-sm">
            <div className="flex items-start justify-between border-b-2 border-blue-600 pb-6">
              <div>
                <p className="text-sm font-black tracking-[0.18em] text-blue-700">ZONO CONSTRUCCIÓN</p>
                <h1 className="mt-2 text-3xl font-black">ORDEN DE COMPRA</h1>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Número de orden</p>
                <p className="mt-1 text-xl font-black text-blue-700">{order.oc_code || "—"}</p>
                <p className="mt-1 text-xs text-slate-500">Fecha: {order.order_date ? formatDateDDMMYYYY(order.order_date) : "—"}</p>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-x-10 gap-y-4 rounded-2xl bg-slate-50 p-5 text-sm">
              <div className="col-span-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Proveedor</p>
                <p className="mt-1 text-lg font-black">{order.supplier?.name || "—"}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Condición de pago</p>
                <p className="mt-1 font-bold">{order.payment_condition || "A convenir"}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Plazo de pago</p>
                <p className="mt-1 font-bold">{Number(order.payment_term_days) > 0 ? `${order.payment_term_days} días` : "Según condición acordada"}</p>
              </div>
              <div className="col-span-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Entrega solicitada</p>
                <p className="mt-1 font-bold">{order.estimated_delivery_date ? formatDateDDMMYYYY(order.estimated_delivery_date) : "A coordinar"}</p>
              </div>
            </div>

            <div className="mt-7 overflow-hidden rounded-2xl border border-slate-200">
              <table className="w-full table-fixed text-left text-sm">
                <thead className="bg-slate-900 text-[11px] font-bold uppercase tracking-wider text-white">
                  <tr>
                    <th className="w-[48%] px-4 py-3">Artículo / detalle</th>
                    <th className="w-[14%] px-4 py-3 text-right">Cantidad</th>
                    <th className="w-[19%] px-4 py-3 text-right">Precio unit.</th>
                    <th className="w-[19%] px-4 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {items.map((item, index) => {
                    const quantity = Number(item.quantity_ordered) || 0;
                    const unitCost = Number(item.unit_cost) || 0;
                    const subtotal = Number(item.subtotal) || quantity * unitCost;
                    const sku = item.product?.sku;
                    const showSku = sku && sku !== item.raw_product_name && !sku.endsWith("_OLD") && !sku.startsWith("AUTO-");
                    return (
                      <tr key={item.id || `${item.raw_product_name}-${index}`}>
                        <td className="px-4 py-4 align-top font-bold">
                          {item.raw_product_name || "Artículo"}{showSku ? ` (${sku})` : ""}
                        </td>
                        <td className="px-4 py-4 text-right align-top font-black tabular-nums">{quantity}</td>
                        <td className="px-4 py-4 text-right align-top font-semibold tabular-nums">{formatPrice(unitCost)}</td>
                        <td className="px-4 py-4 text-right align-top font-black tabular-nums">{formatPrice(subtotal)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-6 flex items-end justify-between rounded-2xl bg-blue-700 p-5 text-white">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-blue-200">Total solicitado</p>
                <p className="mt-1 text-lg font-black">{totalUnits} unidades</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-bold uppercase tracking-wider text-blue-200">Total orden</p>
                <p className="mt-1 text-3xl font-black">{formatPrice(totalAmount)}</p>
              </div>
            </div>

            <p className="mt-6 text-center text-xs font-medium text-slate-500">Agradecemos confirmar disponibilidad y fecha de entrega.</p>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:justify-end">
          <Button type="button" onClick={handleDownload} disabled={action !== null} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-black text-slate-700 hover:bg-slate-50">
            {action === "download" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Descargar PNG
          </Button>
          <Button type="button" onClick={handleCopy} disabled={action !== null} className="rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-black text-white hover:bg-blue-700">
            {action === "copy" ? <Loader2 className="h-4 w-4 animate-spin" /> : copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Imagen copiada" : "Copiar imagen"}
          </Button>
        </div>
      </div>
    </div>
  );
}
