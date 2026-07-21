"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { 
  Truck, 
MapPin, 
  User, 
  ChevronDown, 
  ChevronUp, 
CheckCircle, 
  XCircle, 
  Plus, 
  Edit, 
  Trash2, 
  Search, 
  Loader2, 
  Info,
  Layers,
  ClipboardList,
  Eye,
  TrendingUp,
  Map,
Navigation,
DollarSign,
  AlertTriangle,
CreditCard,
  Check,
  MessageSquare,
  GripVertical,
  Printer,
  RotateCcw,
  X
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatPrice, formatDateDDMMYYYY } from "@/lib/utils";
import { createBulkStockTransactions } from "@/lib/erp/stock";

interface AppError {
  message: string;
  details?: string;
}

function parseReturnItemsFromNotes(notes: string | null | undefined): string[] {
  if (!notes) return [];
  const match = notes.match(/➡️ TRAER DE REGRESO DE CLIENTE:\s*\n([\s\S]*?)(?:➡️|$)/);
  if (!match) return [];
  return match[1]
    .split('\n')
    .map(line => line.replace(/^\s*-\s*/, '').trim())
    .filter(line => line.length > 0);
}

function cleanTextForSearch(str: string | null | undefined): string {
  return (str || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

import { DateInput } from "./components/DateInput";
import { 
  Carrier, 
  Vehicle, 
  Zone, 
  CarrierRate, 
  RouteSheet, 
Delivery, 
  PaymentMethod, 
  DraftPayment,
  ReconciliationDraft,
  RouteOrder,
  Product,
  OrderHistoryEntry
} from "./types";
import { CashRegister, Locality } from "@/types";

function getCategoryBadgeStyle(category: string): string {
  switch (category) {
    case 'Tanques de Agua':
      return 'bg-blue-50 border-blue-200 text-blue-800';
    case 'Biodigestores':
      return 'bg-emerald-50 border-emerald-200 text-emerald-800';
    case 'Pinturas':
      return 'bg-purple-50 border-purple-200 text-purple-800';
    case 'Termotanques':
      return 'bg-amber-50 border-amber-200 text-amber-800';
    case 'MEPS':
      return 'bg-cyan-50 border-cyan-200 text-cyan-800';
    case 'Bombas':
      return 'bg-teal-50 border-teal-200 text-teal-800';
    case 'Aberturas':
      return 'bg-orange-50 border-orange-200 text-orange-800';
    case 'Escaleras':
      return 'bg-indigo-50 border-indigo-200 text-indigo-800';
    default:
      return 'bg-slate-100 border-slate-200 text-slate-700';
  }
}

function getOrderCategorySummary(orderItems: { product_name: string; quantity: number }[]) {
  if (!orderItems || orderItems.length === 0) {
    return { mainCategory: 'Sin productos', totalItems: 0 };
  }

  let totalQty = 0;
  const categoryCounts: Record<string, number> = {};

  orderItems.forEach(item => {
    const qty = item.quantity || 1;
    totalQty += qty;
    const pName = (item.product_name || '').toLowerCase();
    if (pName.includes('descuento') || pName.includes('bonificaci')) return;

    let cat = 'Tanques de Agua';
    if (pName.includes('bomba')) cat = 'Bombas';
    else if (pName.includes('puerta') || pName.includes('ventana')) cat = 'Aberturas';
    else if (pName.includes('termotanque') || pName.includes('turboflex')) cat = 'Termotanques';
    else if (
      pName.includes('biofort') || pName.includes('biodigestor') || pName.includes('biolam') ||
      pName.includes('awaduct') || pName.includes('desengrasadora') || pName.includes('séptica') || pName.includes('septica') || pName.includes('cámara') || pName.includes('camara')
    ) cat = 'Biodigestores';
    else if (
      pName.includes('cuatr') || pName.includes('cuatricapa') || pName.includes('aquafort') ||
      pName.includes('tanque') || pName.includes('cisterna') || pName.includes('tricapa') || pName.includes('bicapa') ||
      pName.includes('complemento') || pName.includes('base') || pName.includes('hierro') || pName.includes('flotante') || pName.includes('boya')
    ) cat = 'Tanques de Agua';
    else if (
      pName.includes('pintura') || pName.includes('latex') || pName.includes('látex') || pName.includes('andina') ||
      pName.includes('lavable') || pName.includes('zono') || pName.includes('pinceleta') || pName.includes('pincel') ||
      pName.includes('lija') || pName.includes('rodillo') || pName.includes('guante') || pName.includes('fijador') ||
      pName.includes('sellador') || pName.includes('enduido') || pName.includes('endui') || pName.includes('sintetico') || pName.includes('sintético')
    ) cat = 'Pinturas';
    else if (pName.includes('venda') || pName.includes('mep') || pName.includes('meps') || pName.includes('equilibrio')) cat = 'MEPS';
    else if (pName.includes('escalera')) cat = 'Escaleras';
    else cat = 'Varios';

    categoryCounts[cat] = (categoryCounts[cat] || 0) + qty;
  });

  const categories = Object.keys(categoryCounts);
  if (categories.length === 0) {
    return { mainCategory: 'Tanques de Agua', totalItems: totalQty || orderItems.length };
  }

  categories.sort((a, b) => categoryCounts[b] - categoryCounts[a]);
  return { mainCategory: categories[0], totalItems: totalQty || orderItems.length };
}

export default function RuteoPage() {
  const [activeTab, setActiveTab] = useState<'pending' | 'planned' | 'in_transit' | 'history' | 'take_away' | 'carriers'>('pending');
  const [loading, setLoading] = useState(true);
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [routeSheets, setRouteSheets] = useState<RouteSheet[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [openRegister, setOpenRegister] = useState<CashRegister | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [printItems, setPrintItems] = useState<Delivery[]>([]);
  const [failedHistory, setFailedHistory] = useState<any[]>([]);
  const [expandedHistoryRoutes, setExpandedHistoryRoutes] = useState<Record<string, boolean>>({});

  const toggleHistoryRouteExpand = (routeId: string) => {
    setExpandedHistoryRoutes(prev => ({
      ...prev,
      [routeId]: !prev[routeId]
    }));
  };

  // Delivery Detail Preview State
  const [previewDelivery, setPreviewDelivery] = useState<Delivery | null>(null);

  // Order Edit and History State
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedOrderHistory, setSelectedOrderHistory] = useState<OrderHistoryEntry[]>([]);
  const [showEditOrderModal, setShowEditOrderModal] = useState(false);
  const [editingOrder, setEditingOrder] = useState<RouteOrder | null>(null);
  const [editingOrderItems, setEditingOrderItems] = useState<{ id: string | null; product_name: string; quantity: number; unit_price: number }[]>([]);
  const [editChangeReason, setEditChangeReason] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [showRuteoPostponementModal, setShowRuteoPostponementModal] = useState(false);
  const [ruteoPostponementReasonType, setRuteoPostponementReasonType] = useState<'cliente' | 'empresa'>('cliente');
  const [ruteoPostponementMotive, setRuteoPostponementMotive] = useState("");
  const [hasDeclaredRuteoPostponementReason, setHasDeclaredRuteoPostponementReason] = useState(false);
  const [postponedDeliveriesList, setPostponedDeliveriesList] = useState<Delivery[]>([]);
  const [showMultiCodeModal, setShowMultiCodeModal] = useState(false);
  const [multiCodeInput, setMultiCodeInput] = useState("");
  const [expandedProductDeliveryIds, setExpandedProductDeliveryIds] = useState<Set<string>>(new Set());

  const toggleProductExpand = (id: string) => {
    setExpandedProductDeliveryIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const [editCustomerName, setEditCustomerName] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editLocality, setEditLocality] = useState("");
  const [editGoogleMapsLink, setEditGoogleMapsLink] = useState("");
  const [editDeliveryNotes, setEditDeliveryNotes] = useState("");
  const [editDeliveryDetail, setEditDeliveryDetail] = useState("");

  const [productSearchQuery, setProductSearchQuery] = useState("");
  const [showProductSuggestions, setShowProductSuggestions] = useState(false);

  // Carrier Form State
  const [showCarrierModal, setShowCarrierModal] = useState(false);
  const [carrierName, setCarrierName] = useState("");
  const [carrierVehicle, setCarrierVehicle] = useState("");
  const [carrierPlate, setCarrierPlate] = useState("");
  const [carrierPhone, setCarrierPhone] = useState("");
  const [selectedCarrierId, setSelectedCarrierId] = useState<string | null>(null);

  // Vehicles and Rates state
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [carrierRates, setCarrierRates] = useState<CarrierRate[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);

  // Expanded Carrier accordion state
  const [expandedCarriers, setExpandedCarriers] = useState<Record<string, boolean>>({});

  // Vehicle Modal/Form State
  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [vehicleCarrierId, setVehicleCarrierId] = useState<string | null>(null);
  const [vehicleType, setVehicleType] = useState("");
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [vehicleMaxWeight, setVehicleMaxWeight] = useState("");
  const [vehicleMaxVolume, setVehicleMaxVolume] = useState("");
  const [vehicleMaxSpeed, setVehicleMaxSpeed] = useState("");
  const [vehicleActive, setVehicleActive] = useState(true);

  // Rate Modal/Form State
  const [showRateModal, setShowRateModal] = useState(false);
  const [selectedRateId, setSelectedRateId] = useState<string | null>(null);
  const [rateCarrierId, setRateCarrierId] = useState<string | null>(null);
  const [rateName, setRateName] = useState("");
  const [rateDailyRate, setRateDailyRate] = useState("");
  const [rateHourlyRate, setRateHourlyRate] = useState("");
  const [rateOvertimeHourlyRate, setRateOvertimeHourlyRate] = useState("");
  const [rateAssistantRate, setRateAssistantRate] = useState("");
  const [rateBaseKms, setRateBaseKms] = useState("");
  const [rateExtraKmRate, setRateExtraKmRate] = useState("");
  const [rateIncludesTolls, setRateIncludesTolls] = useState(false);
  const [rateLogisticsZoneIds, setRateLogisticsZoneIds] = useState<string[]>([]);
  const [showRateZoneDropdown, setShowRateZoneDropdown] = useState(false);
  const [rateZoneSearchTerm, setRateZoneSearchTerm] = useState("");
  const [rateStartDate, setRateStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [rateEndDate, setRateEndDate] = useState("");
  const [rateActive, setRateActive] = useState(true);

  // Settlement Modal State
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [settlementRouteSheet, setSettlementRouteSheet] = useState<RouteSheet | null>(null);
  const [settlementCarrier, setSettlementCarrier] = useState<Carrier | null>(null);
  const [settlementSelectedRateId, setSettlementSelectedRateId] = useState("");
  const [settlementActualHours, setSettlementActualHours] = useState("");
  const [settlementActualOvertimeHours, setSettlementActualOvertimeHours] = useState("");
  const [settlementActualKms, setSettlementActualKms] = useState("");
  const [settlementHasAssistant, setSettlementHasAssistant] = useState(false);
  const [settlementTollsAmount, setSettlementTollsAmount] = useState("");
  const [settlementPayoutStatus, setSettlementPayoutStatus] = useState<'Pendiente' | 'Liquidado'>('Pendiente');
  const [settlementPaymentMethod, setSettlementPaymentMethod] = useState<'cash' | 'other'>('other');


  // Address and Map Edit State
  const [showEditAddressModal, setShowEditAddressModal] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState("");
  const [editingAddress, setEditingAddress] = useState("");
  const [editingMapsLink, setEditingMapsLink] = useState("");
  const [editingIsEncomienda, setEditingIsEncomienda] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);

  // Import Route Order State
  const [showImportOrderModal, setShowImportOrderModal] = useState(false);
  const [importOrderRouteSheetId, setImportOrderRouteSheetId] = useState("");
  const [importOrderRouteSheetName, setImportOrderRouteSheetName] = useState("");
  const [importOrderText, setImportOrderText] = useState("");
  const [importOrderDeliveries, setImportOrderDeliveries] = useState<Delivery[]>([]);
  const [savingImportOrder, setSavingImportOrder] = useState(false);

  // Drag and drop state
  const [draggedRowIndex, setDraggedRowIndex] = useState<number | null>(null);
  const [draggedRouteSheetId, setDraggedRouteSheetId] = useState<string | null>(null);

  // Product Summary State
  const [showProductSummaryModal, setShowProductSummaryModal] = useState(false);
  const [summaryRouteSheetName, setSummaryRouteSheetName] = useState("");
  const [summaryProducts, setSummaryProducts] = useState<{ name: string; quantity: number }[]>([]);

  // Local sequence number overrides
  const [tempOrders, setTempOrders] = useState<Record<string, number>>({});

  // Ruteo Form State
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [selectedCarrierForRoute, setSelectedCarrierForRoute] = useState<Record<string, string>>({});
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [runNumberForRoute, setRunNumberForRoute] = useState<Record<string, number>>({});
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [deliveryDateForRoute, setDeliveryDateForRoute] = useState<Record<string, string>>({});
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [notesForRoute, setNotesForRoute] = useState<Record<string, string>>({});

  // Filter and search
  const [searchTerm, setSearchTerm] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [selectedDateFilter, setSelectedDateFilter] = useState(new Date().toISOString().split('T')[0]);

  // Pending Tab Specific Filters
  const [pendingFilterZones, setPendingFilterZones] = useState<string[]>([]);
  const [showZoneDropdown, setShowZoneDropdown] = useState(false);
  const [zoneSearchTerm, setZoneSearchTerm] = useState("");
  const [pendingFilterLocality, setPendingFilterLocality] = useState<string[]>([]);
  const [showLocalityDropdown, setShowLocalityDropdown] = useState(false);
  const [localitySearchTerm, setLocalitySearchTerm] = useState("");
  const [pendingFilterVencimientoOpt, setPendingFilterVencimientoOpt] = useState<string>(""); // '', 'expired', 'today', 'tomorrow', '3days', 'custom'
  const [pendingFilterVencimientoDate, setPendingFilterVencimientoDate] = useState<string>("");

  // Sorting state
  const [sortField, setSortField] = useState<'zone' | 'vencimiento'>('zone');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Planned sub-tab
  const [plannedSubTab, setPlannedSubTab] = useState<'Borrador' | 'En Viaje' | 'Cerrada'>('Borrador');

  // Checkbox selection states
  const [selectedDeliveryIds, setSelectedDeliveryIds] = useState<Set<string>>(new Set());
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);

  // Bulk actions states
  const [bulkCarrierId, setBulkCarrierId] = useState<string>("");
  const [bulkRunNumber, setBulkRunNumber] = useState<number>(1);
  const [bulkDeliveryDate, setBulkDeliveryDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [savingBulk, setSavingBulk] = useState(false);

  // Fail Notes State
  const [failNotes, setFailNotes] = useState("");
  const [selectedDeliveryToFail, setSelectedDeliveryToFail] = useState<string | null>(null);

  // Delivery Payments Modal (Rendición por Pedido)
  const [showDeliveryPaymentModal, setShowDeliveryPaymentModal] = useState(false);
  const [processingDelivery, setProcessingDelivery] = useState<Delivery | null>(null);
  const [modalPayments, setModalPayments] = useState<DraftPayment[]>([]);
  const [selectedMethodId, setSelectedMethodId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");

  // Route Sheet Reconciliation Modal (Arqueo General de Viaje)
  const [showReconciliationModal, setShowReconciliationModal] = useState(false);
  const [reconcilingRouteSheet, setReconcilingRouteSheet] = useState<RouteSheet | null>(null);
  const [reconciliationDrafts, setReconciliationDrafts] = useState<ReconciliationDraft[]>([]);
  const [actualCashInput, setActualCashInput] = useState<string>("");
  const [reconciliationNotes, setReconciliationNotes] = useState("");
  const [submittingReconciliation, setSubmittingReconciliation] = useState(false);

  // Take Away State
  const [takeAwaySearchQuery, setTakeAwaySearchQuery] = useState("");
  const [pendingTakeAwayOrders, setPendingTakeAwayOrders] = useState<RouteOrder[]>([]);
  const [loadingTakeAway, setLoadingTakeAway] = useState(false);
  const [showTakeAwayModal, setShowTakeAwayModal] = useState(false);
  const [processingTakeAwayOrder, setProcessingTakeAwayOrder] = useState<RouteOrder | null>(null);
  const [takeAwayAmount, setTakeAwayAmount] = useState("");
  const [takeAwayMethodId, setTakeAwayMethodId] = useState("");
  const [takeAwayNotes, setTakeAwayNotes] = useState("");

  // Encomiendas Creation State
  const [showEncomiendaModal, setShowEncomiendaModal] = useState(false);
  const [encomiendaType, setEncomiendaType] = useState<string>("llevar_pago");
  const [encomiendaClientName, setEncomiendaClientName] = useState("");
  const [encomiendaClientPhone, setEncomiendaClientPhone] = useState("");
  const [encomiendaDescription, setEncomiendaDescription] = useState("");
  const [encomiendaLocality, setEncomiendaLocality] = useState("");
  const [encomiendaAddress, setEncomiendaAddress] = useState("");
  const [encomiendaMapsLink, setEncomiendaMapsLink] = useState("");
  const [encomiendaDate, setEncomiendaDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [encomiendaNotes, setEncomiendaNotes] = useState("");
  const [encomiendaPaymentAmount, setEncomiendaPaymentAmount] = useState("");
  const [encomiendaSupplierId, setEncomiendaSupplierId] = useState("");
  const [encomiendaPurchaseId, setEncomiendaPurchaseId] = useState("");
  const [encomiendaInvoiceNumber, setEncomiendaInvoiceNumber] = useState("");
  const [allLocalities, setAllLocalities] = useState<Locality[]>([]);

  const [dbSuppliers, setDbSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [dbPurchases, setDbPurchases] = useState<{ id: string; invoice_number: string }[]>([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [loadingPurchases, setLoadingPurchases] = useState(false);
  const [savingEncomienda, setSavingEncomienda] = useState(false);

  const loadSuppliers = async () => {
    try {
      setLoadingSuppliers(true);
      const { data, error } = await supabase
        .from('suppliers')
        .select('id, name')
        .order('name');
      if (error) throw error;
      setDbSuppliers(data || []);
    } catch (err) {
      console.error("Error loading suppliers:", err);
    } finally {
      setLoadingSuppliers(false);
    }
  };

  const loadPurchases = async (supplierId: string) => {
    if (!supplierId) {
      setDbPurchases([]);
      return;
    }
    try {
      setLoadingPurchases(true);
      const { data, error } = await supabase
        .from('supplier_purchases')
        .select('id, invoice_number')
        .eq('supplier_id', supplierId)
        .order('invoice_number');
      if (error) throw error;
      setDbPurchases(data || []);
    } catch (err) {
      console.error("Error loading purchases:", err);
    } finally {
      setLoadingPurchases(false);
    }
  };

  const openNewEncomiendaModal = () => {
    loadSuppliers();
    setShowEncomiendaModal(true);
  };

  const handleSaveEncomienda = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!encomiendaDescription.trim()) {
      alert("Por favor ingrese una descripción.");
      return;
    }
    if (!encomiendaLocality.trim()) {
      alert("Por favor ingrese una localidad.");
      return;
    }
    if (!encomiendaAddress.trim()) {
      alert("Por favor ingrese una dirección.");
      return;
    }

    try {
      setSavingEncomienda(true);
      
      const payload = {
        type: encomiendaType,
        client_name: encomiendaClientName || null,
        client_phone: encomiendaClientPhone || null,
        description: encomiendaDescription,
        locality: encomiendaLocality,
        address: encomiendaAddress,
        google_maps_link: encomiendaMapsLink || null,
        delivery_date: encomiendaDate,
        notes: encomiendaNotes || null,
        payment_amount: encomiendaPaymentAmount ? parseFloat(encomiendaPaymentAmount) : 0,
        supplier_id: encomiendaSupplierId || null,
        purchase_order_id: encomiendaPurchaseId || null,
        invoice_number: encomiendaInvoiceNumber || null,
      };

      const { error } = await supabase
        .from('encomiendas')
        .insert(payload);

      if (error) throw error;

      alert("Diligencia/Encomienda creada exitosamente.");
      setShowEncomiendaModal(false);
      
      // Reset fields
      setEncomiendaType("llevar_pago");
      setEncomiendaClientName("");
      setEncomiendaClientPhone("");
      setEncomiendaDescription("");
      setEncomiendaLocality("");
      setEncomiendaAddress("");
      setEncomiendaMapsLink("");
      setEncomiendaDate(new Date().toISOString().split('T')[0]);
      setEncomiendaNotes("");
      setEncomiendaPaymentAmount("");
      setEncomiendaSupplierId("");
      setEncomiendaPurchaseId("");
      setEncomiendaInvoiceNumber("");
      
      loadAllData();
    } catch (err) {
      alert("Error al guardar encomienda: " + ((err as AppError).message || (err as AppError).details));
    } finally {
      setSavingEncomienda(false);
    }
  };

  useEffect(() => {
    fetchUserAndRegister();
  }, []);

  useEffect(() => {
    loadAllData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, selectedDateFilter]);

  useEffect(() => {
    if (activeTab === 'take_away') {
      loadPendingTakeAwayOrders();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, takeAwaySearchQuery]);

  useEffect(() => {
    const orderId = previewDelivery?.order_id || previewDelivery?.orders?.id;
    if (orderId) {
      loadOrderHistory(orderId);
    } else {
      setSelectedOrderHistory([]);
    }
  }, [previewDelivery]);

  const loadOrderHistory = async (orderId: string) => {
    try {
      const { data, error } = await supabase
        .from('order_history')
        .select('*')
        .eq('order_id', orderId)
        .order('changed_at', { ascending: false });
      
      if (error) throw error;
      setSelectedOrderHistory((data || []) as OrderHistoryEntry[]);
    } catch (err) {
      console.error("Error al cargar historial de modificaciones:", err);
    }
  };

  const loadProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, sku, stock_current, price, parent_id')
        .eq('is_active', true)
        .order('name', { ascending: true });
      
      if (error) throw error;
      
      const raw = (data || []) as Product[];
      const mapped = raw.map((p) => {
        if (p.parent_id) {
          const parent = raw.find((parent) => parent.id === p.parent_id);
          if (parent) {
            return {
              ...p,
              price: parent.price || p.price
            };
          }
        }
        return p;
      });
      
      setProducts(mapped);
    } catch (err) {
      console.error("Error al cargar productos:", err);
    }
  };

  async function fetchUserAndRegister() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
      }
      const { data: registers } = await supabase
        .from("cash_registers")
        .select("*")
        .eq("status", "Abierta")
        .order("opened_at", { ascending: false });

      if (registers && registers.length > 0) {
        setOpenRegister(registers[0]);
      } else {
        setOpenRegister(null);
      }
    } catch (err) {
      console.error("Error fetching user or register:", err);
    }
  }

  async function loadAllData() {
    try {
      setLoading(true);
      
      // Prepare active deliveries query
      const activeQuery = supabase
        .from('deliveries')
        .select(`
          *,
          orders:orders(
            id,
            client_id,
            customer_name,
            locality,
            address,
            google_maps_link,
            freight_type,
            total_amount,
            payment_status,
            payment_approved,
            payment_method_id,
            max_delivery_date,
            order_date,
            legacy_code,
            delivery_notes,
            delivery_detail,
            logistics_zone_id,
            totals,
            channel,
            zones:zones(name, color, delivery_times(category)),
            clients:clients(phone_primary, phone_secondary, is_wholesale),
            order_items:order_items(
              id,
              product_id,
              product_name,
              quantity,
              unit_price
            )
          ),
          encomiendas:encomiendas(
            *,
            purchase:supplier_purchases(
              id,
              invoice_number,
              supplier:suppliers(name)
            ),
            supplier:suppliers(
              id,
              name
            )
          ),
          carriers:carriers(*),
          route_sheets:route_sheets(*)
        `)
        .not('status', 'in', '("entregado","fallido")')
        .order('delivery_date', { ascending: true })
        .order('run_number', { ascending: true })
        .order('delivery_order', { ascending: true });

      // Run parallel requests
      const promises = [
        supabase.from('payment_methods').select('*').eq('is_active', true).order('name'),
        supabase.from('localities').select('id, name').order('name'),
        supabase.from('carriers').select('*').order('name'),
        supabase.from('route_sheets').select('*, carriers(*)'),
        activeQuery,
        supabase.from('vehicles').select('*').order('plate_number'),
        supabase.from('carrier_rates').select('*, zones:zones(id, name)').order('name'),
        supabase.from('zones').select('id, name, is_active, color').order('name'),
        supabase.from('deliveries')
          .select('id, order_id, encomienda_id, delivery_date, run_number, carriers(name), route_sheets(code)')
          .eq('status', 'fallido')
          .order('delivery_date', { ascending: false })
      ];

      if (activeTab === 'history') {
        const historyQuery = supabase
          .from('deliveries')
          .select(`
            *,
            orders:orders(
              id,
              client_id,
              customer_name,
              locality,
              address,
              google_maps_link,
              freight_type,
              total_amount,
              payment_status,
              payment_approved,
              payment_method_id,
              max_delivery_date,
              order_date,
              legacy_code,
              delivery_notes,
              delivery_detail,
              logistics_zone_id,
              totals,
              channel,
              zones:zones(name, color, delivery_times(category)),
              clients:clients(phone_primary, phone_secondary, is_wholesale),
              order_items:order_items(
                id,
                product_id,
                product_name,
                quantity,
                unit_price
              )
            ),
            encomiendas:encomiendas(
              *,
              purchase:supplier_purchases(
                id,
                invoice_number,
                supplier:suppliers(name)
              ),
              supplier:suppliers(
                id,
                name
              )
            ),
            carriers:carriers(*),
            route_sheets:route_sheets(*)
          `)
          .in('status', ['entregado', 'fallido'])
          .order('delivery_date', { ascending: false })
          .limit(200);
        promises.push(historyQuery);
      }

      const results = await Promise.all(promises);

      const payRes = results[0];
      const locRes = results[1];
      const carrierRes = results[2];
      const sheetsRes = results[3];
      const activeRes = results[4];
      const vehiclesRes = results[5];
      const ratesRes = results[6];
      const zonesRes = results[7];
      const failedRes = results[8];
      const historyRes = activeTab === 'history' ? results[9] : null;

      if (payRes.error) throw payRes.error;
      if (locRes.error) throw locRes.error;
      if (carrierRes.error) throw carrierRes.error;
      if (sheetsRes.error) throw sheetsRes.error;
      if (activeRes.error) throw activeRes.error;
      if (vehiclesRes.error) throw vehiclesRes.error;
      if (ratesRes.error) throw ratesRes.error;
      if (zonesRes.error) throw zonesRes.error;
      if (failedRes.error) throw failedRes.error;
      if (historyRes && historyRes.error) throw historyRes.error;

      const payData = (payRes.data || []) as PaymentMethod[];
      setPaymentMethods(payData);
      if (payData.length > 0) {
        setSelectedMethodId(payData.find((p) => p.is_default)?.id || payData[0].id);
        setTakeAwayMethodId(payData.find((p) => p.is_default)?.id || payData[0].id);
      }

      setAllLocalities((locRes.data || []) as Locality[]);
      setCarriers((carrierRes.data || []) as Carrier[]);
      setRouteSheets((sheetsRes.data || []) as RouteSheet[]);
      setVehicles((vehiclesRes.data || []) as Vehicle[]);
      setCarrierRates((ratesRes.data || []) as CarrierRate[]);
      setZones((zonesRes.data || []) as Zone[]);
      setFailedHistory((failedRes.data || []) as any[]);

      let allDeliveries = (activeRes.data || []) as Delivery[];
      if (historyRes && historyRes.data) {
        allDeliveries = [...allDeliveries, ...(historyRes.data as Delivery[])];
      }

      setDeliveries(allDeliveries as Delivery[]);
    } catch (err) {
      alert("Error al cargar datos de logística: " + (err as AppError).message);
    } finally {
      setLoading(false);
    }
  }

  async function loadPendingTakeAwayOrders() {
    try {
      setLoadingTakeAway(true);
      let query = supabase
        .from('orders')
        .select('*, clients(*)')
        .eq('status', 'Pendiente')
        .eq('locality', 'Depósito')
        .limit(50);
        
      if (takeAwaySearchQuery.trim()) {
        const q = takeAwaySearchQuery.trim();
        query = query.or(`customer_name.ilike.%${q}%,locality.ilike.%${q}%,legacy_code.ilike.%${q}%`);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      setPendingTakeAwayOrders(data || []);
    } catch (err) {
      console.error("Error loading take away orders:", err);
    } finally {
      setLoadingTakeAway(false);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const toggleOrderExpand = (orderId: string) => {
    setExpandedOrders(prev => ({
      ...prev,
      [orderId]: !prev[orderId]
    }));
  };

  const handleSort = (field: 'zone' | 'vencimiento') => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleCheckboxClick = (e: React.MouseEvent, delId: string) => {
    e.stopPropagation();
    
    const newSelected = new Set(selectedDeliveryIds);
    const isShiftPressed = (e.nativeEvent as MouseEvent).shiftKey;

    if (isShiftPressed && lastClickedId && lastClickedId !== delId) {
      const indexCurrent = filteredPending.findIndex(d => d.id === delId);
      const indexLast = filteredPending.findIndex(d => d.id === lastClickedId);
      
      if (indexCurrent !== -1 && indexLast !== -1) {
        const start = Math.min(indexCurrent, indexLast);
        const end = Math.max(indexCurrent, indexLast);
        const shouldSelect = !selectedDeliveryIds.has(delId);
        
        for (let i = start; i <= end; i++) {
          const id = filteredPending[i].id;
          if (shouldSelect) {
            newSelected.add(id);
          } else {
            newSelected.delete(id);
          }
        }
      }
    } else {
      if (newSelected.has(delId)) {
        newSelected.delete(delId);
      } else {
        newSelected.add(delId);
      }
    }
    
    setSelectedDeliveryIds(newSelected);
    setLastClickedId(delId);
  };

  const handleCopySelectedWhatsApp = () => {
    const selected = deliveries.filter(d => selectedDeliveryIds.has(d.id));
    const links = selected
      .map(d => {
        const phone = d.orders?.clients?.phone_primary;
        if (!phone) return null;
        const clean = phone.replace(/\D/g, '');
        return `https://wa.me/${clean} (${d.orders?.customer_name})`;
      })
      .filter(Boolean)
      .join('\n');

    if (!links) {
      alert("Ninguno de los pedidos seleccionados tiene un teléfono cargado.");
      return;
    }

    navigator.clipboard.writeText(links);
    alert("Enlaces de WhatsApp copiados al portapapeles!");
  };

  const handleCopyRouteSheetWhatsApp = (sheetItems: Delivery[], sheetName: string) => {
    const links = sheetItems
      .map(d => {
        const phone = d.orders?.clients?.phone_primary || d.encomiendas?.client_phone;
        if (!phone) return null;
        const clean = phone.replace(/\D/g, '');
        const name = d.orders?.customer_name || d.encomiendas?.client_name || "Diligencia";
        return `https://wa.me/${clean} (${name})`;
      })
      .filter(Boolean)
      .join('\n');

    if (!links) {
      alert("Ninguna entrega en esta hoja de ruta tiene teléfono cargado.");
      return;
    }

    navigator.clipboard.writeText(links);
    alert(`Enlaces de WhatsApp para ${sheetName} copiados!`);
  };

  const handlePrintRemitos = (sheetItems: Delivery[]) => {
    setPrintItems(sheetItems);
    setTimeout(() => {
      window.print();
    }, 250);
  };

  const handleCopyRouteSheetMaps = (sheetItems: Delivery[], sheetName: string) => {
    const sortedItems = [...sheetItems].sort((a, b) => a.delivery_order - b.delivery_order);
    
    const links = sortedItems
      .map(d => d.orders?.google_maps_link || d.encomiendas?.google_maps_link)
      .filter((link): link is string => typeof link === 'string' && link.trim() !== '')
      .join('\n');

    if (!links) {
      alert("Ninguna entrega en esta hoja de ruta tiene enlace de Google Maps cargado.");
      return;
    }

    navigator.clipboard.writeText(links);
    alert(`Enlaces de mapa (${links.split('\n').length}) para ${sheetName} copiados al portapapeles!`);
  };

  const handleOpenImportOrderModal = (sheetItems: Delivery[], routeSheetId: string, sheetName: string) => {
    setImportOrderRouteSheetId(routeSheetId);
    setImportOrderRouteSheetName(sheetName);
    setImportOrderDeliveries(sheetItems);
    setImportOrderText("");
    setShowImportOrderModal(true);
  };

  const handleApplyImportOrder = async () => {
    if (!importOrderRouteSheetId) return;

    const parsedIndices = importOrderText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line !== "")
      .map(line => parseInt(line, 10))
      .filter(num => !isNaN(num));

    if (parsedIndices.length === 0) {
      alert("Por favor ingrese al menos un número válido de parada.");
      return;
    }

    const sortedDeliveries = [...importOrderDeliveries].sort((a, b) => a.delivery_order - b.delivery_order);
    const mappedDeliveries = sortedDeliveries.filter(d => typeof d.orders?.google_maps_link === 'string' && d.orders.google_maps_link.trim() !== '');
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const unmappedDeliveries = sortedDeliveries.filter(d => !(typeof d.orders?.google_maps_link === 'string' && d.orders.google_maps_link.trim() !== ''));

    if (mappedDeliveries.length === 0) {
      alert("Ningún pedido en esta ruta tiene mapa cargado. No se puede aplicar el ordenamiento.");
      return;
    }

    try {
      setSavingImportOrder(true);

      // Create a record of delivery ID to its target sequence position (delivery_order)
      const newOrdersMap: Record<string, number> = {};

      for (let i = 0; i < mappedDeliveries.length; i++) {
        const delivery = mappedDeliveries[i];
        // If we have a parsed index for this position, use it. Otherwise, place at the end of mapped ones.
        const newOrderValue = (i < parsedIndices.length) ? parsedIndices[i] : (mappedDeliveries.length + i);
        newOrdersMap[delivery.id] = newOrderValue;
      }

      // Build the final list with temporary sequence values
      const allDeliveriesWithTempOrder = sortedDeliveries.map((del, i) => {
        let tempOrder = 9999;
        if (newOrdersMap[del.id] !== undefined) {
          tempOrder = newOrdersMap[del.id];
        } else {
          // Unmapped delivery: place at the very end
          tempOrder = 1000 + i;
        }
        return { delivery: del, tempOrder };
      });

      // Sort by temporary order ascending
      allDeliveriesWithTempOrder.sort((a, b) => a.tempOrder - b.tempOrder);

      // Extract the sorted array of deliveries
      const newOrderList = allDeliveriesWithTempOrder.map(item => item.delivery);

      const updatePromises = newOrderList.map((del, i) => {
        const newOrderValue = i + 1;
        return supabase
          .from('deliveries')
          .update({ delivery_order: newOrderValue })
          .eq('id', del.id);
      });

      const results = await Promise.all(updatePromises);
      const errorResult = results.find(r => r.error);
      if (errorResult) throw errorResult.error;

      setDeliveries(prev => prev.map(d => {
        const foundIndex = newOrderList.findIndex(nod => nod.id === d.id);
        if (foundIndex !== -1) {
          return {
            ...d,
            delivery_order: foundIndex + 1
          };
        }
        return d;
      }));

      setShowImportOrderModal(false);
      setImportOrderRouteSheetId("");
      setImportOrderRouteSheetName("");
      setImportOrderText("");
      setImportOrderDeliveries([]);
      alert("Orden de ruta actualizado correctamente.");
    } catch (err) {
      alert("Error al actualizar el ordenamiento: " + (err as AppError).message);
    } finally {
      setSavingImportOrder(false);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleUpdateOrderManual = async (deliveryId: string, newOrder: number) => {
    if (isNaN(newOrder)) return;
    
    try {
      const { error } = await supabase
        .from('deliveries')
        .update({ delivery_order: newOrder })
        .eq('id', deliveryId);

      if (error) throw error;

      setDeliveries(prev => prev.map(d => {
        if (d.id === deliveryId) {
          return {
            ...d,
            delivery_order: newOrder
          };
        }
        return d;
      }));
    } catch (err) {
      console.error("Error al actualizar orden manual:", (err as AppError).message);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handlePasteOrderSequence = async (e: React.ClipboardEvent<HTMLInputElement>, sheetItems: Delivery[], startIdx: number) => {
    const pastedText = e.clipboardData.getData('text');
    if (!pastedText.includes('\n') && !pastedText.includes('\r')) {
      return;
    }

    e.preventDefault();

    const parsedIndices = pastedText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line !== "")
      .map(line => parseInt(line, 10))
      .filter(num => !isNaN(num));

    if (parsedIndices.length === 0) return;

    try {
      const sortedItems = [...sheetItems].sort((a, b) => a.delivery_order - b.delivery_order);
      
      const updatePromises: Promise<{ error: AppError | null }>[] = [];
      const updatedDeliveries: Record<string, number> = {};

      for (let i = 0; i < parsedIndices.length; i++) {
        const itemIdx = startIdx + i;
        if (itemIdx >= sortedItems.length) break;

        const del = sortedItems[itemIdx];
        const newOrderValue = parsedIndices[i];
        updatedDeliveries[del.id] = newOrderValue;

        updatePromises.push(
          Promise.resolve(
            supabase
              .from('deliveries')
              .update({ delivery_order: newOrderValue })
              .eq('id', del.id)
          )
        );
      }

      if (updatePromises.length === 0) return;

      const results = await Promise.all(updatePromises);
      const errorResult = results.find(r => r.error);
      if (errorResult) throw errorResult.error;

      setDeliveries(prev => prev.map(d => {
        if (updatedDeliveries[d.id] !== undefined) {
          return {
            ...d,
            delivery_order: updatedDeliveries[d.id]
          };
        }
        return d;
      }));

      alert(`Secuencia de paradas actualizada (${updatePromises.length} paradas)`);
    } catch (err) {
      alert("Error al pegar secuencia de orden: " + (err as AppError).message);
    }
  };

  const handleDragStart = (e: React.DragEvent, index: number, routeSheetId: string) => {
    setDraggedRowIndex(index);
    setDraggedRouteSheetId(routeSheetId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, targetIndex: number, targetRouteSheetId: string, sheetItems: Delivery[]) => {
    e.preventDefault();
    if (draggedRowIndex === null || draggedRouteSheetId !== targetRouteSheetId || draggedRowIndex === targetIndex) {
      return;
    }

    try {
      const reorderedItems = [...sheetItems].sort((a, b) => a.delivery_order - b.delivery_order);
      const [removed] = reorderedItems.splice(draggedRowIndex, 1);
      reorderedItems.splice(targetIndex, 0, removed);

      const updatePromises = reorderedItems.map((del, i) => {
        const newOrderValue = i + 1;
        return Promise.resolve(
          supabase
            .from('deliveries')
            .update({ delivery_order: newOrderValue })
            .eq('id', del.id)
        );
      });

      const results = await Promise.all(updatePromises);
      const errorResult = results.find(r => r.error);
      if (errorResult) throw errorResult.error;

      setDeliveries(prev => prev.map(d => {
        const foundIndex = reorderedItems.findIndex(nod => nod.id === d.id);
        if (foundIndex !== -1) {
          return {
            ...d,
            delivery_order: foundIndex + 1
          };
        }
        return d;
      }));

    } catch (err) {
      alert("Error al reordenar la parada: " + (err as AppError).message);
    } finally {
      setDraggedRowIndex(null);
      setDraggedRouteSheetId(null);
    }
  };

  const handleDragEnd = () => {
    setDraggedRowIndex(null);
    setDraggedRouteSheetId(null);
  };

  const handleOpenProductSummary = (sheetItems: Delivery[], sheetName: string) => {
    const productMap: Record<string, number> = {};

    sheetItems.forEach(d => {
      if (d.orders && Array.isArray(d.orders.order_items)) {
        d.orders.order_items.forEach(item => {
          const productName = item.product_name || "Producto Desconocido";
          const qty = Number(item.quantity) || 0;
          if (qty > 0) {
            productMap[productName] = (productMap[productName] || 0) + qty;
          }
        });
      }
    });

    const compiledList = Object.entries(productMap)
      .map(([name, quantity]) => ({ name, quantity }))
      .sort((a, b) => b.quantity - a.quantity);

    setSummaryRouteSheetName(sheetName);
    setSummaryProducts(compiledList);
    setShowProductSummaryModal(true);
  };

  const handleCopyProductSummaryText = () => {
    const text = summaryProducts
      .map(p => `${p.quantity}x ${p.name}`)
      .join('\n');
      
    if (!text) {
      alert("No hay productos para copiar.");
      return;
    }
    
    navigator.clipboard.writeText(text);
    alert("Resumen de productos copiado al portapapeles!");
  };

  const handleMoveToRun = async (delivery: Delivery, targetRun: number) => {
    if (!delivery.carrier_id || !delivery.delivery_date) return;
    if (delivery.run_number === targetRun) return;

    try {
      let targetRouteSheetId = "";
      
      const { data: existingSheets, error: sheetLookupError } = await supabase
        .from('route_sheets')
        .select('id')
        .eq('carrier_id', delivery.carrier_id)
        .eq('delivery_date', delivery.delivery_date)
        .eq('run_number', targetRun);
        
      if (sheetLookupError) throw sheetLookupError;
      
      if (existingSheets && existingSheets.length > 0) {
        targetRouteSheetId = existingSheets[0].id;
      } else {
        const { data: newSheet, error: sheetCreateError } = await supabase
          .from('route_sheets')
          .insert({
            carrier_id: delivery.carrier_id,
            delivery_date: delivery.delivery_date,
            run_number: targetRun,
            status: 'Borrador',
            total_theoretical_cash: 0,
            total_reconciled_cash: 0
          })
          .select('id')
          .single();
          
        if (sheetCreateError) throw sheetCreateError;
        targetRouteSheetId = newSheet.id;
      }

      const sameGroup = deliveries.filter(d => 
        d.carrier_id === delivery.carrier_id && 
        d.delivery_date === delivery.delivery_date && 
        d.run_number === targetRun
      );
      const nextOrder = sameGroup.length > 0 ? Math.max(...sameGroup.map(d => d.delivery_order)) + 1 : 1;

      const { error: updateError } = await supabase
        .from('deliveries')
        .update({
          route_sheet_id: targetRouteSheetId,
          run_number: targetRun,
          delivery_order: nextOrder
        })
        .eq('id', delivery.id);

      if (updateError) throw updateError;

      const remainingInOriginal = deliveries
        .filter(d => d.route_sheet_id === delivery.route_sheet_id && d.id !== delivery.id)
        .sort((a, b) => a.delivery_order - b.delivery_order);

      for (let idx = 0; idx < remainingInOriginal.length; idx++) {
        await supabase
          .from('deliveries')
          .update({ delivery_order: idx + 1 })
          .eq('id', remainingInOriginal[idx].id);
      }

      alert(`Pedido movido al Recorrido ${targetRun} con éxito.`);
      loadAllData();
    } catch (err) {
      alert("Error al mover el pedido de recorrido: " + (err as AppError).message);
    }
  };

  const handlePasteOrderSequenceLocal = (e: React.ClipboardEvent<HTMLInputElement>, sheetItems: Delivery[], startIdx: number) => {
    const pastedText = e.clipboardData.getData('text');
    if (!pastedText.includes('\n') && !pastedText.includes('\r')) {
      return;
    }

    e.preventDefault();

    const parsedIndices = pastedText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line !== "")
      .map(line => parseInt(line, 10))
      .filter(num => !isNaN(num));

    if (parsedIndices.length === 0) return;

    const sortedItems = [...sheetItems].sort((a, b) => a.delivery_order - b.delivery_order);
    const newTemp = { ...tempOrders };

    for (let i = 0; i < parsedIndices.length; i++) {
      const itemIdx = startIdx + i;
      if (itemIdx >= sortedItems.length) break;
      newTemp[sortedItems[itemIdx].id] = parsedIndices[i];
    }

    setTempOrders(newTemp);
  };

  const handleApplyManualSort = async (sheetItems: Delivery[]) => {
    try {
      const updatePromises = sheetItems.map(del => {
        const newOrder = tempOrders[del.id] ?? del.delivery_order;
        return Promise.resolve(
          supabase
            .from('deliveries')
            .update({ delivery_order: newOrder })
            .eq('id', del.id)
        );
      });

      const results = await Promise.all(updatePromises);
      const errorResult = results.find(r => r.error);
      if (errorResult) throw errorResult.error;

      setDeliveries(prev => prev.map(d => {
        if (tempOrders[d.id] !== undefined) {
          return { ...d, delivery_order: tempOrders[d.id] };
        }
        return d;
      }));

      setTempOrders(prev => {
        const next = { ...prev };
        sheetItems.forEach(del => {
          delete next[del.id];
        });
        return next;
      });

      alert("Ordenamiento de paradas guardado.");
    } catch (err) {
      alert("Error al aplicar ordenamiento: " + (err as AppError).message);
    }
  };

  const handleOpenEditAddressModal = (orderId: string, address: string, mapsLink: string, isEncomienda: boolean = false) => {
    setEditingOrderId(orderId);
    setEditingAddress(address || "");
    setEditingMapsLink(mapsLink || "");
    setEditingIsEncomienda(isEncomienda);
    setShowEditAddressModal(true);
  };

  const handleSaveAddressAndMap = async () => {
    if (!editingOrderId) return;
    
    try {
      setSavingAddress(true);
      if (editingIsEncomienda) {
        const { error } = await supabase
          .from('encomiendas')
          .update({
            address: editingAddress.trim(),
            google_maps_link: editingMapsLink.trim() || null
          })
          .eq('id', editingOrderId);
          
        if (error) throw error;
        
        // Update local state 'deliveries'
        setDeliveries(prev => prev.map(d => {
          if (d.encomiendas?.id === editingOrderId) {
            return {
              ...d,
              encomiendas: {
                ...d.encomiendas!,
                address: editingAddress.trim(),
                google_maps_link: editingMapsLink.trim() || undefined
              }
            };
          }
          return d;
        }));
      } else {
        const { error } = await supabase
          .from('orders')
          .update({
            address: editingAddress.trim(),
            google_maps_link: editingMapsLink.trim() || null
          })
          .eq('id', editingOrderId);
          
        if (error) throw error;
        
        // Update local state 'deliveries'
        setDeliveries(prev => prev.map(d => {
          if (d.orders?.id === editingOrderId) {
            return {
              ...d,
              orders: {
                ...d.orders,
                address: editingAddress.trim(),
                google_maps_link: editingMapsLink.trim() || undefined
              }
            };
          }
          return d;
        }));
      }
      
      setShowEditAddressModal(false);
      setEditingOrderId("");
      setEditingAddress("");
      setEditingMapsLink("");
      setEditingIsEncomienda(false);
      alert("Dirección y mapa actualizados correctamente.");
    } catch (err) {
      alert("Error al actualizar la dirección: " + (err as AppError).message);
    } finally {
      setSavingAddress(false);
    }
  };

  const handleUpdateCommunicationStatus = async (deliveryId: string, status: string) => {
    try {
      const { error } = await supabase
        .from('deliveries')
        .update({ communication_status: status })
        .eq('id', deliveryId);
      
      if (error) throw error;
      
      setDeliveries(prev => prev.map(d => {
        if (d.id === deliveryId) {
          return {
            ...d,
            communication_status: status
          };
        }
        return d;
      }));
    } catch (err) {
      alert("Error al actualizar estado de comunicación: " + (err as AppError).message);
    }
  };

  const handleSaveRouteBulk = async () => {
    if (selectedDeliveryIds.size === 0) return;
    if (!bulkCarrierId) {
      alert("Por favor seleccione un Transportista para la asignación masiva.");
      return;
    }

    const toUpdate = filteredPending.filter(d => selectedDeliveryIds.has(d.id));
    const postponedDeliveries = toUpdate.filter(d => {
      if (!d.delivery_date) return false;
      return new Date(bulkDeliveryDate) > new Date(d.delivery_date);
    });

    if (postponedDeliveries.length > 0 && !hasDeclaredRuteoPostponementReason) {
      setPostponedDeliveriesList(postponedDeliveries);
      setShowRuteoPostponementModal(true);
      return;
    }

    try {
      setSavingBulk(true);

      // Check or create route sheet
      let routeSheetId = "";
      
      const { data: existingSheets, error: sheetLookupError } = await supabase
        .from('route_sheets')
        .select('id')
        .eq('carrier_id', bulkCarrierId)
        .eq('delivery_date', bulkDeliveryDate)
        .eq('run_number', bulkRunNumber);
        
      if (sheetLookupError) throw sheetLookupError;
      
      if (existingSheets && existingSheets.length > 0) {
        routeSheetId = existingSheets[0].id;
      } else {
        const { data: newSheet, error: sheetCreateError } = await supabase
          .from('route_sheets')
          .insert({
            carrier_id: bulkCarrierId,
            delivery_date: bulkDeliveryDate,
            run_number: bulkRunNumber,
            status: 'Borrador',
            total_theoretical_cash: 0,
            total_reconciled_cash: 0
          })
          .select('id')
          .single();
          
        if (sheetCreateError) throw sheetCreateError;
        routeSheetId = newSheet.id;
      }

      // Find current max order in same date, carrier & run
      const sameGroup = deliveries.filter(d => 
        d.carrier_id === bulkCarrierId && 
        d.delivery_date === bulkDeliveryDate && 
        d.run_number === bulkRunNumber
      );
      let nextOrder = sameGroup.length > 0 ? Math.max(...sameGroup.map(d => d.delivery_order)) + 1 : 1;

      // Filter to update
      const toUpdate = filteredPending.filter(d => selectedDeliveryIds.has(d.id));

      for (const del of toUpdate) {
        const originalDate = del.delivery_date;
        const isPostponed = originalDate && (new Date(bulkDeliveryDate) > new Date(originalDate));

        const { error } = await supabase
          .from('deliveries')
          .update({
            carrier_id: bulkCarrierId,
            delivery_date: bulkDeliveryDate,
            run_number: bulkRunNumber,
            delivery_order: nextOrder,
            status: 'ruteado',
            route_sheet_id: routeSheetId,
            updated_at: new Date().toISOString()
          })
          .eq('id', del.id);

        if (error) throw error;

        if (isPostponed && hasDeclaredRuteoPostponementReason) {
          await supabase
            .from('delivery_postponements')
            .insert({
              delivery_id: del.id,
              original_date: originalDate,
              new_date: bulkDeliveryDate,
              reason_type: ruteoPostponementReasonType,
              motive: ruteoPostponementMotive || null,
              created_by_name: "Logística / Ruteo"
            });
        }

        nextOrder++;
      }

      alert(`Se asignaron con éxito ${toUpdate.length} pedidos a la hoja de ruta.`);
      setSelectedDeliveryIds(new Set());
      loadAllData();
    } catch (err) {
      alert("Error en asignación masiva: " + (err as AppError).message);
    } finally {
      setSavingBulk(false);
      setHasDeclaredRuteoPostponementReason(false);
      setRuteoPostponementMotive("");
      setRuteoPostponementReasonType('cliente');
    }
  };

  // 1. Plan / Route delivery
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleSaveRoute = async (deliveryId: string) => {
    const carrierId = selectedCarrierForRoute[deliveryId];
    const runNum = runNumberForRoute[deliveryId] || 1;
    const dateVal = deliveryDateForRoute[deliveryId] || new Date().toISOString().split('T')[0];
    const notesVal = notesForRoute[deliveryId] || "";

    if (!carrierId) {
      alert("Por favor seleccione un Transportista.");
      return;
    }

    try {
      // 1. Check or create route sheet in 'Borrador' status
      let routeSheetId = "";
      
      const { data: existingSheets, error: sheetLookupError } = await supabase
        .from('route_sheets')
        .select('id')
        .eq('carrier_id', carrierId)
        .eq('delivery_date', dateVal)
        .eq('run_number', runNum);
        
      if (sheetLookupError) throw sheetLookupError;
      
      if (existingSheets && existingSheets.length > 0) {
        routeSheetId = existingSheets[0].id;
      } else {
        const { data: newSheet, error: sheetCreateError } = await supabase
          .from('route_sheets')
          .insert({
            carrier_id: carrierId,
            delivery_date: dateVal,
            run_number: runNum,
            status: 'Borrador',
            total_theoretical_cash: 0,
            total_reconciled_cash: 0
          })
          .select('id')
          .single();
          
        if (sheetCreateError) throw sheetCreateError;
        routeSheetId = newSheet.id;
      }

      // Find current max order in same date, carrier & run
      const sameGroup = deliveries.filter(d => 
        d.carrier_id === carrierId && 
        d.delivery_date === dateVal && 
        d.run_number === runNum &&
        d.id !== deliveryId
      );
      const nextOrder = sameGroup.length > 0 ? Math.max(...sameGroup.map(d => d.delivery_order)) + 1 : 1;

      const { error } = await supabase
        .from('deliveries')
        .update({
          carrier_id: carrierId,
          delivery_date: dateVal,
          run_number: runNum,
          delivery_order: nextOrder,
          status: 'ruteado',
          route_sheet_id: routeSheetId,
          notes: notesVal || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', deliveryId);

      if (error) throw error;
      alert("Entrega planificada correctamente en la Hoja de Ruta.");
      loadAllData();
    } catch (err) {
      alert("Error al guardar ruteo: " + (err as AppError).message);
    }
  };

  // 2. Start trip (Mark en_recorrido / 'En Viaje')
  const handleStartTrip = async (routeSheetId: string) => {
    try {
      const { error: sheetError } = await supabase
        .from('route_sheets')
        .update({ status: 'En Viaje', updated_at: new Date().toISOString() })
        .eq('id', routeSheetId);
        
      if (sheetError) throw sheetError;

      const groupToStart = deliveries.filter(d => d.route_sheet_id === routeSheetId);
      if (groupToStart.length === 0) return;

      const deliveryIds = groupToStart.map(d => d.id);
      const orderIds = groupToStart.map(d => d.order_id).filter(Boolean);
      
      // Update deliveries
      const { error: delError } = await supabase
        .from('deliveries')
        .update({ status: 'en_recorrido', updated_at: new Date().toISOString() })
        .in('id', deliveryIds);
      if (delError) throw delError;
      
      // Update orders to 'En Reparto'
      const { error: orderError } = await supabase
        .from('orders')
        .update({ status: 'En Reparto' })
        .in('id', orderIds);
      if (orderError) throw orderError;

      alert("Hoja de ruta iniciada. Los pedidos están en recorrido.");
      loadAllData();
    } catch (err) {
      alert("Error al iniciar recorrido: " + (err as AppError).message);
    }
  };

  const handleDeleteRouteSheet = async (routeSheetId: string) => {
    if (!confirm("¿Está seguro de que desea eliminar esta hoja de ruta? Todos los pedidos volverán a estar pendientes en la pestaña de Pendientes.")) {
      return;
    }

    try {
      setLoading(true);

      // 1. Get deliveries associated with this route sheet
      const { data: routeDeliveries, error: getDeliveriesError } = await supabase
        .from('deliveries')
        .select('id, order_id')
        .eq('route_sheet_id', routeSheetId);

      if (getDeliveriesError) throw getDeliveriesError;

      if (routeDeliveries && routeDeliveries.length > 0) {
        const deliveryIds = routeDeliveries.map(d => d.id);
        const orderIds = routeDeliveries.map(d => d.order_id).filter(Boolean);

        // 2. Update deliveries status back to 'pendiente_ruteo' and clear carrier/route details
        const { error: updateDeliveriesError } = await supabase
          .from('deliveries')
          .update({
            status: 'pendiente_ruteo',
            route_sheet_id: null,
            carrier_id: null,
            delivery_order: 1,
            run_number: 1,
            updated_at: new Date().toISOString()
          })
          .in('id', deliveryIds);

        if (updateDeliveriesError) throw updateDeliveriesError;

        // 3. Update orders status back to 'Pendiente'
        if (orderIds.length > 0) {
          const { error: updateOrdersError } = await supabase
            .from('orders')
            .update({
              status: 'Pendiente'
            })
            .in('id', orderIds);

          if (updateOrdersError) throw updateOrdersError;
        }
      }

      // 4. Delete the route sheet record itself
      const { error: deleteSheetError } = await supabase
        .from('route_sheets')
        .delete()
        .eq('id', routeSheetId);

      if (deleteSheetError) throw deleteSheetError;

      alert("Hoja de ruta eliminada. Los pedidos han vuelto al listado de pendientes.");
      loadAllData();
    } catch (err) {
      alert("Error al eliminar la hoja de ruta: " + (err as AppError).message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetToDraft = async (routeSheetId: string) => {
    if (!confirm("¿Está seguro de que desea volver esta hoja de ruta a Borrador? Los pedidos volverán a estar pendientes de despacho y su estado volverá a 'Pendiente'.")) {
      return;
    }

    try {
      setLoading(true);

      // 1. Get deliveries associated with this route sheet
      const { data: routeDeliveries, error: getDeliveriesError } = await supabase
        .from('deliveries')
        .select('id, order_id')
        .eq('route_sheet_id', routeSheetId);

      if (getDeliveriesError) throw getDeliveriesError;

      if (routeDeliveries && routeDeliveries.length > 0) {
        const deliveryIds = routeDeliveries.map(d => d.id);
        const orderIds = routeDeliveries.map(d => d.order_id).filter(Boolean);

        // 2. Update deliveries status back to 'ruteado'
        const { error: updateDeliveriesError } = await supabase
          .from('deliveries')
          .update({
            status: 'ruteado',
            updated_at: new Date().toISOString()
          })
          .in('id', deliveryIds);

        if (updateDeliveriesError) throw updateDeliveriesError;

        // 3. Update orders status back to 'Pendiente'
        if (orderIds.length > 0) {
          const { error: updateOrdersError } = await supabase
            .from('orders')
            .update({
              status: 'Pendiente'
            })
            .in('id', orderIds);

          if (updateOrdersError) throw updateOrdersError;
        }
      }

      // 4. Update the route sheet status back to 'Borrador'
      const { error: updateSheetError } = await supabase
        .from('route_sheets')
        .update({
          status: 'Borrador',
          updated_at: new Date().toISOString()
        })
        .eq('id', routeSheetId);

      if (updateSheetError) throw updateSheetError;

      alert("Hoja de ruta revertida a Borrador exitosamente.");
      loadAllData();
    } catch (err) {
      alert("Error al revertir a borrador: " + (err as AppError).message);
    } finally {
      setLoading(false);
    }
  };

  // 3. Mark Complete (with draft payments dialog) or Fail
  const handleOpenDeliveryPayment = (del: Delivery) => {
    setProcessingDelivery(del);
    setModalPayments([]);
    setPaymentAmount("");
    setPaymentNotes("");
    setShowDeliveryPaymentModal(true);
  };

  const handleAddModalPayment = () => {
    const amt = parseFloat(paymentAmount);
    if (isNaN(amt) || amt <= 0) {
      alert("Ingrese un monto válido.");
      return;
    }
    if (!selectedMethodId) {
      alert("Seleccione un medio de pago.");
      return;
    }
    
    setModalPayments(prev => [
      ...prev,
      {
        payment_method_id: selectedMethodId,
        amount: amt,
        notes: paymentNotes
      }
    ]);
    setPaymentAmount("");
    setPaymentNotes("");
  };

  const handleRemoveModalPayment = (idx: number) => {
    setModalPayments(prev => prev.filter((_, i) => i !== idx));
  };

  const handleConfirmDeliveryPayments = async () => {
    if (!processingDelivery) return;
    
    try {
      setLoading(true);
      
      // 1. Insert draft payments
      const paymentsToInsert = modalPayments.map(p => ({
        client_id: processingDelivery.orders?.client_id,
        order_id: processingDelivery.order_id,
        amount: p.amount,
        currency: 'ARS',
        exchange_rate: 1,
        payment_method_id: p.payment_method_id,
        notes: p.notes || null,
        created_by: currentUserId || null,
        status: 'Borrador',
        route_sheet_id: processingDelivery.route_sheet_id
      }));

      if (paymentsToInsert.length > 0) {
        const { error: payError } = await supabase
          .from('client_payments')
          .insert(paymentsToInsert);
        if (payError) throw payError;
      }

      // 2. Update delivery status
      const { error: delError } = await supabase
        .from('deliveries')
        .update({ 
          status: 'entregado', 
          updated_at: new Date().toISOString() 
        })
        .eq('id', processingDelivery.id);

      if (delError) throw delError;

      alert("Entrega registrada con éxito. Los cobros quedaron asentados como borradores pendientes de conciliación.");
      setShowDeliveryPaymentModal(false);
      setProcessingDelivery(null);
      loadAllData();
    } catch (err) {
      alert("Error al guardar entrega: " + (err as AppError).message);
    } finally {
      setLoading(false);
    }
  };

  const handleSetStatusFailed = async (deliveryId: string, notes: string) => {
    try {
      setLoading(true);
      
      const { error } = await supabase
        .from('deliveries')
        .update({ 
          status: 'fallido', 
          notes: notes || null,
          updated_at: new Date().toISOString() 
        })
        .eq('id', deliveryId);

      if (error) throw error;
      
      // Reset order status to 'Pendiente' so it can be scheduled again
      const delivery = deliveries.find(d => d.id === deliveryId);
      if (delivery?.order_id) {
        await supabase
          .from('orders')
          .update({ status: 'Pendiente' })
          .eq('id', delivery.order_id);
      }

      alert("Entrega fallida registrada. El pedido vuelve a estar disponible para ruteo.");
      setSelectedDeliveryToFail(null);
      setFailNotes("");
      loadAllData();
    } catch (err) {
      alert("Error al actualizar estado: " + (err as AppError).message);
    } finally {
      setLoading(false);
    }
  };

  const handleSetStatusAnnulled = async (deliveryId: string, notes: string) => {
    try {
      setLoading(true);
      
      const { error } = await supabase
        .rpc('logistics_annul_order', {
          p_delivery_id: deliveryId,
          p_notes: notes
        });

      if (error) throw error;
      
      alert("Pedido enviado a revisión. La entrega fue registrada como fallida.");
      setSelectedDeliveryToFail(null);
      setFailNotes("");
      loadAllData();
    } catch (err) {
      alert("Error al anular pedido: " + (err as AppError).message);
    } finally {
      setLoading(false);
    }
  };

  const handleTableMarkFailed = async (deliveryId: string) => {
    const delivery = deliveries.find(d => d.id === deliveryId);
    const notes = prompt("Ingrese el motivo del fallo / rechazo (ej: Cliente ausente):");
    if (notes === null) return;
    if (!notes.trim()) {
      alert("Debe ingresar un motivo para registrar el fallo.");
      return;
    }
    
    if (delivery?.order_id) {
      const options = confirm(
        "¿Desea volver a poner el pedido en PENDIENTE para re-rutarlo en el futuro?\n\n" +
        "Aceptar = Re-rutar (Volver a Pendiente)\n" +
        "Cancelar = Anular Pedido (Enviar a revisión del vendedor)"
      );
      if (options) {
        await handleSetStatusFailed(deliveryId, notes.trim());
      } else {
        await handleSetStatusAnnulled(deliveryId, notes.trim());
      }
    } else {
      await handleSetStatusFailed(deliveryId, notes.trim());
    }
  };

  const handleOpenEditOrder = async (order: RouteOrder) => {
    setEditingOrder(order);
    setEditCustomerName(order.customer_name || "");
    setEditAddress(order.address || "");
    setEditLocality(order.locality || "");
    setEditGoogleMapsLink(order.google_maps_link || "");
    setEditDeliveryNotes(order.delivery_notes || "");
    setEditDeliveryDetail(order.delivery_detail || "");
    
    // Map order items
    const items = (order.order_items || []).map(item => ({
      id: item.product_id || null,
      product_name: item.product_name,
      quantity: item.quantity,
      unit_price: item.unit_price || 0
    }));
    setEditingOrderItems(items);
    setEditChangeReason("");
    setShowEditOrderModal(true);
    
    await loadProducts();
  };

  const calculateEditTotal = () => {
    const subtotal = editingOrderItems.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
    const currentTotals = editingOrder?.totals || {};
    const freight = Number(currentTotals.freight || 0);
    const pm = paymentMethods.find(p => p.id === editingOrder?.payment_method_id);
    const surchargePercentage = pm?.surcharge_percentage || 0;
    const computedSurcharge = subtotal * (surchargePercentage / 100);
    
    const hasTax = Number(currentTotals.tax || 0) > 0;
    const computedTax = hasTax ? (subtotal + computedSurcharge + freight) * 0.21 : 0;
    
    const computedTotal = subtotal + computedSurcharge + freight + computedTax;
    const depositAmount = Number(currentTotals.deposit_amount || 0);
    const computedPendingBalance = Math.max(0, computedTotal - depositAmount);
    
    return {
      subtotal,
      freight,
      tax: computedTax,
      payment_surcharges: computedSurcharge,
      total: computedTotal,
      has_deposit: currentTotals.has_deposit || false,
      deposit_amount: depositAmount,
      deposit_receipt_url: currentTotals.deposit_receipt_url || "",
      pending_balance: computedPendingBalance
    };
  };

  const handleSaveEditOrder = async () => {
    if (!editingOrder) return;
    if (!editCustomerName.trim()) {
      alert("El nombre del cliente es obligatorio.");
      return;
    }
    if (!editAddress.trim()) {
      alert("La dirección es obligatoria.");
      return;
    }
    if (!editLocality.trim()) {
      alert("La localidad es obligatoria.");
      return;
    }
    if (editingOrderItems.length === 0) {
      alert("Debe haber al menos un producto en el pedido.");
      return;
    }
    if (!editChangeReason.trim()) {
      alert("Debe ingresar la justificación / motivo del cambio.");
      return;
    }
    
    setIsSavingEdit(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No hay un usuario autenticado.");
      
      let sellerName = user.email || "Usuario";
      const { data: sellerProfile } = await supabase
        .from('sellers')
        .select('full_name')
        .eq('id', user.id)
        .single();
      if (sellerProfile?.full_name) {
        sellerName = sellerProfile.full_name;
      }
      
      const { data: oldDbItems, error: oldItemsErr } = await supabase
        .from('order_items')
        .select('product_id, product_name, quantity, unit_price')
        .eq('order_id', editingOrder.id);
      
      if (oldItemsErr) throw oldItemsErr;
      
      const newTotals = calculateEditTotal();
      
      const originalSnapshot = {
        customer_name: editingOrder.customer_name,
        address: editingOrder.address,
        locality: editingOrder.locality,
        google_maps_link: editingOrder.google_maps_link,
        delivery_notes: editingOrder.delivery_notes,
        delivery_detail: editingOrder.delivery_detail,
        total_amount: editingOrder.total_amount,
        items: (oldDbItems || []).map(item => ({
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: item.quantity,
          unit_price: item.unit_price
        }))
      };
      
      const modifiedSnapshot = {
        customer_name: editCustomerName.trim(),
        address: editAddress.trim(),
        locality: editLocality.trim(),
        google_maps_link: editGoogleMapsLink.trim() || undefined,
        delivery_notes: editDeliveryNotes.trim() || undefined,
        delivery_detail: editDeliveryDetail.trim() || undefined,
        total_amount: newTotals.total,
        items: editingOrderItems.map(item => ({
          product_id: item.id,
          product_name: item.product_name,
          quantity: item.quantity,
          unit_price: item.unit_price
        }))
      };
      
      const { error: orderUpdateErr } = await supabase
        .from('orders')
        .update({
          customer_name: editCustomerName.trim(),
          address: editAddress.trim(),
          locality: editLocality.trim(),
          google_maps_link: editGoogleMapsLink.trim() || null,
          delivery_notes: editDeliveryNotes.trim() || null,
          delivery_detail: editDeliveryDetail.trim() || null,
          total_amount: newTotals.total,
          totals: newTotals,
        })
        .eq('id', editingOrder.id);
      
      if (orderUpdateErr) throw orderUpdateErr;
      
      if (oldDbItems && oldDbItems.length > 0) {
        const cancelTxs = oldDbItems
          .filter(item => item.product_id !== null)
          .map(item => ({
            productId: item.product_id!,
            quantity: item.quantity,
            type: 'Cancelacion Pedido' as const,
            referenceId: editingOrder.id,
            userId: user.id
          }));
        if (cancelTxs.length > 0) {
          await createBulkStockTransactions(supabase, cancelTxs);
        }
      }
      
      const { error: deleteItemsErr } = await supabase
        .from('order_items')
        .delete()
        .eq('order_id', editingOrder.id);
      
      if (deleteItemsErr) throw deleteItemsErr;
      
      const itemsToInsert = editingOrderItems.map(item => ({
        order_id: editingOrder.id,
        product_id: item.id,
        product_name: item.product_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        historical_unit_cost: 0,
        discount_percentage: 0
      }));
      
      const { error: insertItemsErr } = await supabase
        .from('order_items')
        .insert(itemsToInsert);
      
      if (insertItemsErr) throw insertItemsErr;
      
      const reserveTxs = editingOrderItems
        .filter(item => item.id !== null)
        .map(item => ({
          productId: item.id!,
          quantity: item.quantity,
          type: 'Reserva Pedido' as const,
          referenceId: editingOrder.id,
          userId: user.id
        }));
      if (reserveTxs.length > 0) {
        await createBulkStockTransactions(supabase, reserveTxs);
      }
      
      const { error: historyErr } = await supabase
        .from('order_history')
        .insert({
          order_id: editingOrder.id,
          changed_by_id: user.id,
          changed_by_name: sellerName,
          change_reason: editChangeReason.trim(),
          original_data: originalSnapshot,
          modified_data: modifiedSnapshot
        });
      
      if (historyErr) throw historyErr;
      
      alert("Pedido actualizado con éxito e inventario sincronizado.");
      setShowEditOrderModal(false);
      setPreviewDelivery(null);
      loadAllData();
    } catch (err) {
      alert("Error al actualizar pedido: " + (err as Error).message);
    } finally {
      setIsSavingEdit(false);
    }
  };

  // 4. Financial Reconciliation Dialog
  const handleOpenReconciliation = async (sheet: RouteSheet) => {
    setReconcilingRouteSheet(sheet);
    setActualCashInput("");
    setReconciliationNotes("");
    setSubmittingReconciliation(false);
    
    // Fetch draft payments associated with this route sheet
    try {
      const { data: drafts, error } = await supabase
        .from('client_payments')
        .select('*, payment_methods(name), orders(customer_name, legacy_code, id)')
        .eq('route_sheet_id', sheet.id)
        .eq('status', 'Borrador');
        
      if (error) throw error;
      setReconciliationDrafts((drafts || []) as ReconciliationDraft[]);
      setShowReconciliationModal(true);
    } catch (err) {
      alert("Error al cargar borradores de pago: " + (err as AppError).message);
    }
  };

  const handleConfirmReconciliation = async () => {
    if (!reconcilingRouteSheet) return;
    
    const cashMethod = paymentMethods.find(m => m.name.toLowerCase().includes('efectivo'));
    const theoreticalCash = reconciliationDrafts
      .filter(p => p.payment_method_id === cashMethod?.id)
      .reduce((sum, p) => sum + Number(p.amount), 0);
      
    const realCash = parseFloat(actualCashInput);
    if (isNaN(realCash)) {
      alert("Ingrese el monto de efectivo físico real recibido.");
      return;
    }
    
    try {
      setSubmittingReconciliation(true);
      
      // 1. Update Route Sheet status to 'Cerrada' and save cash details
      const { error: sheetErr } = await supabase
        .from('route_sheets')
        .update({
          status: 'Cerrada',
          total_theoretical_cash: theoreticalCash,
          total_reconciled_cash: realCash,
          notes: reconciliationNotes || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', reconcilingRouteSheet.id);
      if (sheetErr) throw sheetErr;
      
      // 2. Approve draft payments in route sheet (status = 'Aprobado')
      const { error: payErr } = await supabase
        .from('client_payments')
        .update({ status: 'Aprobado' })
        .eq('route_sheet_id', reconcilingRouteSheet.id)
        .eq('status', 'Borrador');
      if (payErr) throw payErr;
      
      // 3. Create cash transactions for approved cash payments if cash register is open
      const cashDrafts = reconciliationDrafts.filter(p => p.payment_method_id === cashMethod?.id);
      
      if (openRegister && cashDrafts.length > 0) {
        const carrier = carriers.find(c => c.id === reconcilingRouteSheet.carrier_id);
        
        let addedExpectedBalance = 0;
        for (const payment of cashDrafts) {
          addedExpectedBalance += Number(payment.amount);
          
          const deliveryCode = payment.orders?.legacy_code || payment.orders?.id.substring(0, 8) || "S/C";
          
          const { data: tx, error: txError } = await supabase
            .from('cash_transactions')
            .insert({
              register_id: openRegister.id,
              type: 'ingreso',
              category: 'cobro_pedido',
              amount: payment.amount,
              currency: 'ARS',
              payment_method_id: payment.payment_method_id,
              reference_id: payment.id,
              notes: `Rendición Hoja de Ruta - Chofer ${carrier?.name || "Desconocido"} - Rec. ${reconcilingRouteSheet.run_number} - Delivery: ${deliveryCode}`,
              created_by: currentUserId,
              concept: `Cobro Pedido [${deliveryCode}] - ${payment.orders?.customer_name || "Cliente"}`
            })
            .select('id')
            .single();
            
          if (txError) throw txError;
          
          // Link transaction to payment
          await supabase
            .from('client_payments')
            .update({ cash_transaction_id: tx.id })
            .eq('id', payment.id);
        }
        
        // Update cash register balance
        await supabase
          .from('cash_registers')
          .update({
            expected_balance_ars: openRegister.expected_balance_ars + addedExpectedBalance
          })
          .eq('id', openRegister.id);
      }
      
      // 4. Update orders status to 'Entregado' (if delivered) and recalculate payment_status
      const deliveriesInSheet = deliveries.filter(d => d.route_sheet_id === reconcilingRouteSheet.id);
      
      for (const del of deliveriesInSheet) {
        if (del.status === 'entregado') {
          // Calculate new payment status based on all approved payments for this order
          const { data: approvedPayments } = await supabase
            .from('client_payments')
            .select('amount')
            .eq('order_id', del.order_id)
            .eq('status', 'Aprobado');
            
          const totalPaid = approvedPayments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;
          const orderTotal = del.orders?.total_amount || 0;
          
          let payStatus = 'Pendiente';
          if (totalPaid >= orderTotal) {
            payStatus = 'Abonado';
          } else if (totalPaid > 0) {
            payStatus = 'Seniado';
          }
          
          await supabase
            .from('orders')
            .update({ 
              status: 'Entregado',
              payment_status: payStatus
            })
            .eq('id', del.order_id);
        } else if (del.status === 'fallido') {
          await supabase
            .from('orders')
            .update({ status: 'Pendiente' })
            .eq('id', del.order_id);
        }
      }
      
      alert("Hoja de Ruta conciliada, cobros aprobados y pedidos finalizados.");
      setShowReconciliationModal(false);
      setReconcilingRouteSheet(null);
      loadAllData();
      fetchUserAndRegister();
    } catch (err) {
      alert("Error al conciliar: " + (err as AppError).message);
    } finally {
      setSubmittingReconciliation(false);
    }
  };

  const handleDirectCloseRouteSheet = async (sheet: RouteSheet) => {
    if (!confirm(`¿Estás seguro de cerrar la Hoja de Ruta del chofer? Todos los pedidos entregados se marcarán como finalizados y cobrados.`)) {
      return;
    }

    try {
      // 1. Fetch draft payments associated with this route sheet
      const { data: reconciliationDrafts, error: draftsErr } = await supabase
        .from('client_payments')
        .select('*, payment_methods(name), orders(customer_name, legacy_code, id)')
        .eq('route_sheet_id', sheet.id)
        .eq('status', 'Borrador');
        
      if (draftsErr) throw draftsErr;

      const cashMethod = paymentMethods.find(m => m.name.toLowerCase().includes('efectivo'));
      const theoreticalCash = (reconciliationDrafts || [])
        .filter(p => p.payment_method_id === cashMethod?.id)
        .reduce((sum, p) => sum + Number(p.amount), 0);

      // 2. Update Route Sheet status to 'Cerrada' and save cash details (both actual and theoretical cash are equal since they are fully collected)
      const { error: sheetErr } = await supabase
        .from('route_sheets')
        .update({
          status: 'Cerrada',
          total_theoretical_cash: theoreticalCash,
          total_reconciled_cash: theoreticalCash,
          notes: "Cierre automático directo",
          updated_at: new Date().toISOString()
        })
        .eq('id', sheet.id);
      if (sheetErr) throw sheetErr;
      
      // 3. Approve draft payments in route sheet (status = 'Aprobado')
      const { error: payErr } = await supabase
        .from('client_payments')
        .update({ status: 'Aprobado' })
        .eq('route_sheet_id', sheet.id)
        .eq('status', 'Borrador');
      if (payErr) throw payErr;
      
      // 4. Create cash transactions for approved cash payments if cash register is open
      const cashDrafts = (reconciliationDrafts || []).filter(p => p.payment_method_id === cashMethod?.id);
      
      if (openRegister && cashDrafts.length > 0) {
        const carrier = carriers.find(c => c.id === sheet.carrier_id);
        
        let addedExpectedBalance = 0;
        for (const payment of cashDrafts) {
          addedExpectedBalance += Number(payment.amount);
          
          const deliveryCode = payment.orders?.legacy_code || payment.orders?.id.substring(0, 8) || "S/C";
          
          const { data: tx, error: txError } = await supabase
            .from('cash_transactions')
            .insert({
              register_id: openRegister.id,
              type: 'ingreso',
              category: 'cobro_pedido',
              amount: payment.amount,
              currency: 'ARS',
              payment_method_id: payment.payment_method_id,
              reference_id: payment.id,
              notes: `Rendición Automática - Chofer ${carrier?.name || "Desconocido"} - Rec. ${sheet.run_number} - Delivery: ${deliveryCode}`,
              created_by: currentUserId,
              concept: `Cobro Pedido [${deliveryCode}] - ${payment.orders?.customer_name || "Cliente"}`
            })
            .select('id')
            .single();
            
          if (txError) throw txError;
          
          // Link transaction to payment
          await supabase
            .from('client_payments')
            .update({ cash_transaction_id: tx.id })
            .eq('id', payment.id);
        }
        
        // Update cash register balance
        await supabase
          .from('cash_registers')
          .update({
            expected_balance_ars: openRegister.expected_balance_ars + addedExpectedBalance
          })
          .eq('id', openRegister.id);
      }
      
      // 5. Update orders status to 'Entregado' (if delivered) and force payment_status = 'Abonado'
      const deliveriesInSheet = deliveries.filter(d => d.route_sheet_id === sheet.id);
      
      for (const del of deliveriesInSheet) {
        if (del.status === 'entregado') {
          // Force status 'Entregado' and payment_status 'Abonado' as per user request
          await supabase
            .from('orders')
            .update({ 
              status: 'Entregado',
              payment_status: 'Abonado'
            })
            .eq('id', del.order_id);
        } else if (del.status === 'fallido') {
          await supabase
            .from('orders')
            .update({ status: 'Pendiente' })
            .eq('id', del.order_id);
        }
      }
      
      alert("Hoja de Ruta cerrada con éxito. Todos los cobros fueron aprobados y pedidos finalizados.");
      loadAllData();
      fetchUserAndRegister();
    } catch (err) {
      alert("Error al cerrar la hoja de ruta: " + (err as AppError).message);
    }
  };

  // 5. Take Away (Retiro en Depósito) Flow
  const handleOpenTakeAwayCobro = (order: RouteOrder) => {
    setProcessingTakeAwayOrder(order);
    setTakeAwayAmount(order.total_amount.toString());
    setTakeAwayNotes("");
    setShowTakeAwayModal(true);
  };

  const handleConfirmTakeAway = async () => {
    if (!processingTakeAwayOrder) return;
    
    const amt = parseFloat(takeAwayAmount);
    if (isNaN(amt) || amt <= 0) {
      alert("Ingrese un monto válido.");
      return;
    }
    
    try {
      setLoading(true);
      
      // 1. Insert approved payment
      const { data: payment, error: payError } = await supabase
        .from('client_payments')
        .insert({
          client_id: processingTakeAwayOrder.client_id,
          order_id: processingTakeAwayOrder.id,
          amount: amt,
          currency: 'ARS',
          exchange_rate: 1,
          payment_method_id: takeAwayMethodId,
          notes: takeAwayNotes || null,
          created_by: currentUserId || null,
          status: 'Aprobado'
        })
        .select('id')
        .single();
        
      if (payError) throw payError;
      
      // 2. Create cash transaction if method is cash and register is open
      const selectedMethod = paymentMethods.find(m => m.id === takeAwayMethodId);
      const isCash = selectedMethod?.name.toLowerCase().includes('efectivo');
      
      if (openRegister && isCash && payment) {
        const deliveryCode = processingTakeAwayOrder.legacy_code || processingTakeAwayOrder.id.substring(0, 8);
        const { data: tx, error: txError } = await supabase
          .from('cash_transactions')
          .insert({
            register_id: openRegister.id,
            type: 'ingreso',
            category: 'cobro_pedido',
            amount: amt,
            currency: 'ARS',
            payment_method_id: takeAwayMethodId,
            reference_id: payment.id,
            notes: `Retiro en Depósito (Take Away) - Caja Central - Delivery: ${deliveryCode}`,
            created_by: currentUserId,
            concept: `Cobro Retiro [${deliveryCode}] - ${processingTakeAwayOrder.customer_name}`
          })
          .select('id')
          .single();
          
        if (txError) throw txError;
        
        await supabase
          .from('client_payments')
          .update({ cash_transaction_id: tx.id })
          .eq('id', payment.id);
          
        // Update cash register expected balance
        await supabase
          .from('cash_registers')
          .update({
            expected_balance_ars: openRegister.expected_balance_ars + amt
          })
          .eq('id', openRegister.id);
      }
      
      // 3. Update order
      const { error: orderError } = await supabase
        .from('orders')
        .update({
          status: 'Entregado',
          payment_status: amt >= processingTakeAwayOrder.total_amount ? 'Abonado' : 'Seniado'
        })
        .eq('id', processingTakeAwayOrder.id);
        
      if (orderError) throw orderError;

      // 4. Update associated delivery to 'entregado'
      const { error: delError } = await supabase
        .from('deliveries')
        .update({
          status: 'entregado',
          updated_at: new Date().toISOString()
        })
        .eq('order_id', processingTakeAwayOrder.id);
        
      if (delError) throw delError;
      
      alert("Retiro en Depósito entregado y cobrado de forma instantánea.");
      setShowTakeAwayModal(false);
      setProcessingTakeAwayOrder(null);
      loadPendingTakeAwayOrders();
      loadAllData();
      fetchUserAndRegister();
    } catch (err) {
      alert("Error al registrar retiro: " + (err as AppError).message);
    } finally {
      setLoading(false);
    }
  };

  // 6. Change stop order within route
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleChangeOrder = async (deliveryId: string, direction: 'up' | 'down') => {
    const current = deliveries.find(d => d.id === deliveryId);
    if (!current) return;

    const sameGroup = deliveries.filter(d => 
      d.carrier_id === current.carrier_id && 
      d.delivery_date === current.delivery_date && 
      d.run_number === current.run_number
    ).sort((a, b) => a.delivery_order - b.delivery_order);

    const currentIndex = sameGroup.findIndex(d => d.id === deliveryId);
    if (currentIndex === -1) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= sameGroup.length) return;

    const target = sameGroup[targetIndex];

    try {
      const { error: err1 } = await supabase
        .from('deliveries')
        .update({ delivery_order: target.delivery_order })
        .eq('id', current.id);
      
      if (err1) throw err1;

      const { error: err2 } = await supabase
        .from('deliveries')
        .update({ delivery_order: current.delivery_order })
        .eq('id', target.id);

      if (err2) throw err2;

      loadAllData();
    } catch (err) {
      alert("Error al reordenar: " + (err as AppError).message);
    }
  };

  // Carrier Management
  const handleSaveCarrier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!carrierName) return;
    try {
      if (selectedCarrierId) {
        const { error } = await supabase
          .from('carriers')
          .update({
            name: carrierName,
            vehicle_description: carrierVehicle || null,
            plate_number: carrierPlate || null,
            phone: carrierPhone || null
          })
          .eq('id', selectedCarrierId);
        if (error) throw error;
        alert("Transportista actualizado.");
      } else {
        const { error } = await supabase
          .from('carriers')
          .insert({
            name: carrierName,
            vehicle_description: carrierVehicle || null,
            plate_number: carrierPlate || null,
            phone: carrierPhone || null,
            is_active: true
          });
        if (error) throw error;
        alert("Transportista creado.");
      }
      setShowCarrierModal(false);
      setCarrierName("");
      setCarrierVehicle("");
      setCarrierPlate("");
      setCarrierPhone("");
      setSelectedCarrierId(null);
      loadAllData();
    } catch (err) {
      alert("Error al guardar chofer: " + (err as AppError).message);
    }
  };

  const handleEditCarrier = (c: Carrier) => {
    setSelectedCarrierId(c.id);
    setCarrierName(c.name);
    setCarrierVehicle(c.vehicle_description || "");
    setCarrierPlate(c.plate_number || "");
    setCarrierPhone(c.phone || "");
    setShowCarrierModal(true);
  };

  const handleToggleCarrierActive = async (id: string, active: boolean) => {
    try {
      const { error } = await supabase
        .from('carriers')
        .update({ is_active: !active })
        .eq('id', id);
      if (error) throw error;
      loadAllData();
    } catch (err) {
      alert("Error: " + (err as AppError).message);
    }
  };

  const toggleExpandCarrier = (carrierId: string) => {
    setExpandedCarriers(prev => ({
      ...prev,
      [carrierId]: !prev[carrierId]
    }));
  };

  // Vehicle management handlers
  const handleSaveVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicleType || !vehiclePlate || !vehicleCarrierId) {
      alert("Tipo de vehículo y patente son requeridos.");
      return;
    }
    try {
      const payload = {
        carrier_id: vehicleCarrierId,
        vehicle_type: vehicleType,
        plate_number: vehiclePlate,
        max_weight_kg: vehicleMaxWeight ? Number(vehicleMaxWeight) : null,
        max_volume_m3: vehicleMaxVolume ? Number(vehicleMaxVolume) : null,
        max_speed_kmh: vehicleMaxSpeed ? Number(vehicleMaxSpeed) : null,
        is_active: vehicleActive
      };

      if (selectedVehicleId) {
        const { error } = await supabase
          .from('vehicles')
          .update(payload)
          .eq('id', selectedVehicleId);
        if (error) throw error;
        alert("Vehículo actualizado.");
      } else {
        const { error } = await supabase
          .from('vehicles')
          .insert(payload);
        if (error) throw error;
        alert("Vehículo agregado.");
      }

      setShowVehicleModal(false);
      setSelectedVehicleId(null);
      setVehicleCarrierId(null);
      setVehicleType("");
      setVehiclePlate("");
      setVehicleMaxWeight("");
      setVehicleMaxVolume("");
      setVehicleMaxSpeed("");
      setVehicleActive(true);
      loadAllData();
    } catch (err) {
      alert("Error al guardar vehículo: " + (err as AppError).message);
    }
  };

  const handleEditVehicle = (v: Vehicle) => {
    setSelectedVehicleId(v.id);
    setVehicleCarrierId(v.carrier_id);
    setVehicleType(v.vehicle_type);
    setVehiclePlate(v.plate_number);
    setVehicleMaxWeight(v.max_weight_kg ? String(v.max_weight_kg) : "");
    setVehicleMaxVolume(v.max_volume_m3 ? String(v.max_volume_m3) : "");
    setVehicleMaxSpeed(v.max_speed_kmh ? String(v.max_speed_kmh) : "");
    setVehicleActive(v.is_active);
    setShowVehicleModal(true);
  };

  const handleToggleVehicleActive = async (id: string, active: boolean) => {
    try {
      const { error } = await supabase
        .from('vehicles')
        .update({ is_active: !active })
        .eq('id', id);
      if (error) throw error;
      loadAllData();
    } catch (err) {
      alert("Error al cambiar estado de vehículo: " + (err as AppError).message);
    }
  };

  const handleDeleteVehicle = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar este vehículo?")) return;
    try {
      const { error } = await supabase
        .from('vehicles')
        .delete()
        .eq('id', id);
      if (error) throw error;
      alert("Vehículo eliminado.");
      loadAllData();
    } catch (err) {
      alert("Error al eliminar vehículo: " + (err as AppError).message);
    }
  };

  // Rate management handlers
  const handleSaveRate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rateName || !rateStartDate || !rateCarrierId) {
      alert("Nombre de la tarifa y fecha de inicio son requeridos.");
      return;
    }
    try {
      const payload = {
        carrier_id: rateCarrierId,
        name: rateName,
        daily_rate: Number(rateDailyRate) || 0,
        hourly_rate: rateHourlyRate ? Number(rateHourlyRate) : null,
        overtime_hourly_rate: rateOvertimeHourlyRate ? Number(rateOvertimeHourlyRate) : null,
        assistant_rate: rateAssistantRate ? Number(rateAssistantRate) : null,
        base_kms: Number(rateBaseKms) || 0,
        extra_km_rate: Number(rateExtraKmRate) || 0,
        includes_tolls: rateIncludesTolls,
        logistics_zone_ids: rateLogisticsZoneIds.length > 0 ? rateLogisticsZoneIds : null,
        start_date: rateStartDate,
        end_date: rateEndDate || null,
        is_active: rateActive
      };

      if (selectedRateId) {
        const { error } = await supabase
          .from('carrier_rates')
          .update(payload)
          .eq('id', selectedRateId);
        if (error) throw error;
        alert("Tarifa actualizada.");
      } else {
        const { error } = await supabase
          .from('carrier_rates')
          .insert(payload);
        if (error) throw error;
        alert("Tarifa agregada.");
      }

      setShowRateModal(false);
      setSelectedRateId(null);
      setRateCarrierId(null);
      setRateName("");
      setRateDailyRate("");
      setRateHourlyRate("");
      setRateOvertimeHourlyRate("");
      setRateAssistantRate("");
      setRateBaseKms("");
      setRateExtraKmRate("");
      setRateIncludesTolls(false);
      setRateLogisticsZoneIds([]);
      setRateStartDate(new Date().toISOString().split('T')[0]);
      setRateEndDate("");
      setRateActive(true);
      loadAllData();
    } catch (err) {
      alert("Error al guardar tarifa: " + (err as AppError).message);
    }
  };

  const handleEditRate = (r: CarrierRate) => {
    setSelectedRateId(r.id);
    setRateCarrierId(r.carrier_id);
    setRateName(r.name);
    setRateDailyRate(String(r.daily_rate));
    setRateHourlyRate(r.hourly_rate ? String(r.hourly_rate) : "");
    setRateOvertimeHourlyRate(r.overtime_hourly_rate ? String(r.overtime_hourly_rate) : "");
    setRateAssistantRate(r.assistant_rate ? String(r.assistant_rate) : "");
    setRateBaseKms(String(r.base_kms));
    setRateExtraKmRate(String(r.extra_km_rate));
    setRateIncludesTolls(r.includes_tolls);
    setRateLogisticsZoneIds(r.logistics_zone_ids || []);
    setRateStartDate(r.start_date);
    setRateEndDate(r.end_date || "");
    setRateActive(r.is_active);
    setShowRateModal(true);
  };

  const handleToggleRateActive = async (id: string, active: boolean) => {
    try {
      const { error } = await supabase
        .from('carrier_rates')
        .update({ is_active: !active })
        .eq('id', id);
      if (error) throw error;
      loadAllData();
    } catch (err) {
      alert("Error al cambiar estado de tarifa: " + (err as AppError).message);
    }
  };

  const handleDeleteRate = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar esta tarifa?")) return;
    try {
      const { error } = await supabase
        .from('carrier_rates')
        .delete()
        .eq('id', id);
      if (error) throw error;
      alert("Tarifa eliminada.");
      loadAllData();
    } catch (err) {
      alert("Error al eliminar tarifa: " + (err as AppError).message);
    }
  };

  // Payout calculation
  const getCalculatedSettlementCost = () => {
    if (!settlementSelectedRateId) return 0;
    const rate = carrierRates.find(r => r.id === settlementSelectedRateId);
    if (!rate) return 0;

    const daily = Number(rate.daily_rate) || 0;
    const otHours = Number(settlementActualOvertimeHours) || 0;
    const otRate = Number(rate.overtime_hourly_rate) || 0;
    const assistant = settlementHasAssistant ? (Number(rate.assistant_rate) || 0) : 0;
    const kms = Number(settlementActualKms) || 0;
    const baseKms = Number(rate.base_kms) || 0;
    const extraKmCost = Number(rate.extra_km_rate) || 0;
    const tolls = Number(settlementTollsAmount) || 0;

    const otCost = otHours * otRate;
    const extraKmCostTotal = Math.max(0, kms - baseKms) * extraKmCost;
    const tollsCost = rate.includes_tolls ? 0 : tolls;

    return daily + otCost + assistant + extraKmCostTotal + tollsCost;
  };

  const handleOpenSettlementModal = (sheet: RouteSheet, carrier: Carrier) => {
    // Find deliveries for this route sheet to extract logistics zone
    const sheetDeliveries = deliveries.filter(d => d.route_sheet_id === sheet.id);
    const zoneIds = sheetDeliveries
      .map(d => d.orders?.logistics_zone_id)
      .filter((id): id is string => !!id);
    
    // Find the most frequent zone ID
    let mostFrequentZoneId: string | null = null;
    if (zoneIds.length > 0) {
      const counts: Record<string, number> = {};
      zoneIds.forEach(id => { counts[id] = (counts[id] || 0) + 1; });
      mostFrequentZoneId = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
    }

    // Filter rates for this carrier
    const cRates = carrierRates.filter(r => r.carrier_id === carrier.id && r.is_active);
    
    // Try to find matching rate by date and zone
    const sheetDate = sheet.delivery_date;
    let matchedRate = cRates.find(r => {
      const dateMatch = sheetDate >= r.start_date && (!r.end_date || sheetDate <= r.end_date);
      const zoneMatch = (!r.logistics_zone_ids || r.logistics_zone_ids.length === 0)
        ? (!r.logistics_zone_id || r.logistics_zone_id === mostFrequentZoneId)
        : (mostFrequentZoneId && r.logistics_zone_ids.includes(mostFrequentZoneId));
      return dateMatch && zoneMatch;
    });

    if (!matchedRate) {
      matchedRate = cRates.find(r => sheetDate >= r.start_date && (!r.end_date || sheetDate <= r.end_date));
    }
    if (!matchedRate && cRates.length > 0) {
      matchedRate = cRates[0];
    }

    setSettlementRouteSheet(sheet);
    setSettlementCarrier(carrier);
    setSettlementSelectedRateId(matchedRate?.id || "");
    setSettlementActualHours(sheet.actual_hours ? String(sheet.actual_hours) : "");
    setSettlementActualOvertimeHours(sheet.actual_overtime_hours ? String(sheet.actual_overtime_hours) : "");
    setSettlementActualKms(sheet.actual_kms ? String(sheet.actual_kms) : "");
    setSettlementHasAssistant(sheet.has_assistant || false);
    setSettlementTollsAmount(sheet.tolls_amount ? String(sheet.tolls_amount) : "");
    setSettlementPayoutStatus(sheet.carrier_payout_status || 'Pendiente');
    
    if (sheet.carrier_payout_transaction_id) {
      setSettlementPaymentMethod('cash');
    } else {
      setSettlementPaymentMethod('other');
    }

    setShowSettlementModal(true);
  };

  const handleConfirmSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settlementRouteSheet || !settlementSelectedRateId) return;

    try {
      const calculatedCost = getCalculatedSettlementCost();
      let transactionId: string | null = null;

      // Handle reversion of old cash transaction if there was one
      if (settlementRouteSheet.carrier_payout_transaction_id) {
        const { data: oldTx } = await supabase
          .from('cash_transactions')
          .select('*')
          .eq('id', settlementRouteSheet.carrier_payout_transaction_id)
          .single();

        if (oldTx) {
          const { data: reg } = await supabase
            .from('cash_registers')
            .select('*')
            .eq('id', oldTx.register_id)
            .single();

          if (reg) {
            await supabase
              .from('cash_registers')
              .update({
                expected_balance_ars: reg.expected_balance_ars + oldTx.amount
              })
              .eq('id', reg.id);
          }

          await supabase
            .from('cash_transactions')
            .delete()
            .eq('id', oldTx.id);
        }
      }

      // If Liquidado and payment method is Cash, register cash transaction
      if (settlementPayoutStatus === 'Liquidado' && settlementPaymentMethod === 'cash') {
        if (!openRegister) {
          alert("Debe tener una Caja Abierta para registrar egresos en efectivo.");
          return;
        }

        const deliveriesInSheet = deliveries.filter(d => d.route_sheet_id === settlementRouteSheet.id);
        const deliveryCodes = deliveriesInSheet.map(d => {
          if (d.encomiendas?.code) return d.encomiendas.code;
          if (d.orders) return d.orders.legacy_code || d.orders.id.substring(0, 8);
          return null;
        }).filter(Boolean);

        const deliveryCodesStr = deliveryCodes.length > 0 ? deliveryCodes.join(', ') : 'Ninguno';

        const { data: tx, error: txError } = await supabase
          .from('cash_transactions')
          .insert({
            register_id: openRegister.id,
            type: 'egreso',
            category: 'gasto_flete',
            amount: calculatedCost,
            currency: 'ARS',
            notes: `Liquidación de Flete - Chofer ${settlementCarrier?.name || "Desconocido"} - Hoja de Ruta #${settlementRouteSheet.run_number} (${settlementRouteSheet.delivery_date}) - Deliveries: ${deliveryCodesStr}`,
            concept: `Pago Flete Chofer: ${settlementCarrier?.name || "Desconocido"} - HR #${settlementRouteSheet.run_number}`,
            created_by: currentUserId
          })
          .select('id')
          .single();

        if (txError) throw txError;
        transactionId = tx.id;

        // Deduct from cash register balance
        const { error: regError } = await supabase
          .from('cash_registers')
          .update({
            expected_balance_ars: openRegister.expected_balance_ars - calculatedCost
          })
          .eq('id', openRegister.id);

        if (regError) throw regError;
      }

      // Update route sheet flete fields
      const { error: rsError } = await supabase
        .from('route_sheets')
        .update({
          carrier_rate_id: settlementSelectedRateId,
          actual_hours: settlementActualHours ? Number(settlementActualHours) : 0,
          actual_overtime_hours: settlementActualOvertimeHours ? Number(settlementActualOvertimeHours) : 0,
          actual_kms: settlementActualKms ? Number(settlementActualKms) : 0,
          has_assistant: settlementHasAssistant,
          tolls_amount: settlementTollsAmount ? Number(settlementTollsAmount) : 0,
          carrier_cost_calculated: calculatedCost,
          carrier_payout_status: settlementPayoutStatus,
          carrier_payout_transaction_id: transactionId
        })
        .eq('id', settlementRouteSheet.id);

      if (rsError) throw rsError;

      alert("Liquidación de flete registrada con éxito.");
      setShowSettlementModal(false);
      setSettlementRouteSheet(null);
      setSettlementCarrier(null);
      loadAllData();
      fetchUserAndRegister();
    } catch (err) {
      alert("Error al confirmar liquidación: " + (err as AppError).message);
    }
  };


  const getZoneColorClass = (zoneName: string, dbColor?: string | null) => {
    if (dbColor) {
      switch (dbColor) {
        case 'emerald': return 'bg-emerald-600 text-white border-emerald-700';
        case 'blue': return 'bg-blue-600 text-white border-blue-700';
        case 'slate': return 'bg-slate-500 text-white border-slate-600';
        case 'amber': return 'bg-amber-500 text-white border-amber-600';
        case 'indigo': return 'bg-indigo-600 text-white border-indigo-700';
        case 'rose': return 'bg-rose-600 text-white border-rose-700';
        case 'purple': return 'bg-purple-600 text-white border-purple-700';
        case 'orange': return 'bg-orange-500 text-white border-orange-600';
        case 'cyan': return 'bg-cyan-600 text-white border-cyan-700';
        case 'slate-light': return 'bg-slate-200 text-slate-700 border-slate-300';
      }
    }
    const z = (zoneName || "").toLowerCase();
    if (z.includes('matanza')) return 'bg-emerald-600 text-white border-emerald-700';
    if (z.includes('sur') || z.includes('lanus') || z.includes('eze') || z.includes('lomas') || z.includes('temperley') || z.includes('brown')) return 'bg-blue-600 text-white border-blue-700';
    if (z.includes('caba') || z.includes('capital')) return 'bg-slate-500 text-white border-slate-600';
    if (z.includes('norte') || z.includes('tigre') || z.includes('san isidro') || z.includes('vicente') || z.includes('pilar')) return 'bg-amber-500 text-white border-amber-600';
    if (z.includes('oeste') || z.includes('moron') || z.includes('merlo') || z.includes('ituzaingo')) return 'bg-indigo-600 text-white border-indigo-700';
    return 'bg-slate-200 text-slate-700 border-slate-300';
  };

  const getLimitDateColorClass = (dateStr?: string | null) => {
    if (!dateStr) return 'bg-slate-100 text-slate-500 border-slate-200';
    const now = new Date();
    now.setHours(0,0,0,0);
    const limitDate = new Date(dateStr);
    limitDate.setHours(0,0,0,0);
    const diffDays = Math.ceil((limitDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays <= 0) return 'bg-rose-500 text-white animate-pulse font-extrabold border-rose-600';
    if (diffDays <= 3) return 'bg-amber-400 text-slate-900 font-extrabold border-amber-500';
    return 'bg-slate-100 text-slate-600 border-slate-200';
  };

  const formatCompactItems = (items: { quantity: number; product_name: string }[]) => {
    if (!items || items.length === 0) return '-';
    return items.map(item => `${item.quantity}x ${item.product_name}`).join(' | ');
  };

  // Dynamic list of zones and localities for filters dropdowns in "Pendientes"
  const pendingZones = Array.from(
    new Set(
      deliveries
        .filter(d => d.status === 'pendiente_ruteo')
        .map(d => d.orders ? (d.orders.zones?.name || "Sin Zona") : "Diligencia")
    )
  ).sort() as string[];

  const pendingLocalities = Array.from(
    new Set(
      deliveries
        .filter(d => d.status === 'pendiente_ruteo')
        .map(d => d.orders ? d.orders.locality : d.encomiendas?.locality)
        .filter((loc): loc is string => !!loc)
    )
  ).sort() as string[];

  // Filters logic
  const filteredPending = deliveries
    .filter(d => {
      if (d.status !== 'pendiente_ruteo') return false;
      const order = d.orders;
      const encomienda = d.encomiendas;
      if (!order && !encomienda) return false;

      // Identify warehouse pickups but do NOT exclude them from logistics planning pending list
      const zoneName = order ? (order.zones?.name || "Sin Zona") : "Diligencia";
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const isWarehouse = 
        cleanTextForSearch(zoneName).includes("deposito") || 
        cleanTextForSearch(order ? order.locality : (encomienda?.locality || "")).includes("deposito") || 
        cleanTextForSearch(order ? order.address : (encomienda?.address || "")).includes("deposito");

      // 1. Search term: matches client name or order code (legacy_code or order_id) or encomienda code (supports pasting multiple codes)
      if (searchTerm.trim()) {
        const rawTokens = searchTerm
          .toLowerCase()
          .split(/[\s,\n;\r]+/)
          .map(t => t.trim())
          .filter(t => t.length > 0);

        if (rawTokens.length > 0) {
          const client = (order ? (order.customer_name || "") : (encomienda?.client_name || "")).toLowerCase();
          const code = (order ? (order.legacy_code || order.id || "") : (encomienda?.code || "")).toLowerCase();
          
          const matchesAny = rawTokens.some(token => client.includes(token) || code.includes(token));
          if (!matchesAny) return false;
        }
      }

      // 2. Zone filter (multi-select)
      if (pendingFilterZones.length > 0) {
        if (!pendingFilterZones.includes(zoneName)) return false;
      }

      // 3. Locality filter (multi-select)
      if (pendingFilterLocality.length > 0) {
        const orderLoc = order ? (order.locality || "") : (encomienda?.locality || "");
        if (!pendingFilterLocality.includes(orderLoc)) return false;
      }

      // 4. Vencimiento (Limit Date) filter
      if (pendingFilterVencimientoOpt) {
        const limitDateStr = order ? order.max_delivery_date : encomienda?.delivery_date;
        if (!limitDateStr) return false;
        
        const now = new Date();
        now.setHours(0,0,0,0);
        
        const limitDate = new Date(limitDateStr + 'T00:00:00');
        limitDate.setHours(0,0,0,0);
        
        const diffTime = limitDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (pendingFilterVencimientoOpt === 'expired') {
          if (diffDays >= 0) return false;
        } else if (pendingFilterVencimientoOpt === 'today') {
          if (diffDays !== 0) return false;
        } else if (pendingFilterVencimientoOpt === 'tomorrow') {
          if (diffDays !== 1) return false;
        } else if (pendingFilterVencimientoOpt === '3days') {
          if (diffDays < 0 || diffDays > 3) return false;
        } else if (pendingFilterVencimientoOpt === 'custom') {
          if (pendingFilterVencimientoDate) {
            const filterDate = new Date(pendingFilterVencimientoDate + 'T00:00:00');
            filterDate.setHours(0,0,0,0);
            if (limitDate.getTime() !== filterDate.getTime()) return false;
          }
        }
      }

      return true;
    })
    .sort((a, b) => {
      let comparison = 0;
      
      if (sortField === 'zone') {
        const zoneA = a.orders ? (a.orders.zones?.name || "") : "Diligencia";
        const zoneB = b.orders ? (b.orders.zones?.name || "") : "Diligencia";
        if (zoneA !== zoneB) {
          if (!zoneA) comparison = 1;
          else if (!zoneB) comparison = -1;
          else comparison = zoneA.localeCompare(zoneB);
        } else {
          // secondary sort is date
          const dateA = a.orders?.max_delivery_date 
            ? new Date(a.orders.max_delivery_date).getTime() 
            : (a.encomiendas?.delivery_date ? new Date(a.encomiendas.delivery_date).getTime() : 9999999999999);
          const dateB = b.orders?.max_delivery_date 
            ? new Date(b.orders.max_delivery_date).getTime() 
            : (b.encomiendas?.delivery_date ? new Date(b.encomiendas.delivery_date).getTime() : 9999999999999);
          comparison = dateA - dateB;
        }
      } else { // vencimiento
        const dateA = a.orders?.max_delivery_date 
          ? new Date(a.orders.max_delivery_date).getTime() 
          : (a.encomiendas?.delivery_date ? new Date(a.encomiendas.delivery_date).getTime() : 9999999999999);
        const dateB = b.orders?.max_delivery_date 
          ? new Date(b.orders.max_delivery_date).getTime() 
          : (b.encomiendas?.delivery_date ? new Date(b.encomiendas.delivery_date).getTime() : 9999999999999);
        comparison = dateA - dateB;
        
        if (comparison === 0) {
          // secondary sort is zone
          const zoneA = a.orders ? (a.orders.zones?.name || "") : "Diligencia";
          const zoneB = b.orders ? (b.orders.zones?.name || "") : "Diligencia";
          comparison = zoneA.localeCompare(zoneB);
        }
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });

  const getPlannedGroups = () => {
    const plannedList = deliveries.filter(d => 
      d.route_sheet_id
    );

    const groups: Record<string, { routeSheet: RouteSheet; carrier: Carrier; run_number: number; items: Delivery[]; status: string }> = {};

    plannedList.forEach(d => {
      if (!d.route_sheet_id) return;
      const key = d.route_sheet_id;
      if (!groups[key]) {
        const sheet = routeSheets.find(s => s.id === d.route_sheet_id) || {
          id: d.route_sheet_id,
          carrier_id: d.carrier_id || "",
          delivery_date: d.delivery_date,
          run_number: d.run_number,
          status: 'Borrador',
          total_theoretical_cash: 0,
          total_reconciled_cash: 0
        } as RouteSheet;

        groups[key] = {
          routeSheet: sheet,
          carrier: d.carriers || { id: d.carrier_id || "", name: "Desconocido", is_active: true },
          run_number: d.run_number,
          items: [],
          status: sheet.status
        };
      }
      groups[key].items.push(d);
    });

    Object.keys(groups).forEach(key => {
      groups[key].items.sort((a, b) => a.delivery_order - b.delivery_order);
    });

    return Object.values(groups).sort((a, b) => {
      const dateA = a.routeSheet.delivery_date ? new Date(a.routeSheet.delivery_date + 'T00:00:00').getTime() : 0;
      const dateB = b.routeSheet.delivery_date ? new Date(b.routeSheet.delivery_date + 'T00:00:00').getTime() : 0;
      if (dateB !== dateA) return dateB - dateA;
      return b.run_number - a.run_number;
    });
  };

  const inTransitList = deliveries.filter(d => d.status === 'en_recorrido');

  const historyList = deliveries.filter(d => {
    if (d.status !== 'entregado' && d.status !== 'fallido') return false;
    const query = searchTerm.trim().toLowerCase();
    if (!query) return true;

    const isEnc = !!d.encomienda_id;
    const client = isEnc ? (d.encomiendas?.client_name || "") : (d.orders?.customer_name || "");
    const locality = isEnc ? (d.encomiendas?.locality || "") : (d.orders?.locality || "");
    const address = isEnc ? (d.encomiendas?.address || "") : (d.orders?.address || "");
    const code = isEnc ? (d.encomiendas?.code || "") : (d.orders?.legacy_code || d.orders?.id || "");
    
    const rs = d.route_sheets;
    const rsCode = rs?.code || "";
    const rsRun = rs?.run_number ? `hr #${rs.run_number}` : "";
    const carrier = d.carriers?.name || rs?.carriers?.name || "";

    return client.toLowerCase().includes(query) ||
           locality.toLowerCase().includes(query) ||
           address.toLowerCase().includes(query) ||
           code.toLowerCase().includes(query) ||
           rsCode.toLowerCase().includes(query) ||
           rsRun.toLowerCase().includes(query) ||
           carrier.toLowerCase().includes(query);
  });

  const missingMapCount = deliveries.filter(d => {
    if (d.status === 'entregado' || d.status === 'fallido') return false;
    const order = d.orders;
    const encomienda = d.encomiendas;
    if (!order && !encomienda) return false;
    
    const isEncomienda = !!d.encomienda_id;
    const zoneName = isEncomienda ? "Diligencia" : order?.zones?.name || "Sin Zona";
    const locality = isEncomienda ? encomienda?.locality : order?.locality;
    const address = isEncomienda ? encomienda?.address : order?.address;
    
    const clean = (str: string | null | undefined) => 
      (str || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      
    const isWarehousePickup = 
      clean(zoneName).includes("deposito") || 
      clean(locality).includes("deposito") || 
      clean(address).includes("deposito");
      
    if (isWarehousePickup) return false;
    
    const mapsLink = isEncomienda ? encomienda?.google_maps_link : order?.google_maps_link;
    return !mapsLink || mapsLink.trim() === "";
  }).length;

  return (
    <>
      <div id="ruteo-page-content" className="space-y-6 min-w-max print:hidden">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-1 border-b border-slate-100">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-1.5">
              <Truck className="w-5 h-5 text-brand-600" /> Planificación y Hojas de Ruta
            </h1>
            {missingMapCount > 0 && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 px-2 py-0.5 rounded-lg flex items-center gap-1 text-[10px] font-black uppercase tracking-wider shrink-0">
                <span className="flex h-1.5 w-1.5 relative shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-500"></span>
                </span>
                <span>{missingMapCount} sin mapa</span>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {activeTab === 'carriers' && (
              <button 
                onClick={() => {
                  setSelectedCarrierId(null);
                  setCarrierName("");
                  setCarrierVehicle("");
                  setCarrierPlate("");
                  setCarrierPhone("");
                  setShowCarrierModal(true);
                }}
                className="flex items-center gap-1 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" /> Chofer / Vehículo
              </button>
            )}

            {activeTab === 'pending' && (
              <button 
                onClick={openNewEncomiendaModal}
                className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" /> Diligencia / Encomienda
              </button>
            )}
          </div>
        </div>

      {/* Consolidated Tabs */}
      <div className="flex flex-wrap gap-1 border-b pb-1 border-slate-200 select-none">
        <button 
          type="button"
          onClick={() => setActiveTab('pending')}
          className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
            activeTab === 'pending' 
              ? 'border-brand-600 text-brand-600' 
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Pendientes ({filteredPending.length})
        </button>

        <button 
          type="button"
          onClick={() => {
            setActiveTab('planned');
            setPlannedSubTab('Borrador');
          }}
          className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
            activeTab === 'planned' && plannedSubTab === 'Borrador'
              ? 'border-brand-600 text-brand-600' 
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Borradores ({getPlannedGroups().filter(g => g.status === 'Borrador').length})
        </button>

        <button 
          type="button"
          onClick={() => {
            setActiveTab('planned');
            setPlannedSubTab('En Viaje');
          }}
          className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
            activeTab === 'planned' && plannedSubTab === 'En Viaje'
              ? 'border-brand-600 text-brand-600' 
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          En Viaje ({getPlannedGroups().filter(g => g.status === 'En Viaje').length})
        </button>

        <button 
          type="button"
          onClick={() => {
            setActiveTab('planned');
            setPlannedSubTab('Cerrada');
          }}
          className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
            activeTab === 'planned' && plannedSubTab === 'Cerrada'
              ? 'border-brand-600 text-brand-600' 
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Cerradas ({getPlannedGroups().filter(g => g.status === 'Cerrada').length})
        </button>

        <button 
          type="button"
          onClick={() => setActiveTab('in_transit')}
          className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
            activeTab === 'in_transit' 
              ? 'border-brand-600 text-brand-600' 
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          En Recorrido ({inTransitList.length})
        </button>

        <button 
          type="button"
          onClick={() => setActiveTab('take_away')}
          className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
            activeTab === 'take_away' 
              ? 'border-brand-600 text-brand-600' 
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Retiro Depósito
        </button>

        <button 
          type="button"
          onClick={() => setActiveTab('history')}
          className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
            activeTab === 'history' 
              ? 'border-brand-600 text-brand-600' 
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Historial Entregas
        </button>

        <button 
          type="button"
          onClick={() => setActiveTab('carriers')}
          className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
            activeTab === 'carriers' 
              ? 'border-brand-600 text-brand-600' 
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Transportistas ({carriers.length})
        </button>
      </div>

      {/* Main Panel Content */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
        {loading && activeTab !== 'take_away' ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-10 h-10 animate-spin text-brand-600" />
            <p className="text-slate-500 font-semibold text-xs">Cargando datos de logística...</p>
          </div>
        ) : (
          <>
            {/* SEARCH & FILTERS BAR */}
            {activeTab !== 'carriers' && activeTab !== 'planned' && activeTab !== 'take_away' && (
              <div className="mb-6">
                {activeTab === 'pending' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50/70 p-4 border rounded-3xl border-slate-100 shadow-sm">
                    {/* Search by Client/Code */}
                    <div className="relative">
                      <div className="flex justify-between items-center mb-1">
                        <span className="block text-[10px] font-black text-slate-400 uppercase tracking-wider">Buscar</span>
                        <button
                          type="button"
                          onClick={() => setShowMultiCodeModal(true)}
                          className="text-[9px] font-black text-brand-600 hover:text-brand-800 uppercase tracking-wider flex items-center gap-1 cursor-pointer bg-brand-50 px-2 py-0.5 rounded-md border border-brand-100/60 hover:bg-brand-100 transition-colors"
                        >
                          <ClipboardList className="w-3 h-3" />
                          Pegar Lista
                        </button>
                      </div>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                        <input 
                          type="text"
                          placeholder="Cliente o códigos (ej: JS23992 JS23966)..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold focus:border-brand-500 transition-all outline-none"
                        />
                      </div>
                    </div>

                    {/* Filter by Zona (Multi-select with Search & Actions) */}
                    <div className="relative">
                      <span className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Filtrar por Zona</span>
                      <button
                        type="button"
                        onClick={() => {
                          setShowZoneDropdown(!showZoneDropdown);
                          if (showZoneDropdown) setZoneSearchTerm("");
                        }}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-left focus:border-brand-500 transition-all flex items-center justify-between cursor-pointer"
                      >
                        <span className="truncate mr-2">
                          {pendingFilterZones.length === 0 
                            ? "Todas las Zonas" 
                            : pendingFilterZones.length === 1 
                              ? pendingFilterZones[0] 
                              : `${pendingFilterZones.length} Zonas`}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {pendingFilterZones.length > 0 && (
                            <span 
                              onClick={(e) => {
                                e.stopPropagation();
                                setPendingFilterZones([]);
                              }}
                              className="w-4 h-4 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
                              title="Limpiar filtro"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </span>
                          )}
                          <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                        </div>
                      </button>

                      {showZoneDropdown && (
                        <>
                          <div 
                            className="fixed inset-0 z-10" 
                            onClick={() => {
                              setShowZoneDropdown(false);
                              setZoneSearchTerm("");
                            }}
                          />
                          <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl z-20 max-h-80 p-2.5 space-y-2 animate-in fade-in slide-in-from-top-2 duration-100 flex flex-col">
                            {/* Inner Search Box */}
                            <div className="relative shrink-0">
                              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                              <input
                                type="text"
                                placeholder="Buscar zona..."
                                value={zoneSearchTerm}
                                onChange={(e) => setZoneSearchTerm(e.target.value)}
                                className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold focus:border-brand-500 focus:bg-white transition-all outline-none"
                              />
                            </div>

                            {/* Actions toolbar */}
                            <div className="flex items-center justify-between shrink-0 px-1 py-0.5 border-b border-slate-100 pb-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  const matchingZones = pendingZones.filter(z => z.toLowerCase().includes(zoneSearchTerm.toLowerCase()));
                                  const newSelected = new Set(pendingFilterZones);
                                  matchingZones.forEach(z => newSelected.add(z));
                                  setPendingFilterZones(Array.from(newSelected));
                                }}
                                className="text-[10px] font-black text-brand-600 hover:text-brand-700 uppercase tracking-wider bg-brand-50/50 hover:bg-brand-50 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                              >
                                Seleccionar Todos
                              </button>
                              {pendingFilterZones.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setPendingFilterZones([])}
                                  className="text-[10px] font-black text-rose-600 hover:text-rose-700 uppercase tracking-wider bg-rose-50 hover:bg-rose-100/70 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                                >
                                  Limpiar
                                </button>
                              )}
                            </div>
                            
                            {/* Zone List */}
                            <div className="space-y-1 overflow-y-auto max-h-40 pr-0.5">
                              {pendingZones
                                .filter(z => z.toLowerCase().includes(zoneSearchTerm.toLowerCase()))
                                .map(z => {
                                  const isChecked = pendingFilterZones.includes(z);
                                  return (
                                    <label 
                                      key={z} 
                                      className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded-lg cursor-pointer text-xs font-semibold text-slate-700 select-none"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => {
                                          if (isChecked) {
                                            setPendingFilterZones(prev => prev.filter(x => x !== z));
                                          } else {
                                            setPendingFilterZones(prev => [...prev, z]);
                                          }
                                        }}
                                        className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/10 cursor-pointer accent-brand-600"
                                      />
                                      <span>{z}</span>
                                    </label>
                                  );
                                })
                              }
                              {pendingZones.filter(z => z.toLowerCase().includes(zoneSearchTerm.toLowerCase())).length === 0 && (
                                <div className="text-center py-4 text-slate-400 text-xs font-bold">
                                  No se encontraron zonas
                                </div>
                              )}
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Filter by Localidad */}
                    <div className="relative">
                      <span className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Filtrar por Localidad</span>
                      <button
                        type="button"
                        onClick={() => {
                          setShowLocalityDropdown(!showLocalityDropdown);
                          if (showLocalityDropdown) setLocalitySearchTerm("");
                        }}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-left focus:border-brand-500 transition-all flex items-center justify-between cursor-pointer"
                      >
                        <span className="truncate mr-2">
                          {pendingFilterLocality.length === 0 
                            ? "Todas las Localidades" 
                            : pendingFilterLocality.length === 1 
                              ? pendingFilterLocality[0] 
                              : `${pendingFilterLocality.length} Localidades`}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {pendingFilterLocality.length > 0 && (
                            <span 
                              onClick={(e) => {
                                e.stopPropagation();
                                setPendingFilterLocality([]);
                              }}
                              className="w-4 h-4 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
                              title="Limpiar filtro"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </span>
                          )}
                          <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                        </div>
                      </button>

                      {showLocalityDropdown && (
                        <>
                          <div 
                            className="fixed inset-0 z-10" 
                            onClick={() => {
                              setShowLocalityDropdown(false);
                              setLocalitySearchTerm("");
                            }}
                          />
                          <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl z-20 max-h-80 p-2.5 space-y-2 animate-in fade-in slide-in-from-top-2 duration-100 flex flex-col">
                            {/* Inner Search Box */}
                            <div className="relative shrink-0">
                              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                              <input
                                type="text"
                                placeholder="Buscar localidad..."
                                value={localitySearchTerm}
                                onChange={(e) => setLocalitySearchTerm(e.target.value)}
                                className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold focus:border-brand-500 focus:bg-white transition-all outline-none"
                              />
                            </div>

                            {/* Actions toolbar */}
                            <div className="flex items-center justify-between shrink-0 px-1 py-0.5 border-b border-slate-100 pb-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  const matchingLocalities = pendingLocalities.filter(l => l.toLowerCase().includes(localitySearchTerm.toLowerCase()));
                                  const newSelected = new Set(pendingFilterLocality);
                                  matchingLocalities.forEach(l => newSelected.add(l));
                                  setPendingFilterLocality(Array.from(newSelected));
                                }}
                                className="text-[10px] font-black text-brand-600 hover:text-brand-700 uppercase tracking-wider bg-brand-50/50 hover:bg-brand-50 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                              >
                                Seleccionar Todos
                              </button>
                              {pendingFilterLocality.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setPendingFilterLocality([])}
                                  className="text-[10px] font-black text-rose-600 hover:text-rose-700 uppercase tracking-wider bg-rose-50 hover:bg-rose-100/70 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                                >
                                  Limpiar
                                </button>
                              )}
                            </div>
                            
                            {/* Locality List */}
                            <div className="space-y-1 overflow-y-auto max-h-40 pr-0.5">
                              {pendingLocalities
                                .filter(l => l.toLowerCase().includes(localitySearchTerm.toLowerCase()))
                                .map(l => {
                                  const isChecked = pendingFilterLocality.includes(l);
                                  return (
                                    <label 
                                      key={l} 
                                      className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded-lg cursor-pointer text-xs font-semibold text-slate-700 select-none"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => {
                                          if (isChecked) {
                                            setPendingFilterLocality(prev => prev.filter(x => x !== l));
                                          } else {
                                            setPendingFilterLocality(prev => [...prev, l]);
                                          }
                                        }}
                                        className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/10 cursor-pointer accent-brand-600"
                                      />
                                      <span>{l}</span>
                                    </label>
                                  );
                                })
                              }
                              {pendingLocalities.filter(l => l.toLowerCase().includes(localitySearchTerm.toLowerCase())).length === 0 && (
                                <div className="text-center py-4 text-slate-400 text-xs font-bold">
                                  No se encontraron localidades
                                </div>
                              )}
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Filter by Vencimiento */}
                    <div>
                      <span className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Fecha Límite (Vencimiento)</span>
                      <div className="flex gap-2">
                        <select
                          value={pendingFilterVencimientoOpt}
                          onChange={(e) => {
                            setPendingFilterVencimientoOpt(e.target.value);
                            if (e.target.value !== 'custom') setPendingFilterVencimientoDate("");
                          }}
                          className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold focus:border-brand-500 transition-all outline-none cursor-pointer"
                        >
                          <option value="">Todos</option>
                          <option value="expired">Vencidos (Límite superado)</option>
                          <option value="today">Vencen hoy</option>
                          <option value="tomorrow">Vencen mañana</option>
                          <option value="3days">Próximos 3 días</option>
                          <option value="custom">Fecha específica...</option>
                        </select>

                        {pendingFilterVencimientoOpt === 'custom' && (
                          <div className="w-28">
                            <DateInput
                              value={pendingFilterVencimientoDate}
                              onChange={(val) => setPendingFilterVencimientoDate(val)}
                              className="w-full pl-2 pr-6 py-1 rounded-xl border border-slate-200 bg-white font-bold text-xs outline-none focus:border-brand-500 text-slate-800"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="relative max-w-md">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="text"
                      placeholder="Buscar por cliente o localidad..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold focus:border-brand-500 focus:bg-white transition-all outline-none"
                    />
                  </div>
                )}
              </div>
            )}

            {/* PENDIENTES TAB */}
            {activeTab === 'pending' && (
              <div className="space-y-4 min-w-max">
                {selectedDeliveryIds.size > 0 && (
                  <div className="bg-gradient-to-r from-brand-50 to-brand-100/50 border border-brand-200/80 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm animate-in fade-in slide-in-from-top-4 duration-200">
                    <div className="flex items-center gap-3">
                      <div className="bg-brand-600 text-white rounded-full w-8 h-8 flex items-center justify-center text-xs font-black shadow-md shadow-brand-500/20">
                        {selectedDeliveryIds.size}
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Asignación Masiva</h4>
                        <p className="text-[10px] text-slate-500 font-semibold">Configura el reparto para los pedidos seleccionados</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-black text-slate-400 uppercase">Chofer:</span>
                        <select 
                          value={bulkCarrierId}
                          onChange={(e) => setBulkCarrierId(e.target.value)}
                          className="text-[11px] font-bold border border-slate-200 rounded-xl p-1.5 bg-white outline-none w-36 cursor-pointer focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                        >
                          <option value="">Seleccionar...</option>
                          {carriers.filter(c => c.is_active).map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-black text-slate-400 uppercase">Recorrido:</span>
                        <input 
                          type="number" 
                          min="1" 
                          placeholder="R"
                          value={bulkRunNumber}
                          onChange={(e) => setBulkRunNumber(Number(e.target.value))}
                          className="text-[11px] font-bold border border-slate-200 rounded-xl p-1.5 bg-white text-center outline-none w-12 focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                        />
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-black text-slate-400 uppercase">Fecha:</span>
                        <div className="w-28">
                          <DateInput
                            value={bulkDeliveryDate}
                            onChange={(val) => setBulkDeliveryDate(val)}
                            className="w-full pl-2 pr-6 py-1 rounded-xl border border-slate-200 bg-white font-bold text-[11px] outline-none focus:border-brand-500 text-slate-800"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleCopySelectedWhatsApp}
                          className="px-3 py-1.5 text-[10px] font-black uppercase text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 bg-white border border-emerald-200 rounded-xl transition-all cursor-pointer flex items-center gap-1"
                          title="Copiar enlaces de WhatsApp de los seleccionados"
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-emerald-500" />
                          <span>Copiar WA.me</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedDeliveryIds(new Set())}
                          className="px-3 py-1.5 text-[10px] font-black uppercase text-slate-500 hover:text-slate-700 bg-white border border-slate-200 rounded-xl transition-all cursor-pointer"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          disabled={savingBulk}
                          onClick={handleSaveRouteBulk}
                          className="px-4 py-1.5 text-[10px] font-black uppercase tracking-wider text-white bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 rounded-xl shadow-md shadow-brand-500/10 transition-all cursor-pointer flex items-center gap-1.5"
                        >
                          {savingBulk ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Procesando...
                            </>
                          ) : (
                            <>
                              <Truck className="w-3.5 h-3.5" />
                              Asignar
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {filteredPending.length === 0 ? (
                  <div className="text-center py-16 text-slate-400 space-y-2">
                    <Info className="w-10 h-10 mx-auto text-slate-300" />
                    <p className="font-bold text-xs">No hay entregas pendientes de ruteo.</p>
                  </div>
                ) : (
                  <div className="min-w-max border border-slate-200/60 rounded-3xl bg-white shadow-sm">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100 font-black text-slate-400 text-[10px] uppercase tracking-wider select-none">
                          <th className="px-3 py-3 w-8">
                            <input 
                              type="checkbox"
                              checked={filteredPending.length > 0 && filteredPending.every(d => selectedDeliveryIds.has(d.id))}
                              onChange={(e) => {
                                const newSelected = new Set(selectedDeliveryIds);
                                if (e.target.checked) {
                                  filteredPending.forEach(d => newSelected.add(d.id));
                                } else {
                                  filteredPending.forEach(d => newSelected.delete(d.id));
                                }
                                setSelectedDeliveryIds(newSelected);
                              }}
                              className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/10 cursor-pointer accent-brand-600"
                            />
                          </th>
                          <th 
                            className="px-3 py-3 cursor-pointer hover:text-slate-600 hover:bg-slate-100/50 transition-colors"
                            onClick={() => handleSort('vencimiento')}
                          >
                            <div className="flex items-center gap-1">
                              <span>Vencimiento (Límite)</span>
                              {sortField === 'vencimiento' ? (
                                sortDirection === 'asc' ? <ChevronUp className="w-3.5 h-3.5 text-brand-600 inline" /> : <ChevronDown className="w-3.5 h-3.5 text-brand-600 inline" />
                              ) : (
                                <span className="text-slate-300 text-[9px] ml-0.5">⇅</span>
                              )}
                            </div>
                          </th>
                          <th className="px-3 py-3">Código</th>
                          <th className="px-3 py-3">Cliente</th>
                          <th className="px-3 py-3">Detalle Entrega</th>
                          <th 
                            className="px-3 py-3 cursor-pointer hover:text-slate-600 hover:bg-slate-100/50 transition-colors"
                            onClick={() => handleSort('zone')}
                          >
                            <div className="flex items-center gap-1">
                              <span>Zona</span>
                              {sortField === 'zone' ? (
                                sortDirection === 'asc' ? <ChevronUp className="w-3.5 h-3.5 text-brand-600 inline" /> : <ChevronDown className="w-3.5 h-3.5 text-brand-600 inline" />
                              ) : (
                                <span className="text-slate-300 text-[9px] ml-0.5">⇅</span>
                              )}
                            </div>
                          </th>
                          <th className="px-3 py-3">Localidad y Dirección</th>
                          <th className="px-3 py-3">Productos (Compacto)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
                        {filteredPending.map((del) => {
                          const order = del.orders;
                          const encomienda = del.encomiendas;
                          if (!order && !encomienda) return null;
                          const isEncomienda = !!del.encomienda_id;

                          const paymentRequiresApproval = !isEncomienda && 
                            order && 
                            (order.payment_status === 'Abonado' || order.payment_status === 'Seniado') && 
                            !order.payment_approved;

                          const zoneName = isEncomienda ? "Diligencia" : order?.zones?.name || "Sin Zona";
                          const limitDateStr = isEncomienda
                            ? (encomienda?.delivery_date ? new Date(encomienda.delivery_date + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'S/D')
                            : (order?.max_delivery_date ? new Date(order.max_delivery_date + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'S/D');

                          const code = isEncomienda ? encomienda?.code : order?.legacy_code || order?.id.substring(0, 8);
                          const customerName = isEncomienda ? encomienda?.client_name || "Sin Contacto" : order?.customer_name;
                          const phone = isEncomienda ? encomienda?.client_phone : order?.clients?.phone_primary;
                          const notes = isEncomienda ? encomienda?.description : (order?.delivery_detail || order?.delivery_notes);
                          const address = isEncomienda ? encomienda?.address : order?.address;
                          const locality = isEncomienda ? encomienda?.locality : order?.locality;
                          const mapsLink = isEncomienda ? encomienda?.google_maps_link : order?.google_maps_link;
                          
                          const clean = (str: string | null | undefined) => 
                            (str || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                            
                          const isWarehousePickup = 
                            clean(zoneName).includes("deposito") || 
                            clean(locality).includes("deposito") || 
                            clean(address).includes("deposito");
                          
                          const orderCompactItems = isEncomienda
                            ? `[${encomienda?.type.replace('_', ' ')}] ${encomienda?.description || ''}${
                                encomienda?.supplier?.name ? ` | Proveedor: ${encomienda.supplier.name}` : ''
                              }${
                                encomienda?.payment_amount && encomienda.payment_amount > 0
                                  ? ` | Pago: ${formatPrice(encomienda.payment_amount)}`
                                  : ''
                              }`
                            : formatCompactItems(order?.order_items || []);
                          
                          return (
                            <tr 
                              key={del.id} 
                              className={`hover:bg-slate-50/50 transition-colors ${
                                selectedDeliveryIds.has(del.id) ? "bg-brand-50/20" : ""
                              } ${
                                isEncomienda 
                                  ? "bg-purple-50/10" 
                                  : isWarehousePickup 
                                    ? "bg-indigo-50/15 border-l-4 border-l-indigo-500" 
                                    : ""
                              }`}
                            >
                              <td className="px-3 py-2 w-8">
                                <input
                                  type="checkbox"
                                  checked={selectedDeliveryIds.has(del.id)}
                                  onClick={(e) => handleCheckboxClick(e, del.id)}
                                  onChange={() => {}}
                                  className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/10 accent-brand-600 cursor-pointer"
                                  title={paymentRequiresApproval ? "Pago pendiente de aprobación en administración" : ""}
                                />
                              </td>
                              <td className="px-3 py-2">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase border ${getLimitDateColorClass(isEncomienda ? encomienda?.delivery_date : order?.max_delivery_date)}`}>
                                  {limitDateStr}
                                </span>
                              </td>
                              <td className="px-3 py-2">
                                <button
                                  type="button"
                                  onClick={() => setPreviewDelivery(del)}
                                  className={`inline-flex items-center px-1.5 py-0.25 border rounded text-[10px] font-mono shrink-0 hover:bg-slate-200 hover:text-slate-800 transition-colors cursor-pointer text-left ${
                                    isEncomienda 
                                      ? 'bg-purple-50 border-purple-200 text-purple-700 font-extrabold' 
                                      : 'bg-slate-100 border-slate-200 text-slate-600'
                                  }`}
                                >
                                  {code}
                                </button>
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-1.5 whitespace-nowrap">
                                  <button
                                    type="button"
                                    onClick={() => setPreviewDelivery(del)}
                                    className="font-extrabold text-slate-800 text-xs hover:text-brand-650 hover:underline transition-colors text-left cursor-pointer"
                                  >
                                    {customerName}
                                  </button>
                                  
                                  {paymentRequiresApproval && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 bg-rose-50 border border-rose-200 text-rose-700 rounded text-[9px] font-black uppercase tracking-wider animate-pulse shrink-0">
                                      Falta Aprobación Pago
                                    </span>
                                  )}
                                  
                                  {(() => {
                                    const isEnc = !!del.encomienda_id;
                                    const prevFailed = failedHistory.find(fh => isEnc ? (fh.encomienda_id === del.encomienda_id) : (fh.order_id === del.order_id));
                                    if (!prevFailed) return null;
                                    const failDate = prevFailed.delivery_date ? new Date(prevFailed.delivery_date + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) : 'S/D';
                                    const routeCode = prevFailed.route_sheets?.code || `Rec. ${prevFailed.run_number}`;
                                    const carrierName = prevFailed.carriers?.name || "S/D";
                                    return (
                                      <span 
                                        className="inline-flex items-center px-1.5 py-0.5 bg-amber-50 border border-amber-200 text-amber-805 rounded text-[9px] font-black uppercase tracking-wider shrink-0"
                                        title={`Previa entrega fallida el ${failDate} con ${carrierName} (${routeCode})`}
                                      >
                                        ⚠️ Re-intento (Falló {failDate})
                                      </span>
                                    );
                                  })()}
                                  
                                  {phone && (
                                    <a 
                                      href={`https://wa.me/${phone.replace(/\D/g, "")}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 rounded text-[9px] font-bold transition-colors shrink-0"
                                      title={`WhatsApp: ${phone}`}
                                    >
                                      <MessageSquare className="w-2.5 h-2.5 text-emerald-500 shrink-0" />
                                      <span>{phone}</span>
                                    </a>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-slate-500 font-medium text-[11px] max-w-[150px] truncate" title={notes || ""}>
                                {notes || "-"}
                              </td>
                              <td className="px-3 py-2">
                                {isEncomienda ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black uppercase border shrink-0 bg-purple-50 border-purple-200 text-purple-700 whitespace-nowrap">
                                    Diligencia
                                  </span>
                                ) : (
                                  <div className="flex flex-col gap-1 items-start">
                                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black uppercase border shrink-0 ${getZoneColorClass(zoneName, order?.zones?.color)}`}>
                                        {zoneName}
                                      </span>
                                      <span className={`text-[8px] font-black uppercase tracking-wider px-1 rounded shrink-0 border ${
                                        (order?.zones?.delivery_times?.category === 'Zonal' || order?.freight_type?.toLowerCase().includes('zonal'))
                                          ? 'bg-blue-50 border-blue-200 text-blue-700'
                                          : 'bg-slate-100 border-slate-200 text-slate-500'
                                      }`}>
                                        {(order?.zones?.delivery_times?.category === 'Zonal' || order?.freight_type?.toLowerCase().includes('zonal')) ? 'Zonal 🔵' : 'Regular ⚪'}
                                      </span>
                                    </div>
                                    {isWarehousePickup && (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black uppercase border shrink-0 bg-indigo-50 border-indigo-200 text-indigo-700 whitespace-nowrap tracking-wider">
                                        📦 Retiro Depósito
                                      </span>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-2 border-r border-slate-100 last:border-r-0">
                                <div className="text-xs leading-tight flex items-center gap-1.5 whitespace-nowrap">
                                  <span className="text-slate-800 font-black shrink-0">{locality}</span>
                                  <span className="text-slate-400 font-semibold shrink-0">-</span>
                                  <span className="text-slate-600 font-semibold text-[10px] truncate max-w-[300px]" title={address}>
                                    {address}
                                  </span>
                                  {mapsLink ? (
                                    <a href={mapsLink} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline font-black text-[9px] shrink-0">
                                      [Mapa ↗]
                                    </a>
                                  ) : (
                                    !isWarehousePickup && (
                                      <button
                                        onClick={() => handleOpenEditAddressModal(isEncomienda ? encomienda!.id : order!.id, address || "", mapsLink || "", isEncomienda)}
                                        className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black bg-rose-50 border border-rose-200 text-rose-600 tracking-wider shrink-0 hover:bg-rose-100 transition-colors cursor-pointer"
                                        title="Falta cargar el enlace de Google Maps. Click para cargar."
                                      >
                                        ⚠️ SIN MAPA
                                      </button>
                                    )
                                  )}
                                  <button
                                    onClick={() => handleOpenEditAddressModal(isEncomienda ? encomienda!.id : order!.id, address || "", mapsLink || "", isEncomienda)}
                                    className="p-0.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-all cursor-pointer shrink-0"
                                    title="Modificar dirección y mapa de entrega"
                                  >
                                    <Edit className="w-3 h-3" />
                                  </button>
                                </div>
                              </td>
                              <td className="px-3 py-2">
                                {isEncomienda ? (
                                  <div className="truncate text-brand-600 font-black">{orderCompactItems}</div>
                                ) : (() => {
                                  const items = order?.order_items || [];
                                  const summary = getOrderCategorySummary(items);
                                  return (
                                    <div className="flex flex-col gap-1 items-start">
                                      <span 
                                        className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border shadow-2xs ${getCategoryBadgeStyle(summary.mainCategory)}`}
                                        title={orderCompactItems}
                                      >
                                        {summary.mainCategory}
                                      </span>
                                      {!isEncomienda && parseReturnItemsFromNotes(order?.delivery_notes).length > 0 && (
                                        <div className="mt-1 text-[8px] font-black text-red-650 bg-red-50 border border-red-200 rounded px-1.5 py-0.5 inline-block uppercase tracking-wider animate-pulse">
                                          🔄 RETIRAR: {parseReturnItemsFromNotes(order?.delivery_notes).join(", ")}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* PLANIFICADOS / HOJAS DE RUTA TAB */}
            {activeTab === 'planned' && (
              <div className="space-y-4 min-w-max">
                {getPlannedGroups().filter(g => g.status === plannedSubTab).length === 0 ? (
                  <div className="text-center py-16 text-slate-400 space-y-2">
                    <Info className="w-10 h-10 mx-auto text-slate-300" />
                    <p className="font-bold text-xs">No hay hojas de ruta en estado {plannedSubTab.toLowerCase()}.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {getPlannedGroups()
                      .filter(g => g.status === plannedSubTab)
                      .map((group, index) => {
                        const allProcessed = group.items.every(d => d.status === 'entregado' || d.status === 'fallido');
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        const totalTheoretical = group.items
                          .filter(d => d.status === 'entregado' && d.orders?.payment_status !== 'Abonado')
                          .reduce((sum, d) => sum + Number(d.orders?.total_amount || 0), 0);

                        return (
                          <div key={index} className="border border-slate-100 rounded-3xl overflow-hidden shadow-sm bg-white min-w-max">
                            {/* Group Header - Ultra Compact */}
                            <div className="bg-slate-900 text-white px-3.5 py-2 flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[9px] font-black uppercase tracking-wider">
                                  {group.routeSheet.delivery_date ? new Date(group.routeSheet.delivery_date + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'S/D'}
                                </span>
                                <span className="px-1.5 py-0.5 rounded bg-brand-500 text-white text-[9px] font-black uppercase tracking-wider">
                                  R{group.run_number}
                                </span>
                                <h3 className="font-black text-xs tracking-tight">{group.carrier.name}</h3>
                                <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${
                                  group.status === 'Cerrada' 
                                    ? 'bg-slate-800 text-slate-400' 
                                    : group.status === 'En Viaje' 
                                      ? 'bg-blue-500 text-white animate-pulse'
                                      : 'bg-amber-500 text-white'
                                }`}>
                                  {group.status}
                                </span>
                                <span className="text-[9px] text-slate-400 font-semibold hidden lg:inline">
                                  | Vehículo: {group.carrier.vehicle_description || "S/D"} ({group.carrier.plate_number || "S/D"})
                                </span>
                              </div>
                              
                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => handleCopyRouteSheetWhatsApp(group.items, `${group.carrier.name} - R${group.run_number}`)}
                                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 hover:text-emerald-400 text-slate-300 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer border-none"
                                  title="Copiar enlaces de WhatsApp de todos los clientes en esta ruta"
                                >
                                  <MessageSquare className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                  <span>Copiar WA.me</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleCopyRouteSheetMaps(group.items, `${group.carrier.name} - R${group.run_number}`)}
                                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 hover:text-blue-400 text-slate-300 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer border-none"
                                  title="Copiar enlaces de mapas (uno por línea) de esta ruta"
                                >
                                  <Map className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                  <span>Copiar Mapas</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenProductSummary(group.items, `${group.carrier.name} - R${group.run_number}`)}
                                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 hover:text-emerald-400 text-slate-300 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer border-none"
                                  title="Ver listado consolidado de productos y cantidades de esta ruta"
                                >
                                  <Layers className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                  <span>Resumen Productos</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handlePrintRemitos(group.items)}
                                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 hover:text-amber-400 text-slate-300 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer border-none"
                                  title="Imprimir todos los remitos de esta hoja de ruta (2 por hoja A4 landscape)"
                                >
                                  <Printer className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                  <span>Imprimir Remitos</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenImportOrderModal(group.items, group.routeSheet.id, `${group.carrier.name} - R${group.run_number}`)}
                                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 hover:text-amber-400 text-slate-300 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer border-none"
                                  title="Pegar el orden de paradas optimizado desde la app de ruteo"
                                >
                                  <TrendingUp className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                  <span>Importar Orden</span>
                                </button>
                                {group.items.some(d => tempOrders[d.id] !== undefined && tempOrders[d.id] !== d.delivery_order) && (
                                  <button
                                    type="button"
                                    onClick={() => handleApplyManualSort(group.items)}
                                    className="px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer border-none animate-pulse"
                                    title="Aplicar y ordenar paradas según números manuales"
                                  >
                                    <Check className="w-3.5 h-3.5 shrink-0" />
                                    <span>Ordenar</span>
                                  </button>
                                )}
                                {group.status === 'Borrador' && (
                                  <button
                                    onClick={() => handleStartTrip(group.routeSheet.id)}
                                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1 cursor-pointer border-none"
                                  >
                                    <Navigation className="w-3.5 h-3.5" /> Iniciar Viaje (Despachar)
                                  </button>
                                )}
                                {group.status === 'En Viaje' && (
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => handleOpenReconciliation(group.routeSheet)}
                                      disabled={!allProcessed}
                                      className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1 cursor-pointer border-none ${
                                        allProcessed 
                                          ? 'bg-purple-600 hover:bg-purple-700 text-white animate-pulse' 
                                          : 'bg-slate-700 text-slate-400 cursor-not-allowed'
                                      }`}
                                      title={allProcessed ? "Arqueo y conciliación de caja de viaje" : "Falta cargar novedades de entrega para todas las paradas"}
                                    >
                                      <DollarSign className="w-3.5 h-3.5" /> Rendir Viaje
                                    </button>
                                    <button
                                      onClick={() => handleDirectCloseRouteSheet(group.routeSheet)}
                                      disabled={!allProcessed}
                                      className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1 cursor-pointer border-none ${
                                        allProcessed 
                                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white' 
                                          : 'bg-slate-700 text-slate-400 cursor-not-allowed'
                                      }`}
                                      title={allProcessed ? "Cerrar directamente con el teórico" : "Falta cargar novedades de entrega para todas las paradas"}
                                    >
                                      <CheckCircle className="w-3.5 h-3.5" /> Cierre Directo
                                    </button>
                                  </div>
                                )}
                                {group.status === 'Cerrada' && (
                                  <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                                      Conciliado: {formatPrice(group.routeSheet.total_reconciled_cash)} / {formatPrice(group.routeSheet.total_theoretical_cash)}
                                    </span>
                                    <div className="h-4 w-px bg-slate-700" />
                                    <div className="flex items-center gap-2">
                                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-lg border ${
                                        group.routeSheet.carrier_payout_status === 'Liquidado'
                                          ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30'
                                          : 'bg-amber-950/40 text-amber-400 border-amber-500/30'
                                      }`}>
                                        Flete: {group.routeSheet.carrier_payout_status || 'Pendiente'}
                                        {group.routeSheet.carrier_cost_calculated ? ` (${formatPrice(group.routeSheet.carrier_cost_calculated)})` : ''}
                                      </span>
                                      
                                      <button
                                        type="button"
                                        onClick={() => handleOpenSettlementModal(group.routeSheet, group.carrier)}
                                        className="px-3 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer border-none"
                                      >
                                        {group.routeSheet.carrier_payout_status === 'Liquidado' ? 'Editar Flete' : 'Liquidar Flete'}
                                      </button>
                                    </div>
                                  </div>
                                )}
                                {group.status === 'En Viaje' && (
                                  <button
                                    type="button"
                                    onClick={() => handleResetToDraft(group.routeSheet.id)}
                                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer border-none"
                                    title="Regresar esta hoja de ruta a Borrador para poder editarla"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                                    <span>Volver a Borrador</span>
                                  </button>
                                )}
                                {group.status !== 'Cerrada' && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteRouteSheet(group.routeSheet.id)}
                                    className="px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer border-none"
                                    title="Eliminar esta hoja de ruta y regresar todos los pedidos a pendientes"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 shrink-0" />
                                    <span>Eliminar Hoja</span>
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Table of stops */}
                            <div className="border-t border-slate-100 bg-white min-w-max">
                              <table className="w-full text-left border-collapse text-xs">
                                <thead>
                                  <tr className="bg-slate-50/75 border-b border-slate-100 font-black text-slate-400 text-[10px] uppercase tracking-wider select-none">
                                    <th className="px-3 py-3 w-8 text-center">#</th>
                                    <th className="px-3 py-3 w-20 text-center">Viaje</th>
                                    <th className="px-3 py-3">Vencimiento (Límite)</th>
                                    <th className="px-3 py-3">Código</th>
                                    <th className="px-3 py-3 text-center w-24">Tipo Cliente</th>
                                    <th className="px-3 py-3">Cliente</th>
                                    <th className="px-3 py-3">Detalle Entrega</th>
                                    <th className="px-3 py-3">Zona</th>
                                    <th className="px-3 py-3">Localidad y Dirección</th>
                                    <th className="px-3 py-3 text-center w-28">Confirmación</th>
                                    <th className="px-3 py-3 text-right">Facturación</th>
                                    <th className="px-3 py-3 text-center w-28">Estado Pago</th>
                                    <th className="px-3 py-3 text-center w-16">Acciones</th>
                                    <th className="px-3 py-3">Productos</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
                                  {group.items.map((del, i) => {
                                    const order = del.orders;
                                    const encomienda = del.encomiendas;
                                    if (!order && !encomienda) return null;
                                    
                                    const isEncomienda = !!del.encomienda_id;
                                    const zoneName = isEncomienda ? "Diligencia" : order?.zones?.name || "Sin Zona";
                                    const limitDateStr = isEncomienda
                                      ? (encomienda?.delivery_date ? new Date(encomienda.delivery_date + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'S/D')
                                      : (order?.max_delivery_date ? new Date(order.max_delivery_date + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'S/D');
                                    
                                    const code = isEncomienda ? encomienda?.code : order?.legacy_code || order?.id.substring(0, 8);
                                    const customerName = isEncomienda ? encomienda?.client_name || "Sin Contacto" : order?.customer_name;
                                    const phone = isEncomienda ? encomienda?.client_phone : order?.clients?.phone_primary;
                                    const notes = isEncomienda ? encomienda?.description : (order?.delivery_detail || order?.delivery_notes);
                                    const locality = isEncomienda ? encomienda?.locality : order?.locality;
                                    const address = isEncomienda ? encomienda?.address : order?.address;
                                    const mapsLink = isEncomienda ? encomienda?.google_maps_link : order?.google_maps_link;
                                    
                                    const clean = (str: string | null | undefined) => 
                                      (str || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                                    
                                    const isWarehousePickup = 
                                      clean(zoneName).includes("deposito") || 
                                      clean(locality).includes("deposito") || 
                                      clean(address).includes("deposito");
                                    
                                    const isCurrentDragged = draggedRowIndex === i && draggedRouteSheetId === group.routeSheet.id;
                                    
                                    return (
                                      <tr 
                                        key={del.id} 
                                        draggable={group.status === 'Borrador'}
                                        onDragStart={(e) => handleDragStart(e, i, group.routeSheet.id)}
                                        onDragOver={handleDragOver}
                                        onDrop={(e) => handleDrop(e, i, group.routeSheet.id, group.items)}
                                        onDragEnd={handleDragEnd}
                                        className={`hover:bg-slate-50/50 transition-colors ${
                                          isCurrentDragged 
                                            ? 'opacity-30 bg-slate-50 border-2 border-dashed border-slate-200' 
                                            : ''
                                        } ${group.status === 'Borrador' ? 'cursor-grab active:cursor-grabbing' : ''}`}
                                      >
                                        <td className="px-3 py-2 text-center">
                                          <div className="flex items-center justify-center gap-1">
                                            {group.status === 'Borrador' && (
                                              <GripVertical className="w-3.5 h-3.5 text-slate-400 cursor-grab active:cursor-grabbing shrink-0 select-none" />
                                            )}
                                            <input
                                              type="number"
                                              key={`${del.id}-${tempOrders[del.id] ?? del.delivery_order}`}
                                              value={tempOrders[del.id] ?? del.delivery_order}
                                              onChange={(e) => {
                                                const val = parseInt(e.target.value, 10);
                                                setTempOrders(prev => ({
                                                  ...prev,
                                                  [del.id]: isNaN(val) ? 0 : val
                                                }));
                                              }}
                                              onPaste={(e) => handlePasteOrderSequenceLocal(e, group.items, i)}
                                              className="w-10 text-center border border-slate-200 rounded p-0.5 text-[10px] font-black bg-slate-50 outline-none focus:bg-white focus:border-brand-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                              title="Orden de entrega. Pegá una lista de números y luego presioná 'Ordenar' arriba."
                                            />
                                          </div>
                                        </td>
                                        
                                        {/* Viaje Run Selector Dropdown */}
                                        <td className="px-3 py-2 text-center">
                                          <select
                                            value={del.run_number}
                                            onChange={(e) => handleMoveToRun(del, parseInt(e.target.value, 10))}
                                            disabled={group.status !== 'Borrador'}
                                            className="text-[10px] font-black border border-slate-200 rounded p-1 outline-none bg-slate-50 hover:bg-white disabled:bg-slate-100 disabled:cursor-not-allowed transition-colors cursor-pointer w-20 text-center"
                                            title="Mover pedido a otro viaje/recorrido del mismo chofer y día"
                                          >
                                            <option value={1}>Viaje 1</option>
                                            <option value={2}>Viaje 2</option>
                                            <option value={3}>Viaje 3</option>
                                            <option value={4}>Viaje 4</option>
                                          </select>
                                        </td>

                                        <td className="px-3 py-2">
                                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase border ${getLimitDateColorClass(isEncomienda ? encomienda?.delivery_date : order?.max_delivery_date)}`}>
                                            {limitDateStr}
                                          </span>
                                        </td>
                                        
                                        <td className="px-3 py-2">
                                          <button
                                            type="button"
                                            onClick={() => setPreviewDelivery(del)}
                                            className={`inline-flex items-center px-1.5 py-0.25 border rounded text-[10px] font-mono shrink-0 hover:bg-slate-200 hover:text-slate-800 transition-colors cursor-pointer text-left ${
                                              isEncomienda 
                                                ? 'bg-purple-50 border-purple-200 text-purple-700 font-extrabold' 
                                                : 'bg-slate-100 border-slate-200 text-slate-600'
                                            }`}
                                          >
                                            {code}
                                          </button>
                                        </td>

                                        {/* Tipo Cliente: Mayorista / Minorista / Encomienda */}
                                        <td className="px-3 py-2 text-center">
                                          {isEncomienda ? (
                                            <span className="inline-flex items-center px-2 py-0.5 bg-purple-50 border border-purple-200 text-purple-800 rounded-lg text-[9px] font-black uppercase tracking-wider">
                                              Encomienda
                                            </span>
                                          ) : (() => {
                                            const isWholesale = order?.channel === 'mayorista' || !!(
                                              (order?.legacy_code && (order.legacy_code.toUpperCase().startsWith("AQU") || order.legacy_code.toUpperCase().startsWith("POW") || order.legacy_code.toUpperCase().startsWith("AQ-DB"))) ||
                                              (order?.clients && (Array.isArray(order.clients) ? order.clients[0]?.is_wholesale : order.clients?.is_wholesale))
                                            );
                                            return isWholesale ? (
                                              <span className="inline-flex items-center px-2 py-0.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-[9px] font-black uppercase tracking-wider">
                                                Mayorista
                                              </span>
                                            ) : (
                                              <span className="inline-flex items-center px-2 py-0.5 bg-blue-50 border border-blue-200 text-blue-800 rounded-lg text-[9px] font-black uppercase tracking-wider">
                                                Minorista
                                              </span>
                                            );
                                          })()}
                                        </td>

                                        <td className="px-3 py-2">
                                           <div className="flex items-center gap-1.5 whitespace-nowrap">
                                             <button
                                               type="button"
                                               onClick={() => setPreviewDelivery(del)}
                                               className="font-extrabold text-slate-800 text-xs hover:text-brand-650 hover:underline transition-colors text-left cursor-pointer"
                                             >
                                               {customerName}
                                             </button>
                                             
                                             {phone && (
                                               <a 
                                                 href={`https://wa.me/${phone.replace(/\D/g, "")}`}
                                                 target="_blank"
                                                 rel="noreferrer"
                                                 className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 rounded text-[9px] font-bold transition-colors shrink-0"
                                                 title={`WhatsApp: ${phone}`}
                                               >
                                                 <MessageSquare className="w-2.5 h-2.5 text-emerald-500 shrink-0" />
                                                 <span>{phone}</span>
                                               </a>
                                             )}
                                           </div>
                                         </td>
                                         
                                        <td className="px-3 py-2 text-slate-500 font-medium text-[11px] max-w-[150px] truncate" title={notes || ""}>
                                          {notes || "-"}
                                        </td>
                                        
                                        <td className="px-3 py-2">
                                           {isEncomienda ? (
                                             <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black uppercase border shrink-0 bg-purple-50 border-purple-200 text-purple-750 whitespace-nowrap">
                                               Diligencia
                                             </span>
                                           ) : (
                                             <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black uppercase border shrink-0 whitespace-nowrap ${getZoneColorClass(zoneName, order?.zones?.color)}`}>
                                               {zoneName}
                                             </span>
                                           )}
                                        </td>
                                        
                                        <td className="px-3 py-2">
                                          <div className="text-xs leading-tight flex items-center gap-1.5 whitespace-nowrap">
                                            <span className="text-slate-800 font-black shrink-0">{locality}</span>
                                            <span className="text-slate-400 font-semibold shrink-0">-</span>
                                            <span className="text-slate-600 font-semibold text-[10px] truncate max-w-[300px]" title={address}>
                                              {address}
                                            </span>
                                            {mapsLink ? (
                                              <a href={mapsLink} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline font-black text-[9px] shrink-0">
                                                [Mapa ↗]
                                              </a>
                                            ) : (
                                              !isWarehousePickup && (
                                                <button
                                                  onClick={() => handleOpenEditAddressModal(isEncomienda ? encomienda!.id : order!.id, address || "", mapsLink || "", isEncomienda)}
                                                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black bg-rose-50 border border-rose-200 text-rose-600 tracking-wider shrink-0 hover:bg-rose-100 transition-colors cursor-pointer"
                                                  title="Falta cargar el enlace de Google Maps. Click para cargar."
                                                >
                                                  ⚠️ SIN MAPA
                                                </button>
                                              )
                                            )}
                                            <button
                                              onClick={() => handleOpenEditAddressModal(isEncomienda ? encomienda!.id : order!.id, address || "", mapsLink || "", isEncomienda)}
                                              className="p-0.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-all cursor-pointer shrink-0"
                                              title="Modificar dirección y mapa de entrega"
                                            >
                                              <Edit className="w-3 h-3" />
                                            </button>
                                          </div>
                                        </td>
                                        
                                        <td className="px-3 py-2 text-center">
                                           <select
                                             value={del.communication_status || "Pendiente"}
                                             onChange={(e) => handleUpdateCommunicationStatus(del.id, e.target.value)}
                                             className={`text-[10px] font-black border rounded-lg p-1 outline-none w-28 cursor-pointer transition-all ${
                                               del.communication_status === 'Confirmado' ? 'bg-emerald-50 border-emerald-300 text-emerald-700 font-bold' :
                                               del.communication_status === 'Mensaje Enviado' ? 'bg-blue-50 border-blue-300 text-blue-700 font-bold' :
                                               del.communication_status === 'Reprogramar' ? 'bg-amber-50 border-amber-300 text-amber-700 font-bold' :
                                               del.communication_status === 'No Responde' ? 'bg-rose-50 border-rose-300 text-rose-700 font-bold' :
                                               'bg-slate-50 border-slate-200 text-slate-600'
                                             }`}
                                           >
                                             <option value="Pendiente">⏳ Pendiente</option>
                                             <option value="Mensaje Enviado">💬 Enviado</option>
                                             <option value="Confirmado">✔️ Confirmado</option>
                                             <option value="Reprogramar">📅 Reprogramar</option>
                                             <option value="No Responde">🔇 No Responde</option>
                                           </select>
                                        </td>
                                        
                                        {/* Facturación */}
                                        <td className="px-3 py-2 text-right font-black text-slate-800 whitespace-nowrap">
                                          {isEncomienda ? '-' : formatPrice(order?.total_amount || 0)}
                                        </td>
                                        
                                        {/* Estado Pago */}
                                        <td className="px-3 py-2 text-center">
                                          {isEncomienda ? '-' : (() => {
                                            const payStatus = order?.payment_status || 'Pendiente';
                                            return (
                                              <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[9px] font-black uppercase border shrink-0 ${
                                                payStatus === 'Abonado' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                                                payStatus === 'Seniado' ? 'bg-amber-50 border-amber-200 text-amber-700' :
                                                'bg-rose-50 border-rose-200 text-rose-700'
                                              }`}>
                                                {payStatus}
                                              </span>
                                            );
                                          })()}
                                        </td>

                                        {/* Acciones */}
                                         <td className="px-3 py-2 text-center">
                                           {group.status === 'Borrador' ? (
                                             <button
                                               onClick={async () => {
                                                 if (confirm("¿Estás seguro de desvincular este pedido de la hoja de ruta? Volverá a estar pendiente.")) {
                                                   try {
                                                     const { error } = await supabase
                                                       .from('deliveries')
                                                       .update({
                                                         status: 'pendiente_ruteo',
                                                         carrier_id: null,
                                                         route_sheet_id: null,
                                                         delivery_order: 0,
                                                         updated_at: new Date().toISOString()
                                                       })
                                                       .eq('id', del.id);
                                                     if (error) throw error;
                                                     
                                                     // Reorder remaining items in group
                                                     const remaining = group.items.filter(item => item.id !== del.id);
                                                     for (let idx = 0; idx < remaining.length; idx++) {
                                                       await supabase
                                                         .from('deliveries')
                                                         .update({ delivery_order: idx + 1 })
                                                         .eq('id', remaining[idx].id);
                                                     }
                                                     
                                                     alert("Pedido desvinculado con éxito.");
                                                     loadAllData();
                                                   } catch (err) {
                                                     alert("Error al desvincular pedido: " + (err as AppError).message);
                                                   }
                                                 }
                                               }}
                                               className="p-1 hover:bg-rose-50 hover:border-rose-200 rounded border border-slate-200 text-rose-600 cursor-pointer bg-white"
                                               title="Desvincular y volver a pendientes"
                                             >
                                               <Trash2 className="w-3.5 h-3.5" />
                                             </button>
                                           ) : group.status === 'En Viaje' ? (
                                             (() => {
                                               if (del.status === 'entregado') {
                                                 return (
                                                   <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black uppercase bg-emerald-50 border border-emerald-250 text-emerald-700 whitespace-nowrap animate-in fade-in duration-200">
                                                     ✔️ Entregado
                                                   </span>
                                                 );
                                               }
                                               if (del.status === 'fallido') {
                                                 return (
                                                   <span 
                                                     className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black uppercase bg-rose-50 border border-rose-250 text-rose-700 whitespace-nowrap animate-in fade-in duration-200"
                                                     title={del.notes ? `Motivo: ${del.notes}` : undefined}
                                                   >
                                                     ❌ Fallido
                                                   </span>
                                                 );
                                               }
                                               return (
                                                 <div className="flex items-center justify-center gap-1">
                                                   <button
                                                     onClick={() => handleOpenDeliveryPayment(del)}
                                                     className="p-1 hover:bg-emerald-50 hover:border-emerald-200 rounded border border-slate-200 text-emerald-600 cursor-pointer bg-white"
                                                     title="Marcar como Entregado / Asentar Cobro"
                                                   >
                                                     <CheckCircle className="w-3.5 h-3.5" />
                                                   </button>
                                                   <button
                                                     onClick={() => handleTableMarkFailed(del.id)}
                                                     className="p-1 hover:bg-rose-50 hover:border-rose-200 rounded border border-slate-200 text-rose-600 cursor-pointer bg-white"
                                                     title="Reportar Rechazo / Falla"
                                                   >
                                                     <XCircle className="w-3.5 h-3.5" />
                                                   </button>
                                                 </div>
                                               );
                                             })()
                                           ) : group.status === 'Cerrada' ? (
                                             (() => {
                                               if (del.status === 'entregado') {
                                                 return (
                                                   <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black uppercase bg-emerald-50 border border-emerald-250 text-emerald-700 whitespace-nowrap">
                                                     ✔️ Entregado
                                                   </span>
                                                 );
                                               }
                                               if (del.status === 'fallido') {
                                                 return (
                                                   <span 
                                                     className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black uppercase bg-rose-50 border border-rose-250 text-rose-700 whitespace-nowrap"
                                                     title={del.notes ? `Motivo: ${del.notes}` : undefined}
                                                   >
                                                     ❌ Fallido
                                                   </span>
                                                 );
                                               }
                                               return <span className="text-slate-300 text-xs font-semibold">-</span>;
                                             })()
                                           ) : (
                                             <span className="text-slate-300 text-xs font-semibold">-</span>
                                           )}
                                         </td>

                                        {/* Productos */}
                                        <td className="px-3 py-2">
                                          {isEncomienda ? (
                                            <div className="flex flex-col gap-0.5 text-[10px] font-bold text-purple-800 leading-tight">
                                              <div className="whitespace-nowrap flex items-center gap-1">
                                                <span className="font-extrabold text-purple-700 bg-purple-50 border border-purple-100 px-1 py-0.25 rounded text-[8px] leading-none shrink-0 uppercase tracking-wider">
                                                  {encomienda?.type.replace('_', ' ')}
                                                </span>
                                                <span className="truncate max-w-[250px]" title={encomienda?.description}>
                                                  {encomienda?.description}
                                                </span>
                                              </div>
                                              {encomienda?.supplier?.name && (
                                                <div className="text-[8.5px] font-extrabold text-indigo-750 mt-0.5 flex items-center gap-1">
                                                  🏢 Proveedor: {encomienda.supplier.name}
                                                </div>
                                              )}
                                              {encomienda?.payment_amount && encomienda.payment_amount > 0 ? (
                                                <div className="text-[8.5px] font-extrabold text-emerald-700 mt-0.5 flex items-center gap-1">
                                                  💵 Pago: {formatPrice(encomienda.payment_amount)}
                                                </div>
                                              ) : null}
                                              {encomienda?.purchase && (
                                                <div className="text-[8.5px] font-semibold text-slate-450 mt-0.5">
                                                  🔗 OC: Factura {encomienda.purchase.invoice_number} ({encomienda.purchase.supplier?.name})
                                                </div>
                                              )}
                                            </div>
                                          ) : (() => {
                                            const items = order?.order_items || [];
                                            if (items.length === 0) return '-';
                                            const summary = getOrderCategorySummary(items);
                                            const itemsTooltip = items.map(i => `${i.quantity}x ${i.product_name}`).join('\n');
                                            return (
                                              <div className="flex flex-col gap-1 items-start">
                                                <span 
                                                  className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border shadow-2xs ${getCategoryBadgeStyle(summary.mainCategory)}`}
                                                  title={itemsTooltip}
                                                >
                                                  {summary.mainCategory}
                                                </span>

                                                {!isEncomienda && parseReturnItemsFromNotes(order?.delivery_notes).length > 0 && (
                                                  <div className="mt-1 text-[8.5px] font-black text-red-650 bg-red-50 border border-red-200 rounded px-1.5 py-0.5 inline-block uppercase tracking-wider animate-pulse">
                                                    🔄 RETIRAR: {parseReturnItemsFromNotes(order?.delivery_notes).join(", ")}
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          })()}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            )}

            {/* EN RECORRIDO TAB (CARGA DE NOVEDADES) */}
            {activeTab === 'in_transit' && (
              <div className="space-y-4">
                {inTransitList.length === 0 ? (
                  <div className="text-center py-16 text-slate-400 space-y-2">
                    <Info className="w-10 h-10 mx-auto text-slate-300" />
                    <p className="font-bold text-xs">No hay entregas activas en recorrido en este momento.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {inTransitList.map((del) => {
                      const order = del.orders;
                      if (!order) return null;
                      return (
                        <div key={del.id} className="border border-blue-100 bg-blue-50/10 rounded-2xl p-4 space-y-3 relative shadow-sm">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[9px] font-black bg-blue-100 text-blue-800 px-2 py-0.5 rounded uppercase">
                                  Chofer: {del.carriers?.name}
                                </span>
                                <span className="text-[9px] font-black bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded uppercase">
                                  R{del.run_number} - P{del.delivery_order}
                                </span>
                              </div>
                              <h4 className="font-black text-slate-900 text-sm mt-1.5">{order.customer_name}</h4>
                              <p className="text-[10px] text-slate-500 font-semibold flex items-center gap-0.5 mt-0.5">
                                <MapPin className="w-3 h-3 text-slate-400" /> {order.address} ({order.locality})
                              </p>
                              <p className="text-[10px] text-slate-600 font-black mt-1">
                                Importe Pedido: {formatPrice(order.total_amount)}
                              </p>
                              {del.notes && <p className="text-[10px] text-slate-400 mt-1 font-semibold italic">Nota: {del.notes}</p>}
                            </div>
                          </div>

                          <div className="border-t pt-3 flex justify-between items-center gap-2">
                            <button
                              onClick={() => handleOpenDeliveryPayment(del)}
                              className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1 cursor-pointer"
                            >
                              <CheckCircle className="w-3.5 h-3.5" /> Entregado / Asentar Cobro
                            </button>
                            <button
                              onClick={() => setSelectedDeliveryToFail(del.id)}
                              className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1 cursor-pointer"
                            >
                              <XCircle className="w-3.5 h-3.5" /> Reportar Rechazo / Falla
                            </button>
                          </div>

                          {/* Fail Notes Popover */}
                          {selectedDeliveryToFail === del.id && (
                            <div className="absolute inset-0 bg-white/95 backdrop-blur-sm p-4 rounded-2xl flex flex-col justify-between z-10 animate-in fade-in duration-100">
                              <div className="space-y-1">
                                <label className="text-[9px] font-black uppercase text-slate-400">Motivo del fallo / anulación *</label>
                                <textarea
                                  placeholder="Ej: Cliente ausente, calle anegada, pedido cancelado por cliente..."
                                  value={failNotes}
                                  onChange={(e) => setFailNotes(e.target.value)}
                                  className="w-full text-xs font-bold border rounded-xl p-2 outline-none h-16 bg-slate-50"
                                />
                              </div>
                              <div className="flex gap-1.5 flex-wrap">
                                {del.order_id ? (
                                  <>
                                    <button
                                      onClick={() => handleSetStatusFailed(del.id, failNotes)}
                                      disabled={!failNotes.trim()}
                                      className="flex-1 min-w-[90px] py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-lg text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-0.5"
                                      title="El pedido volverá a estar pendiente de ruteo"
                                    >
                                      Falla (Re-rutar)
                                    </button>
                                    <button
                                      onClick={() => handleSetStatusAnnulled(del.id, failNotes)}
                                      disabled={!failNotes.trim()}
                                      className="flex-1 min-w-[95px] py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-lg text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-0.5"
                                      title="El pedido quedará en revisión para el vendedor"
                                    >
                                      Anular (Revisión)
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    onClick={() => handleSetStatusFailed(del.id, failNotes)}
                                    disabled={!failNotes.trim()}
                                    className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-lg text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-0.5"
                                  >
                                    Confirmar Falla
                                  </button>
                                )}
                                <button
                                  onClick={() => { setSelectedDeliveryToFail(null); setFailNotes(""); }}
                                  className="px-2.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-0.5"
                                >
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* RETIRO EN DEPOSITO TAB */}
            {activeTab === 'take_away' && (
              <div className="space-y-4">
                {/* Warnings about open cash register */}
                {!openRegister && (
                  <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl flex items-center gap-2.5 text-xs font-semibold">
                    <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                    <span>
                      Atención: No posees un turno de Caja Diaria abierto en este momento. Las cobranzas en efectivo se registrarán pero no impactarán automáticamente en la caja diaria.
                    </span>
                  </div>
                )}

                <div className="relative max-w-md">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input 
                    type="text"
                    placeholder="Buscar pedido por cliente, código anterior..."
                    value={takeAwaySearchQuery}
                    onChange={(e) => setTakeAwaySearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold focus:border-brand-500 focus:bg-white transition-all outline-none"
                  />
                </div>

                {loadingTakeAway ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="w-7 h-7 animate-spin text-brand-600" />
                  </div>
                ) : pendingTakeAwayOrders.length === 0 ? (
                  <div className="text-center py-16 text-slate-400 space-y-2">
                    <Info className="w-10 h-10 mx-auto text-slate-300" />
                    <p className="font-bold text-xs">No se encontraron pedidos pendientes para retiro.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-slate-100 rounded-2xl">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100 font-bold text-slate-400 text-[10px] uppercase tracking-wider">
                          <th className="px-4 py-3">Código</th>
                          <th className="px-4 py-3">Cliente</th>
                          <th className="px-4 py-3">Localidad</th>
                          <th className="px-4 py-3">Medio de Pago Config.</th>
                          <th className="px-4 py-3">Importe Total</th>
                          <th className="px-4 py-3 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {pendingTakeAwayOrders.map(order => (
                          <tr key={order.id} className="hover:bg-slate-50/50">
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                onClick={() => setPreviewDelivery({ orders: order } as Delivery)}
                                className="font-semibold text-slate-500 hover:text-slate-800 hover:underline transition-colors text-left cursor-pointer font-mono text-[10px]"
                              >
                                {order.legacy_code || order.id.substring(0, 8)}
                              </button>
                            </td>
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                onClick={() => setPreviewDelivery({ orders: order } as Delivery)}
                                className="font-bold text-slate-800 hover:text-brand-650 hover:underline transition-colors text-left cursor-pointer"
                              >
                                {order.customer_name}
                              </button>
                            </td>
                            <td className="px-4 py-3 text-slate-600">{order.locality}</td>
                            <td className="px-4 py-3 font-semibold text-slate-500">
                              {order.payment_status}
                            </td>
                            <td className="px-4 py-3 font-bold text-brand-600">
                              {formatPrice(order.total_amount)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                onClick={() => handleOpenTakeAwayCobro(order)}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer"
                              >
                                Entregar y Cobrar
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* HISTORIAL TAB */}
            {activeTab === 'history' && (() => {
              // Group historyList by Route Sheet
              const groups: Record<string, {
                id: string;
                routeSheet: any;
                deliveries: typeof deliveries;
                date: string;
                carrierName: string;
                code: string;
                runNumber: number;
                successCount: number;
                failCount: number;
              }> = {};

              historyList.forEach(del => {
                const rs = del.route_sheets;
                const key = rs?.id || "no-route";
                if (!groups[key]) {
                  groups[key] = {
                    id: key,
                    routeSheet: rs || null,
                    deliveries: [],
                    date: rs?.delivery_date || del.real_delivery_date || del.delivery_date || "",
                    carrierName: del.carriers?.name || rs?.carriers?.name || "S/D",
                    code: rs?.code || "",
                    runNumber: del.run_number || rs?.run_number || 1,
                    successCount: 0,
                    failCount: 0
                  };
                }
                groups[key].deliveries.push(del);
                if (del.status === 'entregado') {
                  groups[key].successCount++;
                } else if (del.status === 'fallido') {
                  groups[key].failCount++;
                }
              });

              // Convert to array and sort by date descending, then by runNumber descending
              const sortedGroups = Object.values(groups).sort((a, b) => {
                const dateA = a.date ? new Date(a.date + 'T00:00:00').getTime() : 0;
                const dateB = b.date ? new Date(b.date + 'T00:00:00').getTime() : 0;
                if (dateB !== dateA) return dateB - dateA;
                return b.runNumber - a.runNumber;
              });

              // Sort deliveries inside each group by delivery_order to match stops order
              sortedGroups.forEach(group => {
                group.deliveries.sort((a, b) => (a.delivery_order || 0) - (b.delivery_order || 0));
              });

              return (
                <div className="space-y-4">
                  {sortedGroups.length === 0 ? (
                    <div className="text-center py-16 text-slate-400 space-y-2 bg-white rounded-3xl border border-slate-100">
                      <Info className="w-10 h-10 mx-auto text-slate-300" />
                      <p className="font-bold text-xs">No hay historial de entregas registradas.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {sortedGroups.map(group => {
                        const isExpanded = !!expandedHistoryRoutes[group.id];
                        const isNoRoute = group.id === "no-route";
                        const dateFormatted = isNoRoute
                          ? "Varios"
                          : (group.date 
                              ? new Date(group.date + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                              : "S/D");
                        const routeCode = isNoRoute
                          ? "Entregas Directas / Retiros"
                          : (group.code || `HR #${group.runNumber}`);
                        const carrierName = isNoRoute
                          ? "Sin Transportista"
                          : group.carrierName;

                        return (
                          <div key={group.id} className="border border-slate-100 rounded-3xl bg-white shadow-sm overflow-hidden transition-all duration-200">
                            {/* Header of Route Sheet */}
                            <div 
                              onClick={() => toggleHistoryRouteExpand(group.id)}
                              className="flex items-center justify-between p-4 bg-slate-50/50 hover:bg-slate-50 cursor-pointer select-none transition-colors"
                            >
                              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                                <div className="flex items-center gap-2">
                                  <div className="bg-brand-600 text-white rounded-xl p-2 font-black text-xs shadow-sm shadow-brand-500/10 shrink-0">
                                    📅 {dateFormatted}
                                  </div>
                                  <div className="font-mono text-xs font-bold text-slate-800 bg-slate-150 px-2 py-1 rounded-lg">
                                    {routeCode}
                                  </div>
                                </div>

                                <div className="text-xs font-bold text-slate-700">
                                  <span className="text-slate-400 uppercase text-[9px] block">Transportista</span>
                                  👤 {carrierName}
                                </div>

                                <div className="text-xs font-bold text-slate-700">
                                  <span className="text-slate-400 uppercase text-[9px] block">Resumen de Entregas</span>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className="inline-flex items-center px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-lg text-[10px] font-black border border-emerald-100">
                                      {group.successCount} Entregados
                                    </span>
                                    <span className="inline-flex items-center px-2 py-0.5 bg-rose-50 text-rose-700 rounded-lg text-[10px] font-black border border-rose-100">
                                      {group.failCount} Fallidos
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <button 
                                type="button"
                                className="p-1.5 hover:bg-slate-200 rounded-xl text-slate-400 hover:text-slate-600 transition-colors"
                              >
                                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>
                            </div>

                            {/* Expanded Deliveries List */}
                            {isExpanded && (
                              <div className="border-t border-slate-100 animate-in fade-in slide-in-from-top-2 duration-200">
                                <div className="overflow-x-auto">
                                  <table className="w-full text-left border-collapse text-xs">
                                    <thead>
                                      <tr className="bg-slate-50/20 border-b border-slate-100 font-bold text-slate-400 text-[10px] uppercase tracking-wider select-none">
                                        <th className={`px-4 py-2 text-center ${isNoRoute ? "w-20" : "w-12"}`}>{isNoRoute ? "Fecha" : "Parada"}</th>
                                        <th className="px-4 py-2 w-24">Código</th>
                                        <th className="px-4 py-2">Cliente</th>
                                        <th className="px-4 py-2">Destino / Dirección</th>
                                        <th className="px-4 py-2 text-center w-24">Estado</th>
                                        <th className="px-4 py-2">Detalles / Observaciones</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-150 font-semibold text-slate-700">
                                      {group.deliveries.map(del => {
                                        const order = del.orders;
                                        const encomienda = del.encomiendas;
                                        const isEnc = !!del.encomienda_id;
                                        
                                        const code = isEnc ? encomienda?.code : order?.legacy_code || order?.id.substring(0, 8);
                                        const customerName = isEnc ? encomienda?.client_name || "Sin Contacto" : order?.customer_name;
                                        const address = isEnc ? encomienda?.address : order?.address;
                                        const locality = isEnc ? encomienda?.locality : order?.locality;
                                        const isSuccess = del.status === 'entregado';

                                        return (
                                          <tr key={del.id} className="hover:bg-slate-50/30">
                                            <td className="px-4 py-2.5 text-center font-mono font-bold text-slate-400">
                                              {isNoRoute ? (
                                                (() => {
                                                  const dDate = del.real_delivery_date || del.delivery_date;
                                                  if (!dDate) return "S/D";
                                                  const parts = dDate.split('-');
                                                  if (parts.length === 3) {
                                                    return `${parts[2]}/${parts[1]}`;
                                                  }
                                                  return dDate;
                                                })()
                                              ) : (
                                                `#${del.delivery_order}`
                                              )}
                                            </td>
                                            <td className="px-4 py-2.5">
                                              <button
                                                type="button"
                                                onClick={() => setPreviewDelivery(del)}
                                                className={`inline-flex items-center px-1.5 py-0.25 border rounded text-[9px] font-mono hover:bg-slate-200 transition-colors text-left ${
                                                  isEnc 
                                                    ? 'bg-purple-50 border-purple-200 text-purple-700 font-extrabold' 
                                                    : 'bg-slate-100 border-slate-200 text-slate-600'
                                                }`}
                                              >
                                                {code}
                                              </button>
                                            </td>
                                            <td className="px-4 py-2.5">
                                              <button
                                                type="button"
                                                onClick={() => setPreviewDelivery(del)}
                                                className="font-extrabold text-slate-800 hover:text-brand-650 hover:underline transition-colors text-left"
                                              >
                                                {customerName}
                                              </button>
                                            </td>
                                            <td className="px-4 py-2.5 text-slate-500 text-[11px]">
                                              <div className="font-bold text-slate-700">{address}</div>
                                              <div>{locality}</div>
                                            </td>
                                            <td className="px-4 py-2.5 text-center">
                                              <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase border border-slate-100 ${
                                                isSuccess 
                                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                                                  : 'bg-rose-50 text-rose-700 border-rose-100'
                                              }`}>
                                                {del.status}
                                              </span>
                                            </td>
                                            <td className="px-4 py-2.5 text-slate-400 italic text-[11px] max-w-[200px] truncate" title={del.notes}>
                                              {del.notes || "-"}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* TRANSPORTISTAS TAB */}
            {activeTab === 'carriers' && (
              <div className="space-y-4">
                {carriers.length === 0 ? (
                  <div className="text-center py-16 text-slate-400 space-y-2">
                    <Info className="w-10 h-10 mx-auto text-slate-300" />
                    <p className="font-bold text-xs">No hay transportistas cargados en el sistema.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {carriers.map(c => (
                      <div key={c.id} className={`border rounded-2xl p-4 space-y-3 shadow-sm ${
                        c.is_active ? 'bg-white border-slate-100' : 'bg-slate-50 border-slate-200 opacity-60'
                      }`}>
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                              <User className="w-4 h-4 text-slate-400" /> {c.name}
                            </h4>
                            <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5 tracking-wider">
                              Vehículo: {c.vehicle_description || "S/D"}
                            </p>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${
                            c.is_active ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-slate-200 text-slate-600'
                          }`}>
                            {c.is_active ? 'Activo' : 'Inactivo'}
                          </span>
                        </div>

                        <div className="text-xs text-slate-500 font-semibold space-y-0.5">
                          <div>Patente: <span className="font-bold text-slate-700">{c.plate_number || "S/D"}</span></div>
                          <div>Teléfono: <span className="font-bold text-slate-700">{c.phone || "S/D"}</span></div>
                        </div>

                        <div className="border-t pt-3 flex justify-between items-center gap-2">
                          <button
                            onClick={() => toggleExpandCarrier(c.id)}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer border-none"
                          >
                            <Truck className="w-3.5 h-3.5 text-brand-600" />
                            <span>Tarifas y Vehículos ({vehicles.filter(v => v.carrier_id === c.id).length} | {carrierRates.filter(r => r.carrier_id === c.id).length})</span>
                            {expandedCarriers[c.id] ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                          
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleEditCarrier(c)}
                              className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg transition-all cursor-pointer"
                              title="Editar Datos"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleToggleCarrierActive(c.id, c.is_active)}
                              className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                                c.is_active 
                                  ? 'bg-rose-50 text-rose-600 hover:bg-rose-100' 
                                  : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                              }`}
                            >
                              {c.is_active ? 'Desactivar' : 'Reactivar'}
                            </button>
                          </div>
                        </div>

                        {/* EXPANDED VEHICLES AND RATES SECTION */}
                        {expandedCarriers[c.id] && (
                          <div className="border-t pt-3 mt-3 space-y-4 animate-in slide-in-from-top-2 duration-200">
                            {/* VEHICLES SECTION */}
                            <div className="space-y-2">
                              <div className="flex justify-between items-center">
                                <h5 className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Vehículos Vinc.</h5>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setVehicleCarrierId(c.id);
                                    setSelectedVehicleId(null);
                                    setVehicleType("");
                                    setVehiclePlate("");
                                    setVehicleMaxWeight("");
                                    setVehicleMaxVolume("");
                                    setVehicleMaxSpeed("");
                                    setVehicleActive(true);
                                    setShowVehicleModal(true);
                                  }}
                                  className="text-[9px] font-black text-brand-600 hover:text-brand-700 flex items-center gap-0.5 cursor-pointer uppercase border-none bg-transparent"
                                >
                                  <Plus className="w-3 h-3" /> Agregar
                                </button>
                              </div>

                              {vehicles.filter(v => v.carrier_id === c.id).length === 0 ? (
                                <p className="text-[10px] text-slate-400 font-semibold italic">Sin vehículos cargados.</p>
                              ) : (
                                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                                  {vehicles.filter(v => v.carrier_id === c.id).map(v => (
                                    <div key={v.id} className="bg-slate-50 p-2 rounded-xl border border-slate-100 flex justify-between items-center text-[10px] font-semibold text-slate-600">
                                      <div className="space-y-0.5">
                                        <div className="flex items-center gap-1.5">
                                          <span className="font-extrabold text-slate-800">{v.vehicle_type}</span>
                                          <span className="bg-slate-200 text-slate-700 px-1 rounded font-black text-[9px]">{v.plate_number}</span>
                                          {!v.is_active && <span className="text-red-500 font-bold">(Inactivo)</span>}
                                        </div>
                                        <div className="text-[9px] text-slate-400 font-medium">
                                          {v.max_weight_kg ? `${v.max_weight_kg}kg ` : ''}
                                          {v.max_volume_m3 ? `| ${v.max_volume_m3}m³ ` : ''}
                                          {v.max_speed_kmh ? `| ${v.max_speed_kmh}km/h` : ''}
                                        </div>
                                      </div>
                                      <div className="flex gap-1">
                                        <button
                                          type="button"
                                          onClick={() => handleEditVehicle(v)}
                                          className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer bg-transparent border-none"
                                        >
                                          <Edit className="w-3 h-3" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleToggleVehicleActive(v.id, v.is_active)}
                                          className={`text-[8px] font-black uppercase tracking-wider px-1 rounded ${
                                            v.is_active ? 'text-amber-600 bg-amber-50 hover:bg-amber-100' : 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100'
                                          } cursor-pointer border-none`}
                                        >
                                          {v.is_active ? 'Baja' : 'Alta'}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteVehicle(v.id)}
                                          className="text-red-400 hover:text-red-600 p-0.5 cursor-pointer bg-transparent border-none"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* RATES SECTION */}
                            <div className="space-y-2">
                              <div className="flex justify-between items-center">
                                <h5 className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Tarifas Asoc.</h5>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRateCarrierId(c.id);
                                    setSelectedRateId(null);
                                    setRateName("");
                                    setRateDailyRate("");
                                    setRateHourlyRate("");
                                    setRateOvertimeHourlyRate("");
                                    setRateAssistantRate("");
                                    setRateBaseKms("");
                                    setRateExtraKmRate("");
                                    setRateIncludesTolls(false);
                                    setRateLogisticsZoneIds([]);
                                    setRateStartDate(new Date().toISOString().split('T')[0]);
                                    setRateEndDate("");
                                    setRateActive(true);
                                    setShowRateModal(true);
                                  }}
                                  className="text-[9px] font-black text-brand-600 hover:text-brand-700 flex items-center gap-0.5 cursor-pointer uppercase border-none bg-transparent"
                                >
                                  <Plus className="w-3 h-3" /> Agregar
                                </button>
                              </div>

                              {carrierRates.filter(r => r.carrier_id === c.id).length === 0 ? (
                                <p className="text-[10px] text-slate-400 font-semibold italic">Sin tarifas asociadas.</p>
                              ) : (
                                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                                  {carrierRates.filter(r => r.carrier_id === c.id).map(r => (
                                    <div key={r.id} className="bg-slate-50 p-2 rounded-xl border border-slate-100 flex justify-between items-center text-[10px] font-semibold text-slate-600">
                                      <div className="space-y-0.5">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <span className="font-extrabold text-slate-800">{r.name}</span>
                                          {r.logistics_zone_ids && r.logistics_zone_ids.length > 0 ? (
                                            r.logistics_zone_ids.map(zId => {
                                              const z = zones.find(zone => zone.id === zId);
                                              return z ? (
                                                <span key={zId} className="bg-brand-50 text-brand-700 px-1.5 py-0.5 rounded font-extrabold text-[8px] uppercase">{z.name}</span>
                                              ) : null;
                                            })
                                          ) : r.zones?.name ? (
                                            <span className="bg-brand-50 text-brand-700 px-1.5 py-0.5 rounded font-extrabold text-[8px] uppercase">{r.zones.name}</span>
                                          ) : (
                                            <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-extrabold text-[8px] uppercase">Todas las Zonas</span>
                                          )}
                                          {!r.is_active && <span className="text-red-500 font-bold">(Inactiva)</span>}
                                        </div>
                                        <div className="text-[9px] font-extrabold text-slate-700">
                                          Jornada: {formatPrice(r.daily_rate)} | Extra Km: {formatPrice(r.extra_km_rate)} (Base {r.base_kms} Kms)
                                        </div>
                                        <div className="text-[8px] text-slate-400 font-medium">
                                          Vigencia: {r.start_date ? new Date(r.start_date + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'S/D'} 
                                          {r.end_date ? ` al ${new Date(r.end_date + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}` : ' (Indefinido)'}
                                        </div>
                                        { (r.hourly_rate || r.overtime_hourly_rate || r.assistant_rate || !r.includes_tolls) && (
                                          <div className="text-[8px] text-slate-400 font-bold bg-slate-100/50 p-1 rounded mt-1">
                                            {r.hourly_rate ? `Hora: ${formatPrice(r.hourly_rate)} ` : ''}
                                            {r.overtime_hourly_rate ? `| Extra Hr: ${formatPrice(r.overtime_hourly_rate)} ` : ''}
                                            {r.assistant_rate ? `| Acomp: ${formatPrice(r.assistant_rate)} ` : ''}
                                            | Peaje: {r.includes_tolls ? 'Incluido' : 'Se Reembolsa'}
                                          </div>
                                        )}
                                      </div>
                                      <div className="flex gap-1 shrink-0 ml-2">
                                        <button
                                          type="button"
                                          onClick={() => handleEditRate(r)}
                                          className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer bg-transparent border-none"
                                        >
                                          <Edit className="w-3 h-3" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleToggleRateActive(r.id, r.is_active)}
                                          className={`text-[8px] font-black uppercase tracking-wider px-1 rounded ${
                                            r.is_active ? 'text-amber-600 bg-amber-50 hover:bg-amber-100' : 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100'
                                          } cursor-pointer border-none`}
                                        >
                                          {r.is_active ? 'Baja' : 'Alta'}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteRate(r.id)}
                                          className="text-red-400 hover:text-red-600 p-0.5 cursor-pointer bg-transparent border-none"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* DELIVERY DETAILS PREVIEW MODAL */}
      {previewDelivery && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150">
          <div 
            className="fixed inset-0 z-0 cursor-default" 
            onClick={() => setPreviewDelivery(null)} 
          />
          <div className="relative z-10 bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-6 bg-slate-900 text-white flex justify-between items-start shrink-0">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border tracking-wider shrink-0 ${
                    previewDelivery.encomienda_id 
                      ? 'bg-purple-900/30 border-purple-800 text-purple-200' 
                      : 'bg-slate-800 border-slate-700 text-slate-300'
                  }`}>
                    {previewDelivery.encomienda_id ? "Diligencia / Encomienda" : "Pedido de Venta"}
                  </span>
                  {previewDelivery.orders?.legacy_code && (
                    <span className="px-2 py-0.5 rounded bg-brand-600 text-white text-[10px] font-mono shrink-0">
                      {previewDelivery.orders.legacy_code}
                    </span>
                  )}
                  {previewDelivery.encomiendas?.code && (
                    <span className="px-2 py-0.5 rounded bg-purple-600 text-white text-[10px] font-mono shrink-0">
                      {previewDelivery.encomiendas.code}
                    </span>
                  )}
                </div>
                <h3 className="text-xl font-black tracking-tight mt-2 text-white">
                  {previewDelivery.encomienda_id 
                    ? previewDelivery.encomiendas?.client_name || "Sin Contacto"
                    : previewDelivery.orders?.customer_name || "Cliente Desconocido"}
                </h3>
              </div>
              <button 
                onClick={() => setPreviewDelivery(null)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs text-slate-700">
              {/* Encomienda specific details */}
              {previewDelivery.encomienda_id ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5 p-3.5 bg-slate-50 border border-slate-100 rounded-2xl">
                      <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Información General</span>
                      <div className="space-y-1 font-bold">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Tipo:</span>
                          <span className="text-slate-800 uppercase">{previewDelivery.encomiendas?.type?.replace('_', ' ') || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Fecha de Entrega:</span>
                          <span className="text-slate-800">{previewDelivery.encomiendas?.delivery_date ? new Date(previewDelivery.encomiendas.delivery_date + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'S/D'}</span>
                        </div>
                        {previewDelivery.encomiendas?.client_phone && (
                          <div className="flex justify-between items-center pt-1">
                            <span className="text-slate-400">Teléfono:</span>
                            <span className="text-slate-800">{previewDelivery.encomiendas.client_phone}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1.5 p-3.5 bg-purple-50/30 border border-purple-100/50 rounded-2xl">
                      <span className="block text-[9px] font-black text-purple-400 uppercase tracking-widest">Proveedor y Compra</span>
                      <div className="space-y-1 font-bold">
                        <div className="flex justify-between">
                          <span className="text-purple-400">Proveedor:</span>
                          <span className="text-purple-800">{previewDelivery.encomiendas?.supplier?.name || 'No aplica'}</span>
                        </div>
                        {previewDelivery.encomiendas?.purchase?.invoice_number && (
                          <div className="flex justify-between">
                            <span className="text-purple-400">Factura Compra:</span>
                            <span className="text-purple-800">{previewDelivery.encomiendas.purchase.invoice_number}</span>
                          </div>
                        )}
                        {previewDelivery.encomiendas?.payment_amount && previewDelivery.encomiendas.payment_amount > 0 ? (
                          <div className="flex justify-between font-black text-purple-700">
                            <span>A Cobrar en Reparto:</span>
                            <span>{formatPrice(previewDelivery.encomiendas.payment_amount)}</span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Descripción / Aclaraciones de Diligencia</span>
                    <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl font-semibold text-slate-700 whitespace-pre-wrap">
                      {previewDelivery.encomiendas?.description || "Sin descripción adicional."}
                    </div>
                  </div>
                </>
              ) : (
                /* Order specific details */
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5 p-3.5 bg-slate-50 border border-slate-100 rounded-2xl">
                      <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Resumen de Venta</span>
                      <div className="space-y-1 font-bold">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Fecha Pedido:</span>
                          <span className="text-slate-800">{previewDelivery.orders?.order_date ? new Date(previewDelivery.orders.order_date + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'S/D'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Fecha Límite:</span>
                          <span className="text-slate-800">{previewDelivery.orders?.max_delivery_date ? new Date(previewDelivery.orders.max_delivery_date + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'S/D'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Canal:</span>
                          <span className="text-slate-800 uppercase tracking-wider text-[10px]">{previewDelivery.orders?.channel?.replace('_', ' ') || 'S/D'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Tipo Envío:</span>
                          <span className="text-slate-800">{previewDelivery.orders?.freight_type || 'Flete Propio'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5 p-3.5 bg-slate-50 border border-slate-100 rounded-2xl">
                      <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Liquidación y Pago</span>
                      <div className="space-y-1 font-bold">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Total Pedido:</span>
                          <span className="text-slate-800 font-extrabold">{formatPrice(previewDelivery.orders?.total_amount || 0)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Estado Pago:</span>
                          <span className={`inline-flex px-1.5 py-0.5 rounded text-[8px] font-black uppercase border ${
                            previewDelivery.orders?.payment_status === 'Abonado' 
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
                              : previewDelivery.orders?.payment_status === 'Seniado'
                                ? 'bg-amber-50 border-amber-200 text-amber-700'
                                : 'bg-rose-50 border-rose-200 text-rose-700'
                          }`}>
                            {previewDelivery.orders?.payment_status || 'Pendiente'}
                          </span>
                        </div>
                        {(previewDelivery.orders?.payment_status === 'Seniado' || 
                          (previewDelivery.orders?.totals?.deposit_amount && previewDelivery.orders.totals.deposit_amount > 0)) && (
                          <>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Total Seña:</span>
                              <span className="text-slate-800 font-extrabold">
                                {formatPrice(previewDelivery.orders?.totals?.deposit_amount || 0)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Falta Abonar:</span>
                              <span className="text-slate-800 font-extrabold">
                                {formatPrice(
                                  previewDelivery.orders?.totals?.pending_balance !== undefined
                                    ? previewDelivery.orders.totals.pending_balance
                                    : Math.max(0, (previewDelivery.orders?.total_amount || 0) - (previewDelivery.orders?.totals?.deposit_amount || 0))
                                )}
                              </span>
                            </div>
                          </>
                        )}
                        {previewDelivery.orders?.clients?.phone_primary && (
                          <div className="flex justify-between items-center pt-1">
                            <span className="text-slate-400">Teléfono:</span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-800">{previewDelivery.orders.clients.phone_primary}</span>
                              <a 
                                href={`https://wa.me/${previewDelivery.orders.clients.phone_primary.replace(/\D/g, "")}`}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1 hover:bg-emerald-50 rounded text-emerald-600 transition-colors"
                                title="Enviar WhatsApp"
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                              </a>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Order Items List */}
                  <div className="space-y-2">
                    <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Productos a Entregar</span>
                    <div className="border border-slate-100 rounded-2xl bg-white overflow-hidden divide-y divide-slate-50">
                      {previewDelivery.orders?.order_items && previewDelivery.orders.order_items.length > 0 ? (
                        previewDelivery.orders.order_items.map((item) => (
                          <div key={item.id} className="p-3.5 flex justify-between items-center gap-4 font-bold text-xs">
                            <div>
                              <span className="block text-slate-800 font-extrabold">{item.product_name}</span>
                              {item.sku && (
                                <span className="block text-[9px] text-slate-400 font-bold uppercase mt-0.5">SKU: {item.sku}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-4 text-right shrink-0">
                              <div className="text-slate-500">
                                <span className="text-[10px] text-slate-400 font-semibold mr-1">Cant:</span>
                                <span className="text-slate-800 font-black">{item.quantity} un.</span>
                              </div>
                              <div className="text-brand-650 font-black w-24">
                                {formatPrice(item.unit_price || 0)}
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-4 text-center text-slate-400 font-semibold">
                          No hay productos registrados en este pedido.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Return items alert from delivery notes */}
                  {parseReturnItemsFromNotes(previewDelivery.orders?.delivery_notes).length > 0 && (
                    <div className="p-4 bg-rose-50 border border-rose-250 rounded-2xl text-rose-800 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-rose-650 shrink-0" />
                        <span className="font-black text-xs uppercase tracking-wider">🔄 RETIRAR DE REGRESO</span>
                      </div>
                      <p className="font-bold text-[11px] text-rose-700">
                        Este viaje involucra el retiro de los siguientes artículos del domicilio del cliente:
                      </p>
                      <ul className="list-disc pl-5 font-black text-xs space-y-0.5 text-rose-900">
                        {parseReturnItemsFromNotes(previewDelivery.orders?.delivery_notes).map((ret, idx) => (
                          <li key={idx}>{ret}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}

              {/* Delivery Address & Notes */}
              <div className="space-y-4">
                <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest border-b pb-1.5 border-slate-100">
                  Instrucciones de Despacho y Dirección
                </span>
                
                <div className="space-y-3 font-bold text-xs">
                  <div className="flex justify-between items-start gap-4">
                    <span className="text-slate-400 shrink-0">Dirección:</span>
                    <span className="text-slate-800 text-right">
                      {previewDelivery.encomienda_id ? previewDelivery.encomiendas?.address : previewDelivery.orders?.address}
                      {` (${previewDelivery.encomienda_id ? previewDelivery.encomiendas?.locality : previewDelivery.orders?.locality})`}
                    </span>
                  </div>

                  {(previewDelivery.encomienda_id ? previewDelivery.encomiendas?.google_maps_link : previewDelivery.orders?.google_maps_link) && (
                    <div className="flex justify-between items-center gap-4">
                      <span className="text-slate-400">Geolocalización:</span>
                      <a 
                        href={previewDelivery.encomienda_id ? previewDelivery.encomiendas?.google_maps_link : previewDelivery.orders?.google_maps_link}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors uppercase tracking-wider font-black text-[9px] border border-blue-200/50"
                      >
                        <MapPin className="w-3.5 h-3.5" />
                        Ver en Google Maps
                      </a>
                    </div>
                  )}

                  {/* Notes */}
                  <div className="space-y-1">
                    <span className="block text-slate-400">Notas de Entrega:</span>
                    <div className="p-3 bg-slate-50 border border-slate-150 rounded-xl font-semibold text-slate-650 whitespace-pre-wrap">
                      {previewDelivery.encomienda_id ? previewDelivery.encomiendas?.description : (previewDelivery.orders?.delivery_detail || previewDelivery.orders?.delivery_notes || "Sin notas de entrega cargadas.")}
                    </div>
                  </div>

                  {/* Modification History Logs */}
                  {!previewDelivery.encomienda_id && selectedOrderHistory.length > 0 && (
                    <div className="space-y-3 pt-4 border-t border-slate-100">
                      <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">
                        Historial de Modificaciones
                      </span>
                      <div className="space-y-3">
                        {selectedOrderHistory.map((entry) => (
                          <div key={entry.id} className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-1.5 text-[11px]">
                            <div className="flex justify-between items-center text-slate-500 font-semibold text-[10px]">
                              <span>Modificado por: <span className="font-extrabold text-slate-700">{entry.changed_by_name}</span></span>
                              <span>{new Date(entry.changed_at).toLocaleString('es-AR')}</span>
                            </div>
                            <p className="font-bold text-slate-800 bg-white border border-slate-100 rounded-lg p-2 italic">
                              &ldquo;{entry.change_reason}&rdquo;
                            </p>
                            
                            <div className="text-[10px] text-slate-500 font-semibold">
                              <span className="font-extrabold uppercase text-[9px] text-slate-400 tracking-wider">Cambios Realizados:</span>
                              <ul className="list-disc pl-4 mt-1 space-y-0.5">
                                {entry.original_data.customer_name !== entry.modified_data.customer_name && (
                                  <li>Cliente: <span className="line-through text-rose-500">{entry.original_data.customer_name}</span> → <span className="text-emerald-600">{entry.modified_data.customer_name}</span></li>
                                )}
                                {entry.original_data.address !== entry.modified_data.address && (
                                  <li>Dirección: <span className="line-through text-rose-500">{entry.original_data.address}</span> → <span className="text-emerald-600">{entry.modified_data.address}</span></li>
                                )}
                                {entry.original_data.locality !== entry.modified_data.locality && (
                                  <li>Localidad: <span className="line-through text-rose-500">{entry.original_data.locality}</span> → <span className="text-emerald-600">{entry.modified_data.locality}</span></li>
                                )}
                                {entry.original_data.delivery_notes !== entry.modified_data.delivery_notes && (
                                  <li>Notas de entrega: <span className="italic text-slate-400">modificadas</span></li>
                                )}
                                {entry.original_data.delivery_detail !== entry.modified_data.delivery_detail && (
                                  <li>Detalles de entrega: <span className="italic text-slate-400">modificados</span></li>
                                )}
                                {JSON.stringify(entry.original_data.items) !== JSON.stringify(entry.modified_data.items) && (
                                  <li>Productos / cantidades / precios modificados.</li>
                                )}
                                {entry.original_data.total_amount !== entry.modified_data.total_amount && (
                                  <li>Total: <span className="line-through text-rose-500">{formatPrice(entry.original_data.total_amount)}</span> → <span className="text-emerald-600">{formatPrice(entry.modified_data.total_amount)}</span></li>
                                )}
                              </ul>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t flex gap-3 justify-end shrink-0">
              <Button 
                type="button"
                onClick={() => setPreviewDelivery(null)}
                variant="outline"
                className="rounded-xl px-5 py-2 font-bold text-xs uppercase"
              >
                Cerrar
              </Button>
              {!previewDelivery.encomienda_id && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      if (previewDelivery.orders) {
                        handleOpenEditOrder(previewDelivery.orders);
                      }
                    }}
                    className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 border-none cursor-pointer"
                  >
                    <Edit className="w-4 h-4" />
                    Editar Pedido
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handlePrintRemitos([previewDelivery]);
                      setPreviewDelivery(null);
                    }}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 border-none cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                    Imprimir Remito
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* RUTEO POSTPONEMENT MODAL */}
      {showRuteoPostponementModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-3xl">
              <div>
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">Reprogramación de Entrega</h2>
                <p className="text-[10px] font-bold text-slate-500 mt-0.5">Por favor, registra el motivo por el cual se pospone la fecha.</p>
              </div>
              <button 
                onClick={() => {
                  setShowRuteoPostponementModal(false);
                  setHasDeclaredRuteoPostponementReason(false);
                }} 
                className="p-1.5 hover:bg-slate-200 rounded-full transition-colors text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              {/* List of affected postponed deliveries */}
              {postponedDeliveriesList.length > 0 && (
                <div className="bg-amber-50/80 border border-amber-200/80 p-3 rounded-2xl space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="block text-[10px] font-black uppercase text-amber-900 tracking-wider">
                      {postponedDeliveriesList.length} {postponedDeliveriesList.length === 1 ? 'Pedido posterga su fecha original' : 'Pedidos postergan su fecha original'}:
                    </span>
                    <span className="text-[9px] bg-amber-200 text-amber-900 font-extrabold px-2 py-0.5 rounded-full">
                      Nueva Ruta: {formatDateDDMMYYYY(bulkDeliveryDate)}
                    </span>
                  </div>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                    {postponedDeliveriesList.map(d => {
                      const name = d.orders?.customer_name || d.encomiendas?.client_name || 'Cliente sin nombre';
                      const code = d.orders?.legacy_code || d.encomiendas?.code || 'SIN REF';
                      return (
                        <div key={d.id} className="flex items-center justify-between text-[11px] font-bold text-slate-800 bg-white/80 p-2 rounded-xl border border-amber-200/60 shadow-2xs">
                          <span className="truncate max-w-[200px]" title={name}>
                            <strong className="text-amber-900 font-mono">[{code}]</strong> {name}
                          </span>
                          <span className="text-[9px] text-amber-900 font-black shrink-0 bg-amber-100 px-1.5 py-0.5 rounded-md">
                            {formatDateDDMMYYYY(d.delivery_date)} ➔ {formatDateDDMMYYYY(bulkDeliveryDate)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <span className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Clasificación del Retraso</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRuteoPostponementReasonType('cliente')}
                    className={`py-3 px-4 rounded-xl border text-xs font-black uppercase tracking-wider transition-all flex flex-col items-center gap-1 cursor-pointer ${
                      ruteoPostponementReasonType === 'cliente'
                        ? 'border-brand-500 bg-brand-50/50 text-brand-700 shadow-sm'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    👤 Temas del Cliente
                    <span className="text-[9px] font-bold text-slate-400 lowercase italic normal-case font-normal">no está, reprogramó él, etc.</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRuteoPostponementReasonType('empresa')}
                    className={`py-3 px-4 rounded-xl border text-xs font-black uppercase tracking-wider transition-all flex flex-col items-center gap-1 cursor-pointer ${
                      ruteoPostponementReasonType === 'empresa'
                        ? 'border-brand-500 bg-brand-50/50 text-brand-700 shadow-sm'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    🚚 Temas de Empresa / Logística
                    <span className="text-[9px] font-bold text-slate-400 lowercase italic normal-case font-normal">falta stock, camión lleno, etc.</span>
                  </button>
                </div>
              </div>

              <div>
                <span className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Detalle / Observación (Opcional)</span>
                <textarea
                  value={ruteoPostponementMotive}
                  onChange={(e) => setRuteoPostponementMotive(e.target.value)}
                  placeholder="Ej: Reorganización masiva de ruta..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none h-20 bg-white"
                />
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-2 rounded-b-3xl">
              <button
                type="button"
                onClick={() => {
                  setShowRuteoPostponementModal(false);
                  setHasDeclaredRuteoPostponementReason(true);
                  if (!ruteoPostponementMotive) {
                    setRuteoPostponementMotive("Reorganización masiva de ruta");
                  }
                  setTimeout(() => {
                    handleSaveRouteBulk();
                  }, 50);
                }}
                className="px-3.5 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200/60 transition-all cursor-pointer"
              >
                Omitir y Asignar
              </button>
              
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowRuteoPostponementModal(false);
                    setHasDeclaredRuteoPostponementReason(false);
                  }}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowRuteoPostponementModal(false);
                    setHasDeclaredRuteoPostponementReason(true);
                    if (!ruteoPostponementMotive.trim()) {
                      setRuteoPostponementMotive("Asignación masiva de ruta");
                    }
                    setTimeout(() => {
                      handleSaveRouteBulk();
                    }, 50);
                  }}
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl text-xs shadow-md shadow-brand-500/10 transition-all cursor-pointer"
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MULTI-CODE PASTE MODAL */}
      {showMultiCodeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-3xl">
              <div>
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <ClipboardList className="w-4.5 h-4.5 text-brand-600" />
                  Pegar Lista de Códigos de Pedidos
                </h2>
                <p className="text-[10px] font-bold text-slate-500 mt-0.5">
                  Ingresá o pegá varios códigos (uno por línea, separados por comas o espacios).
                </p>
              </div>
              <button 
                type="button"
                onClick={() => setShowMultiCodeModal(false)}
                className="p-1.5 hover:bg-slate-200 rounded-full transition-colors text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <span className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">
                  Lista de Códigos
                </span>
                <textarea
                  value={multiCodeInput}
                  onChange={(e) => setMultiCodeInput(e.target.value)}
                  placeholder={"JS23992\nJS23966\nJS23860\nJS23764\n..."}
                  className="w-full px-3 py-2 border border-slate-200 rounded-2xl text-xs font-mono font-bold focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none h-44 bg-slate-50/70"
                />
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-2 rounded-b-3xl">
              <button
                type="button"
                onClick={() => {
                  setMultiCodeInput("");
                  setSearchTerm("");
                  setShowMultiCodeModal(false);
                }}
                className="px-3.5 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 transition-all cursor-pointer"
              >
                Limpiar Filtro
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm(multiCodeInput);
                    setShowMultiCodeModal(false);
                  }}
                  className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-bold rounded-xl text-xs transition-all cursor-pointer"
                >
                  Filtrar en Lista
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm(multiCodeInput);
                    setShowMultiCodeModal(false);

                    const rawTokens = multiCodeInput
                      .toLowerCase()
                      .split(/[\s,\n;\r]+/)
                      .map(t => t.trim())
                      .filter(t => t.length > 0);

                    if (rawTokens.length > 0) {
                      const matchingIds = new Set<string>();
                      deliveries.forEach(d => {
                        if (d.status !== 'pendiente_ruteo') return;
                        const order = d.orders;
                        const encomienda = d.encomiendas;
                        if (!order && !encomienda) return;

                        const client = (order ? (order.customer_name || "") : (encomienda?.client_name || "")).toLowerCase();
                        const code = (order ? (order.legacy_code || order.id || "") : (encomienda?.code || "")).toLowerCase();

                        if (rawTokens.some(t => client.includes(t) || code.includes(t))) {
                          matchingIds.add(d.id);
                        }
                      });
                      setSelectedDeliveryIds(matchingIds);
                    }
                  }}
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl text-xs shadow-md shadow-brand-500/10 transition-all cursor-pointer"
                >
                  Filtrar y Seleccionar Todos
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EDIT ORDER MODAL */}
      {showEditOrderModal && editingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150">
          <div 
            className="fixed inset-0 z-0 cursor-default" 
            onClick={() => {
              if (confirm("¿Seguro que desea cerrar? Se perderán los cambios no guardados.")) {
                setShowEditOrderModal(false);
              }
            }} 
          />
          <div className="relative z-10 bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center shrink-0">
              <div>
                <span className="px-2 py-0.5 rounded bg-brand-600 text-white text-[10px] font-mono uppercase tracking-wider">
                  Edición de Pedido: {editingOrder.legacy_code || editingOrder.id.substring(0, 8)}
                </span>
                <h3 className="text-lg font-black tracking-tight mt-1 text-white">Editar Información y Productos</h3>
              </div>
              <button 
                onClick={() => {
                  if (confirm("¿Seguro que desea cerrar? Se perderán los cambios no guardados.")) {
                    setShowEditOrderModal(false);
                  }
                }}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs text-slate-700">
              {/* General details grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400">Cliente *</label>
                  <input
                    type="text"
                    value={editCustomerName}
                    onChange={(e) => setEditCustomerName(e.target.value)}
                    className="w-full text-xs font-bold border rounded-xl p-2 outline-none bg-slate-50 focus:bg-white focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400">Localidad *</label>
                  <input
                    type="text"
                    value={editLocality}
                    onChange={(e) => setEditLocality(e.target.value)}
                    className="w-full text-xs font-bold border rounded-xl p-2 outline-none bg-slate-50 focus:bg-white focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-[10px] font-black uppercase text-slate-400">Dirección *</label>
                  <input
                    type="text"
                    value={editAddress}
                    onChange={(e) => setEditAddress(e.target.value)}
                    className="w-full text-xs font-bold border rounded-xl p-2 outline-none bg-slate-50 focus:bg-white focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-[10px] font-black uppercase text-slate-400">Enlace de Google Maps / Geolocalización</label>
                  <input
                    type="text"
                    value={editGoogleMapsLink}
                    onChange={(e) => setEditGoogleMapsLink(e.target.value)}
                    placeholder="https://maps.google.com/..."
                    className="w-full text-xs font-bold border rounded-xl p-2 outline-none bg-slate-50 focus:bg-white focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400">Notas de Entrega</label>
                  <textarea
                    value={editDeliveryNotes}
                    onChange={(e) => setEditDeliveryNotes(e.target.value)}
                    rows={2}
                    className="w-full text-xs font-bold border rounded-xl p-2 h-16 outline-none bg-slate-50 focus:bg-white focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400">Detalle de Entrega</label>
                  <textarea
                    value={editDeliveryDetail}
                    onChange={(e) => setEditDeliveryDetail(e.target.value)}
                    rows={2}
                    className="w-full text-xs font-bold border rounded-xl p-2 h-16 outline-none bg-slate-50 focus:bg-white focus:ring-1 focus:ring-brand-500"
                  />
                </div>
              </div>

              {/* Order Items Section */}
              <div className="space-y-3 pt-4 border-t border-slate-100">
                <div className="flex justify-between items-center">
                  <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Productos del Pedido
                  </span>
                  <span className="text-[10px] font-black text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                    Total Ítems: {editingOrderItems.length}
                  </span>
                </div>

                {/* Add product input/search */}
                <div className="relative p-3.5 bg-slate-50 rounded-2xl border border-slate-150 space-y-2" onClick={(e) => e.stopPropagation()}>
                  <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Agregar Producto al Pedido</span>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input 
                      type="text"
                      placeholder="Buscar por nombre o SKU del producto..."
                      value={productSearchQuery}
                      onChange={(e) => {
                        setProductSearchQuery(e.target.value);
                        setShowProductSuggestions(true);
                      }}
                      onFocus={() => setShowProductSuggestions(true)}
                      className="w-full pl-8 pr-8 py-1.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500/10 bg-white font-bold text-xs outline-none"
                    />
                    {productSearchQuery && (
                      <button 
                        type="button" 
                        onClick={() => {
                          setProductSearchQuery("");
                          setShowProductSuggestions(false);
                        }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-650"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {showProductSuggestions && productSearchQuery.trim() !== "" && (
                    <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto divide-y divide-slate-100">
                      {products
                        .filter(p => 
                          p.name.toLowerCase().includes(productSearchQuery.toLowerCase()) || 
                          (p.sku && p.sku.toLowerCase().includes(productSearchQuery.toLowerCase()))
                        )
                        .slice(0, 10)
                        .map(prod => (
                          <button
                            key={prod.id}
                            type="button"
                            onClick={() => {
                              const parts = (prod.sku || "").split(" - ");
                              const variantText = parts.length > 1 ? parts[parts.length - 1] : "";
                              const suffix = variantText ? ` (${variantText})` : "";
                              setEditingOrderItems(prev => [
                                ...prev,
                                {
                                  id: prod.id,
                                  product_name: prod.name + suffix,
                                  quantity: 1,
                                  unit_price: prod.price || 0
                                }
                              ]);
                              setProductSearchQuery("");
                              setShowProductSuggestions(false);
                            }}
                            className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 transition-colors flex justify-between items-center font-bold"
                          >
                            <div>
                              <span className="text-slate-800">{prod.name}</span>
                              {prod.sku && <span className="text-slate-400 text-[10px] ml-2 font-mono bg-slate-100 px-1 py-0.25 rounded">SKU: {prod.sku}</span>}
                            </div>
                            <div className="text-brand-650 font-black flex items-center gap-2">
                              <span>{formatPrice(prod.price || 0)}</span>
                              <span className="text-[10px] text-slate-455 font-semibold bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">Stock: {prod.stock_current}</span>
                            </div>
                          </button>
                        ))}
                      {products.filter(p => 
                        p.name.toLowerCase().includes(productSearchQuery.toLowerCase()) || 
                        (p.sku && p.sku.toLowerCase().includes(productSearchQuery.toLowerCase()))
                      ).length === 0 && (
                        <div className="p-3 text-center text-slate-400 font-semibold">
                          No se encontraron productos. 
                          <button
                            type="button"
                            onClick={() => {
                              setEditingOrderItems(prev => [
                                ...prev,
                                {
                                  id: null,
                                  product_name: productSearchQuery.trim(),
                                  quantity: 1,
                                  unit_price: 0
                                }
                              ]);
                              setProductSearchQuery("");
                              setShowProductSuggestions(false);
                            }}
                            className="ml-2 text-brand-600 hover:text-brand-700 underline font-black cursor-pointer"
                          >
                            Agregar como ítem personalizado sin enlace
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Items Editor List */}
                <div className="border border-slate-100 rounded-2xl bg-white overflow-hidden divide-y divide-slate-100">
                  {editingOrderItems.map((item, idx) => (
                    <div key={idx} className="p-3.5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 font-bold text-xs bg-white hover:bg-slate-50/50 transition-colors">
                      <div className="flex-1 w-full space-y-1">
                        <span className="block text-[9px] font-black uppercase text-slate-450 tracking-wider">Nombre del Producto / Color / Modelo</span>
                        <input
                          type="text"
                          value={item.product_name}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditingOrderItems(prev => prev.map((it, i) => i === idx ? { ...it, product_name: val } : it));
                          }}
                          className="w-full text-xs font-black border rounded-xl p-1.5 outline-none bg-slate-50 focus:bg-white focus:ring-1 focus:ring-brand-500"
                        />
                        {item.id === null && (
                          <span className="block text-[8px] font-black text-amber-600 bg-amber-50 px-1.5 py-0.25 rounded w-max uppercase tracking-wider mt-0.5">
                            ⚠️ Ítem personalizado (sin stock controlado)
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto w-full sm:w-auto justify-end">
                        <div className="w-20 space-y-1">
                          <span className="block text-[9px] font-black uppercase text-slate-450 tracking-wider">Cantidad</span>
                          <input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(e) => {
                              const val = Math.max(1, parseInt(e.target.value) || 1);
                              setEditingOrderItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: val } : it));
                            }}
                            className="w-full text-xs font-black border rounded-xl p-1.5 outline-none bg-slate-50 focus:bg-white text-center"
                          />
                        </div>
                        <div className="w-24 space-y-1">
                          <span className="block text-[9px] font-black uppercase text-slate-450 tracking-wider">Precio Unitario</span>
                          <input
                            type="number"
                            min={0}
                            value={item.unit_price}
                            onChange={(e) => {
                              const val = Math.max(0, parseFloat(e.target.value) || 0);
                              setEditingOrderItems(prev => prev.map((it, i) => i === idx ? { ...it, unit_price: val } : it));
                            }}
                            className="w-full text-xs font-black border rounded-xl p-1.5 outline-none bg-slate-50 focus:bg-white text-right"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingOrderItems(prev => prev.filter((_, i) => i !== idx));
                          }}
                          className="p-2 border rounded-xl hover:bg-rose-50 text-rose-600 border-slate-200 mt-4"
                          title="Eliminar de la lista"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recalculated totals warning */}
              <div className="p-4 bg-brand-50 border border-brand-100 rounded-2xl space-y-2">
                <span className="block text-[9px] font-black text-brand-600 uppercase tracking-widest">Resumen de Totales Estimados</span>
                {(() => {
                  const totals = calculateEditTotal();
                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-bold text-slate-700">
                      <div>
                        <span className="text-[10px] text-slate-450 block font-semibold">Subtotal:</span>
                        <span>{formatPrice(totals.subtotal)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-450 block font-semibold">Flete:</span>
                        <span>{formatPrice(totals.freight)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-450 block font-semibold">Recargos/IVA:</span>
                        <span>{formatPrice(totals.payment_surcharges + totals.tax)}</span>
                      </div>
                      <div className="text-brand-700">
                        <span className="text-[10px] text-brand-500 block font-black">Nuevo Total:</span>
                        <span className="text-sm font-black">{formatPrice(totals.total)}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Justification / Change Reason */}
              <div className="space-y-1.5 pt-4 border-t border-slate-100">
                <label className="text-[10px] font-black uppercase text-slate-500 flex items-center gap-1">
                  Justificación de la modificación *
                </label>
                <textarea
                  placeholder="Ej: Se cambia inodoro a color beige por solicitud del cliente vía WhatsApp. Se retira grifería del listado por falta de stock en depósito..."
                  value={editChangeReason}
                  onChange={(e) => setEditChangeReason(e.target.value)}
                  className="w-full text-xs font-bold border rounded-xl p-2.5 h-20 outline-none bg-slate-50 focus:bg-white focus:ring-1 focus:ring-brand-500"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t flex gap-3 justify-end shrink-0">
              <Button 
                type="button"
                onClick={() => {
                  if (confirm("¿Seguro que desea cerrar? Se perderán los cambios no guardados.")) {
                    setShowEditOrderModal(false);
                  }
                }}
                variant="outline"
                className="rounded-xl px-5 py-2 font-bold text-xs uppercase"
              >
                Cancelar
              </Button>
              <button
                type="button"
                disabled={isSavingEdit}
                onClick={handleSaveEditOrder}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 border-none cursor-pointer"
              >
                {isSavingEdit ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Guardando...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" /> Guardar Cambios
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELIVERIES ASENTAR COBRO MODAL */}
      {showDeliveryPaymentModal && processingDelivery && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl p-6 space-y-5">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] bg-slate-100 border text-slate-600 px-2 py-0.5 rounded font-black uppercase tracking-wider">
                  Rendición de parada #{processingDelivery.delivery_order}
                </span>
                <h3 className="text-lg font-black text-slate-900 tracking-tight mt-1.5">
                  Cobros de: {processingDelivery.orders?.customer_name}
                </h3>
              </div>
              <button 
                onClick={() => setShowDeliveryPaymentModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <div className="p-3.5 bg-slate-50 border rounded-2xl space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500 font-semibold">Total Teórico del Pedido:</span>
                <span className="font-extrabold text-slate-800">{formatPrice(processingDelivery.orders?.total_amount || 0)}</span>
              </div>
              <div className="flex justify-between text-brand-600 font-black">
                <span>Cobrado en Reparto:</span>
                <span>{formatPrice(modalPayments.reduce((s, p) => s + p.amount, 0))}</span>
              </div>
            </div>

            {/* Add Payment Form */}
            <div className="bg-slate-50/50 border border-dashed rounded-2xl p-4 space-y-3">
              <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Registrar Medio de Pago Traído</h4>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400">Medio de Pago</label>
                  <select
                    value={selectedMethodId}
                    onChange={(e) => setSelectedMethodId(e.target.value)}
                    className="w-full text-xs font-bold border rounded-lg p-2 bg-white outline-none"
                  >
                    <option value="">Seleccionar...</option>
                    {paymentMethods.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400">Monto Cobrado</label>
                  <input
                    type="number"
                    placeholder="Monto ARS"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    className="w-full text-xs font-bold border rounded-lg p-2 bg-white outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-400">Comentarios (Nº de Ref / Ticket)</label>
                <input
                  type="text"
                  placeholder="Ej: Ref 123456"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  className="w-full text-xs font-bold border rounded-lg p-2 bg-white outline-none"
                />
              </div>

              <button
                type="button"
                onClick={handleAddModalPayment}
                className="w-full py-2 bg-slate-900 hover:bg-black text-white rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Agregar cobro a la ración
              </button>
            </div>

            {/* List of added payments */}
            {modalPayments.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Detalle a Rendir</h4>
                <div className="border divide-y rounded-2xl overflow-hidden text-xs">
                  {modalPayments.map((p, idx) => {
                    const method = paymentMethods.find(m => m.id === p.payment_method_id);
                    return (
                      <div key={idx} className="flex justify-between items-center p-3 bg-white">
                        <div>
                          <span className="font-black text-slate-800">{method?.name}</span>
                          {p.notes && <span className="text-[10px] text-slate-400 font-semibold block">Obs: {p.notes}</span>}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-extrabold text-slate-800">{formatPrice(p.amount)}</span>
                          <button
                            onClick={() => handleRemoveModalPayment(idx)}
                            className="text-rose-500 hover:text-rose-700 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                type="button"
                onClick={handleConfirmDeliveryPayments}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer"
              >
                Confirmar Entrega y Cobros
              </button>
              <button
                type="button"
                onClick={() => setShowDeliveryPaymentModal(false)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ROUTE SHEET RECONCILIATION MODAL */}
      {showReconciliationModal && reconcilingRouteSheet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] bg-purple-50 border border-purple-100 text-purple-700 px-2 py-0.5 rounded font-black uppercase tracking-wider">
                  Arqueo y Rendición de Caja Central
                </span>
                <h3 className="text-lg font-black text-slate-900 tracking-tight mt-1.5">
                  Conciliación de Hoja de Ruta - Recorrido {reconcilingRouteSheet.run_number}
                </h3>
                <p className="text-[10px] text-slate-500 font-semibold">
                  Fecha: {new Date(reconcilingRouteSheet.delivery_date).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })} | Chofer: {carriers.find(c => c.id === reconcilingRouteSheet.carrier_id)?.name}
                </p>
              </div>
              <button 
                onClick={() => setShowReconciliationModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            {/* List of draft payments registered in this trip */}
            <div className="space-y-2">
              <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Cobros Traídos por el Fletero</h4>
              {reconciliationDrafts.length === 0 ? (
                <div className="text-center py-6 border border-dashed rounded-2xl text-slate-400 text-xs font-bold">
                  No se registraron cobros pendientes en este viaje (pedidos prepagados o impagos).
                </div>
              ) : (
                <div className="border divide-y rounded-2xl overflow-hidden text-xs max-h-40 overflow-y-auto">
                  {reconciliationDrafts.map((d, i) => (
                    <div key={i} className="flex justify-between items-center p-2.5 bg-slate-50/50">
                      <div>
                        <span className="font-bold text-slate-700">{d.orders?.customer_name}</span>
                        <span className="text-[9.5px] bg-slate-100 text-slate-500 rounded px-1 ml-1.5 uppercase font-medium">{d.payment_methods?.name}</span>
                      </div>
                      <span className="font-extrabold text-slate-800">{formatPrice(d.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Balance and Arqueo form */}
            {(() => {
              const cashMethod = paymentMethods.find(m => m.name.toLowerCase().includes('efectivo'));
              const theoreticalCash = reconciliationDrafts
                .filter(p => p.payment_method_id === cashMethod?.id)
                .reduce((sum, p) => sum + Number(p.amount), 0);
              
              const otherMethodsTotal = reconciliationDrafts
                .filter(p => p.payment_method_id !== cashMethod?.id)
                .reduce((sum, p) => sum + Number(p.amount), 0);

              const realCash = parseFloat(actualCashInput) || 0;
              const difference = realCash - theoreticalCash;

              return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Left Column: Totals Summary */}
                  <div className="p-4 bg-slate-50 border rounded-2xl space-y-3 text-xs">
                    <h5 className="font-black text-slate-800 uppercase tracking-wider text-[9px] border-b pb-1">Totales Teóricos a Rendir</h5>
                    
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-semibold">Total Efectivo a Recibir:</span>
                      <span className="font-extrabold text-slate-800">{formatPrice(theoreticalCash)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-semibold">Total Otros Medios (Transferencias, Tarjetas):</span>
                      <span className="font-extrabold text-slate-800">{formatPrice(otherMethodsTotal)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-2 font-black text-brand-600 text-sm">
                      <span>Total Teórico General:</span>
                      <span>{formatPrice(theoreticalCash + otherMethodsTotal)}</span>
                    </div>
                  </div>

                  {/* Right Column: Physical Cash input & discrepancies */}
                  <div className="p-4 border-2 border-purple-100 rounded-2xl space-y-3 text-xs">
                    <h5 className="font-black text-purple-700 uppercase tracking-wider text-[9px] border-b border-purple-100 pb-1">Arqueo de Efectivo Físico</h5>
                    
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase text-slate-400">Efectivo Físico Entregado *</label>
                      <div className="relative">
                        <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="number"
                          placeholder="Monto en pesos"
                          value={actualCashInput}
                          onChange={(e) => setActualCashInput(e.target.value)}
                          className="w-full pl-7 pr-3 py-2 border rounded-xl bg-slate-50/50 font-bold text-xs outline-none focus:bg-white focus:border-purple-500 transition-all"
                        />
                      </div>
                    </div>

                    <div className="flex justify-between items-center font-bold">
                      <span>Diferencia de Caja:</span>
                      <span className={`px-2 py-0.5 rounded font-black ${
                        difference === 0 
                          ? 'bg-emerald-50 text-emerald-700' 
                          : difference > 0 
                            ? 'bg-blue-50 text-blue-700' 
                            : 'bg-rose-50 text-rose-700'
                      }`}>
                        {difference === 0 ? 'Sin diferencia' : formatPrice(difference)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Reconciliation notes */}
            <div className="space-y-1 text-xs">
              <label className="text-[9px] font-black uppercase text-slate-400">Observaciones Generales de la Rendición</label>
              <textarea
                placeholder="Ej: Faltó $100 que el chofer rinde mañana, transferencias controladas en el banco, etc."
                value={reconciliationNotes}
                onChange={(e) => setReconciliationNotes(e.target.value)}
                className="w-full border rounded-xl p-2.5 outline-none h-16 bg-slate-50 font-bold text-xs"
              />
            </div>

            {/* Action buttons */}
            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                type="button"
                onClick={handleConfirmReconciliation}
                disabled={submittingReconciliation}
                className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer"
              >
                {submittingReconciliation ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Confirmar Rendición y Aprobar Cobros
              </button>
              <button
                type="button"
                onClick={() => setShowReconciliationModal(false)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RETIRO EN DEPOSITO COBRO MODAL */}
      {showTakeAwayModal && processingTakeAwayOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] bg-emerald-50 border border-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-black uppercase tracking-wider">
                  Retiro en Depósito Directo
                </span>
                <h3 className="text-lg font-black text-slate-900 tracking-tight mt-1.5">
                  Entrega y Cobro de: {processingTakeAwayOrder.customer_name}
                </h3>
              </div>
              <button 
                onClick={() => { setShowTakeAwayModal(false); setProcessingTakeAwayOrder(null); }}
                className="text-slate-400 hover:text-slate-600"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 border rounded-2xl text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500 font-semibold">Total a Cobrar:</span>
                <span className="font-extrabold text-slate-800">{formatPrice(processingTakeAwayOrder.total_amount)}</span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-400">Medio de Pago</label>
                <select
                  value={takeAwayMethodId}
                  onChange={(e) => setTakeAwayMethodId(e.target.value)}
                  className="w-full text-xs font-bold border rounded-lg p-2 bg-slate-50 outline-none"
                >
                  <option value="">Seleccionar...</option>
                  {paymentMethods.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-400">Monto Recibido</label>
                <input
                  type="number"
                  placeholder="Monto ARS"
                  value={takeAwayAmount}
                  onChange={(e) => setTakeAwayAmount(e.target.value)}
                  className="w-full text-xs font-bold border rounded-lg p-2 bg-slate-50 outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-400">Comentarios / Notas</label>
                <input
                  type="text"
                  placeholder="Nº referencia, etc..."
                  value={takeAwayNotes}
                  onChange={(e) => setTakeAwayNotes(e.target.value)}
                  className="w-full text-xs font-bold border rounded-lg p-2 bg-slate-50 outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                type="button"
                onClick={handleConfirmTakeAway}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer"
              >
                Confirmar Entrega y Pago
              </button>
              <button
                type="button"
                onClick={() => { setShowTakeAwayModal(false); setProcessingTakeAwayOrder(null); }}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CARRIER ADD/EDIT MODAL */}
      {showCarrierModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <h3 className="text-lg font-black text-slate-900 tracking-tight">
              {selectedCarrierId ? "Editar Transportista" : "Agregar Nuevo Transportista"}
            </h3>

            <form onSubmit={handleSaveCarrier} className="space-y-3">
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Nombre del Chofer *</label>
                <input 
                  type="text" 
                  required
                  placeholder="Ej: Juan Pérez"
                  value={carrierName}
                  onChange={(e) => setCarrierName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold focus:border-brand-500 focus:bg-white transition-all outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Descripción del Vehículo</label>
                <input 
                  type="text"
                  placeholder="Ej: Camioneta Ford F100 Roja"
                  value={carrierVehicle}
                  onChange={(e) => setCarrierVehicle(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold focus:border-brand-500 focus:bg-white transition-all outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Número de Patente / Matrícula</label>
                <input 
                  type="text"
                  placeholder="Ej: ABC 123"
                  value={carrierPlate}
                  onChange={(e) => setCarrierPlate(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold focus:border-brand-500 focus:bg-white transition-all outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Teléfono de Contacto</label>
                <input 
                  type="text"
                  placeholder="Ej: 3794123456"
                  value={carrierPhone}
                  onChange={(e) => setCarrierPhone(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold focus:border-brand-500 focus:bg-white transition-all outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="submit"
                  className="px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                >
                  Guardar
                </button>
                <button
                  type="button"
                  onClick={() => setShowCarrierModal(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT ADDRESS AND MAP MODAL */}
      {showEditAddressModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <h3 className="text-lg font-black text-slate-900 tracking-tight">
              Modificar Dirección de Entrega
            </h3>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Dirección de Entrega</label>
                <textarea 
                  rows={3}
                  placeholder="Calle, Número, Piso, Departamento, etc."
                  value={editingAddress}
                  onChange={(e) => setEditingAddress(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold focus:border-brand-500 focus:bg-white transition-all outline-none resize-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Enlace de Google Maps</label>
                <input 
                  type="text"
                  placeholder="https://maps.google.com/?q=..."
                  value={editingMapsLink}
                  onChange={(e) => setEditingMapsLink(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold focus:border-brand-500 focus:bg-white transition-all outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={handleSaveAddressAndMap}
                  disabled={savingAddress}
                  className="px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  {savingAddress && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {savingAddress ? "Guardando..." : "Guardar Cambios"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowEditAddressModal(false);
                    setEditingOrderId("");
                    setEditingAddress("");
                    setEditingMapsLink("");
                  }}
                  disabled={savingAddress}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* IMPORT ROUTE ORDER MODAL */}
      {showImportOrderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <h3 className="text-lg font-black text-slate-900 tracking-tight">
              Importar Orden de Paradas
            </h3>
            <p className="text-xs font-semibold text-slate-500">
              Pegá la columna de números del recorrido optimizado (uno debajo del otro). El sistema reordenará automáticamente la secuencia de paradas de <strong>{importOrderRouteSheetName}</strong> en base a su carga original de mapas.
            </p>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Secuencia de Paradas (Números)</label>
                <textarea 
                  rows={8}
                  placeholder="Ej:&#10;12&#10;6&#10;10&#10;11&#10;7"
                  value={importOrderText}
                  onChange={(e) => setImportOrderText(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono font-bold focus:border-brand-500 focus:bg-white transition-all outline-none resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={handleApplyImportOrder}
                  disabled={savingImportOrder}
                  className="px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  {savingImportOrder && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {savingImportOrder ? "Aplicando..." : "Aplicar Secuencia"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowImportOrderModal(false);
                    setImportOrderRouteSheetId("");
                    setImportOrderRouteSheetName("");
                    setImportOrderText("");
                    setImportOrderDeliveries([]);
                  }}
                  disabled={savingImportOrder}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PRODUCT SUMMARY MODAL */}
      {showProductSummaryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl p-6 space-y-4 flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
              <div>
                <h3 className="text-base font-black text-slate-900 tracking-tight">
                  Resumen de Productos
                </h3>
                <p className="text-xs font-semibold text-slate-400">
                  {summaryRouteSheetName}
                </p>
              </div>
              <button 
                onClick={() => {
                  setShowProductSummaryModal(false);
                  setSummaryRouteSheetName("");
                  setSummaryProducts([]);
                }}
                className="text-slate-400 hover:text-slate-650 p-1 rounded-lg hover:bg-slate-100 transition-all cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1">
              {summaryProducts.length === 0 ? (
                <div className="text-center py-8 text-slate-400 font-bold text-xs">
                  No hay productos cargados en este recorrido.
                </div>
              ) : (
                <div className="border border-slate-150 rounded-2xl overflow-hidden divide-y divide-slate-100">
                  {summaryProducts.map((p, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3.5 hover:bg-slate-50/50 transition-colors">
                      <span className="text-xs font-bold text-slate-700">{p.name}</span>
                      <span className="px-2.5 py-1 bg-brand-50 border border-brand-100 text-brand-700 rounded-lg text-xs font-black shrink-0">
                        {p.quantity} unid.
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3 shrink-0">
              <button
                type="button"
                onClick={handleCopyProductSummaryText}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5"
              >
                <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                Copiar Lista
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowProductSummaryModal(false);
                  setSummaryRouteSheetName("");
                  setSummaryProducts([]);
                }}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-650 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NEW ENCOMIENDA MODAL */}
      {showEncomiendaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150">
          <form 
            onSubmit={handleSaveEncomienda}
            className="bg-white rounded-3xl w-full max-w-xl shadow-2xl p-6 space-y-4 flex flex-col max-h-[90vh]"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
              <div>
                <h3 className="text-base font-black text-purple-900 tracking-tight flex items-center gap-1.5">
                  📦 Cargar Nueva Diligencia / Encomienda
                </h3>
                <p className="text-xs font-semibold text-slate-400">
                  Las diligencias aparecen automáticamente en logística como paradas a rutear.
                </p>
              </div>
              <button 
                type="button"
                onClick={() => setShowEncomiendaModal(false)}
                className="text-slate-400 hover:text-slate-650 p-1 rounded-lg hover:bg-slate-100 transition-all cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                
                {/* Tipo de Diligencia */}
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 font-bold">Tipo de Diligencia *</label>
                  <select
                    value={encomiendaType}
                    onChange={e => setEncomiendaType(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-xs outline-none focus:ring-2 focus:ring-purple-550/10 cursor-pointer text-slate-800"
                    required
                  >
                    <option value="llevar_pago">💸 Llevar Pago</option>
                    <option value="buscar_mercaderia">📦 Buscar Mercadería</option>
                    <option value="buscar_insumos">🛠️ Buscar Insumos</option>
                    <option value="tramite_general">📝 Trámite General</option>
                    <option value="otro">❓ Otro</option>
                  </select>
                </div>

                {/* Fecha Programada */}
                <DateInput
                  label="Fecha Programada *"
                  value={encomiendaDate}
                  onChange={setEncomiendaDate}
                  required
                />

                {/* Destinatario / Cliente */}
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 font-bold">Contacto / Destinatario (Opcional)</label>
                  <input
                    type="text"
                    value={encomiendaClientName}
                    onChange={e => setEncomiendaClientName(e.target.value)}
                    placeholder="Nombre de la persona o contacto"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-xs outline-none focus:ring-2 focus:ring-purple-550/10"
                  />
                </div>

                {/* Teléfono */}
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 font-bold">Teléfono (Opcional)</label>
                  <input
                    type="text"
                    value={encomiendaClientPhone}
                    onChange={e => setEncomiendaClientPhone(e.target.value)}
                    placeholder="Ej: 1155443322"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-xs outline-none focus:ring-2 focus:ring-purple-550/10"
                  />
                </div>

                {/* Dirección */}
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 font-bold">Dirección de Diligencia *</label>
                  <input
                    type="text"
                    value={encomiendaAddress}
                    onChange={e => setEncomiendaAddress(e.target.value)}
                    placeholder="Ej: Av. Santa Fe 1234"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-xs outline-none focus:ring-2 focus:ring-purple-550/10"
                    required
                  />
                </div>

                {/* Localidad */}
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 font-bold">Localidad *</label>
                  <input
                    type="text"
                    list="encomiendas-localities-list"
                    value={encomiendaLocality}
                    onChange={e => setEncomiendaLocality(e.target.value)}
                    placeholder="Ej: Tigre, San Fernando"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-xs outline-none focus:ring-2 focus:ring-purple-550/10"
                    required
                  />
                  <datalist id="encomiendas-localities-list">
                    {allLocalities.map(loc => (
                      <option key={loc.id} value={loc.name} />
                    ))}
                  </datalist>
                </div>

                {/* Enlace Maps */}
                <div className="space-y-1 md:col-span-2">
                  <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 font-bold">Enlace Google Maps (Opcional)</label>
                  <input
                    type="url"
                    value={encomiendaMapsLink}
                    onChange={e => setEncomiendaMapsLink(e.target.value)}
                    placeholder="https://maps.google.com/..."
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-xs outline-none focus:ring-2 focus:ring-purple-550/10"
                  />
                </div>

                {/* Monto de pago si corresponde */}
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 font-bold">Monto de Pago ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={encomiendaPaymentAmount}
                    onChange={e => setEncomiendaPaymentAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-xs outline-none focus:ring-2 focus:ring-purple-550/10 text-emerald-700 font-bold"
                  />
                </div>

                {/* Proveedor Relacionado */}
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 font-bold">Proveedor Relacionado</label>
                  <select
                    value={encomiendaSupplierId}
                    onChange={e => {
                      const supId = e.target.value;
                      setEncomiendaSupplierId(supId);
                      setEncomiendaPurchaseId("");
                      setEncomiendaInvoiceNumber("");
                      if (supId) {
                        loadPurchases(supId);
                      } else {
                        setDbPurchases([]);
                      }
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-xs outline-none focus:ring-2 focus:ring-purple-550/10 cursor-pointer text-slate-800"
                  >
                    <option value="">Ninguno / No corresponde</option>
                    {loadingSuppliers ? (
                      <option disabled>Cargando proveedores...</option>
                    ) : (
                      dbSuppliers.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))
                    )}
                  </select>
                </div>

                {/* Compra/Factura Relacionada si hay proveedor */}
                {encomiendaSupplierId && (
                  <>
                    <div className="space-y-1 animate-in fade-in duration-200">
                      <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 font-bold">Compra Relacionada</label>
                      <select
                        value={encomiendaPurchaseId}
                        onChange={e => {
                          const purId = e.target.value;
                          setEncomiendaPurchaseId(purId);
                          const pur = dbPurchases.find(p => p.id === purId);
                          if (pur) {
                            setEncomiendaInvoiceNumber(pur.invoice_number);
                          } else {
                            setEncomiendaInvoiceNumber("");
                          }
                        }}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-xs outline-none focus:ring-2 focus:ring-purple-550/10 cursor-pointer text-slate-800"
                      >
                        <option value="">Ninguna / Cargar número manual</option>
                        {loadingPurchases ? (
                          <option disabled>Cargando compras...</option>
                        ) : (
                          dbPurchases.map(p => (
                            <option key={p.id} value={p.id}>Factura N° {p.invoice_number}</option>
                          ))
                        )}
                      </select>
                    </div>

                    <div className="space-y-1 animate-in fade-in duration-200">
                      <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 font-bold">Número de Factura / Ref</label>
                      <input
                        type="text"
                        value={encomiendaInvoiceNumber}
                        onChange={e => setEncomiendaInvoiceNumber(e.target.value)}
                        placeholder="Nro Factura o Remito Proveedor"
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-xs outline-none focus:ring-2 focus:ring-purple-550/10"
                      />
                    </div>
                  </>
                )}

                {/* Descripción de Tarea */}
                <div className="space-y-1 md:col-span-2">
                  <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 font-bold">Descripción del Trámite *</label>
                  <textarea
                    value={encomiendaDescription}
                    onChange={e => setEncomiendaDescription(e.target.value)}
                    placeholder="Ej: Retirar 5 rollos de cable y firmar remito duplicado."
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-xs outline-none focus:ring-2 focus:ring-purple-550/10 resize-y h-16"
                    required
                  />
                </div>

                {/* Notas Administrativas */}
                <div className="space-y-1 md:col-span-2">
                  <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 font-bold">Notas Administrativas (Opcional)</label>
                  <textarea
                    value={encomiendaNotes}
                    onChange={e => setEncomiendaNotes(e.target.value)}
                    placeholder="Notas internas que no ve el transportista en la dirección principal."
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-xs outline-none focus:ring-2 focus:ring-purple-550/10 resize-y h-16"
                  />
                </div>

              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3 shrink-0">
              <button
                type="button"
                onClick={() => setShowEncomiendaModal(false)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-650 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingEncomienda}
                className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-md shadow-purple-600/10"
              >
                {savingEncomienda ? "Guardando..." : "Crear Diligencia"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* VEHICLE MODAL */}
      {showVehicleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <h3 className="text-lg font-black text-slate-900 tracking-tight">
              {selectedVehicleId ? "Editar Vehículo" : "Agregar Nuevo Vehículo"}
            </h3>

            <form onSubmit={handleSaveVehicle} className="space-y-3">
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Tipo de Vehículo *</label>
                <input 
                  type="text" 
                  required
                  placeholder="Ej: Camión, Camioneta, Furgón"
                  value={vehicleType}
                  onChange={(e) => setVehicleType(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold focus:border-brand-500 focus:bg-white transition-all outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Patente / Matrícula *</label>
                <input 
                  type="text"
                  required
                  placeholder="Ej: AF123WY"
                  value={vehiclePlate}
                  onChange={(e) => setVehiclePlate(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold focus:border-brand-500 focus:bg-white transition-all outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider font-bold">Peso Máx (kg)</label>
                  <input 
                    type="number"
                    placeholder="Ej: 1500"
                    value={vehicleMaxWeight}
                    onChange={(e) => setVehicleMaxWeight(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold focus:border-brand-500 focus:bg-white transition-all outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider font-bold">Volumen (m³)</label>
                  <input 
                    type="number"
                    step="any"
                    placeholder="Ej: 12.5"
                    value={vehicleMaxVolume}
                    onChange={(e) => setVehicleMaxVolume(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold focus:border-brand-500 focus:bg-white transition-all outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider font-bold">Vel. Máx (km/h)</label>
                  <input 
                    type="number"
                    placeholder="Ej: 110"
                    value={vehicleMaxSpeed}
                    onChange={(e) => setVehicleMaxSpeed(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold focus:border-brand-500 focus:bg-white transition-all outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-100">
                <span className="text-xs font-bold text-slate-650">Estado de Operación</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer" 
                    checked={vehicleActive}
                    onChange={(e) => setVehicleActive(e.target.checked)}
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600"></div>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="submit"
                  className="px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                >
                  Guardar
                </button>
                <button
                  type="button"
                  onClick={() => setShowVehicleModal(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RATE MODAL */}
      {showRateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl p-6 space-y-4 my-8">
            <h3 className="text-lg font-black text-slate-900 tracking-tight">
              {selectedRateId ? "Editar Tarifa de Flete" : "Agregar Nueva Tarifa de Flete"}
            </h3>

            <form onSubmit={handleSaveRate} className="space-y-4 text-xs font-semibold">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Nombre de la Tarifa *</label>
                  <input 
                    type="text" 
                    required
                    placeholder="Ej: Tarifa Plana Oeste, Tarifa Acompañante"
                    value={rateName}
                    onChange={(e) => setRateName(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold focus:border-brand-500 focus:bg-white transition-all outline-none"
                  />
                </div>

                <div className="space-y-1 relative">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Zona Logística (Opcional)</label>
                  <button
                    type="button"
                    onClick={() => {
                      setShowRateZoneDropdown(!showRateZoneDropdown);
                      if (showRateZoneDropdown) setRateZoneSearchTerm("");
                    }}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-left focus:border-brand-500 focus:bg-white transition-all flex items-center justify-between cursor-pointer"
                  >
                    <span className="truncate mr-2">
                      {rateLogisticsZoneIds.length === 0 
                        ? "Todas las Zonas" 
                        : rateLogisticsZoneIds.length === 1 
                          ? zones.find(z => z.id === rateLogisticsZoneIds[0])?.name || "1 Zona"
                          : `${rateLogisticsZoneIds.length} Zonas`}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {rateLogisticsZoneIds.length > 0 && (
                        <span 
                          onClick={(e) => {
                            e.stopPropagation();
                            setRateLogisticsZoneIds([]);
                          }}
                          className="w-4 h-4 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
                          title="Limpiar"
                        >
                          <XCircle className="w-3 h-3" />
                        </span>
                      )}
                      <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                    </div>
                  </button>

                  {showRateZoneDropdown && (
                    <>
                      <div 
                        className="fixed inset-0 z-10" 
                        onClick={() => {
                          setShowRateZoneDropdown(false);
                          setRateZoneSearchTerm("");
                        }}
                      />
                      <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl z-20 max-h-80 p-2.5 space-y-2 animate-in fade-in slide-in-from-top-2 duration-100 flex flex-col">
                        {/* Search Input */}
                        <div className="relative shrink-0">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                          <input
                            type="text"
                            placeholder="Buscar zona..."
                            value={rateZoneSearchTerm}
                            onChange={(e) => setRateZoneSearchTerm(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold focus:border-brand-500 focus:bg-white transition-all outline-none"
                          />
                        </div>

                        {/* Toolbar */}
                        <div className="flex items-center justify-between shrink-0 px-1 py-0.5 border-b border-slate-100 pb-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              const matching = zones.filter(z => z.name.toLowerCase().includes(rateZoneSearchTerm.toLowerCase())).map(z => z.id);
                              const newSelected = new Set(rateLogisticsZoneIds);
                              matching.forEach(id => newSelected.add(id));
                              setRateLogisticsZoneIds(Array.from(newSelected));
                            }}
                            className="text-[9px] font-black text-brand-600 hover:text-brand-700 uppercase tracking-wider bg-brand-50/50 hover:bg-brand-50 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                          >
                            Seleccionar Todos
                          </button>
                          {rateLogisticsZoneIds.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setRateLogisticsZoneIds([])}
                              className="text-[9px] font-black text-rose-600 hover:text-rose-700 uppercase tracking-wider bg-rose-50 hover:bg-rose-100/70 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                            >
                              Limpiar
                            </button>
                          )}
                        </div>

                        {/* List */}
                        <div className="space-y-1 overflow-y-auto max-h-40 pr-0.5">
                          {zones
                            .filter(z => z.name.toLowerCase().includes(rateZoneSearchTerm.toLowerCase()))
                            .map(z => {
                              const isChecked = rateLogisticsZoneIds.includes(z.id);
                              return (
                                <label 
                                  key={z.id} 
                                  className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded-lg cursor-pointer text-xs font-semibold text-slate-700 select-none"
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => {
                                      if (isChecked) {
                                        setRateLogisticsZoneIds(prev => prev.filter(x => x !== z.id));
                                      } else {
                                        setRateLogisticsZoneIds(prev => [...prev, z.id]);
                                      }
                                    }}
                                    className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/10 cursor-pointer accent-brand-600"
                                  />
                                  <span>{z.name}</span>
                                </label>
                              );
                            })
                          }
                          {zones.filter(z => z.name.toLowerCase().includes(rateZoneSearchTerm.toLowerCase())).length === 0 && (
                            <div className="text-center py-4 text-slate-400 text-xs font-bold">
                              No se encontraron zonas
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Costo por Jornada ($) *</label>
                  <input 
                    type="number" 
                    required
                    placeholder="Ej: 45000"
                    value={rateDailyRate}
                    onChange={(e) => setRateDailyRate(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold focus:border-brand-500 focus:bg-white transition-all outline-none text-right"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Costo por Acompañante ($)</label>
                  <input 
                    type="number"
                    placeholder="Ej: 15000"
                    value={rateAssistantRate}
                    onChange={(e) => setRateAssistantRate(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold focus:border-brand-500 focus:bg-white transition-all outline-none text-right"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Kms Base *</label>
                  <input 
                    type="number"
                    required
                    placeholder="Ej: 100"
                    value={rateBaseKms}
                    onChange={(e) => setRateBaseKms(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold focus:border-brand-500 focus:bg-white transition-all outline-none text-right"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Costo Km Extra ($) *</label>
                  <input 
                    type="number"
                    required
                    placeholder="Ej: 120"
                    value={rateExtraKmRate}
                    onChange={(e) => setRateExtraKmRate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold focus:border-brand-500 focus:bg-white transition-all outline-none text-right"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Costo Hora Extra ($)</label>
                  <input 
                    type="number"
                    placeholder="Ej: 3000"
                    value={rateOvertimeHourlyRate}
                    onChange={(e) => setRateOvertimeHourlyRate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold focus:border-brand-500 focus:bg-white transition-all outline-none text-right"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Fecha Inicio Vigencia *</label>
                  <input 
                    type="date"
                    required
                    value={rateStartDate}
                    onChange={(e) => setRateStartDate(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold focus:border-brand-500 focus:bg-white transition-all outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Fecha Fin Vigencia (Opcional)</label>
                  <input 
                    type="date"
                    value={rateEndDate}
                    onChange={(e) => setRateEndDate(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold focus:border-brand-500 focus:bg-white transition-all outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-100">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-slate-700">¿Incluye Peajes?</span>
                  <span className="text-[10px] text-slate-400 font-medium">Si está marcado, los peajes reales no se adicionan al costo del flete.</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input 
                    type="checkbox" 
                    className="sr-only peer" 
                    checked={rateIncludesTolls}
                    onChange={(e) => setRateIncludesTolls(e.target.checked)}
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-100">
                <span className="text-xs font-bold text-slate-700">Tarifa Vigente</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer" 
                    checked={rateActive}
                    onChange={(e) => setRateActive(e.target.checked)}
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600"></div>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="submit"
                  className="px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                >
                  Guardar Tarifa
                </button>
                <button
                  type="button"
                  onClick={() => setShowRateModal(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SETTLEMENT MODAL */}
      {showSettlementModal && settlementRouteSheet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl p-6 space-y-4 my-8">
            <div className="space-y-1">
              <h3 className="text-lg font-black text-slate-900 tracking-tight">
                Liquidación de Flete - Recorrido #{settlementRouteSheet.run_number}
              </h3>
              <p className="text-xs text-slate-500 font-bold">
                Chofer: <span className="text-slate-800 font-black">{settlementCarrier?.name}</span> | Fecha: {new Date(settlementRouteSheet.delivery_date + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
              </p>
            </div>

            <form onSubmit={handleConfirmSettlement} className="space-y-4 text-xs font-semibold">
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Tarifa Aplicable</label>
                <select
                  required
                  value={settlementSelectedRateId}
                  onChange={(e) => setSettlementSelectedRateId(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold focus:border-brand-500 focus:bg-white transition-all outline-none"
                >
                  <option value="">Seleccionar tarifa...</option>
                  {carrierRates.filter(r => r.carrier_id === settlementCarrier?.id).map(r => (
                    <option key={r.id} value={r.id}>
                      {r.name} - Jornada: {formatPrice(r.daily_rate)} {r.zones?.name ? `(Zona: ${r.zones.name})` : ''}
                    </option>
                  ))}
                </select>
                {carrierRates.filter(r => r.carrier_id === settlementCarrier?.id).length === 0 && (
                  <p className="text-red-500 text-[10px] font-bold mt-1">
                    ⚠️ Este chofer no tiene tarifas cargadas en el sistema. Debes agregar una tarifa primero desde la pestaña &quot;Choferes&quot;.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Kilómetros Recorridos Reales</label>
                  <input 
                    type="number"
                    placeholder="Ej: 120"
                    value={settlementActualKms}
                    onChange={(e) => setSettlementActualKms(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold focus:border-brand-500 focus:bg-white transition-all outline-none text-right"
                  />
                  {settlementSelectedRateId && (
                    <p className="text-slate-400 text-[9px] mt-0.5">
                      Base cubierta: {carrierRates.find(r => r.id === settlementSelectedRateId)?.base_kms} Kms (Extra Km: {formatPrice(carrierRates.find(r => r.id === settlementSelectedRateId)?.extra_km_rate || 0)})
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Monto de Peajes ($)</label>
                  <input 
                    type="number"
                    placeholder="Ej: 1800"
                    value={settlementTollsAmount}
                    onChange={(e) => setSettlementTollsAmount(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold focus:border-brand-500 focus:bg-white transition-all outline-none text-right"
                  />
                  {settlementSelectedRateId && (
                    <p className="text-slate-400 text-[9px] mt-0.5">
                      Peaje: {carrierRates.find(r => r.id === settlementSelectedRateId)?.includes_tolls ? 'Incluido en tarifa' : 'Adiciona al costo flete'}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Horas de Viaje Reales</label>
                  <input 
                    type="number"
                    placeholder="Ej: 8"
                    value={settlementActualHours}
                    onChange={(e) => setSettlementActualHours(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold focus:border-brand-500 focus:bg-white transition-all outline-none text-right"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Horas Extras Reales</label>
                  <input 
                    type="number"
                    placeholder="Ej: 2"
                    value={settlementActualOvertimeHours}
                    onChange={(e) => setSettlementActualOvertimeHours(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold focus:border-brand-500 focus:bg-white transition-all outline-none text-right"
                  />
                  {settlementSelectedRateId && (
                    <p className="text-slate-400 text-[9px] mt-0.5">
                      Costo Hora Extra: {formatPrice(carrierRates.find(r => r.id === settlementSelectedRateId)?.overtime_hourly_rate || 0)}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-100">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-slate-755">¿Llevó Acompañante?</span>
                  {settlementSelectedRateId && (
                    <span className="text-[10px] text-slate-400 font-medium">
                      Adiciona {formatPrice(carrierRates.find(r => r.id === settlementSelectedRateId)?.assistant_rate || 0)} al costo de flete.
                    </span>
                  )}
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input 
                    type="checkbox" 
                    className="sr-only peer" 
                    checked={settlementHasAssistant}
                    onChange={(e) => setSettlementHasAssistant(e.target.checked)}
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600"></div>
                </label>
              </div>

              {/* CALCULATION PREVIEW BOX */}
              {settlementSelectedRateId && (
                <div className="bg-slate-900 text-white p-4 rounded-2xl space-y-2.5 font-bold">
                  <h4 className="text-[9px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-1.5">Desglose de Costo de Flete</h4>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between font-normal text-slate-300">
                      <span>Jornada Base:</span>
                      <span className="font-mono font-bold text-white">{formatPrice(carrierRates.find(r => r.id === settlementSelectedRateId)?.daily_rate || 0)}</span>
                    </div>
                    {Number(settlementActualOvertimeHours) > 0 && (
                      <div className="flex justify-between font-normal text-slate-300">
                        <span>Horas Extras ({settlementActualOvertimeHours} hr):</span>
                        <span className="font-mono font-bold text-white">
                          +{formatPrice((Number(settlementActualOvertimeHours) || 0) * (carrierRates.find(r => r.id === settlementSelectedRateId)?.overtime_hourly_rate || 0))}
                        </span>
                      </div>
                    )}
                    {settlementHasAssistant && (
                      <div className="flex justify-between font-normal text-slate-300">
                        <span>Acompañante:</span>
                        <span className="font-mono font-bold text-white">+{formatPrice(carrierRates.find(r => r.id === settlementSelectedRateId)?.assistant_rate || 0)}</span>
                      </div>
                    )}
                    {Math.max(0, (Number(settlementActualKms) || 0) - (carrierRates.find(r => r.id === settlementSelectedRateId)?.base_kms || 0)) > 0 && (
                      <div className="flex justify-between font-normal text-slate-300">
                        <span>Kms Extras ({Math.max(0, (Number(settlementActualKms) || 0) - (carrierRates.find(r => r.id === settlementSelectedRateId)?.base_kms || 0))} km):</span>
                        <span className="font-mono font-bold text-white">
                          +{formatPrice(Math.max(0, (Number(settlementActualKms) || 0) - (carrierRates.find(r => r.id === settlementSelectedRateId)?.base_kms || 0)) * (carrierRates.find(r => r.id === settlementSelectedRateId)?.extra_km_rate || 0))}
                        </span>
                      </div>
                    )}
                    {Number(settlementTollsAmount) > 0 && !(carrierRates.find(r => r.id === settlementSelectedRateId)?.includes_tolls) && (
                      <div className="flex justify-between font-normal text-slate-300">
                        <span>Reembolso Peajes:</span>
                        <span className="font-mono font-bold text-white">+{formatPrice(Number(settlementTollsAmount) || 0)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm pt-2 border-t border-slate-800 text-brand-400 font-extrabold">
                      <span>Total a Abonar:</span>
                      <span className="font-mono text-base text-white">{formatPrice(getCalculatedSettlementCost())}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* PAYMENT REGISTRATION */}
              <div className="space-y-3 border-t pt-3">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Estado del Pago</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSettlementPayoutStatus('Pendiente')}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${
                        settlementPayoutStatus === 'Pendiente'
                          ? 'bg-amber-100 text-amber-800 shadow-sm border border-amber-200'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      } cursor-pointer`}
                    >
                      Pendiente
                    </button>
                    <button
                      type="button"
                      onClick={() => setSettlementPayoutStatus('Liquidado')}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${
                        settlementPayoutStatus === 'Liquidado'
                          ? 'bg-emerald-100 text-emerald-800 shadow-sm border border-emerald-200'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      } cursor-pointer`}
                    >
                      Liquidado (Pagado)
                    </button>
                  </div>
                </div>

                {settlementPayoutStatus === 'Liquidado' && (
                  <div className="space-y-2 bg-slate-50 p-3 rounded-2xl border border-slate-100 animate-in fade-in duration-150">
                    <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider block">Método de Liquidación</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setSettlementPaymentMethod('cash')}
                        className={`p-2.5 rounded-xl text-center border font-bold text-xs transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                          settlementPaymentMethod === 'cash'
                            ? 'bg-white border-brand-500 text-brand-600 shadow-sm'
                            : 'bg-slate-100/50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <DollarSign className="w-4 h-4 text-emerald-500" />
                        <span>Efectivo (Caja)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSettlementPaymentMethod('other')}
                        className={`p-2.5 rounded-xl text-center border font-bold text-xs transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                          settlementPaymentMethod === 'other'
                            ? 'bg-white border-brand-500 text-brand-600 shadow-sm'
                            : 'bg-slate-100/50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <CreditCard className="w-4 h-4 text-blue-500" />
                        <span>Transf. / Banco</span>
                      </button>
                    </div>

                    {settlementPaymentMethod === 'cash' && (
                      <div className="mt-2 text-[10px] text-slate-500 font-semibold space-y-1">
                        {openRegister ? (
                          <p className="text-emerald-600 flex items-center gap-1">
                            <Check className="w-3.5 h-3.5 shrink-0" />
                            Caja abierta: <strong>{openRegister.id.substring(0, 8)}</strong> (Arqueo: {formatPrice(openRegister.expected_balance_ars)})
                          </p>
                        ) : (
                          <p className="text-red-500 font-black">
                            ⚠️ No hay ninguna caja diaria abierta. No se puede asentar el egreso de efectivo.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="submit"
                  disabled={settlementPayoutStatus === 'Liquidado' && settlementPaymentMethod === 'cash' && !openRegister}
                  className="px-4 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:bg-slate-350 disabled:cursor-not-allowed text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                >
                  Guardar Liquidación
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowSettlementModal(false);
                    setSettlementRouteSheet(null);
                    setSettlementCarrier(null);
                  }}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>

      {/* PRINTABLE REMITOS ROOT (Only visible under @media print) */}
      <div id="print-remitos-root">
        {printItems.map((del, index) => {
          const order = del.orders;
          const encomienda = del.encomiendas;
          if (!order && !encomienda) return null;
          
          const isEncomienda = !!del.encomienda_id;
          const code = isEncomienda ? encomienda?.code : order?.legacy_code || order?.id.substring(0, 8);
          const customerName = isEncomienda ? encomienda?.client_name || "Sin Contacto" : order?.customer_name;
          const address = isEncomienda ? encomienda?.address : order?.address;
          const locality = isEncomienda ? encomienda?.locality : order?.locality;
          const zoneName = isEncomienda ? "Diligencia" : order?.zones?.name || "Sin Zona";
          const phone = isEncomienda ? encomienda?.client_phone : order?.clients?.phone_primary;
          const notes = isEncomienda ? encomienda?.description : (order?.delivery_detail || order?.delivery_notes);

          const subtotal = order?.totals?.subtotal || 0;
          const freight = order?.totals?.freight || 0;
          const surcharges = order?.totals?.payment_surcharges || 0;
          const tax = order?.totals?.tax || 0;
          const total = order?.total_amount || order?.totals?.total || 0;
          const deposit = order?.totals?.deposit_amount || 0;
          const balance = order?.totals?.pending_balance !== undefined ? order.totals.pending_balance : total - deposit;
          const isWholesale = order?.channel === 'mayorista' || !!((order?.legacy_code && (order.legacy_code.toUpperCase().startsWith("AQU") || order.legacy_code.toUpperCase().startsWith("POW") || order.legacy_code.toUpperCase().startsWith("AQ-DB"))) || (order?.clients && (Array.isArray(order.clients) ? order.clients[0]?.is_wholesale : order.clients?.is_wholesale)));
          const paymentMethodName = paymentMethods.find(m => m.id === order?.payment_method_id)?.name || 'No especificado';

          return (
            <div 
              key={del.id} 
              className={`w-full bg-white text-black p-3 flex flex-col justify-between min-h-[265mm] ${
                index < printItems.length - 1 ? 'print-page-break' : ''
              }`}
              style={{ contentVisibility: 'auto' }}
            >
              {/* Main Content wrapper */}
              <div className="flex flex-col flex-1 justify-between">
                <div>
                  {/* Top Header Block */}
                  <div className="flex justify-between items-start border-b border-slate-900 pb-1 mb-2">
                    <div>
                      <h1 className="text-lg font-black tracking-tight text-slate-900">ZONO CONSTRUCCIÓN</h1>
                      <p className="text-[9px] text-slate-650 font-bold uppercase tracking-wider">Venta de Materiales y Logística</p>
                      <p className="text-[8px] text-slate-500 font-semibold">Panamericana y Ruta 197, Tigre | Tel: 11-3294-6500</p>
                    </div>
                    <div className="text-right">
                      <span className="inline-block px-2 py-0.5 bg-slate-900 text-white rounded text-[9px] font-black tracking-wider uppercase">
                        {isEncomienda ? 'DILIGENCIA / ENCOMIENDA' : 'COMPROBANTE DE ENTREGA Y COBRO'}
                      </span>
                      <h2 className="text-xs font-mono font-black text-slate-700 mt-1">
                        {isEncomienda ? 'DILIGENCIA N°' : 'REMITO N°'}: <span className="text-slate-900 underline">{code}</span>
                      </h2>
                      <p className="text-[8px] font-bold text-slate-500">
                        Fecha Emisión: {new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </p>
                    </div>
                  </div>

                  {/* Top Metadata Grid (Destino y Logística) */}
                  <div className="grid grid-cols-2 gap-3 mb-2">
                    {/* Left: Customer */}
                    <div className="border border-slate-200 rounded-xl p-2 bg-slate-50/50 text-[10px] flex flex-col justify-between">
                      <div>
                        <span className="text-[8px] font-black text-slate-400 tracking-wider uppercase block border-b border-slate-100 pb-0.5 mb-1">Destinatario / Cliente</span>
                        <h3 className="text-xs font-black text-slate-900 leading-tight">{customerName}</h3>
                        {!isEncomienda && (
                          <span className="inline-block px-1 bg-slate-200 text-slate-800 rounded text-[8px] font-black uppercase tracking-wider border border-slate-350 mt-0.5">
                            {isWholesale ? '👑 Mayorista' : '👤 Minorista'}
                          </span>
                        )}
                        {isEncomienda && (
                          <span className="inline-block px-1 bg-purple-105 text-purple-800 rounded text-[8px] font-black uppercase tracking-wider border border-purple-200 mt-0.5">
                            📦 Diligencia: {encomienda?.type.replace('_', ' ')}
                          </span>
                        )}
                        <p className="text-[10px] text-slate-700 font-semibold mt-1"><strong>Dirección:</strong> {address}</p>
                        <p className="text-[10px] text-slate-800 font-extrabold"><strong>Localidad:</strong> {locality} {zoneName ? `(${zoneName})` : ""}</p>
                      </div>
                      {phone && <p className="text-[9px] text-slate-600 mt-1"><strong>Teléfono:</strong> {phone}</p>}
                    </div>

                    {/* Right: Logistics & Payment Info */}
                    <div className="border border-slate-200 rounded-xl p-2 bg-slate-50/50 text-[10px] flex flex-col justify-between">
                      <div>
                        <span className="text-[8px] font-black text-slate-400 tracking-wider uppercase block border-b border-slate-100 pb-0.5 mb-1">Datos de Reparto y Pago</span>
                        <p className="text-[10px] text-slate-700"><strong>Chofer:</strong> <span className="font-extrabold text-slate-900">{del.carriers?.name || "No Asignado"}</span></p>
                        <p className="text-[10px] text-slate-700"><strong>Hoja de Ruta:</strong> <span className="font-bold text-slate-850">{del.route_sheets ? (del.route_sheets.code || `${new Date(del.route_sheets.delivery_date + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })} (V. ${del.route_sheets.run_number})`) : (del.route_sheet_id?.substring(0, 8) || "N/A")}</span></p>
                        {!isEncomienda ? (
                          <>
                            <p className="text-[10px] text-slate-700"><strong>Método de Pago:</strong> <span className="font-extrabold text-slate-900">{paymentMethodName}</span></p>
                            <div className="flex items-center gap-1 mt-1">
                              <strong className="text-[10px] text-slate-700">Estado Pago:</strong>
                              <span className={`px-1.5 py-0.2 rounded text-[8px] font-black uppercase tracking-wider border ${
                                order?.payment_status === 'Abonado' 
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                                  : order?.payment_status === 'Seniado'
                                    ? 'bg-amber-50 text-amber-850 border-amber-250'
                                    : 'bg-rose-50 text-rose-800 border-rose-250'
                              }`}>
                                {order?.payment_status || 'Impago'}
                              </span>
                            </div>
                          </>
                        ) : (
                          <>
                            <p className="text-[10px] text-slate-700"><strong>Tipo Trámite:</strong> <span className="font-black text-purple-800 uppercase">{encomienda?.type.replace('_', ' ')}</span></p>
                            {encomienda?.payment_amount && encomienda.payment_amount > 0 ? (
                              <div className="mt-1 p-1 bg-emerald-50 border border-emerald-200 rounded text-emerald-800 text-[9px] font-bold flex justify-between items-center">
                                <span>Entregar Pago:</span>
                                <span className="font-black">{formatPrice(encomienda.payment_amount)}</span>
                              </div>
                            ) : null}
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Delivery Notes Box */}
                  <div className="border border-amber-200 bg-amber-50/30 rounded-xl p-1.5 text-[9px] mb-2 flex flex-col gap-0.5">
                    <span className="text-amber-800 font-black uppercase text-[8px] tracking-wider">
                      {isEncomienda ? 'Instrucciones de Diligencia:' : 'Observaciones / Detalles de Entrega:'}
                    </span>
                    <p className="font-bold text-slate-750 italic leading-tight">{notes || "Sin observaciones específicas."}</p>
                  </div>

                  {/* Table Title */}
                  <h3 className="text-[9px] font-black text-slate-800 uppercase tracking-wider mb-1 flex items-center gap-1">
                    <span>📋</span> {isEncomienda ? 'INFORMACIÓN COMPLEMENTARIA' : 'DETALLE DE PRODUCTOS'}
                  </h3>

                  {/* Table block */}
                  {isEncomienda ? (
                    <div className="border border-slate-200 rounded-xl p-2 bg-purple-50/10 text-[10px] space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-[7px] text-slate-400 font-black uppercase leading-none">Proveedor / Origen</p>
                          <p className="font-extrabold text-slate-900 mt-0.5">{encomienda?.supplier?.name || "No Especificado"}</p>
                        </div>
                        {encomienda?.purchase && (
                          <div>
                            <p className="text-[7px] text-slate-400 font-black uppercase leading-none">Compra/Factura Vinculada</p>
                            <p className="font-black text-purple-900 mt-0.5">
                              Factura N° {encomienda.purchase.invoice_number}
                            </p>
                          </div>
                        )}
                      </div>
                      
                      {encomienda?.notes && (
                        <div className="border-t border-slate-150 pt-1.5 mt-1">
                          <p className="text-[7px] text-slate-400 font-black uppercase leading-none">Notas Administrativas</p>
                          <p className="text-slate-700 font-bold leading-tight mt-0.5">{encomienda.notes}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-xl overflow-hidden mb-2 bg-white">
                      <table className="w-full text-left text-[10px] border-collapse">
                        <thead>
                          <tr className="bg-slate-900 text-white font-black text-[8px] uppercase tracking-wider">
                            <th className="px-2 py-1 text-center w-12 border-r border-slate-800">CANT.</th>
                            <th className="px-2 py-1">DESCRIPCIÓN DEL PRODUCTO</th>
                            <th className="px-2 py-1 text-right w-24 border-l border-slate-800">P. UNIT.</th>
                            <th className="px-2 py-1 text-right w-28 border-l border-slate-800">TOTAL</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-150 text-slate-800 font-bold">
                          {(order?.order_items || []).map((item, idx) => {
                            const unitPrice = item.unit_price || 0;
                            const itemSubtotal = item.quantity * unitPrice;
                            return (
                              <tr key={idx} className="hover:bg-slate-50/50">
                                <td className="px-2 py-0.5 text-center font-black text-slate-900 bg-slate-50/50 border-r border-slate-200">{item.quantity}</td>
                                <td className="px-2 py-0.5 font-extrabold text-slate-900 truncate max-w-[280px]">{item.product_name}</td>
                                <td className="px-2 py-0.5 text-right border-l border-slate-200 font-mono text-slate-600">{formatPrice(unitPrice)}</td>
                                <td className="px-2 py-0.5 text-right border-l border-slate-200 font-mono font-black text-slate-900">{formatPrice(itemSubtotal)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Return items block */}
                  {!isEncomienda && parseReturnItemsFromNotes(order?.delivery_notes).length > 0 && (
                    <div className="border-2 border-red-500 rounded-xl overflow-hidden mb-2 bg-red-50/10 animate-in fade-in duration-200">
                      <div className="bg-red-500 text-white font-black text-[9px] uppercase tracking-wider px-2 py-1 flex justify-between">
                        <span>⚠️ RETIRAR DE CLIENTE (DEVOLUCIÓN OBLIGATORIA)</span>
                        <span>CONTROL DE RETORNO EN DEPÓSITO</span>
                      </div>
                      <table className="w-full text-left text-[10px] border-collapse">
                        <tbody className="divide-y divide-red-200 text-slate-900 font-extrabold bg-white">
                          {parseReturnItemsFromNotes(order?.delivery_notes).map((itemLine, idx) => (
                            <tr key={idx} className="hover:bg-red-50/50">
                              <td className="px-2 py-1.5 text-red-700 w-6 text-center border-r border-red-150 font-black">
                                [ ]
                              </td>
                              <td className="px-2 py-1.5 text-slate-900">{itemLine}</td>
                              <td className="px-2 py-1.5 text-right text-[8px] text-slate-400 font-bold w-36 border-l border-red-150">
                                Firma Chofer: _________
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Financial Summary and Signatures at Bottom of Page */}
                <div className="space-y-3 mt-4">
                  {/* Financial Summary Box */}
                  {!isEncomienda && (
                    <div className="flex justify-end">
                      <div className="w-64 border border-slate-200 rounded-xl p-2 bg-slate-50/50 space-y-1 text-[10px] text-slate-700">
                        <div className="flex justify-between font-semibold">
                          <span>Subtotal Productos:</span>
                          <span className="font-mono text-slate-800">{formatPrice(subtotal)}</span>
                        </div>
                        {surcharges > 0 && (
                          <div className="flex justify-between font-semibold">
                            <span>Recargos por Pago:</span>
                            <span className="font-mono text-slate-800">{formatPrice(surcharges)}</span>
                          </div>
                        )}
                        {freight > 0 && (
                          <div className="flex justify-between font-semibold">
                            <span>Flete / Envío:</span>
                            <span className="font-mono text-slate-850">{formatPrice(freight)}</span>
                          </div>
                        )}
                        {tax > 0 && (
                          <div className="flex justify-between font-semibold">
                            <span>IVA (21%):</span>
                            <span className="font-mono text-slate-850">{formatPrice(tax)}</span>
                          </div>
                        )}
                        <div className="flex justify-between border-t border-slate-200 pt-1 font-black text-slate-900">
                          <span>Total del Pedido:</span>
                          <span className="font-mono">{formatPrice(total)}</span>
                        </div>
                        <div className="flex justify-between text-emerald-800 font-black">
                          <span>Seña / Pago Registrado:</span>
                          <span className="font-mono">-{formatPrice(deposit)}</span>
                        </div>
                        <div className="border-t border-slate-200 pt-1">
                          {balance <= 0 ? (
                            <div className="w-full text-center bg-emerald-50 border border-emerald-200 text-emerald-800 py-0.5 rounded font-black uppercase text-[8px] tracking-wider leading-none">
                              💸 Saldo Totalmente Saldado
                            </div>
                          ) : (
                            <div className="flex justify-between items-center font-black">
                              <span className="text-[8px] font-black text-rose-500 uppercase tracking-wider">SALDO A COBRAR:</span>
                              <span className="font-mono text-xs text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                                {formatPrice(balance)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Signature Blocks */}
                  <div className="border-t border-slate-200 pt-4 grid grid-cols-2 gap-4">
                    <div className="text-center flex flex-col justify-end h-12">
                      <div className="border-t border-slate-300 w-3/4 mx-auto mb-0.5"></div>
                      <p className="text-[8px] font-black text-slate-600 uppercase tracking-wider leading-none">
                        {isEncomienda ? 'Firma Conforme Receptor' : 'Firma Conforme Destinatario'}
                      </p>
                      <p className="text-[7px] text-slate-400 font-semibold">Aclaración, DNI y Firma</p>
                    </div>
                    <div className="text-center flex flex-col justify-end h-12">
                      <div className="border-t border-slate-300 w-3/4 mx-auto mb-0.5"></div>
                      <p className="text-[8px] font-black text-slate-600 uppercase tracking-wider leading-none">Firma Transportista / Entregador</p>
                      <p className="text-[7px] text-slate-400 font-semibold">Zono Construcción y Hogar</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

