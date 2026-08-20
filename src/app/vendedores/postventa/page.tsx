"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { 
  RefreshCw, 
  Search, 
  Trash2, 
  Plus, 
  CheckCircle, 
  AlertCircle, 
  ShieldAlert, 
  Clock, 
  User, 
  ArrowDownRight, 
  ArrowUpRight, 
  History, 
  Loader2, 
  Save,
  Check,
  ChevronRight,
  Info,
  DollarSign
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatPrice } from "@/lib/utils";
import { ReturnExchange, ReturnItem, ExchangeItem, WarrantyClaim, Product, PaymentMethod } from "@/types";

interface ExtendedOrderItem {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  returned_qty: number; // tracks how many return units are configured in current form
  restock_action: 'reingreso_stock' | 'descarte_defectuoso';
  mark_warranty: boolean;
  warranty_issue: string;
  serial_number: string;
}

interface OrderDetails {
  id: string;
  customer_name: string;
  total_amount: number;
  order_date: string;
  payment_status: string;
  status: string;
  client_id: string | null;
  payment_method_id: string;
  created_at: string;
  legacy_code?: string | null;
}

const PREDEFINED_REASONS = {
  devolucion: [
    "Arrepentimiento de compra / Devolución voluntaria",
    "Error en la compra del cliente",
    "Error en el despacho / Envío incorrecto",
    "Precio mal cobrado / Discrepancia de precio",
    "Otro motivo de devolución (especificar en comentarios)"
  ],
  cambio: [
    "Cambio de variante (Color / Tipo / Ciego)",
    "Cambio por otra capacidad o modelo",
    "Error de despacho (se entregó producto equivocado)",
    "Cambio por disconformidad con el producto",
    "Otro motivo de cambio (especificar en comentarios)"
  ],
  garantia: [
    "Falla técnica de fábrica / Pérdida de agua",
    "Fisura en junta o soldadura",
    "Tapa o accesorio defectuoso de fábrica",
    "Producto dañado durante el transporte",
    "Otro problema de garantía (especificar en comentarios)"
  ],
  despacho: [
    "Entrega incorrecta / Error de variante o color",
    "Pedido incompleto / Producto faltante",
    "Dirección de entrega incorrecta (despacho erróneo)",
    "Producto equivocado entregado por logística"
  ]
};

export default function PostventaPage() {
  const [activeTab, setActiveTab] = useState<'registrar' | 'historial' | 'garantias'>('registrar');
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Cash Register & Payment Methods
  const [openRegister, setOpenRegister] = useState<any | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);

  // TAB 1: REGISTRAR OPERACIÓN
  // Step 1: Search Order
  const [orderSearchQuery, setOrderSearchQuery] = useState("");
  const [searchingOrders, setSearchingOrders] = useState(false);
  const [ordersResults, setOrdersResults] = useState<OrderDetails[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<OrderDetails | null>(null);
  const [orderItems, setOrderItems] = useState<ExtendedOrderItem[]>([]);
  const [loadingOrderItems, setLoadingOrderItems] = useState(false);

  // Step 2: Exchanges (Replacement Items)
  const [exchangeSearchQuery, setExchangeSearchQuery] = useState("");
  const [searchingCatalog, setSearchingCatalog] = useState(false);
  const [catalogResults, setCatalogResults] = useState<any[]>([]);
  const [exchangeItems, setExchangeItems] = useState<any[]>([]);
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [showProductDropdown, setShowProductDropdown] = useState(false);

  // Step 3: Resolution & Details
  const [opType, setOpType] = useState<'devolucion' | 'cambio' | 'garantia' | 'despacho'>('cambio');
  const [opReason, setOpReason] = useState("");
  const [settlementMethod, setSettlementMethod] = useState<'caja' | 'cuenta_corriente'>('caja');
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState("");
  const [submittingOperation, setSubmittingOperation] = useState(false);

  // New postventa details fields
  const [whaticketLink, setWhaticketLink] = useState("");
  const [problemExplanation, setProblemExplanation] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [showReasonDropdown, setShowReasonDropdown] = useState(false);

  const handleAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingAttachment(true);
    try {
      const newUrls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileExt = file.name.split('.').pop();
        const fileName = `postventa_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${fileExt}`;
        const filePath = `postventa/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('product-images')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage
          .from('product-images')
          .getPublicUrl(filePath);

        newUrls.push(publicUrlData.publicUrl);
      }
      setAttachments([...attachments, ...newUrls]);
    } catch (err: any) {
      console.error("Error al subir archivo:", err);
      alert("Error al subir archivo: " + err.message);
    } finally {
      setUploadingAttachment(false);
    }
  };

  const handleRemoveAttachment = (urlToRemove: string) => {
    setAttachments(attachments.filter(url => url !== urlToRemove));
  };

  // TAB 2: HISTORIAL DE POSTVENTA
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<any[]>([]);
  const [selectedHistoryEntry, setSelectedHistoryEntry] = useState<any | null>(null);
  const [historyStatusFilter, setHistoryStatusFilter] = useState("todos");
  const [historySearchQuery, setHistorySearchQuery] = useState("");
  const [cambOrders, setCambOrders] = useState<any[]>([]);

  // TAB 3: GARANTÍAS DE FÁBRICA
  const [warrantiesLoading, setWarrantiesLoading] = useState(false);
  const [warrantyClaims, setWarrantyClaims] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [updatingWarrantyId, setUpdatingWarrantyId] = useState<string | null>(null);

  useEffect(() => {
    initPage();
  }, []);

  async function initPage() {
    try {
      setLoading(true);
      
      // Get user
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
      }

      // Execute all initialization queries in parallel to eliminate database waterfall latency
      const [
        registersRes,
        pmsRes,
        productsRes,
        suppliersRes,
        historyRes,
        cambRes,
        warrantiesRes
      ] = await Promise.all([
        supabase
          .from('cash_registers')
          .select('*')
          .eq('status', 'Abierta')
          .order('opened_at', { ascending: false }),
        supabase
          .from('payment_methods')
          .select('*')
          .eq('is_active', true),
        supabase
          .from('products')
          .select('id, name, sku, price, stock_physical, stock_current')
          .eq('is_active', true)
          .order('name', { ascending: true }),
        supabase
          .from('suppliers')
          .select('id, name'),
        supabase
          .from('returns_exchanges')
          .select(`
            *,
            orders(customer_name, legacy_code)
          `)
          .order('created_at', { ascending: false }),
        supabase
          .from('orders')
          .select('id, legacy_code, status, delivery_detail, delivery_notes')
          .ilike('legacy_code', 'CAMB%'),
        supabase
          .from('warranty_claims')
          .select(`
            *,
            products(name, sku),
            suppliers(name)
          `)
          .order('created_at', { ascending: false })
      ]);

      // Process cash register
      if (registersRes.data && registersRes.data.length > 0) {
        setOpenRegister(registersRes.data[0]);
      }

      // Process payment methods
      if (pmsRes.data) {
        setPaymentMethods(pmsRes.data);
        const cashMethod = pmsRes.data.find(p => p.name.toLowerCase().includes("efectivo"));
        if (cashMethod) setSelectedPaymentMethodId(cashMethod.id);
        else if (pmsRes.data.length > 0) setSelectedPaymentMethodId(pmsRes.data[0].id);
      }

      // Process products
      if (productsRes.data) {
        setAllProducts(productsRes.data);
      }

      // Process suppliers
      if (suppliersRes.data) {
        setSuppliers(suppliersRes.data);
      }

      // Process history (returns & exchanges)
      if (historyRes.error) throw historyRes.error;
      setHistoryEntries(historyRes.data || []);

      // Process CAMB orders
      if (cambRes.error) {
        console.error("Error loading CAMB orders:", cambRes.error);
      } else {
        setCambOrders(cambRes.data || []);
      }

      // Process warranties
      if (warrantiesRes.error) throw warrantiesRes.error;
      setWarrantyClaims(warrantiesRes.data || []);

    } catch (err) {
      console.error("Error initializing page:", err);
    } finally {
      setLoading(false);
    }
  }

  // Reload history
  async function loadHistory() {
    try {
      setHistoryLoading(true);
      
      const { data: historyData, error: historyErr } = await supabase
        .from('returns_exchanges')
        .select(`
          *,
          orders(customer_name, legacy_code)
        `)
        .order('created_at', { ascending: false });

      if (historyErr) throw historyErr;

      const { data: cambData, error: cambErr } = await supabase
        .from('orders')
        .select('id, legacy_code, status, delivery_detail, delivery_notes')
        .ilike('legacy_code', 'CAMB%');

      if (cambErr) {
        console.error("Error loading CAMB orders:", cambErr);
      } else {
        setCambOrders(cambData || []);
      }

      setHistoryEntries(historyData || []);
    } catch (err) {
      console.error("Error loading history:", err);
    } finally {
      setHistoryLoading(false);
    }
  }

  // Load warranty claims
  async function loadWarranties() {
    try {
      setWarrantiesLoading(true);
      const { data, error } = await supabase
        .from('warranty_claims')
        .select(`
          *,
          products(name, sku),
          suppliers(name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setWarrantyClaims(data || []);
    } catch (err) {
      console.error("Error loading warranties:", err);
    } finally {
      setWarrantiesLoading(false);
    }
  }

  // Search orders
  async function handleSearchOrders() {
    if (!orderSearchQuery.trim()) return;
    setSearchingOrders(true);
    try {
      let query = supabase
        .from('orders')
        .select('id, customer_name, total_amount, order_date, payment_status, status, client_id, payment_method_id, created_at, legacy_code')
        .neq('status', 'Anulado')
        .order('created_at', { ascending: false });

      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderSearchQuery.trim());
      if (isUuid) {
        query = query.eq('id', orderSearchQuery.trim());
      } else {
        query = query.or(`customer_name.ilike.%${orderSearchQuery}%,legacy_code.ilike.%${orderSearchQuery}%`);
      }

      const { data, error } = await query.limit(10);
      if (error) throw error;
      setOrdersResults(data || []);
    } catch (err) {
      console.error("Error searching orders:", err);
      alert("Error al buscar pedidos.");
    } finally {
      setSearchingOrders(false);
    }
  }

  // Select an order to return/exchange
  async function handleSelectOrder(order: OrderDetails) {
    setSelectedOrder(order);
    setLoadingOrderItems(true);
    try {
      const { data: items, error } = await supabase
        .from('order_items')
        .select('id, product_id, product_name, quantity, unit_price')
        .eq('order_id', order.id);

      if (error) throw error;

      // Map to extended items format
      const extended: ExtendedOrderItem[] = (items || []).map(i => ({
        id: i.id,
        product_id: i.product_id,
        product_name: i.product_name,
        quantity: i.quantity,
        unit_price: i.unit_price,
        returned_qty: 0,
        restock_action: 'reingreso_stock',
        mark_warranty: false,
        warranty_issue: "",
        serial_number: ""
      }));

      setOrderItems(extended);
      setExchangeItems([]);
      setOpReason("");
      setProblemExplanation("");
      
      // Auto-set settlement method based on client existence
      if (order.client_id) {
        setSettlementMethod('cuenta_corriente');
      } else {
        setSettlementMethod('caja');
      }

    } catch (err) {
      console.error("Error loading order items:", err);
      alert("Error al cargar ítems del pedido.");
    } finally {
      setLoadingOrderItems(false);
    }
  }

  // Search catalog for exchanges
  async function handleSearchCatalog() {
    if (!exchangeSearchQuery.trim()) return;
    setSearchingCatalog(true);
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, sku, price, stock_physical, stock_current')
        .eq('is_active', true)
        .ilike('name', `%${exchangeSearchQuery}%`)
        .limit(10);

      if (error) throw error;
      setCatalogResults(data || []);
    } catch (err) {
      console.error("Error searching catalog:", err);
    } finally {
      setSearchingCatalog(false);
    }
  }

  // Add item to exchange list
  function handleAddExchangeItem(prod: Product) {
    // Check if already in list
    if (exchangeItems.find(item => item.id === prod.id)) {
      alert("El producto ya está en la lista de cambios.");
      return;
    }
    
    // Check if the added exchange item matches any returned item (directly or via parent product group)
    const matchedReturnedItem = orderItems.find(oi => {
      if (oi.returned_qty <= 0) return false;
      const returnedProduct = allProducts.find(p => p.id === oi.product_id);
      
      const isDirectMatch = oi.product_id === prod.id;
      const isParentMatch = prod.parent_id && oi.product_id === prod.parent_id;
      const isChildMatch = returnedProduct?.parent_id && returnedProduct.parent_id === prod.id;
      const isSiblingMatch = prod.parent_id && returnedProduct?.parent_id && prod.parent_id === returnedProduct.parent_id;

      return isDirectMatch || isParentMatch || isChildMatch || isSiblingMatch;
    });

    const initialPrice = matchedReturnedItem ? matchedReturnedItem.unit_price : prod.price;
    setExchangeItems([...exchangeItems, { ...prod, quantity: 1, customPrice: initialPrice }]);
  }

  // Remove exchange item
  function handleRemoveExchangeItem(id: string) {
    setExchangeItems(exchangeItems.filter(item => item.id !== id));
  }

  // Update exchange item details
  function handleUpdateExchangeQty(id: string, qty: number) {
    setExchangeItems(exchangeItems.map(item => item.id === id ? { ...item, quantity: Math.max(1, qty) } : item));
  }

  function handleUpdateExchangePrice(id: string, price: number) {
    setExchangeItems(exchangeItems.map(item => item.id === id ? { ...item, customPrice: Math.max(0, price) } : item));
  }

  // Totals calculations
  const totalReturned = orderItems.reduce((acc, item) => acc + (item.returned_qty * item.unit_price), 0);
  const totalExchange = exchangeItems.reduce((acc, item) => acc + (item.quantity * item.customPrice), 0);
  const differenceAmount = totalExchange - totalReturned; // positive: client pays, negative: client credit/refund

  // Handle Return Submission
  async function handleSubmitOperation() {
    if (!selectedOrder || !currentUserId) return;
    if (totalReturned === 0 && totalExchange === 0) {
      alert("Debe seleccionar al menos un producto a devolver o agregar un producto de cambio.");
      return;
    }
    if (!opReason.trim()) {
      alert("Por favor indique el motivo de la postventa.");
      return;
    }

    // Cash register requirement check
    const isCashPayment = selectedPaymentMethodId && paymentMethods.find(p => p.id === selectedPaymentMethodId)?.name.toLowerCase().includes("efectivo");
    const needsCashRegister = (differenceAmount !== 0) && (settlementMethod === 'caja') && (isCashPayment || differenceAmount < 0);
    
    if (needsCashRegister && !openRegister) {
      alert("No hay una caja diaria abierta. Debe abrir caja primero para realizar transacciones de caja.");
      return;
    }

    setSubmittingOperation(true);
    try {
      // 1. Insert header
      const finalOpType = opType; // 'devolucion', 'cambio', 'garantia'
      const { data: retEx, error: retExError } = await supabase
        .from('returns_exchanges')
        .insert({
          order_id: selectedOrder.id,
          type: finalOpType,
          status: 'Abierto',
          reason: opReason,
          notes: problemExplanation || null, // Map unified explanation to notes for backwards compatibility
          whaticket_link: whaticketLink || null,
          specifications: null,
          problem_explanation: problemExplanation || null,
          attachments: attachments.length > 0 ? attachments : null,
          refund_amount: totalReturned,
          exchange_amount: totalExchange,
          difference_amount: differenceAmount,
          created_by: currentUserId
        })
        .select()
        .single();

      if (retExError) throw retExError;

      // 2. Insert return items
      const returnedItemsToInsert = orderItems
        .filter(item => item.returned_qty > 0)
        .map(item => ({
          return_id: retEx.id,
          product_id: item.product_id,
          quantity: item.returned_qty,
          unit_price: item.unit_price,
          restock_action: item.restock_action
        }));

      if (returnedItemsToInsert.length > 0) {
        const { error: retItemsError } = await supabase
          .from('return_items')
          .insert(returnedItemsToInsert);
        if (retItemsError) throw retItemsError;
      }

      // 3. Insert exchange items
      const exchangeItemsToInsert = exchangeItems.map(item => ({
        return_id: retEx.id,
        product_id: item.id,
        quantity: item.quantity,
        unit_price: item.customPrice
      }));

      if (exchangeItemsToInsert.length > 0) {
        const { error: excItemsError } = await supabase
          .from('exchange_items')
          .insert(exchangeItemsToInsert);
        if (excItemsError) throw excItemsError;
      }

      // 4. Handle warranty claims if any returned item is marked for warranty
      const warrantyClaimsToInsert: any[] = [];
      for (const item of orderItems.filter(item => item.returned_qty > 0 && item.mark_warranty)) {
        // Find supplier relations for product
        const { data: rels } = await supabase
          .from('product_supplier_relations')
          .select('supplier_id')
          .eq('product_id', item.product_id);
        
        let supplierId = rels && rels.length > 0 ? rels[0].supplier_id : null;
        
        // Fallback to first supplier if none
        if (!supplierId && suppliers.length > 0) {
          supplierId = suppliers[0].id;
        }

        if (supplierId) {
          warrantyClaimsToInsert.push({
            return_id: retEx.id,
            product_id: item.product_id,
            supplier_id: supplierId,
            serial_number: item.serial_number || null,
            issue_description: item.warranty_issue || `Reclamo por postventa: ${opReason}`,
            customer_resolution: 'pendiente',
            supplier_claim_status: 'no_reclamado',
            notes: problemExplanation || null
          });
        }
      }

      if (warrantyClaimsToInsert.length > 0) {
        const { error: warrantyError } = await supabase
          .from('warranty_claims')
          .insert(warrantyClaimsToInsert);
        if (warrantyError) throw warrantyError;
      }

      // 5. Handle Cash & Ledger Accounting (Skipped: Admin will approve and record this)
      alert("Operación de postventa registrada con éxito. Queda en estado 'Abierto' para evaluación de la administración.");
      
      // Reset form
      setSelectedOrder(null);
      setOrderItems([]);
      setExchangeItems([]);
      setOpReason("");
      setWhaticketLink("");
      setProblemExplanation("");
      setAttachments([]);
      setOrdersResults([]);
      setOrderSearchQuery("");

      // Reload lists
      await loadHistory();
      await loadWarranties();

    } catch (err: any) {
      console.error("Error processing postventa:", err);
      alert("Error al procesar la operación: " + (err.message || err));
    } finally {
      setSubmittingOperation(false);
    }
  }

  // Update warranty claim status
  async function handleUpdateWarrantyStatus(claimId: string, supplierStatus: string, customerRes: string, notes: string) {
    setUpdatingWarrantyId(claimId);
    try {
      const { error } = await supabase
        .from('warranty_claims')
        .update({
          supplier_claim_status: supplierStatus,
          customer_resolution: customerRes,
          notes: notes,
          updated_at: new Date().toISOString()
        })
        .eq('id', claimId);

      if (error) throw error;
      alert("Reclamo de garantía actualizado con éxito.");
      await loadWarranties();
    } catch (err) {
      console.error("Error updating warranty claim:", err);
      alert("Error al actualizar la garantía.");
    } finally {
      setUpdatingWarrantyId(null);
    }
  }

  // Load details for history modal
  async function handleViewHistoryDetail(entry: any) {
    setSelectedHistoryEntry(entry);
    
    // Fetch detailed items
    try {
      const { data: retItems } = await supabase
        .from('return_items')
        .select('*, products(name, sku)')
        .eq('return_id', entry.id);

      const { data: excItems } = await supabase
        .from('exchange_items')
        .select('*, products(name, sku)')
        .eq('return_id', entry.id);

      const { data: wClaims } = await supabase
        .from('warranty_claims')
        .select('*, products(name, sku), suppliers(name)')
        .eq('return_id', entry.id);

      setSelectedHistoryEntry({
        ...entry,
        returns: retItems || [],
        exchanges: excItems || [],
        warranties: wClaims || []
      });
    } catch (err) {
      console.error("Error loading history details:", err);
    }
  }

  const getOriginalOrderCode = (entry: any): string => {
    if (!entry) return '';
    const ordersData = entry.orders;
    if (!ordersData) return '';
    
    // Support both single object and array of objects
    const order = Array.isArray(ordersData) ? ordersData[0] : ordersData;
    if (!order) return '';
    
    let code = order.legacy_code || '';
    if (code.startsWith('ORIG-')) {
      code = code.substring(5);
    }
    
    // If the original order code is the same as the exchange/change code, it's incorrect/placeholder
    const exchangeCode = getExchangeCode(entry);
    if (code === exchangeCode) {
      return '';
    }
    return code;
  };

  const getCustomerName = (entry: any): string => {
    if (!entry) return '';
    const ordersData = entry.orders;
    const order = Array.isArray(ordersData) ? ordersData[0] : ordersData;
    return order?.customer_name || 'Desconocido';
  };

  const getClaimCode = (entry: any): string => {
    const textToSearch = `${entry.notes || ''} ${entry.reason || ''} ${entry.problem_explanation || ''}`;
    const recMatch = textToSearch.match(/REC\d+/i);
    if (recMatch) return recMatch[0].toUpperCase();
    const autoMatch = textToSearch.match(/AUTO-[A-Z0-9]+/i);
    if (autoMatch) return autoMatch[0].toUpperCase();
    return 'S/C';
  };

  const getExchangeCode = (entry: any): string => {
    // 1. Try to find matched CAMB order in loaded cambOrders
    const claimShortId = entry.id.substring(0, 8);
    const claimCode = getClaimCode(entry);
    
    const matchedOrder = cambOrders.find(o => {
      const notes = (o.delivery_notes || '').toLowerCase();
      const detail = (o.delivery_detail || '').toLowerCase();
      
      if (notes.includes(`id reclamo: ${claimShortId}`) || detail.includes(`id reclamo: ${claimShortId}`)) {
        return true;
      }
      
      if (claimCode && claimCode !== 'S/C') {
        const lowerCode = claimCode.toLowerCase();
        if (notes.includes(lowerCode) || detail.includes(lowerCode)) {
          return true;
        }
      }
      return false;
    });

    if (matchedOrder) {
      return matchedOrder.legacy_code;
    }

    // 2. Fallback to extracting from text fields
    const textToSearch = `${entry.notes || ''} ${entry.reason || ''} ${entry.problem_explanation || ''}`;
    const cambMatch = textToSearch.match(/CAMB\d+/i);
    if (cambMatch) return cambMatch[0].toUpperCase();

    return 'S/C';
  };

  const getClaimStatus = (entry: any): string => {
    if (!entry) return 'Abierto';
    if (entry.status === 'Resuelto' || entry.status === 'Completado' || entry.status === 'Aprobado' || entry.status === 'Rechazado') {
      return entry.status;
    }
    
    const claimShortId = entry.id.substring(0, 8);
    const claimCode = getClaimCode(entry);
    
    const matchedOrder = cambOrders.find(o => {
      const notes = (o.delivery_notes || '').toLowerCase();
      const detail = (o.delivery_detail || '').toLowerCase();
      
      if (notes.includes(`id reclamo: ${claimShortId}`) || detail.includes(`id reclamo: ${claimShortId}`)) {
        return true;
      }
      
      if (claimCode && claimCode !== 'S/C') {
        const lowerCode = claimCode.toLowerCase();
        if (notes.includes(lowerCode) || detail.includes(lowerCode)) {
          return true;
        }
      }
      return false;
    });

    if (matchedOrder && matchedOrder.status === 'Entregado') {
      return 'Completado';
    }

    return entry.status || 'Abierto';
  };

  const filteredHistory = historyEntries.filter(entry => {
    const status = getClaimStatus(entry);
    // 1. Status Filter
    const matchesStatus = historyStatusFilter === 'todos' || 
      (historyStatusFilter === 'Abierto' && (status === 'Abierto' || status === 'Pendiente')) || 
      (historyStatusFilter === 'Resuelto' && (status === 'Resuelto' || status === 'Completado' || status === 'Aprobado')) || 
      (historyStatusFilter === 'Rechazado' && status === 'Rechazado');
      
    if (!matchesStatus) return false;

    // 2. Search Query Filter
    if (!historySearchQuery.trim()) return true;
    
    const query = historySearchQuery.toLowerCase().trim();
    const clientName = (getCustomerName(entry) || '').toLowerCase();
    const claimCode = getClaimCode(entry).toLowerCase();
    const exchangeCode = getExchangeCode(entry).toLowerCase();
    const reason = (entry.reason || '').toLowerCase();
    const notes = (entry.notes || '').toLowerCase();
    const problem = (entry.problem_explanation || '').toLowerCase();
    
    return clientName.includes(query) || 
           claimCode.includes(query) || 
           exchangeCode.includes(query) || 
           reason.includes(query) || 
           notes.includes(query) || 
           problem.includes(query);
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header Panel */}
      <div className="relative overflow-hidden bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 text-white shadow-2xl">
        <div className="absolute right-0 top-0 w-96 h-96 bg-brand-500/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute left-1/3 bottom-0 w-80 h-80 bg-blue-500/10 rounded-full blur-[100px] pointer-events-none" />
        
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-400 text-[10px] font-black uppercase tracking-widest">
              <RefreshCw className="w-3 h-3 animate-spin-slow" />
              Operaciones Especiales
            </div>
            <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
              Centro de Postventa
            </h1>
            <p className="text-slate-400 text-sm font-medium max-w-2xl">
              Gestione devoluciones de productos, cambios de mercadería y derive reclamos por fallas técnicas directamente a la garantía de fábrica.
            </p>
          </div>

          {/* Cash Register State Card */}
          <div className="shrink-0 bg-slate-950/60 backdrop-blur-md border border-slate-800 p-5 rounded-3xl flex items-center gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${openRegister ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400' : 'bg-amber-500/15 border border-amber-500/30 text-amber-400'}`}>
              <DollarSign className="w-6 h-6" />
            </div>
            <div>
              <span className="block text-[9px] font-black text-slate-500 uppercase tracking-widest">Estado de Caja</span>
              <span className={`block font-black text-sm ${openRegister ? 'text-emerald-400' : 'text-amber-400'}`}>
                {openRegister ? `Caja Abierta (ARS: ${formatPrice(openRegister.expected_balance_ars)})` : 'Caja Cerrada'}
              </span>
              <span className="block text-[10px] text-slate-400 font-bold">
                {openRegister ? 'Habilitado para arqueo' : 'Se requieren métodos no-físicos'}
              </span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex gap-2 mt-8 border-t border-slate-800 pt-6 overflow-x-auto">
          <button
            onClick={() => setActiveTab('registrar')}
            className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all ${activeTab === 'registrar' ? 'bg-white text-slate-900 shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}
          >
            <RefreshCw className="w-4 h-4" />
            Registrar Postventa
          </button>
          <button
            onClick={() => setActiveTab('historial')}
            className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all ${activeTab === 'historial' ? 'bg-white text-slate-900 shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}
          >
            <History className="w-4 h-4" />
            Historial de Operaciones
          </button>
          <button
            onClick={() => setActiveTab('garantias')}
            className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all ${activeTab === 'garantias' ? 'bg-white text-slate-900 shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}
          >
            <ShieldAlert className="w-4 h-4" />
            Garantías de Fábrica
          </button>
        </div>
      </div>

      {/* TAB 1: REGISTRAR OPERACIÓN */}
      {activeTab === 'registrar' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Form & Selection Panel */}
          <div className="lg:col-span-2 space-y-6">
            {/* Step 1: Buscar Pedido */}
            <div className="bg-white border border-slate-100 shadow-md rounded-[2rem] p-6 space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600 font-bold">1</div>
                <div>
                  <h3 className="font-black text-slate-900 text-lg leading-tight">Buscar Pedido de Venta</h3>
                  <p className="text-xs text-slate-400 font-medium">Ingrese la razón social del cliente o ID del pedido original</p>
                </div>
              </div>

              {!selectedOrder ? (
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Razón social o UUID de pedido..."
                        value={orderSearchQuery}
                        onChange={(e) => setOrderSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearchOrders()}
                        className="w-full pl-11 pr-5 py-3.5 rounded-2xl border border-slate-100 focus:ring-4 focus:ring-brand-500/10 bg-slate-50 font-bold text-sm text-slate-700"
                      />
                    </div>
                    <Button onClick={handleSearchOrders} disabled={searchingOrders}>
                      {searchingOrders ? <Loader2 className="animate-spin w-4 h-4" /> : "Buscar"}
                    </Button>
                  </div>

                  {ordersResults.length > 0 && (
                    <div className="border border-slate-100 rounded-2xl overflow-hidden divide-y divide-slate-50 bg-slate-50/50">
                      {ordersResults.map(order => (
                        <button
                          key={order.id}
                          onClick={() => handleSelectOrder(order)}
                          className="w-full flex items-center justify-between p-4 text-left hover:bg-white transition-colors"
                        >
                          <div>
                            <span className="block font-black text-slate-800 text-sm">{order.customer_name}</span>
                            <span className="block text-[10px] text-slate-400 font-bold uppercase">
                              Pedido: {order.legacy_code || order.id.substring(0,8)} • {new Date(order.order_date).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                            </span>
                          </div>
                          <div className="text-right flex items-center gap-4">
                            <div>
                              <span className="block font-black text-brand-600 text-sm">{formatPrice(order.total_amount)}</span>
                              <span className="inline-block px-2 py-0.5 rounded text-[9px] font-black uppercase bg-slate-200 text-slate-700">
                                {order.status}
                              </span>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-400" />
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-brand-500/10 text-brand-600 flex items-center justify-center">
                      <User className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="block font-black text-slate-800">{selectedOrder.customer_name}</span>
                      <span className="block text-[10px] text-slate-400 font-black uppercase">
                        Pedido: {selectedOrder.legacy_code || selectedOrder.id.substring(0,8)} • {new Date(selectedOrder.order_date).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <span className="block font-black text-slate-900">{formatPrice(selectedOrder.total_amount)}</span>
                      <span className="inline-block px-2 py-0.5 rounded text-[8px] font-black uppercase bg-brand-100 text-brand-700">
                        {selectedOrder.status}
                      </span>
                    </div>
                    <button
                      onClick={() => { setSelectedOrder(null); setOrderItems([]); }}
                      className="p-2 hover:bg-red-50 hover:text-red-600 rounded-xl transition-all text-slate-400"
                      title="Cambiar pedido"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {selectedOrder && (
              <>
                {/* Step 2: Seleccionar ítems a devolver */}
                <div className="bg-white border border-slate-100 shadow-md rounded-[2rem] p-6 space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600 font-bold">2</div>
                      <div>
                        <h3 className="font-black text-slate-900 text-lg leading-tight">Artículos a Devolver</h3>
                        <p className="text-xs text-slate-400 font-medium">Seleccione la cantidad de unidades que el cliente devuelve</p>
                      </div>
                    </div>
                    <div className="flex gap-1.5 bg-slate-100/80 p-1 rounded-2xl border border-slate-200/50">
                      <button
                        type="button"
                        onClick={() => {
                          setOpType('despacho');
                          // Reset mark_warranty on items by default
                          setOrderItems(orderItems.map(oi => ({ ...oi, mark_warranty: false })));
                        }}
                        className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${opType === 'despacho' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        🚚 Error Despacho
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOpType('garantia');
                          // Auto set mark_warranty to true on return items
                          setOrderItems(orderItems.map(oi => ({ ...oi, mark_warranty: true, restock_action: 'descarte_defectuoso' })));
                        }}
                        className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${opType === 'garantia' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        🛡️ Garantía
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOpType('devolucion');
                          // Reset mark_warranty on items by default
                          setOrderItems(orderItems.map(oi => ({ ...oi, mark_warranty: false })));
                        }}
                        className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${opType === 'devolucion' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        💵 Devolución
                      </button>
                    </div>
                  </div>

                  {loadingOrderItems ? (
                    <div className="flex justify-center p-8"><Loader2 className="animate-spin text-brand-600 w-8 h-8" /></div>
                  ) : (
                    <div className="space-y-4">
                      {orderItems.map((item, idx) => (
                        <div key={item.id} className="p-4 border border-slate-100 rounded-2xl bg-slate-50/30 space-y-4">
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex-1">
                              <span className="block font-black text-slate-800 text-sm">{item.product_name}</span>
                              <span className="block text-[10px] text-slate-400 font-bold">
                                Comprado: {item.quantity} un. • Precio Abonado: {formatPrice(item.unit_price)}
                              </span>
                            </div>

                            {/* Qty Selector */}
                            <div className="flex items-center gap-2 shrink-0">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cant. Devolver:</label>
                              <select
                                value={item.returned_qty}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value);
                                  setOrderItems(orderItems.map((oi, i) => i === idx ? { ...oi, returned_qty: val } : oi));
                                }}
                                className="px-3 py-2 bg-white border border-slate-100 rounded-xl font-black text-xs"
                              >
                                {Array.from({ length: item.quantity + 1 }, (_, i) => (
                                  <option key={i} value={i}>{i}</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          {item.returned_qty > 0 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-dashed border-slate-100">
                              {opType === 'garantia' ? (
                                <div className="space-y-2 col-span-2 bg-amber-50/50 border border-amber-200 rounded-2xl p-4 text-[11px] text-amber-900 animate-in fade-in duration-200">
                                  <span className="font-black block uppercase tracking-wider text-amber-800">🛡️ Garantía de Fábrica Directa</span>
                                  <p className="font-semibold text-slate-500 mt-0.5">El producto defectuoso se registrará para reclamo directo al proveedor y descarte en depósito.</p>
                                  
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                                    <div>
                                      <label className="block text-[9px] font-black text-amber-800 uppercase tracking-wider mb-1">Número de Serie (Opcional)</label>
                                      <input
                                        type="text"
                                        placeholder="Ingrese número de serie si aplica..."
                                        value={item.serial_number || ""}
                                        onChange={(e) => setOrderItems(orderItems.map((oi, i) => i === idx ? { ...oi, serial_number: e.target.value } : oi))}
                                        className="w-full px-3 py-2 rounded-xl border border-amber-200 bg-white font-medium text-xs text-amber-955 placeholder-amber-400 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[9px] font-black text-amber-800 uppercase tracking-wider mb-1">Detalle de la Falla</label>
                                      <input
                                        type="text"
                                        placeholder="Describa el desperfecto técnico..."
                                        value={item.warranty_issue || ""}
                                        onChange={(e) => setOrderItems(orderItems.map((oi, i) => i === idx ? { ...oi, warranty_issue: e.target.value } : oi))}
                                        className="w-full px-3 py-2 rounded-xl border border-amber-200 bg-white font-medium text-xs text-amber-955 placeholder-amber-400 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
                                        required
                                      />
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  {/* Stock actions */}
                                  <div className="space-y-2">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Destino Físico</label>
                                    <div className="grid grid-cols-2 gap-2">
                                      <button
                                        type="button"
                                        onClick={() => setOrderItems(orderItems.map((oi, i) => i === idx ? { ...oi, restock_action: 'reingreso_stock' } : oi))}
                                        className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border ${item.restock_action === 'reingreso_stock' ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-white text-slate-500 border-slate-100 hover:bg-slate-50'}`}
                                      >
                                        Reingresar a Stock
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setOrderItems(orderItems.map((oi, i) => i === idx ? { ...oi, restock_action: 'descarte_defectuoso' } : oi))}
                                        className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border ${item.restock_action === 'descarte_defectuoso' ? 'bg-red-50 text-red-700 border-red-300' : 'bg-white text-slate-500 border-slate-100 hover:bg-slate-50'}`}
                                      >
                                        Descarte (Merma)
                                      </button>
                                    </div>
                                  </div>

                                  {/* Warranty Option */}
                                  {item.restock_action === 'descarte_defectuoso' && (
                                    <div className="space-y-2">
                                      <label className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer">
                                        <input
                                          type="checkbox"
                                          checked={item.mark_warranty || false}
                                          onChange={(e) => setOrderItems(orderItems.map((oi, i) => i === idx ? { ...oi, mark_warranty: e.target.checked } : oi))}
                                          className="rounded border-slate-200 text-brand-600 focus:ring-brand-500"
                                        />
                                        Derivar a Reclamo de Garantía
                                      </label>
                                      
                                      {item.mark_warranty && (
                                        <div className="space-y-2 mt-2">
                                          <input
                                            type="text"
                                            placeholder="Número de serie (opcional)..."
                                            value={item.serial_number || ""}
                                            onChange={(e) => setOrderItems(orderItems.map((oi, i) => i === idx ? { ...oi, serial_number: e.target.value } : oi))}
                                            className="w-full px-3 py-2 rounded-xl border border-slate-100 bg-white font-medium text-xs"
                                          />
                                          <input
                                            type="text"
                                            placeholder="Falla o desperfecto detectado..."
                                            value={item.warranty_issue || ""}
                                            onChange={(e) => setOrderItems(orderItems.map((oi, i) => i === idx ? { ...oi, warranty_issue: e.target.value } : oi))}
                                            className="w-full px-3 py-2 rounded-xl border border-slate-100 bg-white font-medium text-xs"
                                            required
                                          />
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Step 3: Replacement items (Cambio) */}
                {(opType === 'cambio' || opType === 'despacho' || opType === 'garantia') && (
                  <div className="bg-white border border-slate-100 shadow-md rounded-[2rem] p-6 space-y-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600 font-bold">3</div>
                      <div>
                        <h3 className="font-black text-slate-900 text-lg leading-tight">Productos de Cambio (Opcional)</h3>
                        <p className="text-xs text-slate-400 font-medium">Si es un cambio directo (ej. error de despacho), cargue los productos de reemplazo. De lo contrario, deje vacío.</p>
                      </div>
                    </div>

                    {/* Catalog search for replacements */}
                    <div className="space-y-4">
                      <div className="relative">
                        <div className="relative z-10">
                          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input
                            type="text"
                            placeholder="Buscar y seleccionar producto..."
                            value={exchangeSearchQuery}
                            onFocus={() => setShowProductDropdown(true)}
                            onChange={(e) => {
                              setExchangeSearchQuery(e.target.value);
                              setShowProductDropdown(true);
                            }}
                            className="w-full pl-11 pr-10 py-3 rounded-xl border border-slate-100 focus:ring-4 focus:ring-brand-500/10 bg-slate-50 font-bold text-xs"
                          />
                          {exchangeSearchQuery && (
                            <button
                              type="button"
                              onClick={() => {
                                  setExchangeSearchQuery("");
                                  setShowProductDropdown(false);
                              }}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-650"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>

                        {/* Searchable Dropdown List */}
                        {showProductDropdown && (
                          <>
                            <div 
                              className="fixed inset-0 z-0 cursor-default" 
                              onClick={() => setShowProductDropdown(false)} 
                            />
                            <div className="absolute z-20 w-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl max-h-60 overflow-y-auto divide-y divide-slate-100 animate-in fade-in slide-in-from-top-1 duration-150">
                              {allProducts
                                .filter(p => 
                                  !exchangeSearchQuery ||
                                  p.name.toLowerCase().includes(exchangeSearchQuery.toLowerCase()) ||
                                  (p.sku && p.sku.toLowerCase().includes(exchangeSearchQuery.toLowerCase()))
                                )
                                .slice(0, 50)
                                .map(p => (
                                  <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => {
                                      handleAddExchangeItem(p);
                                      setExchangeSearchQuery("");
                                      setShowProductDropdown(false);
                                    }}
                                    className="w-full flex items-center justify-between p-3 text-left hover:bg-slate-50 transition-colors cursor-pointer"
                                  >
                                    <div>
                                      <span className="block font-black text-slate-800 text-xs">{p.name}</span>
                                      <span className="block text-[10px] text-slate-400 font-bold uppercase mt-0.5">
                                        SKU: {p.sku || 'N/A'} • Stock: {p.stock_current ?? p.stock_physical ?? 0} un.
                                      </span>
                                    </div>
                                    <span className="font-black text-brand-600 text-xs shrink-0 pl-3">
                                      {formatPrice(p.price)}
                                    </span>
                                  </button>
                                ))}
                              {allProducts.filter(p => 
                                !exchangeSearchQuery ||
                                p.name.toLowerCase().includes(exchangeSearchQuery.toLowerCase()) ||
                                (p.sku && p.sku.toLowerCase().includes(exchangeSearchQuery.toLowerCase()))
                              ).length === 0 && (
                                <div className="p-4 text-center text-slate-400 text-xs font-semibold">
                                  No se encontraron productos.
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>

                      {/* Added exchange items list */}
                      {exchangeItems.length > 0 && (
                        <div className="space-y-3">
                          <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Productos Seleccionados</h4>
                          <div className="border border-slate-100 rounded-2xl divide-y divide-slate-50 overflow-hidden bg-white">
                            {exchangeItems.map(item => (
                              <div key={item.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="flex-1">
                                  <span className="block font-black text-slate-800 text-sm">{item.name}</span>
                                  <span className="block text-[10px] text-slate-400 font-bold">
                                    SKU: {item.sku || 'N/A'} • Precio Base: {formatPrice(item.price)}
                                  </span>
                                </div>

                                <div className="flex items-center gap-4">
                                  {/* Qty */}
                                  <div className="flex items-center gap-1">
                                    <span className="text-[10px] font-black text-slate-400 uppercase">Cant:</span>
                                    <input
                                      type="number"
                                      value={item.quantity}
                                      onChange={(e) => handleUpdateExchangeQty(item.id, parseInt(e.target.value) || 1)}
                                      className="w-14 px-2 py-1 rounded-lg border border-slate-100 font-black text-xs text-center"
                                    />
                                  </div>
                                  
                                  {/* Custom Price */}
                                  <div className="flex items-center gap-1">
                                    <span className="text-[10px] font-black text-slate-400 uppercase">Precio:</span>
                                    <input
                                      type="number"
                                      value={item.customPrice}
                                      onChange={(e) => handleUpdateExchangePrice(item.id, parseFloat(e.target.value) || 0)}
                                      className="w-20 px-2 py-1 rounded-lg border border-slate-100 font-black text-xs text-center text-brand-600"
                                    />
                                  </div>

                                  <button
                                    onClick={() => handleRemoveExchangeItem(item.id)}
                                    className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

              </>
            )}
          </div>

          {/* Settlement / Summary Sidebar */}
          <div className="space-y-6">
            {selectedOrder ? (
              <div className="bg-slate-900 text-white rounded-[2.5rem] border border-slate-800 shadow-2xl p-6 space-y-6 sticky top-6">
                <div>
                  <h3 className="font-black text-lg">Liquidación Final</h3>
                  <p className="text-slate-500 text-xs font-semibold">Resumen contable y forma de reembolso o cobro</p>
                </div>

                {/* Account Details */}
                <div className="space-y-3 bg-slate-950/50 border border-slate-800/80 p-4 rounded-2xl text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-bold">Total Devolución:</span>
                    <span className="font-black text-emerald-400">+{formatPrice(totalReturned)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-bold">Total Cambios:</span>
                    <span className="font-black text-amber-400">-{formatPrice(totalExchange)}</span>
                  </div>

                  <div className="border-t border-slate-800 my-2 pt-2 flex justify-between items-center">
                    <span className="text-slate-300 font-black uppercase text-[10px] tracking-wider">Diferencia Neto:</span>
                    <span className={`text-lg font-black ${differenceAmount === 0 ? 'text-white' : differenceAmount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {differenceAmount === 0 ? '$0,00' : differenceAmount > 0 ? `Debes Cobrar: ${formatPrice(differenceAmount)}` : `Debes Reembolsar: ${formatPrice(Math.abs(differenceAmount))}`}
                    </span>
                  </div>
                </div>

                {/* Settle Type Alert */}
                {differenceAmount !== 0 && (
                  <div className="p-4 bg-slate-800/50 border border-slate-800 rounded-2xl space-y-3">
                    <div className="flex gap-2">
                      <Info className="w-4 h-4 text-brand-400 shrink-0 mt-0.5" />
                      <p className="text-slate-300 text-xs font-medium">
                        {differenceAmount > 0 
                          ? "El cambio supera el valor de lo devuelto. Seleccione cómo se cobrará la diferencia."
                          : "La devolución supera el valor del cambio. Seleccione cómo se acreditará la diferencia al cliente."}
                      </p>
                    </div>

                    {/* Settle selector */}
                    <div className="space-y-2">
                      <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Método de Imputación</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setSettlementMethod('caja')}
                          className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border ${settlementMethod === 'caja' ? 'bg-white text-slate-900 border-white' : 'bg-slate-850 text-slate-400 border-slate-800'}`}
                        >
                          Efectivo / Caja
                        </button>
                        <button
                          type="button"
                          disabled={!selectedOrder.client_id}
                          onClick={() => setSettlementMethod('cuenta_corriente')}
                          className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border ${settlementMethod === 'cuenta_corriente' ? 'bg-white text-slate-900 border-white' : 'bg-slate-850 text-slate-400 border-slate-800 disabled:opacity-30'}`}
                          title={!selectedOrder.client_id ? "Requiere un cliente cargado en el pedido" : ""}
                        >
                          Cta. Corriente
                        </button>
                      </div>
                    </div>

                    {settlementMethod === 'caja' && (
                      <div className="space-y-2 pt-2 border-t border-slate-850">
                        <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Medio de Pago</label>
                        <select
                          value={selectedPaymentMethodId}
                          onChange={(e) => setSelectedPaymentMethodId(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-xs font-bold text-slate-300"
                        >
                          {paymentMethods.map(pm => (
                            <option key={pm.id} value={pm.id}>{pm.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}

                {/* Additional inputs */}
                <div className="space-y-4">
                  {/* Searchable Select for Motivo de Postventa */}
                  <div className="space-y-1 relative">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Motivo de Postventa (Requerido)</label>
                    <div className="relative z-10">
                      <input
                        type="text"
                        placeholder="Buscar o escribir motivo..."
                        value={opReason}
                        onFocus={() => setShowReasonDropdown(true)}
                        onChange={(e) => {
                          setOpReason(e.target.value);
                          setShowReasonDropdown(true);
                        }}
                        className="w-full px-4 py-3 bg-slate-950 border border-slate-850 rounded-xl text-xs font-medium text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-brand-500"
                      />
                      {opReason && (
                        <button
                          type="button"
                          onClick={() => {
                            setOpReason("");
                            setShowReasonDropdown(false);
                          }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {showReasonDropdown && (
                      <>
                        <div 
                          className="fixed inset-0 z-0 cursor-default" 
                          onClick={() => setShowReasonDropdown(false)} 
                        />
                        <div className="absolute z-20 w-full mt-1 bg-slate-950 border border-slate-850 rounded-xl shadow-xl max-h-48 overflow-y-auto divide-y divide-slate-900 animate-in fade-in slide-in-from-top-1 duration-150 text-xs">
                          {(PREDEFINED_REASONS[opType] || PREDEFINED_REASONS.cambio)
                            .filter(reason => 
                              !opReason || 
                              reason.toLowerCase().includes(opReason.toLowerCase())
                            )
                            .map((reason, i) => (
                              <button
                                key={i}
                                type="button"
                                onClick={() => {
                                  setOpReason(reason);
                                  setShowReasonDropdown(false);
                                }}
                                className="w-full text-left px-4 py-2.5 hover:bg-slate-900 text-slate-300 hover:text-white transition-colors cursor-pointer font-medium"
                              >
                                {reason}
                              </button>
                            ))}
                          {(PREDEFINED_REASONS[opType] || PREDEFINED_REASONS.cambio).filter(reason => 
                            !opReason || 
                            reason.toLowerCase().includes(opReason.toLowerCase())
                          ).length === 0 && (
                            <button
                              type="button"
                              onClick={() => setShowReasonDropdown(false)}
                              className="w-full text-left px-4 py-2.5 hover:bg-slate-900 text-slate-400 transition-colors"
                            >
                              Usar motivo personalizado: "{opReason}"
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Link a Whaticket o Conversación */}
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Link a Whaticket / Conversación</label>
                    <input
                      type="text"
                      placeholder="https://whaticket.example.com/..."
                      value={whaticketLink}
                      onChange={(e) => setWhaticketLink(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-950 border border-slate-850 rounded-xl text-xs font-medium text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-brand-500"
                    />
                  </div>

                  {/* Explicación y Detalles del Problema */}
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Detalles y Explicación del Reclamo</label>
                    <textarea
                      placeholder="Detalle los motivos y especificaciones del problema..."
                      value={problemExplanation}
                      onChange={(e) => setProblemExplanation(e.target.value)}
                      rows={3}
                      className="w-full px-4 py-3 bg-slate-950 border border-slate-850 rounded-xl text-xs font-medium text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-brand-500 resize-none"
                    />
                  </div>

                  {/* Fotos o Documentos */}
                  <div className="space-y-2">
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Fotos o Documentos Adjuntos</label>
                    
                    <div className="flex items-center justify-center w-full">
                      <label className="flex flex-col items-center justify-center w-full h-20 border border-dashed border-slate-800 hover:border-slate-600 bg-slate-950/40 hover:bg-slate-950/60 rounded-xl cursor-pointer transition-all group">
                        <div className="flex flex-col items-center justify-center py-4">
                          {uploadingAttachment ? (
                            <Loader2 className="w-5 h-5 text-brand-500 animate-spin" />
                          ) : (
                            <>
                              <Plus className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors mb-0.5" />
                              <p className="text-[9px] text-slate-500 group-hover:text-slate-300 font-bold">Haga clic para adjuntar archivos</p>
                              <p className="text-[7px] text-slate-650 font-bold uppercase mt-0.5">Imágenes o Documentos</p>
                            </>
                          )}
                        </div>
                        <input 
                          type="file" 
                          multiple 
                          className="hidden" 
                          onChange={handleAttachmentUpload}
                          disabled={uploadingAttachment}
                        />
                      </label>
                    </div>

                    {attachments.length > 0 && (
                      <div className="grid grid-cols-4 gap-2 pt-2">
                        {attachments.map((url, i) => {
                          const isImg = url.match(/\.(jpeg|jpg|gif|png|webp)/i);
                          return (
                            <div key={i} className="relative group rounded-lg overflow-hidden border border-slate-800 bg-slate-950 h-12 flex items-center justify-center">
                              {isImg ? (
                                <img src={url} alt={`adjunto-${i}`} className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-[8px] text-slate-500 font-bold uppercase truncate px-1">Doc #{i+1}</span>
                              )}
                              <button
                                type="button"
                                onClick={() => handleRemoveAttachment(url)}
                                className="absolute inset-0 bg-black/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <Trash2 className="w-4 h-4 text-red-500" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <Button
                  onClick={handleSubmitOperation}
                  className="w-full py-6 font-black rounded-2xl bg-brand-500 text-white hover:bg-brand-600 active:scale-95 transition-all text-xs uppercase tracking-widest"
                  disabled={submittingOperation}
                >
                  {submittingOperation ? <Loader2 className="animate-spin" /> : (
                    <span className="flex items-center justify-center gap-2">
                      <Save className="w-4 h-4" />
                      Procesar Postventa
                    </span>
                  )}
                </Button>
              </div>
            ) : (
              <div className="bg-slate-50 border border-dashed border-slate-200 rounded-[2.5rem] p-12 text-center text-slate-400 space-y-3">
                <RefreshCw className="w-10 h-10 mx-auto text-slate-300 animate-spin-slow" />
                <h4 className="font-bold text-slate-700 text-sm">Aguardando Selección</h4>
                <p className="text-xs text-slate-400 max-w-[200px] mx-auto">Seleccione o busque un pedido de venta activo para comenzar.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: HISTORIAL DE POSTVENTA */}
      {activeTab === 'historial' && (
        <div className="bg-white border border-slate-100 shadow-md rounded-[2.5rem] p-6 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="font-black text-slate-900 text-lg">Historial de Operaciones</h3>
              <p className="text-xs text-slate-400 font-medium">Bandeja con las devoluciones y cambios efectuados</p>
            </div>
            
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar por cliente, reclamo, cambio..."
                  value={historySearchQuery}
                  onChange={e => setHistorySearchQuery(e.target.value)}
                  className="pl-9 pr-4 py-1.5 w-full sm:w-64 bg-slate-50 border border-slate-100 rounded-xl font-bold text-xs focus:ring-2 focus:ring-brand-500/10 focus:outline-none"
                />
              </div>

              {/* Status Filter */}
              <div className="flex items-center gap-2 shrink-0">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Estado:</label>
                <select
                  value={historyStatusFilter}
                  onChange={e => setHistoryStatusFilter(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-xl font-bold text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/10"
                >
                  <option value="todos">Todos</option>
                  <option value="Abierto">Abierto</option>
                  <option value="Resuelto">Resuelto</option>
                  <option value="Rechazado">Rechazado</option>
                </select>
              </div>
            </div>
          </div>

          {historyLoading ? (
            <div className="flex justify-center p-12"><Loader2 className="animate-spin text-brand-600 w-8 h-8" /></div>
          ) : filteredHistory.length === 0 ? (
            <div className="p-12 text-center text-slate-400">No se encontraron operaciones registradas con este filtro o búsqueda.</div>
          ) : (
            <div className="overflow-x-auto border border-slate-100 rounded-2xl">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <th className="p-4">Fecha</th>
                    <th className="p-4">Cliente</th>
                    <th className="p-4">Operación</th>
                    <th className="p-4">Ped. Original</th>
                    <th className="p-4">Cód. Reclamo</th>
                    <th className="p-4">Cód. Cambio</th>
                    <th className="p-4">Estado</th>
                    <th className="p-4">Motivo</th>
                    <th className="p-4 text-right">Devuelto</th>
                    <th className="p-4 text-right">Entregado</th>
                    <th className="p-4 text-right">Diferencia</th>
                    <th className="p-4 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-xs font-bold text-slate-700">
                  {filteredHistory.map(entry => (
                    <tr key={entry.id} className="hover:bg-slate-50/50">
                      <td className="p-4 whitespace-nowrap">{new Date(entry.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</td>
                      <td className="p-4">{getCustomerName(entry)}</td>
                      <td className="p-4">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase ${
                          entry.type === 'devolucion' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 
                          entry.type === 'cambio' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 
                          entry.type === 'despacho' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                          'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}>
                          {entry.type === 'devolucion' ? 'Devolución' : 
                           entry.type === 'cambio' ? 'Cambio' : 
                           entry.type === 'despacho' ? 'Error Despacho' : 'Garantía'}
                        </span>
                      </td>
                      <td className="p-4 font-mono font-bold text-slate-650">{getOriginalOrderCode(entry) || 'S/C'}</td>
                      <td className="p-4 font-mono font-bold text-slate-650">{getClaimCode(entry)}</td>
                      <td className="p-4 font-mono font-bold text-slate-650">{getExchangeCode(entry)}</td>
                      <td className="p-4">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase ${
                          getClaimStatus(entry) === 'Abierto' || getClaimStatus(entry) === 'Pendiente' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                          getClaimStatus(entry) === 'Resuelto' || getClaimStatus(entry) === 'Completado' || getClaimStatus(entry) === 'Aprobado' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                          'bg-red-50 text-red-700 border border-red-200'
                        }`}>
                          {getClaimStatus(entry) === 'Pendiente' ? 'Abierto' : 
                           getClaimStatus(entry) === 'Completado' || getClaimStatus(entry) === 'Aprobado' ? 'Resuelto' : 
                           getClaimStatus(entry) || 'Abierto'}
                        </span>
                      </td>
                      <td className="p-4 max-w-xs truncate" title={entry.reason}>{entry.reason}</td>
                      <td className="p-4 text-right text-emerald-600 font-extrabold">{formatPrice(entry.refund_amount)}</td>
                      <td className="p-4 text-right text-amber-600 font-extrabold">{formatPrice(entry.exchange_amount)}</td>
                      <td className={`p-4 text-right font-black ${entry.difference_amount === 0 ? 'text-slate-800' : entry.difference_amount > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {formatPrice(entry.difference_amount)}
                      </td>
                      <td className="p-4 text-center">
                        <button
                          onClick={() => handleViewHistoryDetail(entry)}
                          className="px-3 py-1 bg-slate-100 hover:bg-slate-200 rounded-xl text-[10px] uppercase font-black tracking-wider transition-colors"
                        >
                          Ver Detalle
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* History Detail Modal */}
          {selectedHistoryEntry && (
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-6 z-50">
              <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 space-y-6">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Detalles de Operación</span>
                    <h3 className="font-black text-slate-900 text-xl">Postventa Pedido #{selectedHistoryEntry.order_id?.substring(0,8)}</h3>
                  </div>
                  <button
                    onClick={() => setSelectedHistoryEntry(null)}
                    className="p-2 hover:bg-slate-100 rounded-xl text-slate-400"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs font-bold bg-slate-50 p-4 rounded-2xl">
                  <div>
                    <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Tipo</span>
                    <span className="text-slate-700 capitalize">{selectedHistoryEntry.type}</span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Fecha</span>
                    <span className="text-slate-700">{new Date(selectedHistoryEntry.created_at).toLocaleString('es-AR')}</span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Ped. Original</span>
                    <span className="text-slate-750 font-mono font-black">{getOriginalOrderCode(selectedHistoryEntry) || 'S/C'}</span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Cód. Reclamo</span>
                    <span className="text-slate-750 font-mono font-black">{getClaimCode(selectedHistoryEntry)}</span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Cód. Cambio</span>
                    <span className="text-slate-750 font-mono font-black">{getExchangeCode(selectedHistoryEntry)}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Motivo</span>
                    <span className="text-slate-700">{selectedHistoryEntry.reason}</span>
                  </div>
                </div>

                {/* Resolution Message */}
                {selectedHistoryEntry.resolution_message && (
                  <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl space-y-1">
                    <span className="block text-[10px] font-black text-slate-500 uppercase tracking-wider">
                      Respuesta / Mensaje de Resolución
                    </span>
                    <p className="text-xs text-slate-700 font-bold whitespace-pre-wrap">
                      {selectedHistoryEntry.resolution_message}
                    </p>
                  </div>
                )}

                {/* Returned Items */}
                {selectedHistoryEntry.returns && selectedHistoryEntry.returns.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Artículos Devueltos</h4>
                    <div className="border border-slate-100 rounded-xl overflow-hidden divide-y divide-slate-50 text-xs">
                      {selectedHistoryEntry.returns.map((item: any) => (
                        <div key={item.id} className="p-3 flex justify-between items-center font-bold">
                          <div>
                            <span className="block text-slate-800">{item.products?.name || 'Producto Desconocido'}</span>
                            <span className="block text-[9px] text-slate-400 uppercase">
                              Acción de stock: {item.restock_action === 'reingreso_stock' ? 'Reingresado a Stock' : 'Descartado por Dañado'}
                            </span>
                          </div>
                          <span className="text-slate-700 font-extrabold">
                            {item.quantity} un. x {formatPrice(item.unit_price)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Exchange Items */}
                {selectedHistoryEntry.exchanges && selectedHistoryEntry.exchanges.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Artículos Entregados en Reemplazo</h4>
                    <div className="border border-slate-100 rounded-xl overflow-hidden divide-y divide-slate-50 text-xs">
                      {selectedHistoryEntry.exchanges.map((item: any) => (
                        <div key={item.id} className="p-3 flex justify-between items-center font-bold">
                          <span className="text-slate-800">{item.products?.name || 'Producto Desconocido'}</span>
                          <span className="text-slate-700 font-extrabold">
                            {item.quantity} un. x {formatPrice(item.unit_price)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Warranty Claims Associated */}
                {selectedHistoryEntry.warranties && selectedHistoryEntry.warranties.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Garantías Derivadas</h4>
                    <div className="border border-slate-100 rounded-xl overflow-hidden divide-y divide-slate-50 text-xs">
                      {selectedHistoryEntry.warranties.map((item: any) => (
                        <div key={item.id} className="p-3 space-y-1 bg-slate-50/50 font-bold">
                          <div className="flex justify-between items-center">
                            <span className="text-slate-800">{item.products?.name || 'Producto Desconocido'}</span>
                            <span className="inline-block px-2 py-0.5 rounded text-[8px] font-black uppercase bg-amber-100 text-amber-700">
                              {item.supplier_claim_status}
                            </span>
                          </div>
                          {item.serial_number && (
                            <span className="block text-[10px] text-slate-400">N/S: {item.serial_number}</span>
                          )}
                          <span className="block text-[10px] text-slate-500 font-medium">Falla: {item.issue_description}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-end pt-4 border-t border-slate-100">
                  <Button onClick={() => setSelectedHistoryEntry(null)}>Cerrar</Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: GARANTÍAS DE FÁBRICA */}
      {activeTab === 'garantias' && (
        <div className="bg-white border border-slate-100 shadow-md rounded-[2.5rem] p-6 space-y-6">
          <div>
            <h3 className="font-black text-slate-900 text-lg">Garantías de Fábrica</h3>
            <p className="text-xs text-slate-400 font-medium">Bandeja de reclamos derivados a proveedores por productos defectuosos</p>
          </div>

          {warrantiesLoading ? (
            <div className="flex justify-center p-12"><Loader2 className="animate-spin text-brand-600 w-8 h-8" /></div>
          ) : warrantyClaims.length === 0 ? (
            <div className="p-12 text-center text-slate-400">No se encontraron reclamos de garantía.</div>
          ) : (
            <div className="space-y-4">
              {warrantyClaims.map(claim => (
                <WarrantyCard
                  key={claim.id}
                  claim={claim}
                  suppliers={suppliers}
                  onUpdateStatus={handleUpdateWarrantyStatus}
                  isUpdating={updatingWarrantyId === claim.id}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Subcomponent for Warranty Claim management
function WarrantyCard({ claim, suppliers, onUpdateStatus, isUpdating }: {
  claim: any;
  suppliers: any[];
  onUpdateStatus: (claimId: string, supplierStatus: string, customerRes: string, notes: string) => Promise<void>;
  isUpdating: boolean;
}) {
  const [supplierStatus, setSupplierStatus] = useState(claim.supplier_claim_status);
  const [customerRes, setCustomerRes] = useState(claim.customer_resolution);
  const [notes, setNotes] = useState(claim.notes || "");
  const [dirty, setDirty] = useState(false);

  return (
    <div className="p-5 border border-slate-100 rounded-3xl bg-slate-50/20 grid grid-cols-1 lg:grid-cols-4 gap-6">
      {/* Product Details */}
      <div className="lg:col-span-2 space-y-3">
        <div className="flex items-start gap-2">
          <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-black text-slate-800 text-sm">{claim.products?.name}</h4>
            <span className="block text-[10px] text-slate-400 font-bold">
              SKU: {claim.products?.sku || 'N/A'} • Proveedor: {claim.suppliers?.name || 'N/A'}
            </span>
          </div>
        </div>

        <div className="bg-white p-3 border border-slate-100 rounded-xl space-y-1">
          {claim.serial_number && (
            <div className="flex gap-2 text-[10px] font-bold">
              <span className="text-slate-400 uppercase tracking-wider">Número de Serie:</span>
              <span className="text-slate-700">{claim.serial_number}</span>
            </div>
          )}
          <div className="text-[10px] font-bold">
            <span className="block text-slate-400 uppercase tracking-wider">Falla Reportada:</span>
            <span className="text-slate-600 font-medium">{claim.issue_description}</span>
          </div>
        </div>
      </div>

      {/* Select Statuses */}
      <div className="space-y-3">
        <div className="space-y-1">
          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Reclamo Proveedor</label>
          <select
            value={supplierStatus}
            onChange={(e) => { setSupplierStatus(e.target.value); setDirty(true); }}
            className="w-full px-3 py-2 bg-white border border-slate-150 rounded-xl text-xs font-bold text-slate-700"
          >
            <option value="no_reclamado">No Reclamado</option>
            <option value="enviado_a_fabrica">Enviado a Fábrica</option>
            <option value="aprobado_por_proveedor">Aprobado por Proveedor</option>
            <option value="rechazado_por_proveedor">Rechazado por Proveedor</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Resolución Cliente</label>
          <select
            value={customerRes}
            onChange={(e) => { setCustomerRes(e.target.value); setDirty(true); }}
            className="w-full px-3 py-2 bg-white border border-slate-150 rounded-xl text-xs font-bold text-slate-700"
          >
            <option value="pendiente">Pendiente</option>
            <option value="reemplazo_entregado">Reemplazo Entregado</option>
            <option value="nota_credito_emitida">Nota de Crédito</option>
            <option value="rechazado">Rechazado</option>
          </select>
        </div>
      </div>

      {/* Notes & Actions */}
      <div className="flex flex-col justify-between gap-4">
        <div className="space-y-1">
          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Observaciones</label>
          <textarea
            placeholder="Comentarios de la gestión..."
            value={notes}
            onChange={(e) => { setNotes(e.target.value); setDirty(true); }}
            rows={2}
            className="w-full px-3 py-2 bg-white border border-slate-150 rounded-xl text-xs font-medium text-slate-700 resize-none"
          />
        </div>

        <Button
          onClick={() => { onUpdateStatus(claim.id, supplierStatus, customerRes, notes); setDirty(false); }}
          disabled={!dirty || isUpdating}
          size="sm"
          className="w-full py-2.5 font-bold uppercase tracking-wider text-[10px]"
        >
          {isUpdating ? <Loader2 className="animate-spin w-3.5 h-3.5" /> : "Guardar Cambios"}
        </Button>
      </div>
    </div>
  );
}

function X({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  );
}
