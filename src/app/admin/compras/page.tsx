"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { 
  Truck, 
  Plus, 
  Trash2, 
  Save, 
  X, 
  FileText, 
  ListPlus, 
  Settings, 
  Loader2, 
  CheckCircle2, 
  HelpCircle,
  Link2,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  Layers,
  ArrowRightLeft,
  GitPullRequest,
  Columns,
  Info,
  Search,
  AlertTriangle,
  History,
  ShoppingBag,
  DollarSign,
  ClipboardList,
  Calendar,
  Check,
  Eye,
  Percent,
  Users,
  Scale,
  TrendingUp
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { formatPrice, formatDateDDMMYYYY } from "@/lib/utils";

interface Supplier {
  id: string;
  name: string;
  legal_name?: string;
  cuit?: string;
  base_discount_percentage: number;
  delivery_time_days: number;
  bank_details?: {
    bank_name?: string;
    account_number?: string;
    cbu?: string;
    alias?: string;
  };
  created_at: string;
  business_unit?: string;
  contacts?: string;
  phone?: string;
  address?: string;
  locality?: string;
  gps_location?: string;
  notes?: string;
  delivery_time_text?: string;
  main_products?: string;
  discount_1?: number;
  discount_2?: number;
  surcharges?: number;
  discount_cash?: number;
  bonus_coef?: number;
}

interface PriceList {
  id: string;
  supplier_id: string;
  list_number: string;
  list_date: string;
  is_active: boolean;
  created_at: string;
}

interface Product {
  id: string;
  name: string;
  sku?: string;
  price: number;
  fixed_price: boolean;
  markup_percentage: number;
  markup_wholesale_percentage: number;
  category?: string;
  brand?: string;
  parent_id?: string | null;
  variant_type?: string;
  stock_physical?: number;
  production_type?: 'comprado' | 'fabricado' | 'ensamblado';
  is_insumo?: boolean;
  insumo_use?: 'fabricacion' | 'ensamblado' | 'ensamblado_venta';
  labor_cost?: number;
  overhead_cost?: number;
  cost_price?: number;
  is_generic?: boolean;
  mapped_real_product_id?: string | null;
}

interface ProductCostAlert {
  id: string;
  product_id: string;
  purchase_id: string;
  catalog_cost: number;
  purchase_cost: number;
  status: 'Pendiente' | 'Ignorada' | 'Actualizada';
  created_at: string;
  product?: {
    id: string;
    name: string;
    sku?: string;
  };
  purchase?: {
    id: string;
    invoice_number: string;
    supplier?: {
      id: string;
      name: string;
    };
  };
}

interface SupplierPurchase {
  id: string;
  supplier_id: string;
  invoice_number: string;
  purchase_date: string;
  due_date?: string;
  total_amount: number;
  paid_amount: number;
  currency: 'ARS' | 'USD';
  status: 'Pendiente' | 'Parcial' | 'Pagado' | 'Anulado';
  notes?: string;
  created_at: string;
  cost_center_id?: string;
  cost_centers?: {
    id: string;
    name: string;
    code: string;
  };
  supplier?: {
    name: string;
  };
}

interface PaymentMethod {
  id: string;
  name: string;
  surcharge_percentage: number;
  is_active: boolean;
}

const DatePickerDDMMYYYY = ({
  value,
  onChange,
  required = false,
  className = "text-xs"
}: {
  value: string;
  onChange: (val: string) => void;
  required?: boolean;
  className?: string;
}) => {
  const formatDisplayDate = (val: string) => {
    if (!val) return "";
    const parts = val.split("-");
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return val;
  };

  const hiddenInputRef = React.useRef<HTMLInputElement>(null);

  const handleOpenPicker = () => {
    if (hiddenInputRef.current) {
      try {
        hiddenInputRef.current.showPicker();
      } catch (err) {
        hiddenInputRef.current.focus();
      }
    }
  };

  return (
    <div className="relative w-full cursor-pointer" onClick={handleOpenPicker}>
      <input
        type="text"
        readOnly
        required={required}
        value={value ? formatDisplayDate(value) : ""}
        placeholder="dd/mm/aaaa"
        className={`w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-bold cursor-pointer text-slate-800 pr-10 focus:ring-2 focus:ring-brand-500/10 outline-none transition-all ${className}`}
      />
      <input
        ref={hiddenInputRef}
        type="date"
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute opacity-0 pointer-events-none w-0 h-0"
      />
      {value && !required && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onChange("");
          }}
          className="absolute right-9 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 z-10 p-1 rounded-full hover:bg-slate-200/50"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
      <Calendar className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
    </div>
  );
};

export default function ComprasAdminPage() {
  const [activeSubTab, setActiveSubTab] = useState<'suppliers' | 'pricelists' | 'relations' | 'new_purchase' | 'purchases_history' | 'alerts' | 'hold_orders' | 'claims_exchanges' | 'boms' | 'production' | 'insumos' | 'make_vs_buy' | 'bom_explorer'>('suppliers');
  const [loading, setLoading] = useState(true);

  // Costos & BOM (Recetas) States
  const [selectedBomProductId, setSelectedBomProductId] = useState("");
  const [bomComponents, setBomComponents] = useState<any[]>([]);
  const [loadingBom, setLoadingBom] = useState(false);
  const [bomComponentSearch, setBomComponentSearch] = useState("");
  const [selectedComponentId, setSelectedComponentId] = useState("");
  const [bomComponentQuantity, setBomComponentQuantity] = useState("1");
  const [bomComponentWaste, setBomComponentWaste] = useState("0");
  const [bomLaborCost, setBomLaborCost] = useState("");
  const [bomOverheadCost, setBomOverheadCost] = useState("");
  const [savingBomCosts, setSavingBomCosts] = useState(false);
  const [bomFilterType, setBomFilterType] = useState<'production' | 'comprado' | 'all'>('production');

  // Make vs Buy & Supplier Comparison States
  const [compareProductId, setCompareProductId] = useState("");
  const [supplierComparisonItems, setSupplierComparisonItems] = useState<any[]>([]);
  const [loadingComparison, setLoadingComparison] = useState(false);
  const [makeVsBuySubTab, setMakeVsBuySubTab] = useState<'make_vs_buy_kpis' | 'supplier_comparison'>('make_vs_buy_kpis');
  const [allBoms, setAllBoms] = useState<any[]>([]);
  
  // Órdenes de Producción States
  const [prodProductId, setProdProductId] = useState("");
  const [prodQuantity, setProdQuantity] = useState("1");
  const [prodNotes, setProdNotes] = useState("");
  const [prodComponents, setProdComponents] = useState<any[]>([]);
  const [isRegisteringProduction, setIsRegisteringProduction] = useState(false);
  
  // Insumos States
  const [insumosSearchQuery, setInsumosSearchQuery] = useState("");
  const [selectedInsumoToAdjust, setSelectedInsumoToAdjust] = useState<any | null>(null);
  const [insumoAdjustQty, setInsumoAdjustQty] = useState("1");
  const [insumoAdjustType, setInsumoAdjustType] = useState<'ingreso' | 'egreso'>('ingreso');
  const [isAdjustingInsumo, setIsAdjustingInsumo] = useState(false);
  const [selectedGenericToMap, setSelectedGenericToMap] = useState<any | null>(null);
  const [newMappedRealProductId, setNewMappedRealProductId] = useState("");
  const [isUpdatingMapping, setIsUpdatingMapping] = useState(false);

  // BOM Explorer States
  const [bomExplorerTab, setBomExplorerTab] = useState<'tree' | 'compare' | 'where_used'>('tree');
  const [explorerProductId, setExplorerProductId] = useState("");
  const [explorerExpandedCategories, setExplorerExpandedCategories] = useState<Record<string, boolean>>({
    'Resinas': true,
    'Accesorios y Conexiones': true,
    'Etiquetas y Embalaje': true,
    'Costos de Fabricación': true,
    'Otros': true
  });
  const [compareProductAId, setCompareProductAId] = useState("");
  const [compareProductBId, setCompareProductBId] = useState("");
  const [reverseInsumoId, setReverseInsumoId] = useState("");

  // USD exchange rate & multi-currency states
  const [usdExchangeRate, setUsdExchangeRate] = useState<number>(1465);
  const [newPlCurrency, setNewPlCurrency] = useState<'ARS' | 'USD'>('ARS');
  const [isUpdatingUsdRate, setIsUpdatingUsdRate] = useState(false);
  const [tempUsdRate, setTempUsdRate] = useState("1465");

  // Lists
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [pricelists, setPricelists] = useState<PriceList[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [relations, setRelations] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<ProductCostAlert[]>([]);
  const [holdOrders, setHoldOrders] = useState<any[]>([]);
  const [purchases, setPurchases] = useState<SupplierPurchase[]>([]);
  const [claims, setClaims] = useState<any[]>([]);
  const [searchClaimTerm, setSearchClaimTerm] = useState("");
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [openRegister, setOpenRegister] = useState<any>(null);

  // Selection states
  const [selectedSupplierId, setSelectedSupplierId] = useState("");

  // Modals / Form toggles
  const [isSupplierFormOpen, setIsSupplierFormOpen] = useState(false);
  const [isPricelistFormOpen, setIsPricelistFormOpen] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState<SupplierPurchase | null>(null);
  const [purchaseItemsDetail, setPurchaseItemsDetail] = useState<any[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // New Supplier form state
  const [newSupplierName, setNewSupplierName] = useState("");
  const [newSupplierLegal, setNewSupplierLegal] = useState("");
  const [newSupplierCuit, setNewSupplierCuit] = useState("");
  const [newSupplierDiscount, setNewSupplierDiscount] = useState(0);
  const [newSupplierDelivery, setNewSupplierDelivery] = useState(0);
  const [newSupplierBankName, setNewSupplierBankName] = useState("");
  const [newSupplierAccount, setNewSupplierAccount] = useState("");
  const [newSupplierCbu, setNewSupplierCbu] = useState("");
  const [newSupplierAlias, setNewSupplierAlias] = useState("");
  const [newSupplierBusinessUnit, setNewSupplierBusinessUnit] = useState("Zono");
  const [newSupplierContacts, setNewSupplierContacts] = useState("");
  const [newSupplierPhone, setNewSupplierPhone] = useState("");
  const [newSupplierAddress, setNewSupplierAddress] = useState("");
  const [newSupplierLocality, setNewSupplierLocality] = useState("");
  const [newSupplierGpsLocation, setNewSupplierGpsLocation] = useState("");
  const [newSupplierNotes, setNewSupplierNotes] = useState("");
  const [newSupplierDeliveryText, setNewSupplierDeliveryText] = useState("");
  const [newSupplierMainProducts, setNewSupplierMainProducts] = useState("");
  const [newSupplierDiscount1, setNewSupplierDiscount1] = useState("0");
  const [newSupplierDiscount2, setNewSupplierDiscount2] = useState("0");
  const [newSupplierSurcharges, setNewSupplierSurcharges] = useState("0");
  const [newSupplierDiscountCash, setNewSupplierDiscountCash] = useState("0");
  const [newSupplierBonusCoef, setNewSupplierBonusCoef] = useState("1.0");
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  // New PriceList form state
  const [newPlNumber, setNewPlNumber] = useState("");
  const [newPlDate, setNewPlDate] = useState(new Date().toISOString().split('T')[0]);
  const [newPlActive, setNewPlActive] = useState(true);
  const [plRawText, setPlRawText] = useState(""); // Pasted SKU data
  const [submittingPl, setSubmittingPl] = useState(false);

  // Search states for relations
  const [searchRelationTerm, setSearchRelationTerm] = useState("");

  // --- NEW PURCHASE FORM STATE ---
  const [purchaseSupplierId, setPurchaseSupplierId] = useState("");
  const [purchaseInvoiceNumber, setPurchaseInvoiceNumber] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [purchaseDueDate, setPurchaseDueDate] = useState("");
  const [purchaseCurrency, setPurchaseCurrency] = useState<'ARS' | 'USD'>('ARS');
  const [purchaseNotes, setPurchaseNotes] = useState("");
  const [purchaseItems, setPurchaseItems] = useState<{ productId: string, name: string, sku: string, quantity: number, unitCost: number }[]>([]);
  
  // Selected product to add to current purchase
  const [currentItemProductId, setCurrentItemProductId] = useState("");
  const [currentItemQuantity, setCurrentItemQuantity] = useState("1");
  const [currentItemUnitCost, setCurrentItemUnitCost] = useState("");
  const [isSubmittingPurchase, setIsSubmittingPurchase] = useState(false);

  // States for searchable product combobox
  const [productSearchQuery, setProductSearchQuery] = useState("");
  const [showProductSearchDropdown, setShowProductSearchDropdown] = useState(false);

  useEffect(() => {
    if (!currentItemProductId) {
      setProductSearchQuery("");
    } else {
      const prod = products.find(p => p.id === currentItemProductId);
      if (prod) {
        setProductSearchQuery(prod.name + (prod.sku ? ` (${prod.sku})` : ''));
      }
    }
  }, [currentItemProductId, products]);

  // States for searchable recipe components combobox
  const [componentSearchQuery, setComponentSearchQuery] = useState("");
  const [showComponentSearchDropdown, setShowComponentSearchDropdown] = useState(false);

  useEffect(() => {
    if (!selectedComponentId) {
      setComponentSearchQuery("");
    } else {
      const prod = products.find(p => p.id === selectedComponentId);
      if (prod) {
        setComponentSearchQuery((prod.sku ? `[${prod.sku}] ` : '') + prod.name);
      }
    }
  }, [selectedComponentId, products]);

  // Price list inspection states
  const [inspectingPriceList, setInspectingPriceList] = useState<PriceList | null>(null);
  const [inspectingItems, setInspectingItems] = useState<any[]>([]);
  const [loadingInspectingItems, setLoadingInspectingItems] = useState(false);
  const [plModalSearchQuery, setPlModalSearchQuery] = useState("");

  // Immediate payment states
  const [payImmediately, setPayImmediately] = useState(false);
  const [immediatePaymentAmount, setImmediatePaymentAmount] = useState("");
  const [immediatePaymentMethodId, setImmediatePaymentMethodId] = useState("");

  // Nuevos estados para centros de costos y conciliación
  const [costCenters, setCostCenters] = useState<any[]>([]);
  const [purchaseCostCenterId, setPurchaseCostCenterId] = useState("");
  const [detailTab, setDetailTab] = useState<'items' | 'payments'>('items');
  const [associatedPayments, setAssociatedPayments] = useState<any[]>([]);
  const [unreconciledEgresos, setUnreconciledEgresos] = useState<any[]>([]);
  const [selectedEgresoId, setSelectedEgresoId] = useState("");
  const [newPaymentAmount, setNewPaymentAmount] = useState("");
  const [newPaymentMethodId, setNewPaymentMethodId] = useState("");
  const [newPaymentNotes, setNewPaymentNotes] = useState("");
  const [submittingNewPayment, setSubmittingNewPayment] = useState(false);
  const [submittingLink, setSubmittingLink] = useState(false);
  const [loadingPayments, setLoadingPayments] = useState(false);

  // Claims & Exchanges evaluation states
  const [selectedClaim, setSelectedClaim] = useState<any | null>(null);
  const [claimReturnItems, setClaimReturnItems] = useState<any[]>([]);
  const [claimExchangeItems, setClaimExchangeItems] = useState<any[]>([]);
  const [loadingClaimDetail, setLoadingClaimDetail] = useState(false);
  const [evaluatingClaimId, setEvaluatingClaimId] = useState<string | null>(null);
  const [evalSettlementMethod, setEvalSettlementMethod] = useState<'caja' | 'cuenta_corriente'>('caja');
  const [evalPaymentMethodId, setEvalPaymentMethodId] = useState("");
  const [exchangeSearchQuery, setExchangeSearchQuery] = useState("");
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [resolutionMessage, setResolutionMessage] = useState("");

  const handleAddClaimExchangeItem = (prod: any) => {
    if (claimExchangeItems.some(item => item.product_id === prod.id)) return;
    
    const initialPrice = prod.price || 0;
    const newItem = {
      id: Math.random().toString(), 
      product_id: prod.id,
      quantity: 1,
      unit_price: initialPrice,
      products: {
        name: prod.name,
        sku: prod.sku
      }
    };
    setClaimExchangeItems([...claimExchangeItems, newItem]);
  };

  const handleUpdateClaimExchangeQty = (id: string, qty: number) => {
    setClaimExchangeItems(claimExchangeItems.map(item => item.id === id ? { ...item, quantity: Math.max(1, qty) } : item));
  };

  const handleUpdateClaimExchangePrice = (id: string, price: number) => {
    setClaimExchangeItems(claimExchangeItems.map(item => item.id === id ? { ...item, unit_price: Math.max(0, price) } : item));
  };

  const handleRemoveClaimExchangeItem = (id: string) => {
    setClaimExchangeItems(claimExchangeItems.filter(item => item.id !== id));
  };

  const calculatedExchangeAmount = claimExchangeItems.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
  const calculatedDifferenceAmount = selectedClaim ? (calculatedExchangeAmount - selectedClaim.refund_amount) : 0;

  useEffect(() => {
    loadAllData();
  }, []);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tab = urlParams.get('tab');
    const validTabs = ['suppliers', 'pricelists', 'relations', 'new_purchase', 'purchases_history', 'alerts', 'hold_orders', 'boms', 'production', 'insumos', 'make_vs_buy', 'bom_explorer'];
    if (tab && validTabs.includes(tab)) {
      setActiveSubTab(tab as any);
    }
  }, []);

  async function loadAllData(silent = false) {
    try {
      if (!silent) setLoading(true);
      // Fetch suppliers
      const { data: sups } = await supabase.from("suppliers").select("*").order("name");
      if (sups) setSuppliers(sups);

      // Fetch USD exchange rate
      const { data: usdSetting } = await supabase
        .from("site_settings")
        .select("value")
        .eq("id", "usd_exchange_rate")
        .maybeSingle();
      if (usdSetting) {
        const rateVal = Number(usdSetting.value) || 1465;
        setUsdExchangeRate(rateVal);
        setTempUsdRate(rateVal.toString());
      }

      // Fetch price lists
      const { data: lists } = await supabase.from("price_lists").select("*").order("created_at", { ascending: false });
      if (lists) setPricelists(lists);

      // Fetch products (specifically SKU, price, fixed_price, and new cost/BOM details)
      const { data: prods } = await supabase.from("products").select("id, name, sku, price, fixed_price, markup_percentage, markup_wholesale_percentage, production_type, is_insumo, insumo_use, labor_cost, overhead_cost, cost_price, is_generic, mapped_real_product_id, category").order("name");
      if (prods) setProducts(prods);

      // Fetch current supplier-product relations
      const { data: rels } = await supabase.from("product_supplier_relations").select("*");
      if (rels) setRelations(rels);

      // Fetch all product BOM relations
      const { data: bomsData } = await supabase.from("product_boms").select("*");
      if (bomsData) setAllBoms(bomsData);

      // Fetch cost alerts (only Pendiente)
      const { data: alts } = await supabase
        .from("product_cost_alerts")
        .select(`
          *,
          product:products(id, name, sku),
          purchase:supplier_purchases(
            id,
            invoice_number,
            supplier:suppliers(id, name)
          )
        `)
        .eq("status", "Pendiente")
        .order("created_at", { ascending: false });
      if (alts) setAlerts(alts as any);

      // Fetch orders on hold
      const { data: holds } = await supabase
        .from("orders")
        .select(`
          *,
          hold_product:products!hold_product_id(id, name, sku)
        `)
        .eq("status", "En Espera")
        .order("created_at", { ascending: false });
      if (holds) setHoldOrders(holds);

      // Fetch returns and exchanges (claims)
      const { data: rets } = await supabase
        .from("returns_exchanges")
        .select(`
          *,
          orders(
            id, customer_name, client_id, locality, address, google_maps_link, 
            shipping_address_id, shipping_address_snapshot, legacy_code, 
            initial_delivery_date, max_delivery_date, seller_id,
            clients(phone_primary, phone_secondary, tax_id, billing_address),
            sellers(full_name)
          )
        `)
        .order("created_at", { ascending: false });
      if (rets) setClaims(rets);

      // Fetch cost centers
      const { data: ccs } = await supabase
        .from("cost_centers")
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (ccs) {
        setCostCenters(ccs);
        // Set default cost center to 'LOG' if available, otherwise first
        const logCc = ccs.find(c => c.code === 'LOG');
        if (logCc) {
          setPurchaseCostCenterId(logCc.id);
        } else if (ccs.length > 0) {
          setPurchaseCostCenterId(ccs[0].id);
        }
      }

      // Fetch supplier purchases history
      const { data: purc } = await supabase
        .from("supplier_purchases")
        .select(`
          *,
          supplier:suppliers(name),
          cost_centers:cost_centers(id, name, code)
        `)
        .order("created_at", { ascending: false });
      if (purc) setPurchases(purc as any);

      // Fetch active cash register
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

      // Fetch payment methods
      const { data: payMethods } = await supabase
        .from("payment_methods")
        .select("*")
        .eq("is_active", true);
      if (payMethods) {
        setPaymentMethods(payMethods);
        if (payMethods.length > 0) {
          setImmediatePaymentMethodId(payMethods[0].id);
          setNewPaymentMethodId(payMethods[0].id);
        }
      }

    } catch (e) {
      console.error("Error loading data in compras panel:", e);
    } finally {
      setLoading(false);
    }
  }

  // --- COSTOS & BOM HELPERS ---
  const fetchBom = async (productId: string) => {
    if (!productId) {
      setBomComponents([]);
      return;
    }
    setLoadingBom(true);
    try {
      const { data, error } = await supabase
        .from('product_boms')
        .select('*')
        .eq('parent_product_id', productId);
      
      if (error) {
        console.error("Error loading BOM from database:", error);
        alert("Error al cargar componentes de receta: " + error.message);
        setBomComponents([]);
      } else if (data) {
        // Map component relation in-memory using already fetched products array
        const mappedData = data.map(item => {
          const comp = products.find(p => p.id === item.component_product_id);
          return {
            ...item,
            component: comp || null
          };
        });
        setBomComponents(mappedData);
      }
      
      const prod = products.find(p => p.id === productId);
      if (prod) {
        setBomLaborCost(prod.labor_cost?.toString() || "0");
        setBomOverheadCost(prod.overhead_cost?.toString() || "0");
      }
    } catch (err: any) {
      console.error("Error loading BOM:", err);
      alert("Error inesperado al cargar la receta: " + err.message);
    } finally {
      setLoadingBom(false);
    }
  };

  const handleSaveBomCosts = async () => {
    if (!selectedBomProductId) return;
    setSavingBomCosts(true);
    try {
      const labor = parseFloat(bomLaborCost) || 0;
      const overhead = parseFloat(bomOverheadCost) || 0;
      const { error } = await supabase
        .from('products')
        .update({
          labor_cost: labor,
          overhead_cost: overhead
        })
        .eq('id', selectedBomProductId);
      if (error) throw error;
      
      alert("Costos de producción actualizados correctamente.");
      await loadAllData(true);
      await fetchBom(selectedBomProductId);
    } catch (err: any) {
      alert("Error al guardar costos: " + err.message);
    } finally {
      setSavingBomCosts(false);
    }
  };

  const handleAddBomComponent = async () => {
    if (!selectedBomProductId || !selectedComponentId) return;
    try {
      const qty = parseFloat(bomComponentQuantity) || 0;
      const waste = parseFloat(bomComponentWaste) || 0;
      if (qty <= 0) {
        alert("La cantidad debe ser mayor a 0");
        return;
      }

      const { error } = await supabase
        .from('product_boms')
        .insert({
          parent_product_id: selectedBomProductId,
          component_product_id: selectedComponentId,
          quantity: qty,
          waste_percentage: waste
        });
      if (error) {
        if (error.code === '23505') {
          alert("Este componente ya forma parte de la receta de este producto.");
        } else {
          throw error;
        }
        return;
      }

      setBomComponentQuantity("1");
      setBomComponentWaste("0");
      setSelectedComponentId("");
      await loadAllData(true);
      await fetchBom(selectedBomProductId);
    } catch (err: any) {
      alert("Error al agregar componente: " + err.message);
    }
  };

  const handleDeleteBomComponent = async (id: string) => {
    if (!confirm("¿Seguro que deseas eliminar este componente de la receta?")) return;
    try {
      const { error } = await supabase
        .from('product_boms')
        .delete()
        .eq('id', id);
      if (error) throw error;

      await loadAllData(true);
      await fetchBom(selectedBomProductId);
    } catch (err: any) {
      alert("Error al eliminar componente: " + err.message);
    }
  };

  // --- ORDEN DE PRODUCCION HELPERS ---
  const loadProductionBom = async (productId: string) => {
    if (!productId) {
      setProdComponents([]);
      return;
    }
    try {
      const { data: boms } = await supabase
        .from('product_boms')
        .select(`
          id,
          component_product_id,
          quantity,
          waste_percentage
        `)
        .eq('parent_product_id', productId);
        
      if (!boms || boms.length === 0) {
        setProdComponents([]);
        return;
      }

      const items = boms.map(bom => {
        const compProduct = products.find(p => p.id === bom.component_product_id);
        const isGeneric = compProduct?.is_generic || false;
        const targetProduct = (isGeneric && compProduct?.mapped_real_product_id) 
          ? products.find(p => p.id === compProduct.mapped_real_product_id) 
          : compProduct;

        const defaultSku = compProduct?.sku || "";
        const defaultName = compProduct?.name || "";
        const stockPhysical = targetProduct?.stock_physical || 0;
        
        // Buscar variantes del producto real
        const compParentId = targetProduct?.parent_id || targetProduct?.id;
        const relatedVariants = targetProduct ? products.filter(p => p.id === compParentId || p.parent_id === compParentId) : [];
        
        return {
          bom_id: bom.id,
          product_id: bom.component_product_id,
          default_sku: defaultSku,
          default_name: defaultName + (isGeneric ? " [Genérico]" : ""),
          default_qty: bom.quantity,
          waste_percentage: bom.waste_percentage || 0,
          selected_variant_id: targetProduct?.id || bom.component_product_id, // Por defecto al producto real mapeado
          quantity_to_consume: bom.quantity * (1 + (bom.waste_percentage || 0) / 100),
          stock_physical: stockPhysical,
          variants: relatedVariants.length > 0 ? relatedVariants : [targetProduct].filter(Boolean)
        };
      });
      
      setProdComponents(items);
    } catch (err) {
      console.error("Error loading production BOM:", err);
    }
  };

  const handleRegisterProduction = async () => {
    if (!prodProductId || !prodQuantity) return;
    const qtyToProduce = parseFloat(prodQuantity) || 0;
    if (qtyToProduce <= 0) {
      alert("La cantidad a producir debe ser mayor a 0");
      return;
    }

    // Validar si tiene componentes cargados
    if (prodComponents.length === 0) {
      alert("El producto no tiene una receta (BOM) configurada o no tiene componentes.");
      return;
    }

    setIsRegisteringProduction(true);
    try {
      // 1. Obtener ID del usuario actual
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || null;

      // 2. Registrar el log de producción
      const prodType = products.find(p => p.id === prodProductId)?.production_type === 'ensamblado' ? 'ensamblado' : 'fabricacion';
      const { data: logData, error: logError } = await supabase
        .from('production_logs')
        .insert({
          product_id: prodProductId,
          quantity: qtyToProduce,
          type: prodType,
          notes: prodNotes || null,
          created_by: userId
        })
        .select()
        .single();
      
      if (logError) throw logError;

      // 3. Registrar consumos y transacciones de inventario
      const consumptions = [];
      const stockTransactions = [];

      for (const comp of prodComponents) {
        const variantProduct = products.find(p => p.id === comp.selected_variant_id);
        const unitCost = variantProduct?.cost_price || 0;
        const totalConsumed = comp.quantity_to_consume * qtyToProduce;

        // Registrar detalle del consumo
        consumptions.push({
          production_log_id: logData.id,
          component_product_id: comp.selected_variant_id,
          quantity_consumed: totalConsumed,
          unit_cost: unitCost
        });

        // Registrar transacción de inventario (resta stock de componentes)
        stockTransactions.push({
          product_id: comp.selected_variant_id,
          quantity: totalConsumed, // se restará en el trigger
          type: 'Produccion Consumo',
          reference_id: logData.id,
          user_id: userId
        });
      }

      // Registrar los consumos de producción
      const { error: consError } = await supabase
        .from('production_consumptions')
        .insert(consumptions);
      if (consError) throw consError;

      // Registrar transacciones de inventario de consumo
      const { error: txConsError } = await supabase
        .from('inventory_transactions')
        .insert(stockTransactions);
      if (txConsError) throw txConsError;

      // 4. Registrar transacción de ingreso de stock del producto final
      const { error: txProdError } = await supabase
        .from('inventory_transactions')
        .insert({
          product_id: prodProductId,
          quantity: qtyToProduce, // sumará stock
          type: 'Produccion Ingreso',
          reference_id: logData.id,
          user_id: userId
        });
      if (txProdError) throw txProdError;

      alert("Producción registrada exitosamente. Se ha actualizado el stock.");
      setProdQuantity("1");
      setProdNotes("");
      setProdComponents([]);
      setProdProductId("");
      await loadAllData(true);
    } catch (err: any) {
      alert("Error al registrar producción: " + err.message);
    } finally {
      setIsRegisteringProduction(false);
    }
  };

  // --- INSUMOS HELPERS ---
  const handleAdjustInsumoStock = async () => {
    if (!selectedInsumoToAdjust || !insumoAdjustQty) return;
    const qty = parseFloat(insumoAdjustQty) || 0;
    if (qty <= 0) {
      alert("La cantidad debe ser mayor a 0");
      return;
    }

    setIsAdjustingInsumo(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || null;

      const finalQty = insumoAdjustType === 'egreso' ? -qty : qty;
      const { error } = await supabase
        .from('inventory_transactions')
        .insert({
          product_id: selectedInsumoToAdjust.id,
          quantity: finalQty,
          type: 'Ajuste',
          user_id: userId
        });
      if (error) throw error;

      alert("Ajuste de stock registrado correctamente.");
      setSelectedInsumoToAdjust(null);
      setInsumoAdjustQty("1");
      await loadAllData(true);
    } catch (err: any) {
      alert("Error al ajustar stock: " + err.message);
    } finally {
      setIsAdjustingInsumo(false);
    }
  };

  const handleUpdateGenericMapping = async () => {
    if (!selectedGenericToMap) return;
    setIsUpdatingMapping(true);
    try {
      const { error } = await supabase
        .from('products')
        .update({ mapped_real_product_id: newMappedRealProductId || null })
        .eq('id', selectedGenericToMap.id);
      if (error) throw error;

      alert("Mapeo centralizado actualizado correctamente. Todos los costos y stock se sincronizaron.");
      setSelectedGenericToMap(null);
      setNewMappedRealProductId("");
      await loadAllData(true);
    } catch (err: any) {
      alert("Error al actualizar mapeo: " + err.message);
    } finally {
      setIsUpdatingMapping(false);
    }
  };

  const fetchSupplierComparison = async (prodId: string) => {
    if (!prodId) {
      setSupplierComparisonItems([]);
      return;
    }
    setLoadingComparison(true);
    try {
      const selectedProd = products.find(p => p.id === prodId);
      if (!selectedProd) return;

      // 1. Fetch active price lists
      const { data: activeLists, error: alErr } = await supabase
        .from('price_lists')
        .select('id, list_number, supplier_id, suppliers(name), list_date, currency')
        .eq('is_active', true);
      if (alErr) throw alErr;

      if (!activeLists || activeLists.length === 0) {
        setSupplierComparisonItems([]);
        return;
      }

      // 2. Fetch price list items for the SKU
      const listIds = activeLists.map(al => al.id);
      const { data: items, error: itemsErr } = await supabase
        .from('price_list_items')
        .select('*')
        .in('price_list_id', listIds)
        .eq('sku', selectedProd.sku);
      if (itemsErr) throw itemsErr;

      // Map to combined data
      const mapped = (items || []).map(item => {
        const listInfo = activeLists.find(al => al.id === item.price_list_id);
        const supplierName = (Array.isArray(listInfo?.suppliers) ? listInfo.suppliers[0]?.name : (listInfo?.suppliers as any)?.name) || 'Proveedor desconocido';
        const supplierId = listInfo?.supplier_id;
        const listNumber = listInfo?.list_number;
        const listDate = listInfo?.list_date;
        const currency = listInfo?.currency || 'ARS';

        let listCost = Number(item.list_cost) || 0;
        const discount = Number(item.discount) || 0;
        const taxes = Number(item.taxes) || 21.0;

        // Convertir a ARS si la lista está en USD
        if (currency === 'USD') {
          listCost = listCost * usdExchangeRate;
        }
        
        let netCost = listCost;
        if (item.discount_type === 'percentage') {
          netCost = listCost * (1 - discount / 100);
        } else if (item.discount_type === 'fixed') {
          netCost = listCost - discount;
        }
        
        const totalCost = netCost * (1 + taxes / 100);

        return {
          ...item,
          supplierName,
          supplierId,
          listNumber,
          validFrom: listDate, // Mapeamos list_date a validFrom para retrocompatibilidad en la UI
          netCost,
          totalCost,
          currency
        };
      });

      // Sort by netCost ascending
      mapped.sort((a, b) => a.netCost - b.netCost);
      setSupplierComparisonItems(mapped);
    } catch (err) {
      console.error("Error fetching supplier comparison:", err);
    } finally {
      setLoadingComparison(false);
    }
  };

  const handlePromoteToFabricado = async (productId: string) => {
    try {
      const { error } = await supabase
        .from('products')
        .update({ production_type: 'fabricado' })
        .eq('id', productId);
      if (error) throw error;

      alert("El producto ha sido cambiado a 'Fabricado por nosotros' correctamente. Su costo real fue recalculado.");
      await loadAllData(true);
    } catch (err: any) {
      alert("Error al promover producto: " + err.message);
    }
  };

  const handleSetPrimarySupplier = async (productId: string, supplierId: string) => {
    try {
      // Set all other supplier relations for this product as is_primary = false
      await supabase
        .from('product_supplier_relations')
        .update({ is_primary: false })
        .eq('product_id', productId);

      // Upsert relation for this supplier as is_primary = true
      const { error } = await supabase
        .from('product_supplier_relations')
        .upsert({
          product_id: productId,
          supplier_id: supplierId,
          is_primary: true
        }, { onConflict: 'product_id,supplier_id' });

      if (error) throw error;
      
      alert("Proveedor principal actualizado correctamente.");
      await loadAllData(true);
      if (compareProductId) {
        await fetchSupplierComparison(compareProductId);
      }
    } catch (err: any) {
      alert("Error al establecer proveedor principal: " + err.message);
    }
  };

  // Claims/Exchanges handlers
  const handleViewClaimDetail = async (claim: any) => {
    setSelectedClaim(claim);
    setResolutionMessage(claim.resolution_message || "");
    setLoadingClaimDetail(true);
    try {
      const { data: rItems } = await supabase
        .from("return_items")
        .select("*, products(name, sku)")
        .eq("return_id", claim.id);
      setClaimReturnItems(rItems || []);

      const { data: eItems } = await supabase
        .from("exchange_items")
        .select("*, products(name, sku)")
        .eq("return_id", claim.id);
      setClaimExchangeItems(eItems || []);

      if (claim.orders?.client_id) {
        setEvalSettlementMethod("cuenta_corriente");
      } else {
        setEvalSettlementMethod("caja");
      }

      if (paymentMethods.length > 0) {
        const cashMethod = paymentMethods.find(p => p.name.toLowerCase().includes("efectivo"));
        if (cashMethod) setEvalPaymentMethodId(cashMethod.id);
        else setEvalPaymentMethodId(paymentMethods[0].id);
      }
    } catch (err) {
      console.error("Error loading claim details:", err);
      alert("Error al cargar detalles del reclamo.");
    } finally {
      setLoadingClaimDetail(false);
    }
  };

  const handleApproveClaim = async (claim: any) => {
    if (!claim) return;
    
    if (!resolutionMessage.trim()) {
      alert("Debe ingresar un mensaje de resolución / respuesta al cliente para continuar.");
      return;
    }
    
    // Dynamic recalculation of exchange and difference amounts
    const finalExchangeAmount = claimExchangeItems.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
    const finalDifferenceAmount = finalExchangeAmount - claim.refund_amount;
    
    // Check cash register if using cash settlement
    const isCashPayment = evalPaymentMethodId && paymentMethods.find(p => p.id === evalPaymentMethodId)?.name.toLowerCase().includes("efectivo");
    const needsCashRegister = (finalDifferenceAmount !== 0) && (evalSettlementMethod === 'caja') && (isCashPayment || finalDifferenceAmount < 0);
    
    if (needsCashRegister && !openRegister) {
      alert("No hay una caja diaria abierta. Debe abrir caja primero para registrar movimientos de efectivo.");
      return;
    }

    setEvaluatingClaimId(claim.id);
    try {
      // 1a. Sync final exchange items in the database
      const { error: deleteError } = await supabase
        .from("exchange_items")
        .delete()
        .eq("return_id", claim.id);
      if (deleteError) throw deleteError;

      if (claimExchangeItems.length > 0) {
        const exchangeItemsToInsert = claimExchangeItems.map(item => ({
          return_id: claim.id,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price
        }));
        const { error: excItemsError } = await supabase
          .from('exchange_items')
          .insert(exchangeItemsToInsert);
        if (excItemsError) throw excItemsError;
      }

      // 1b. Update returns_exchanges status, exchange_amount, difference_amount to 'Resuelto'
      const { error: updateError } = await supabase
        .from("returns_exchanges")
        .update({ 
          status: "Resuelto",
          exchange_amount: finalExchangeAmount,
          difference_amount: finalDifferenceAmount,
          resolution_message: resolutionMessage.trim()
        })
        .eq("id", claim.id);
      if (updateError) throw updateError;

      // 2. Perform Cash / Ledger adjustments
      if (finalDifferenceAmount !== 0) {
        const pm = paymentMethods.find(p => p.id === evalPaymentMethodId);
        const pmName = pm ? pm.name : 'Postventa';

        if (evalSettlementMethod === 'caja') {
          const isRefund = finalDifferenceAmount < 0;
          const amtToRecord = Math.abs(finalDifferenceAmount);

          const { data: txData, error: txError } = await supabase
            .from('cash_transactions')
            .insert({
              register_id: openRegister.id,
              type: isRefund ? 'egreso' : 'ingreso',
              category: isRefund ? 'devolucion_reembolso' : 'cobro_pedido',
              amount: amtToRecord,
              currency: 'ARS',
              exchange_rate: 1.0,
              payment_method_id: evalPaymentMethodId,
              reference_id: claim.id,
              notes: `Aprobación Reclamo Pedido #${claim.orders?.legacy_code || claim.order_id?.substring(0,8)}. Razón: ${claim.reason}`,
              created_by: claim.created_by
            })
            .select()
            .single();
          if (txError) throw txError;

          const registerDiff = isRefund ? -amtToRecord : amtToRecord;
          const newExpectedArs = openRegister.expected_balance_ars + registerDiff;

          const { error: regError } = await supabase
            .from('cash_registers')
            .update({ expected_balance_ars: newExpectedArs })
            .eq('id', openRegister.id);
          if (regError) throw regError;

          if (claim.orders?.client_id) {
            const { error: pmError } = await supabase
              .from('client_payments')
              .insert({
                client_id: claim.orders.client_id,
                order_id: claim.order_id,
                amount: -finalDifferenceAmount,
                currency: 'ARS',
                exchange_rate: 1.0,
                payment_method_id: evalPaymentMethodId,
                cash_transaction_id: txData.id,
                notes: `Ajuste postventa registrado en caja (${pmName})`
              });
            if (pmError) throw pmError;
          }
        } else if (evalSettlementMethod === 'cuenta_corriente' && claim.orders?.client_id) {
          const { error: pmError } = await supabase
            .from('client_payments')
            .insert({
              client_id: claim.orders.client_id,
              order_id: claim.order_id,
              amount: -finalDifferenceAmount,
              currency: 'ARS',
              exchange_rate: 1.0,
              payment_method_id: evalPaymentMethodId || 'a3a890a8-b677-4b7b-8ffb-d36c2e7b5ad3',
              notes: `Ajuste postventa imputado en Cuenta Corriente. Razón: ${claim.reason}`
            });
          if (pmError) throw pmError;
        }
      }

      // 3. Logistics Integration: Create CAMB order if replacement items exist OR we need to collect returned items
      const hasExchangeItems = claimExchangeItems.length > 0;
      const hasReturnItems = claimReturnItems.length > 0;

      if (hasExchangeItems || hasReturnItems) {
        let sellerId = claim.orders?.seller_id;
        if (!sellerId) {
          const { data: sData } = await supabase.from("sellers").select("id").limit(1);
          if (sData && sData.length > 0) {
            sellerId = sData[0].id;
          } else {
            sellerId = "a0d663bb-a536-47a3-83f5-09bd26bbde70";
          }
        }

        const shippingSnapshot = claim.orders?.shipping_address_snapshot || null;

        const returnNotes = claimReturnItems
          .map(i => `${i.quantity}x ${i.products?.name} (${i.restock_action === 'reingreso_stock' ? 'Volver a Stock' : 'Descarte por Defectuoso'})`)
          .join("\n- ");

        const deliveryNotes = `🔄 RECLAMO / CAMBIO APROBADO (ID Reclamo: ${claim.id.substring(0,8)})\n` +
          (hasReturnItems ? `➡️ TRAER DE REGRESO DE CLIENTE:\n- ${returnNotes}\n` : "") +
          `➡️ MOTIVO: ${claim.reason}`;

        const { data: newOrder, error: orderError } = await supabase
          .from("orders")
          .insert({
            seller_id: sellerId,
            customer_name: claim.orders?.customer_name || 'Desconocido',
            client_id: claim.orders?.client_id || null,
            locality: claim.orders?.locality || '',
            address: claim.orders?.address || '',
            google_maps_link: claim.orders?.google_maps_link || '',
            shipping_address_id: claim.orders?.shipping_address_id || null,
            shipping_address_snapshot: shippingSnapshot,
            payment_method_id: evalPaymentMethodId || 'a3a890a8-b677-4b7b-8ffb-d36c2e7b5ad3',
            freight_type: 'Flete Propio',
            status: 'Listo para Entregar',
            payment_status: finalDifferenceAmount <= 0 ? 'Abonado' : 'Pendiente',
            total_amount: finalDifferenceAmount > 0 ? finalDifferenceAmount : 0,
            legacy_code: `CAMB-${claim.orders?.legacy_code || claim.orders?.id?.substring(0,6) || claim.id.substring(0,6)}`,
            delivery_notes: deliveryNotes,
            delivery_detail: deliveryNotes,
            initial_delivery_date: claim.orders?.initial_delivery_date || new Date().toISOString().split('T')[0],
            max_delivery_date: claim.orders?.max_delivery_date || new Date().toISOString().split('T')[0],
            logistics_zone_id: claim.orders?.logistics_zone_id || null
          })
          .select()
          .single();

        if (orderError) throw orderError;

        if (hasExchangeItems) {
          const itemsToInsert = claimExchangeItems.map(item => ({
            order_id: newOrder.id,
            product_id: item.product_id,
            product_name: item.products?.name || 'Desconocido',
            quantity: item.quantity,
            unit_price: item.unit_price,
            historical_unit_cost: 0,
            discount_percentage: 0
          }));

          const { error: itemsError } = await supabase
            .from("order_items")
            .insert(itemsToInsert);
          if (itemsError) throw itemsError;
        }
      }

      alert("Reclamo aprobado con éxito. Se actualizó el stock, la caja y se generó el pedido de cambio logístico 'CAMB' para la hoja de ruta.");
      setSelectedClaim(null);
      await loadAllData(true);
    } catch (err: any) {
      console.error("Error approving claim:", err);
      alert("Error al aprobar el reclamo: " + err.message);
    } finally {
      setEvaluatingClaimId(null);
    }
  };

  const handleRejectClaim = async (claimId: string) => {
    if (!resolutionMessage.trim()) {
      alert("Debe ingresar un mensaje de resolución / motivo de rechazo para continuar.");
      return;
    }
    setEvaluatingClaimId(claimId);
    try {
      const { error } = await supabase
        .from("returns_exchanges")
        .update({ 
          status: "Rechazado",
          rejection_reason: resolutionMessage.trim(),
          resolution_message: resolutionMessage.trim()
        })
        .eq("id", claimId);
      if (error) throw error;

      alert("Reclamo rechazado con éxito.");
      setSelectedClaim(null);
      await loadAllData(true);
    } catch (err: any) {
      console.error("Error rejecting claim:", err);
      alert("Error al rechazar el reclamo: " + err.message);
    } finally {
      setEvaluatingClaimId(null);
    }
  };

  const startEditSupplier = (sup: Supplier) => {
    setEditingSupplier(sup);
    setNewSupplierName(sup.name || "");
    setNewSupplierLegal(sup.legal_name || "");
    setNewSupplierCuit(sup.cuit || "");
    setNewSupplierDiscount(sup.base_discount_percentage || 0);
    setNewSupplierDelivery(sup.delivery_time_days || 0);
    setNewSupplierBankName(sup.bank_details?.bank_name || "");
    setNewSupplierAccount(sup.bank_details?.account_number || "");
    setNewSupplierCbu(sup.bank_details?.cbu || "");
    setNewSupplierAlias(sup.bank_details?.alias || "");
    
    setNewSupplierBusinessUnit(sup.business_unit || "Zono");
    setNewSupplierContacts(sup.contacts || "");
    setNewSupplierPhone(sup.phone || "");
    setNewSupplierAddress(sup.address || "");
    setNewSupplierLocality(sup.locality || "");
    setNewSupplierGpsLocation(sup.gps_location || "");
    setNewSupplierNotes(sup.notes || "");
    setNewSupplierDeliveryText(sup.delivery_time_text || "");
    setNewSupplierMainProducts(sup.main_products || "");
    setNewSupplierDiscount1(sup.discount_1?.toString() || "0");
    setNewSupplierDiscount2(sup.discount_2?.toString() || "0");
    setNewSupplierSurcharges(sup.surcharges?.toString() || "0");
    setNewSupplierDiscountCash(sup.discount_cash?.toString() || "0");
    setNewSupplierBonusCoef(sup.bonus_coef?.toString() || "1.0");

    setIsSupplierFormOpen(true);
  };

  const closeSupplierForm = () => {
    setEditingSupplier(null);
    setNewSupplierName("");
    setNewSupplierLegal("");
    setNewSupplierCuit("");
    setNewSupplierDiscount(0);
    setNewSupplierDelivery(0);
    setNewSupplierBankName("");
    setNewSupplierAccount("");
    setNewSupplierCbu("");
    setNewSupplierAlias("");
    
    setNewSupplierBusinessUnit("Zono");
    setNewSupplierContacts("");
    setNewSupplierPhone("");
    setNewSupplierAddress("");
    setNewSupplierLocality("");
    setNewSupplierGpsLocation("");
    setNewSupplierNotes("");
    setNewSupplierDeliveryText("");
    setNewSupplierMainProducts("");
    setNewSupplierDiscount1("0");
    setNewSupplierDiscount2("0");
    setNewSupplierSurcharges("0");
    setNewSupplierDiscountCash("0");
    setNewSupplierBonusCoef("1.0");

    setIsSupplierFormOpen(false);
  };

  // Create or Update Supplier
  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupplierName) return;

    try {
      const bankDetails = {
        bank_name: newSupplierBankName,
        account_number: newSupplierAccount,
        cbu: newSupplierCbu,
        alias: newSupplierAlias
      };

      const payload = {
        name: newSupplierName,
        legal_name: newSupplierLegal || null,
        cuit: newSupplierCuit || null,
        base_discount_percentage: Number(newSupplierDiscount) || 0,
        delivery_time_days: Number(newSupplierDelivery) || 0,
        bank_details: bankDetails,
        business_unit: newSupplierBusinessUnit,
        contacts: newSupplierContacts || null,
        phone: newSupplierPhone || null,
        address: newSupplierAddress || null,
        locality: newSupplierLocality || null,
        gps_location: newSupplierGpsLocation || null,
        notes: newSupplierNotes || null,
        delivery_time_text: newSupplierDeliveryText || null,
        main_products: newSupplierMainProducts || null,
        discount_1: Number(newSupplierDiscount1) || 0,
        discount_2: Number(newSupplierDiscount2) || 0,
        surcharges: Number(newSupplierSurcharges) || 0,
        discount_cash: Number(newSupplierDiscountCash) || 0,
        bonus_coef: Number(newSupplierBonusCoef) || 1.0
      };

      if (editingSupplier) {
        // UPDATE
        const { data, error } = await supabase
          .from("suppliers")
          .update(payload)
          .eq("id", editingSupplier.id)
          .select()
          .single();

        if (error) throw error;
        setSuppliers(prev => prev.map(s => s.id === editingSupplier.id ? data : s));
        alert("Proveedor actualizado con éxito.");
      } else {
        // CREATE
        const { data, error } = await supabase
          .from("suppliers")
          .insert(payload)
          .select()
          .single();

        if (error) throw error;
        setSuppliers(prev => [...prev, data]);
        alert("Proveedor registrado con éxito.");
      }

      closeSupplierForm();
    } catch (err) {
      alert("Error al guardar el proveedor: " + (err as any).message);
    }
  };

  // Delete Supplier
  const handleDeleteSupplier = async (id: string) => {
    if (!confirm("¿Seguro que querés eliminar este proveedor? Esto borrará todas sus listas de precios asociadas.")) return;
    try {
      const { error } = await supabase.from("suppliers").delete().eq("id", id);
      if (error) throw error;
      setSuppliers(prev => prev.filter(s => s.id !== id));
    } catch (err) {
      alert("Error al eliminar: " + (err as any).message);
    }
  };

  // Import Price List
  const handleImportPriceList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplierId || !newPlNumber || !plRawText) {
      alert("Completá todos los campos requeridos.");
      return;
    }

    setSubmittingPl(true);
    try {
      const lines = plRawText.split("\n");
      const parsedItems: {sku: string, list_cost: number, discount: number, discount_type: string, taxes: number}[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || i === 0 && line.toLowerCase().startsWith("sku")) continue; // Ignorar cabecera

        const cols = line.split(/[,\t]/);
        if (cols.length >= 2) {
          const sku = cols[0].trim();
          const list_cost = Number(cols[1].trim());
          const discount = cols[2] ? Number(cols[2].trim()) : 0;
          const discount_type = cols[3] ? cols[3].trim().toLowerCase() : 'percentage';
          const taxes = cols[4] ? Number(cols[4].trim()) : 21.0;

          if (sku && !isNaN(list_cost)) {
            parsedItems.push({
              sku,
              list_cost,
              discount,
              discount_type: discount_type === 'fixed' ? 'fixed' : 'percentage',
              taxes
            });
          }
        }
      }

      if (parsedItems.length === 0) {
        throw new Error("No se encontraron registros válidos para importar. Asegurate de que el formato sea SKU, COSTO (separado por coma o tab).");
      }

      if (newPlActive) {
        await supabase
          .from("price_lists")
          .update({ is_active: false })
          .eq("supplier_id", selectedSupplierId);
      }

      const { data: newPl, error: plErr } = await supabase
        .from("price_lists")
        .insert({
          supplier_id: selectedSupplierId,
          list_number: newPlNumber,
          list_date: newPlDate,
          is_active: newPlActive,
          currency: newPlCurrency
        })
        .select()
        .single();

      if (plErr) throw plErr;

      const itemsToInsert = parsedItems.map(item => ({
        price_list_id: newPl.id,
        sku: item.sku,
        list_cost: item.list_cost,
        discount: item.discount,
        discount_type: item.discount_type,
        taxes: item.taxes
      }));

      const { error: itemsErr } = await supabase.from("price_list_items").insert(itemsToInsert);
      if (itemsErr) throw itemsErr;

      alert(`Lista de precios importada correctamente. Se cargaron ${parsedItems.length} artículos.`);
      setIsPricelistFormOpen(false);
      setPlRawText("");
      setNewPlNumber("");
      setNewPlCurrency("ARS");
      loadAllData();

    } catch (err) {
      alert("Error al importar lista: " + (err as any).message);
    } finally {
      setSubmittingPl(false);
    }
  };

  // Toggle active price list
  const handleTogglePriceList = async (listId: string, supplierId: string) => {
    try {
      await supabase.from("price_lists").update({ is_active: false }).eq("supplier_id", supplierId);
      const { error } = await supabase.from("price_lists").update({ is_active: true }).eq("id", listId);
      if (error) throw error;
      
      alert("Lista de precios activada.");
      loadAllData();
    } catch (err) {
      alert("Error al activar lista: " + (err as any).message);
    }
  };

  // Fetch price list items for inspection
  const handleViewPriceListItems = async (pl: PriceList) => {
    setInspectingPriceList(pl);
    setLoadingInspectingItems(true);
    setPlModalSearchQuery("");
    try {
      const { data, error } = await supabase
        .from('price_list_items')
        .select('*')
        .eq('price_list_id', pl.id)
        .order('sku');
      if (error) throw error;
      setInspectingItems(data || []);
    } catch (err: any) {
      console.error("Error fetching price list items:", err);
      alert("Error al cargar ítems de la lista: " + err.message);
    } finally {
      setLoadingInspectingItems(false);
    }
  };

  // Associate product with supplier
  const handleRelationChange = async (productId: string, supplierId: string, isPrimary: boolean) => {
    try {
      if (!supplierId) {
        await supabase.from("product_supplier_relations").delete().eq("product_id", productId);
      } else {
        if (isPrimary) {
          await supabase.from("product_supplier_relations").update({ is_primary: false }).eq("product_id", productId);
        }

        const { error } = await supabase
          .from("product_supplier_relations")
          .upsert({
            product_id: productId,
            supplier_id: supplierId,
            is_primary: isPrimary
          }, { onConflict: 'product_id,supplier_id' });

        if (error) throw error;
      }
      loadAllData(true);
    } catch (err) {
      alert("Error al vincular: " + (err as any).message);
    }
  };

  // Toggle product price formula
  const handleTogglePriceFormula = async (productId: string, fixedPrice: boolean) => {
    try {
      const { error } = await supabase
        .from("products")
        .update({ fixed_price: fixedPrice })
        .eq("id", productId);
      
      if (error) throw error;
      setProducts(prev => prev.map(p => p.id === productId ? { ...p, fixed_price: fixedPrice } : p));
    } catch (err) {
      alert("Error al actualizar fórmula: " + (err as any).message);
    }
  };

  // Update product markup
  const handleUpdateMarkup = async (productId: string, type: 'retail' | 'wholesale', value: number) => {
    try {
      const field = type === 'retail' ? 'markup_percentage' : 'markup_wholesale_percentage';
      const { error } = await supabase
        .from("products")
        .update({ [field]: value })
        .eq("id", productId);

      if (error) throw error;
      setProducts(prev => prev.map(p => p.id === productId ? { ...p, [field]: value } : p));
    } catch (err) {
      alert("Error al actualizar margen: " + (err as any).message);
    }
  };

  // --- COST ALERTS RESOLUTION LOGIC ---
  const handleResolveAlert = async (alertItem: ProductCostAlert, action: 'Actualizada' | 'Ignorada') => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id;
      if (!userId) throw new Error("No se pudo autenticar el usuario.");

      if (action === 'Actualizada') {
        // Find product SKU
        const product = products.find(p => p.id === alertItem.product_id);
        const sku = product?.sku;
        if (!sku) throw new Error("El producto no posee SKU asignado para actualizar la lista de precios.");

        // Find primary relation supplier
        const rel = relations.find(r => r.product_id === alertItem.product_id && r.is_primary) || relations.find(r => r.product_id === alertItem.product_id);
        let supplierId = rel?.supplier_id;
        
        if (!supplierId) {
          // Fallback to purchase supplier
          supplierId = alertItem.purchase?.supplier?.id;
        }

        if (!supplierId) {
          throw new Error("No se pudo identificar el proveedor asociado.");
        }

        // Fetch active price list
        const { data: activeLists } = await supabase
          .from('price_lists')
          .select('id')
          .eq('supplier_id', supplierId)
          .eq('is_active', true)
          .limit(1);

        let activeListId = activeLists && activeLists.length > 0 ? activeLists[0].id : null;

        if (!activeListId) {
          // Create new price list
          const { data: newPl, error: plErr } = await supabase
            .from('price_lists')
            .insert({
              supplier_id: supplierId,
              list_number: 'AJUSTE-COSTO-COMPRA',
              is_active: true
            })
            .select()
            .single();
          if (plErr) throw plErr;
          activeListId = newPl.id;
        }

        // Fetch price list item
        const { data: plItems } = await supabase
          .from('price_list_items')
          .select('*')
          .eq('price_list_id', activeListId)
          .eq('sku', sku)
          .limit(1);

        const plItem = plItems && plItems.length > 0 ? plItems[0] : null;
        const newPurchaseCost = Number(alertItem.purchase_cost);

        if (plItem) {
          const taxes = Number(plItem.taxes) || 21.0;
          const discount = Number(plItem.discount) || 0;
          let newListCost = 0;

          if (plItem.discount_type === 'fixed') {
            newListCost = (newPurchaseCost / (1 + taxes / 100)) + discount;
          } else {
            newListCost = newPurchaseCost / ((1 - discount / 100) * (1 + taxes / 100));
          }

          const { error: updateItemErr } = await supabase
            .from('price_list_items')
            .update({ list_cost: newListCost })
            .eq('id', plItem.id);

          if (updateItemErr) throw updateItemErr;
        } else {
          // Create new price list item, assuming 21% IVA, no discounts
          const newListCost = newPurchaseCost / 1.21;
          const { error: insertItemErr } = await supabase
            .from('price_list_items')
            .insert({
              price_list_id: activeListId,
              sku: sku,
              list_cost: newListCost,
              discount: 0,
              discount_type: 'percentage',
              taxes: 21.0
            });

          if (insertItemErr) throw insertItemErr;
        }
      }

      // Resolve the alert
      const { error: updateAlertErr } = await supabase
        .from('product_cost_alerts')
        .update({
          status: action,
          resolved_at: new Date().toISOString(),
          created_by: userId
        })
        .eq('id', alertItem.id);

      if (updateAlertErr) throw updateAlertErr;

      alert(`Alerta marcada como ${action === 'Actualizada' ? 'Actualizada (Catálogo Modificado)' : 'Ignorada'} con éxito.`);
      loadAllData();
    } catch (err: any) {
      alert("Error al resolver la alerta: " + err.message);
    }
  };

  // --- NEW PURCHASE LOGIC ---
  const handleAddPurchaseItem = () => {
    if (!currentItemProductId || !currentItemQuantity || !currentItemUnitCost) {
      alert("Seleccioná un producto y completá cantidad y costo.");
      return;
    }

    const qty = Number(currentItemQuantity);
    const cost = Number(currentItemUnitCost);

    if (isNaN(qty) || qty <= 0) {
      alert("La cantidad debe ser mayor a 0.");
      return;
    }
    if (isNaN(cost) || cost < 0) {
      alert("El costo unitario debe ser mayor o igual a 0.");
      return;
    }

    const prod = products.find(p => p.id === currentItemProductId);
    if (!prod) return;

    // Check if item already exists in current list
    const existsIdx = purchaseItems.findIndex(i => i.productId === prod.id);
    if (existsIdx > -1) {
      const updated = [...purchaseItems];
      updated[existsIdx].quantity += qty;
      updated[existsIdx].unitCost = cost; // Overwrite with newest cost
      setPurchaseItems(updated);
    } else {
      setPurchaseItems(prev => [...prev, {
        productId: prod.id,
        name: prod.name,
        sku: prod.sku || "SIN SKU",
        quantity: qty,
        unitCost: cost
      }]);
    }

    // Reset inputs
    setCurrentItemProductId("");
    setCurrentItemQuantity("1");
    setCurrentItemUnitCost("");
  };

  const handleRemovePurchaseItem = (idx: number) => {
    setPurchaseItems(prev => prev.filter((_, i) => i !== idx));
  };

  const loadPaymentsAndEgresos = async (purchaseId: string, currency: string) => {
    setLoadingPayments(true);
    try {
      // 1. Fetch associated payments
      const { data: payments, error: payError } = await supabase
        .from('supplier_payments')
        .select(`
          *,
          payment_methods(name),
          cash_transactions(concept, amount)
        `)
        .eq('purchase_id', purchaseId)
        .order('created_at', { ascending: true });
      if (payError) throw payError;
      setAssociatedPayments(payments || []);

      // 2. Fetch unreconciled cash transactions (egresos of category 'pago_proveedor' or 'gasto_general' in same currency)
      const { data: allEgresos, error: egresosError } = await supabase
        .from('cash_transactions')
        .select(`
          *,
          payment_methods(name)
        `)
        .eq('type', 'egreso')
        .eq('currency', currency)
        .in('category', ['pago_proveedor', 'gasto_general'])
        .order('created_at', { ascending: false });
      
      if (egresosError) throw egresosError;

      // Find all cash_transaction_id already linked in supplier_payments
      const { data: linkedPayments, error: linkedError } = await supabase
        .from('supplier_payments')
        .select('cash_transaction_id')
        .not('cash_transaction_id', 'is', null);

      if (linkedError) throw linkedError;

      const linkedIds = new Set(linkedPayments?.map(p => p.cash_transaction_id) || []);
      const unreconciled = (allEgresos || []).filter(e => !linkedIds.has(e.id));
      setUnreconciledEgresos(unreconciled);
      setSelectedEgresoId("");
    } catch (e: any) {
      console.error("Error loading payments/egresos:", e);
    } finally {
      setLoadingPayments(false);
    }
  };

  const handleLinkEgreso = async () => {
    if (!selectedPurchase || !selectedEgresoId) return;
    setSubmittingLink(true);
    try {
      const egreso = unreconciledEgresos.find(e => e.id === selectedEgresoId);
      if (!egreso) throw new Error("Movimiento de caja no encontrado.");

      const remainingBalance = selectedPurchase.total_amount - selectedPurchase.paid_amount;
      if (remainingBalance <= 0) {
        throw new Error("La compra ya se encuentra completamente pagada.");
      }

      const imputeAmount = Math.min(remainingBalance, egreso.amount);

      const { data: { user } } = await supabase.auth.getUser();
      const currentUserId = user?.id;
      if (!currentUserId) throw new Error("No autenticado.");

      const { error: payErr } = await supabase
        .from('supplier_payments')
        .insert({
          supplier_id: selectedPurchase.supplier_id,
          purchase_id: selectedPurchase.id,
          amount: imputeAmount,
          currency: selectedPurchase.currency,
          payment_method_id: egreso.payment_method_id,
          cash_transaction_id: egreso.id,
          notes: `Vinculado con Egreso de Caja: ${egreso.concept || 'S/C'}`,
          created_by: currentUserId
        });

      if (payErr) throw payErr;

      const newPaidAmount = selectedPurchase.paid_amount + imputeAmount;
      const newStatus: "Pendiente" | "Parcial" | "Pagado" | "Anulado" = newPaidAmount >= selectedPurchase.total_amount ? 'Pagado' : 'Parcial';

      const { error: updateErr } = await supabase
        .from('supplier_purchases')
        .update({
          paid_amount: newPaidAmount,
          status: newStatus
        })
        .eq('id', selectedPurchase.id);

      if (updateErr) throw updateErr;

      const updatedPurchase = {
        ...selectedPurchase,
        paid_amount: newPaidAmount,
        status: newStatus
      };
      setSelectedPurchase(updatedPurchase);
      setPurchases(prev => prev.map(p => p.id === selectedPurchase.id ? updatedPurchase : p));

      alert("Egreso de caja vinculado con éxito.");
      await loadPaymentsAndEgresos(selectedPurchase.id, selectedPurchase.currency);
    } catch (err: any) {
      alert("Error al vincular movimiento: " + err.message);
    } finally {
      setSubmittingLink(false);
    }
  };

  const handleRegisterNewPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPurchase) return;

    const payAmt = Number(newPaymentAmount);
    if (isNaN(payAmt) || payAmt <= 0) {
      alert("Monto inválido.");
      return;
    }

    const remainingBalance = selectedPurchase.total_amount - selectedPurchase.paid_amount;
    if (payAmt > remainingBalance) {
      alert("El pago no puede superar el saldo restante de la compra.");
      return;
    }

    const pm = paymentMethods.find(p => p.id === newPaymentMethodId);
    const isCash = pm?.name.toLowerCase().includes("efectivo");
    if (isCash && !openRegister) {
      alert("Debe tener una Caja Abierta para registrar pagos en efectivo.");
      return;
    }

    setSubmittingNewPayment(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const currentUserId = user?.id;
      if (!currentUserId) throw new Error("No autenticado.");

      let cashTxId: string | undefined = undefined;

      if (isCash && openRegister) {
        const { data: txData, error: txError } = await supabase
          .from('cash_transactions')
          .insert({
            register_id: openRegister.id,
            type: 'egreso',
            category: 'pago_proveedor',
            amount: payAmt,
            currency: selectedPurchase.currency,
            exchange_rate: 1.0,
            payment_method_id: newPaymentMethodId,
            reference_id: selectedPurchase.id,
            concept: `Pago a Proveedor: ${selectedPurchase.supplier?.name || ''} - Factura: ${selectedPurchase.invoice_number}`,
            cost_center_id: selectedPurchase.cost_center_id || null,
            notes: newPaymentNotes || `Pago registrado desde Compras`,
            created_by: currentUserId
          })
          .select()
          .single();

        if (txError) throw txError;
        cashTxId = txData.id;

        const changeAmountArs = selectedPurchase.currency === 'ARS' ? payAmt : 0;
        const changeAmountUsd = selectedPurchase.currency === 'USD' ? payAmt : 0;
        const newExpectedArs = openRegister.expected_balance_ars - changeAmountArs;
        const newExpectedUsd = openRegister.expected_balance_usd - changeAmountUsd;

        await supabase
          .from('cash_registers')
          .update({
            expected_balance_ars: newExpectedArs,
            expected_balance_usd: newExpectedUsd
          })
          .eq('id', openRegister.id);
      }

      const { error: payErr } = await supabase
        .from('supplier_payments')
        .insert({
          supplier_id: selectedPurchase.supplier_id,
          purchase_id: selectedPurchase.id,
          amount: payAmt,
          currency: selectedPurchase.currency,
          payment_method_id: newPaymentMethodId,
          cash_transaction_id: cashTxId || null,
          notes: newPaymentNotes || `Pago factura de compra ${selectedPurchase.invoice_number}`,
          created_by: currentUserId
        });

      if (payErr) throw payErr;

      const newPaidAmount = selectedPurchase.paid_amount + payAmt;
      const newStatus: "Pendiente" | "Parcial" | "Pagado" | "Anulado" = newPaidAmount >= selectedPurchase.total_amount ? 'Pagado' : 'Parcial';

      const { error: updateErr } = await supabase
        .from('supplier_purchases')
        .update({
          paid_amount: newPaidAmount,
          status: newStatus
        })
        .eq('id', selectedPurchase.id);

      if (updateErr) throw updateErr;

      const updatedPurchase = {
        ...selectedPurchase,
        paid_amount: newPaidAmount,
        status: newStatus
      };
      setSelectedPurchase(updatedPurchase);
      setPurchases(prev => prev.map(p => p.id === selectedPurchase.id ? updatedPurchase : p));

      setNewPaymentAmount("");
      setNewPaymentNotes("");

      alert("Pago registrado correctamente.");
      await loadPaymentsAndEgresos(selectedPurchase.id, selectedPurchase.currency);
    } catch (err: any) {
      alert("Error al registrar pago: " + err.message);
    } finally {
      setSubmittingNewPayment(false);
    }
  };

  const handleUnlinkPayment = async (paymentId: string) => {
    if (!selectedPurchase) return;
    if (!confirm("¿Seguro que querés desvincular o anular este pago?")) return;

    setLoadingPayments(true);
    try {
      const payment = associatedPayments.find(p => p.id === paymentId);
      if (!payment) throw new Error("Pago no encontrado.");

      const { error: deletePayErr } = await supabase
        .from('supplier_payments')
        .delete()
        .eq('id', paymentId);

      if (deletePayErr) throw deletePayErr;

      if (payment.cash_transaction_id) {
        const isLinked = payment.notes?.includes("Vinculado con Egreso de Caja");
        if (!isLinked) {
          const { data: tx } = await supabase
            .from('cash_transactions')
            .select('*')
            .eq('id', payment.cash_transaction_id)
            .single();

          if (tx) {
            await supabase.from('cash_transactions').delete().eq('id', tx.id);

            const changeAmountArs = tx.currency === 'ARS' ? tx.amount : 0;
            const changeAmountUsd = tx.currency === 'USD' ? tx.amount : 0;
            
            const { data: reg } = await supabase
              .from('cash_registers')
              .select('*')
              .eq('id', tx.register_id)
              .single();
            
            if (reg) {
              await supabase
                .from('cash_registers')
                .update({
                  expected_balance_ars: reg.expected_balance_ars + changeAmountArs,
                  expected_balance_usd: reg.expected_balance_usd + changeAmountUsd
                })
                .eq('id', reg.id);
            }
          }
        }
      }

      const newPaidAmount = Math.max(0, selectedPurchase.paid_amount - payment.amount);
      const newStatus: "Pendiente" | "Parcial" | "Pagado" | "Anulado" = newPaidAmount === 0 ? 'Pendiente' : (newPaidAmount >= selectedPurchase.total_amount ? 'Pagado' : 'Parcial');

      const { error: updateErr } = await supabase
        .from('supplier_purchases')
        .update({
          paid_amount: newPaidAmount,
          status: newStatus
        })
        .eq('id', selectedPurchase.id);

      if (updateErr) throw updateErr;

      const updatedPurchase = {
        ...selectedPurchase,
        paid_amount: newPaidAmount,
        status: newStatus
      };
      setSelectedPurchase(updatedPurchase);
      setPurchases(prev => prev.map(p => p.id === selectedPurchase.id ? updatedPurchase : p));

      alert("Pago eliminado/desvinculado correctamente.");
      await loadPaymentsAndEgresos(selectedPurchase.id, selectedPurchase.currency);
    } catch (err: any) {
      alert("Error al anular pago: " + err.message);
    } finally {
      setLoadingPayments(false);
    }
  };

  const handleSavePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!purchaseSupplierId || !purchaseInvoiceNumber) {
      alert("Proveedor y Nro de Factura son requeridos.");
      return;
    }
    if (purchaseItems.length === 0) {
      alert("Debés agregar al menos un artículo a la compra.");
      return;
    }

    setIsSubmittingPurchase(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const currentUserId = user?.id;
      if (!currentUserId) throw new Error("No autenticado.");

      const purchaseTotal = purchaseItems.reduce((acc, item) => acc + (item.quantity * item.unitCost), 0);

      let paidAmt = 0;
      let cashTxId: string | undefined = undefined;

      if (payImmediately) {
        const payAmt = Number(immediatePaymentAmount);
        if (isNaN(payAmt) || payAmt <= 0) {
          throw new Error("El monto de pago inmediato debe ser mayor a 0.");
        }
        if (payAmt > purchaseTotal) {
          throw new Error("El pago no puede superar el total de la compra.");
        }
        paidAmt = payAmt;

        const pm = paymentMethods.find(p => p.id === immediatePaymentMethodId);
        const isCash = pm?.name.toLowerCase().includes("efectivo");
        
        if (isCash) {
          if (!openRegister) {
            throw new Error("Debe tener una Caja Abierta para registrar egresos en efectivo.");
          }
        }
      }

      const purchaseStatus = paidAmt === 0 ? 'Pendiente' : (paidAmt === purchaseTotal ? 'Pagado' : 'Parcial');
      const { data: purchaseData, error: purchaseErr } = await supabase
        .from('supplier_purchases')
        .insert({
          supplier_id: purchaseSupplierId,
          invoice_number: purchaseInvoiceNumber,
          purchase_date: new Date(purchaseDate).toISOString(),
          due_date: purchaseDueDate ? new Date(purchaseDueDate).toISOString() : null,
          total_amount: purchaseTotal,
          paid_amount: paidAmt,
          currency: purchaseCurrency,
          status: purchaseStatus,
          cost_center_id: purchaseCostCenterId || null,
          notes: purchaseNotes || null,
          created_by: currentUserId
        })
        .select()
        .single();

      if (purchaseErr) throw purchaseErr;

      const itemsPayload = purchaseItems.map(item => ({
        purchase_id: purchaseData.id,
        product_id: item.productId,
        quantity: item.quantity,
        unit_cost: item.unitCost
      }));

      const { error: itemsErr } = await supabase
        .from('supplier_purchase_items')
        .insert(itemsPayload);

      if (itemsErr) throw itemsErr;

      const stockPayload = purchaseItems.map(item => ({
        product_id: item.productId,
        quantity: item.quantity,
        type: 'Compra',
        reference_id: purchaseData.id,
        user_id: currentUserId
      }));

      const { error: stockErr } = await supabase
        .from('inventory_transactions')
        .insert(stockPayload);

      if (stockErr) throw stockErr;

      if (payImmediately && paidAmt > 0) {
        const pm = paymentMethods.find(p => p.id === immediatePaymentMethodId);
        const isCash = pm?.name.toLowerCase().includes("efectivo");

        if (isCash && openRegister) {
          const { data: txData, error: txError } = await supabase
            .from('cash_transactions')
            .insert({
              register_id: openRegister.id,
              type: 'egreso',
              category: 'pago_proveedor',
              amount: paidAmt,
              currency: purchaseCurrency,
              exchange_rate: 1.0,
              payment_method_id: immediatePaymentMethodId,
              reference_id: purchaseData.id,
              cost_center_id: purchaseCostCenterId || null,
              concept: `Pago inmediato de factura ${purchaseInvoiceNumber}`,
              notes: `Pago inmediato de factura ${purchaseInvoiceNumber}`,
              created_by: currentUserId
            })
            .select()
            .single();

          if (txError) throw txError;
          cashTxId = txData.id;

          const changeAmountArs = purchaseCurrency === 'ARS' ? paidAmt : 0;
          const changeAmountUsd = purchaseCurrency === 'USD' ? paidAmt : 0;
          const newExpectedArs = openRegister.expected_balance_ars - changeAmountArs;
          const newExpectedUsd = openRegister.expected_balance_usd - changeAmountUsd;

          await supabase
            .from('cash_registers')
            .update({
              expected_balance_ars: newExpectedArs,
              expected_balance_usd: newExpectedUsd
            })
            .eq('id', openRegister.id);
        }

        const { error: payErr } = await supabase
          .from('supplier_payments')
          .insert({
            supplier_id: purchaseSupplierId,
            purchase_id: purchaseData.id,
            amount: paidAmt,
            currency: purchaseCurrency,
            payment_method_id: immediatePaymentMethodId,
            cash_transaction_id: cashTxId || null,
            notes: `Pago inicial factura de compra ${purchaseInvoiceNumber}`,
            created_by: currentUserId
          });

        if (payErr) throw payErr;
      }

      alert("Compra registrada correctamente. El inventario ha sido incrementado.");
      
      setPurchaseSupplierId("");
      setPurchaseInvoiceNumber("");
      setPurchaseDate(new Date().toISOString().split('T')[0]);
      setPurchaseDueDate("");
      setPurchaseCurrency("ARS");
      setPurchaseNotes("");
      setPurchaseItems([]);
      setPayImmediately(false);
      setImmediatePaymentAmount("");

      await loadAllData();
      setActiveSubTab('purchases_history');
    } catch (err: any) {
      alert("Error al registrar la compra: " + err.message);
    } finally {
      setIsSubmittingPurchase(false);
    }
  };

  const handleViewPurchaseDetails = async (purchase: SupplierPurchase) => {
    setSelectedPurchase(purchase);
    setLoadingDetail(true);
    setDetailTab('items');
    try {
      const { data: items, error } = await supabase
        .from('supplier_purchase_items')
        .select(`
          *,
          product:products(name, sku)
        `)
        .eq('purchase_id', purchase.id);

      if (error) throw error;
      setPurchaseItemsDetail(items || []);
      
      await loadPaymentsAndEgresos(purchase.id, purchase.currency);
    } catch (err: any) {
      alert("Error al cargar detalles de la compra: " + err.message);
    } finally {
      setLoadingDetail(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 text-brand-600 animate-spin" />
        <p className="text-slate-500 font-medium">Cargando módulo de compras...</p>
      </div>
    );
  }

  // Filter products for relation management
  const filteredProducts = products.filter(p => {
    if (!searchRelationTerm) return true;
    return `${p.name} ${p.sku || ''}`.toLowerCase().includes(searchRelationTerm.toLowerCase());
  });

  const totalPurchaseFormAmount = purchaseItems.reduce((acc, item) => acc + (item.quantity * item.unitCost), 0);

  // Make vs Buy calculations for the currently selected product
  const getSimulatedBomCost = (productId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return 0;
    const comps = allBoms.filter(b => b.parent_product_id === productId);
    if (comps.length === 0) return 0;
    const compCostVal = comps.reduce((sum, item) => {
      const compProduct = products.find(p => p.id === item.component_product_id);
      const cost = compProduct?.cost_price || 0;
      const qty = Number(item.quantity) || 0;
      const waste = Number(item.waste_percentage) || 0;
      return sum + (cost * qty * (1 + waste / 100));
    }, 0);
    return compCostVal + (product.labor_cost || 0) + (product.overhead_cost || 0);
  };

  const currentBomProduct = products.find(p => p.id === selectedBomProductId);
  const isBomProductComprado = currentBomProduct?.production_type === 'comprado';
  const bomComponentsCost = bomComponents.reduce((sum, item) => 
    sum + ((item.component?.cost_price || 0) * item.quantity * (1 + (item.waste_percentage || 0) / 100))
  , 0);
  const bomLabor = parseFloat(bomLaborCost) || 0;
  const bomOverhead = parseFloat(bomOverheadCost) || 0;
  const bomSimulatedCost = bomComponentsCost + bomLabor + bomOverhead;

  return (
    <div className="space-y-4">
      {/* Cabecera */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
        <div>
          <h1 className="text-lg font-black text-slate-900 tracking-tight">Proveedores y Logística de Compras</h1>
          <p className="text-[11px] text-slate-400 font-semibold">Carga de mercadería, listas de costos base y alertas de discrepancia.</p>
        </div>

        <div className="flex bg-slate-200/50 p-0.5 rounded-xl flex-wrap gap-0.5">
          <button 
            onClick={() => setActiveSubTab('suppliers')}
            className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all ${activeSubTab === 'suppliers' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Proveedores
          </button>
          <button 
            onClick={() => setActiveSubTab('pricelists')}
            className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all ${activeSubTab === 'pricelists' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Listas de Fábrica
          </button>
          <button 
            onClick={() => setActiveSubTab('relations')}
            className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all ${activeSubTab === 'relations' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Precios y Fórmulas
          </button>
          <button 
            onClick={() => setActiveSubTab('new_purchase')}
            className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all ${activeSubTab === 'new_purchase' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Registrar Compra
          </button>
          <button 
            onClick={() => setActiveSubTab('purchases_history')}
            className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all ${activeSubTab === 'purchases_history' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Historial de Compras
          </button>
          <button 
            onClick={() => setActiveSubTab('alerts')}
            className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all flex items-center gap-1.5 ${
              activeSubTab === 'alerts' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Alertas de Costos
            {alerts.length > 0 && (
              <span className="bg-red-500 text-white text-[9px] px-1.5 py-0.5 rounded-full font-black animate-pulse">
                {alerts.length}
              </span>
            )}
          </button>
          <button 
            onClick={() => setActiveSubTab('hold_orders')}
            className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all flex items-center gap-1.5 ${
              activeSubTab === 'hold_orders' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Pedidos en Espera
            {holdOrders.length > 0 && (
              <span className="bg-amber-500 text-white text-[9px] px-1.5 py-0.5 rounded-full font-black animate-pulse">
                {holdOrders.length}
              </span>
            )}
          </button>
          <button 
            onClick={() => setActiveSubTab('claims_exchanges')}
            className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all flex items-center gap-1.5 ${
              activeSubTab === 'claims_exchanges' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Reclamos y Cambios
            {claims.filter(c => c.status === 'Abierto' || c.status === 'Pendiente').length > 0 && (
              <span className="bg-red-500 text-white text-[9px] px-1.5 py-0.5 rounded-full font-black animate-pulse">
                {claims.filter(c => c.status === 'Abierto' || c.status === 'Pendiente').length}
              </span>
            )}
          </button>
          <button 
            onClick={() => {
              setActiveSubTab('boms');
              if (products.length > 0 && !selectedBomProductId) {
                const firstMfg = products.find(p => p.production_type === 'fabricado' || p.production_type === 'ensamblado');
                if (firstMfg) {
                  setSelectedBomProductId(firstMfg.id);
                  fetchBom(firstMfg.id);
                }
              }
            }}
            className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all ${activeSubTab === 'boms' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Recetas (BOM)
          </button>
          <button 
            onClick={() => {
              setActiveSubTab('production');
              setProdProductId("");
              setProdComponents([]);
            }}
            className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all ${activeSubTab === 'production' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Ordenes de Producción
          </button>
          <button 
            onClick={() => setActiveSubTab('insumos')}
            className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all ${activeSubTab === 'insumos' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Insumos / Stock
          </button>
          <button 
            onClick={() => {
              setActiveSubTab('make_vs_buy');
              setMakeVsBuySubTab('make_vs_buy_kpis');
              setCompareProductId("");
              setSupplierComparisonItems([]);
            }}
            className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all ${activeSubTab === 'make_vs_buy' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Análisis Costos / Make vs Buy
          </button>
          <button 
            onClick={() => {
              setActiveSubTab('bom_explorer');
              setBomExplorerTab('tree');
              if (products.length > 0 && !explorerProductId) {
                const firstMfg = products.find(p => p.production_type === 'fabricado' || p.production_type === 'ensamblado');
                if (firstMfg) {
                  setExplorerProductId(firstMfg.id);
                }
              }
              if (products.length > 0 && !compareProductAId) {
                const mfgProds = products.filter(p => p.production_type === 'fabricado' || p.production_type === 'ensamblado');
                if (mfgProds.length > 0) {
                  setCompareProductAId(mfgProds[0].id);
                  if (mfgProds.length > 1) {
                    setCompareProductBId(mfgProds[1].id);
                  }
                }
              }
              if (products.length > 0 && !reverseInsumoId) {
                const firstUsedInsumo = products.find(p => allBoms.some(b => b.component_product_id === p.id));
                if (firstUsedInsumo) {
                  setReverseInsumoId(firstUsedInsumo.id);
                }
              }
            }}
            className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all ${activeSubTab === 'bom_explorer' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Explorador BOM
          </button>
        </div>
      </div>

      {/* SUBTAB 1: PROVEEDORES */}
      {activeSubTab === 'suppliers' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200/60 shadow-sm">
            <div>
              <h3 className="font-black text-slate-900 text-sm">Directorio de Proveedores</h3>
              <p className="text-xs text-slate-400">Registrá los proveedores con sus tasas de descuentos base.</p>
            </div>
            <Button onClick={() => setIsSupplierFormOpen(true)} className="rounded-xl gap-1.5 py-2 px-3 text-xs font-black">
              <Plus className="w-3.5 h-3.5" /> Nuevo Proveedor
            </Button>
          </div>


          {isSupplierFormOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150 overflow-y-auto">
              <form onSubmit={handleSaveSupplier} className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl p-6 my-8 space-y-6">
                <div className="flex justify-between items-center border-b pb-4">
                  <div>
                    <h3 className="text-xl font-black text-slate-900">
                      {editingSupplier ? `Editar Proveedor: ${editingSupplier.name}` : "Registrar Proveedor"}
                    </h3>
                    <p className="text-xs text-slate-400">Completá la información comercial, logística y financiera del proveedor.</p>
                  </div>
                  <button type="button" onClick={closeSupplierForm} className="p-1 hover:bg-slate-100 rounded-full">
                    <X className="w-5 h-5 text-slate-500" />
                  </button>
                </div>

                <div className="max-h-[70vh] overflow-y-auto pr-1 space-y-6 text-xs">
                  {/* SECCIÓN 1: GENERAL */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-black text-brand-600 uppercase tracking-wider border-b pb-1">1. Información General</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Nombre de Fantasía *</label>
                        <input type="text" required value={newSupplierName} onChange={e => setNewSupplierName(e.target.value)} placeholder="Ej. Fábrica Rotoplast" className="w-full px-3 py-2 rounded-xl border bg-slate-50 font-bold text-xs" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Unidad de Negocio *</label>
                        <select value={newSupplierBusinessUnit} onChange={e => setNewSupplierBusinessUnit(e.target.value)} className="w-full px-3 py-2 rounded-xl border bg-slate-50 font-bold text-xs">
                          <option value="Zono">Zono</option>
                          <option value="Aquafort">Aquafort</option>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Razón Social</label>
                        <input type="text" value={newSupplierLegal} onChange={e => setNewSupplierLegal(e.target.value)} placeholder="Ej. Rotoplast S.A." className="w-full px-3 py-2 rounded-xl border bg-slate-50 font-bold text-xs" />
                      </div>
                      <div className="space-y-1.5 md:col-span-2">
                        <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">CUIT (sin guiones)</label>
                        <input type="text" value={newSupplierCuit} onChange={e => setNewSupplierCuit(e.target.value)} placeholder="Ej. 30707880380" className="w-full px-3 py-2 rounded-xl border bg-slate-50 font-bold text-xs" />
                      </div>
                    </div>
                  </div>

                  {/* SECCIÓN 2: CONTACTO Y LOGÍSTICA */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-black text-brand-600 uppercase tracking-wider border-b pb-1">2. Contacto y Ubicación</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Contactos</label>
                        <input type="text" value={newSupplierContacts} onChange={e => setNewSupplierContacts(e.target.value)} placeholder="Ej. Carlos / Mariana" className="w-full px-3 py-2 rounded-xl border bg-slate-50 font-bold text-xs" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Teléfono</label>
                        <input type="text" value={newSupplierPhone} onChange={e => setNewSupplierPhone(e.target.value)} placeholder="Ej. 11-3442-1234" className="w-full px-3 py-2 rounded-xl border bg-slate-50 font-bold text-xs" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Dirección</label>
                        <input type="text" value={newSupplierAddress} onChange={e => setNewSupplierAddress(e.target.value)} placeholder="Ej. Av. Mitre 1234" className="w-full px-3 py-2 rounded-xl border bg-slate-50 font-bold text-xs" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Localidad</label>
                        <input type="text" value={newSupplierLocality} onChange={e => setNewSupplierLocality(e.target.value)} placeholder="Ej. San Martín" className="w-full px-3 py-2 rounded-xl border bg-slate-50 font-bold text-xs" />
                      </div>
                      <div className="space-y-1.5 md:col-span-2">
                        <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Enlace Google Maps (Ubicación GPS)</label>
                        <input type="text" value={newSupplierGpsLocation} onChange={e => setNewSupplierGpsLocation(e.target.value)} placeholder="Ej. https://maps.google.com/..." className="w-full px-3 py-2 rounded-xl border bg-slate-50 font-bold text-xs" />
                      </div>
                    </div>
                  </div>

                  {/* SECCIÓN 3: CONDICIONES COMERCIALES */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-black text-brand-600 uppercase tracking-wider border-b pb-1">3. Condiciones Comerciales y Coeficientes</h4>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Descuento 1 (%)</label>
                        <input type="number" step="any" value={newSupplierDiscount1} onChange={e => setNewSupplierDiscount1(e.target.value)} className="w-full px-3 py-2 rounded-xl border bg-slate-50 font-bold text-xs text-right" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Descuento 2 (%)</label>
                        <input type="number" step="any" value={newSupplierDiscount2} onChange={e => setNewSupplierDiscount2(e.target.value)} className="w-full px-3 py-2 rounded-xl border bg-slate-50 font-bold text-xs text-right" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Recargos (%)</label>
                        <input type="number" step="any" value={newSupplierSurcharges} onChange={e => setNewSupplierSurcharges(e.target.value)} className="w-full px-3 py-2 rounded-xl border bg-slate-50 font-bold text-xs text-right" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Dto Contado (%)</label>
                        <input type="number" step="any" value={newSupplierDiscountCash} onChange={e => setNewSupplierDiscountCash(e.target.value)} className="w-full px-3 py-2 rounded-xl border bg-slate-50 font-bold text-xs text-right" />
                      </div>
                      <div className="space-y-1.5 col-span-2 md:col-span-1">
                        <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Coef. Bonificación</label>
                        <input type="number" step="any" value={newSupplierBonusCoef} onChange={e => setNewSupplierBonusCoef(e.target.value)} className="w-full px-3 py-2 rounded-xl border bg-slate-50 font-bold text-xs text-right" />
                      </div>
                      <div className="space-y-1.5 col-span-2">
                        <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Plazo de entrega (Texto)</label>
                        <input type="text" value={newSupplierDeliveryText} onChange={e => setNewSupplierDeliveryText(e.target.value)} placeholder="Ej. De 5 a 10 días" className="w-full px-3 py-2 rounded-xl border bg-slate-50 font-bold text-xs" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Demora (días enteros)</label>
                        <input type="number" value={newSupplierDelivery} onChange={e => setNewSupplierDelivery(Number(e.target.value))} className="w-full px-3 py-2 rounded-xl border bg-slate-50 font-bold text-xs text-right" />
                      </div>
                      <div className="space-y-1.5 col-span-2">
                        <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Productos Principales</label>
                        <input type="text" value={newSupplierMainProducts} onChange={e => setNewSupplierMainProducts(e.target.value)} placeholder="Ej. Tanques de agua y filtros" className="w-full px-3 py-2 rounded-xl border bg-slate-50 font-bold text-xs" />
                      </div>
                    </div>
                  </div>

                  {/* SECCIÓN 4: DATOS BANCARIOS */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-black text-brand-600 uppercase tracking-wider border-b pb-1">4. Datos Bancarios</h4>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Banco</label>
                        <input type="text" placeholder="Ej. Galicia" value={newSupplierBankName} onChange={e => setNewSupplierBankName(e.target.value)} className="w-full px-3 py-2 rounded-xl border bg-slate-50 font-bold text-xs" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Nro de Cuenta</label>
                        <input type="text" placeholder="Nro de Cuenta" value={newSupplierAccount} onChange={e => setNewSupplierAccount(e.target.value)} className="w-full px-3 py-2 rounded-xl border bg-slate-50 font-bold text-xs" />
                      </div>
                      <div className="space-y-1.5 md:col-span-2">
                        <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">CBU / CVU</label>
                        <input type="text" placeholder="22 dígitos" value={newSupplierCbu} onChange={e => setNewSupplierCbu(e.target.value)} className="w-full px-3 py-2 rounded-xl border bg-slate-50 font-bold text-xs" />
                      </div>
                      <div className="space-y-1.5 md:col-span-4">
                        <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Alias CBU / CVU</label>
                        <input type="text" placeholder="Alias de la cuenta" value={newSupplierAlias} onChange={e => setNewSupplierAlias(e.target.value)} className="w-full px-3 py-2 rounded-xl border bg-slate-50 font-bold text-xs" />
                      </div>
                    </div>
                  </div>

                  {/* SECCIÓN 5: OBSERVACIONES */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-black text-brand-600 uppercase tracking-wider border-b pb-1">5. Notas y Observaciones</h4>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Notas Internas</label>
                      <textarea value={newSupplierNotes} onChange={e => setNewSupplierNotes(e.target.value)} rows={3} placeholder="Condiciones comerciales especiales, horarios de retiro, contactos secundarios..." className="w-full px-3 py-2 rounded-xl border bg-slate-50 font-bold text-xs" />
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4 flex justify-end gap-3">
                  <button type="button" onClick={closeSupplierForm} className="px-5 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl">Cancelar</button>
                  <Button type="submit" className="px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider">Guardar Proveedor</Button>
                </div>
              </form>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4">Unidad</th>
                  <th className="py-3 px-4">Proveedor / Razón Social</th>
                  <th className="py-3 px-4">Contacto</th>
                  <th className="py-3 px-4">Ubicación</th>
                  <th className="py-3 px-4">Descuentos y Coeficientes</th>
                  <th className="py-3 px-4">Tiempos y Productos</th>
                  <th className="py-3 px-4">Observaciones</th>
                  <th className="py-3 px-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
                {suppliers.map(sup => (
                  <tr key={sup.id} className="hover:bg-slate-50/50 transition-colors">
                    {/* Unidad */}
                    <td className="py-3 px-4">
                      <span className={`inline-block text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                        sup.business_unit === 'Aquafort' 
                          ? 'bg-blue-50 text-blue-600 border border-blue-100' 
                          : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                      }`}>
                        {sup.business_unit || 'Zono'}
                      </span>
                    </td>
                    {/* Proveedor / Razón Social */}
                    <td className="py-3 px-4 space-y-0.5">
                      <div className="font-black text-slate-900 text-sm">{sup.name}</div>
                      {sup.legal_name && <div className="text-slate-400 font-bold">{sup.legal_name}</div>}
                      {sup.cuit && <div className="text-[10px] text-slate-400">CUIT: {sup.cuit}</div>}
                    </td>
                    {/* Contacto */}
                    <td className="py-3 px-4 space-y-0.5">
                      {sup.contacts && <div className="text-slate-800">{sup.contacts}</div>}
                      {sup.phone && <div className="text-slate-400 font-medium text-[11px]">{sup.phone}</div>}
                    </td>
                    {/* Ubicación */}
                    <td className="py-3 px-4 space-y-0.5">
                      {sup.address && <div className="text-slate-800">{sup.address}</div>}
                      {sup.locality && <div className="text-slate-400 font-bold text-[10px]">{sup.locality}</div>}
                      {sup.gps_location && (
                        <a 
                          href={sup.gps_location} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="inline-flex items-center gap-0.5 text-[10px] text-brand-600 hover:underline"
                        >
                          📍 Ver GPS
                        </a>
                      )}
                    </td>
                    {/* Costos y Descuentos */}
                    <td className="py-3 px-4 space-y-1 text-[11px]">
                      {sup.bank_details?.bank_name && (
                        <div className="text-slate-600 mb-1 font-black">
                          🏦 {sup.bank_details.bank_name}
                          {sup.bank_details.cbu && <span className="block text-[9px] font-bold text-slate-400 font-mono">CBU: {sup.bank_details.cbu}</span>}
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 border-t pt-1 border-slate-100 text-[10px] text-slate-500 font-medium">
                        <div>Dto Lista: <span className="font-bold text-slate-700">{sup.discount_1 || 0}%</span></div>
                        {(sup.discount_2 || 0) > 0 && <div>Dto 2: <span className="font-bold text-slate-700">{sup.discount_2}%</span></div>}
                        {(sup.surcharges || 0) > 0 && <div>Recargos: <span className="font-bold text-red-600">{sup.surcharges}%</span></div>}
                        {(sup.discount_cash || 0) > 0 && <div>Contado: <span className="font-bold text-emerald-600">{sup.discount_cash}%</span></div>}
                        <div>Bonif Coef: <span className="font-bold text-slate-900">{sup.bonus_coef || 1.0}</span></div>
                      </div>
                    </td>
                    {/* Tiempos y Productos */}
                    <td className="py-3 px-4 space-y-0.5">
                      {sup.delivery_time_text ? (
                        <div className="text-slate-800 font-black">{sup.delivery_time_text}</div>
                      ) : (
                        sup.delivery_time_days > 0 && <div className="text-slate-800 font-black">{sup.delivery_time_days} días</div>
                      )}
                      {sup.main_products && (
                        <div className="text-[10px] text-slate-400 font-bold max-w-[150px] truncate" title={sup.main_products}>
                          📦 {sup.main_products}
                        </div>
                      )}
                    </td>
                    {/* Observaciones */}
                    <td className="py-3 px-4">
                      {sup.notes && (
                        <div className="text-[10px] text-slate-400 font-semibold max-w-[200px] line-clamp-3 leading-relaxed" title={sup.notes}>
                          {sup.notes}
                        </div>
                      )}
                    </td>
                    {/* Acciones */}
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-center gap-1.5">
                        <button 
                          onClick={() => startEditSupplier(sup)} 
                          className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors cursor-pointer"
                          title="Editar Proveedor"
                          type="button"
                        >
                          <Settings className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDeleteSupplier(sup.id)} 
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          title="Eliminar Proveedor"
                          type="button"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUBTAB 2: LISTAS DE PRECIOS */}
      {activeSubTab === 'pricelists' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200/60 shadow-sm">
              <div>
                <h3 className="font-black text-slate-900 text-sm">Carga de Listas de Costos</h3>
                <p className="text-xs text-slate-400">Cargá masivamente los costos base de fábrica pegando listados CSV/TSV.</p>
              </div>
              <Button onClick={() => setIsPricelistFormOpen(true)} className="rounded-xl gap-1.5 py-2 px-3 text-xs font-black">
                <FileText className="w-3.5 h-3.5" /> Importar Lista
              </Button>
            </div>
            
            {/* USD Exchange Rate Setting Card */}
            <div className="bg-white p-4 rounded-xl border border-slate-200/60 shadow-sm flex flex-col justify-between">
              <div className="flex justify-between items-center">
                <div>
                  <h4 className="font-black text-slate-800 text-[10px] uppercase tracking-wider">Cotización USD</h4>
                  <p className="text-[9px] text-slate-400">Utilizado para convertir listas de costos en USD a ARS.</p>
                </div>
                <span className="text-slate-800 font-mono font-black text-xs bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200/40">
                  $ {usdExchangeRate}
                </span>
              </div>
              
              <div className="mt-2.5 flex gap-2">
                <input 
                  type="number" 
                  value={tempUsdRate}
                  onChange={e => setTempUsdRate(e.target.value)}
                  placeholder="Cotización"
                  className="px-2.5 py-1.5 rounded-lg border text-xs font-bold w-full bg-slate-50 focus:bg-white outline-none text-slate-800"
                />
                <button
                  type="button"
                  disabled={isUpdatingUsdRate}
                  onClick={async () => {
                    const rate = Number(tempUsdRate);
                    if (isNaN(rate) || rate <= 0) {
                      alert("Ingresá un tipo de cambio válido.");
                      return;
                    }
                    setIsUpdatingUsdRate(true);
                    try {
                      const { error } = await supabase
                        .from('site_settings')
                        .upsert({ id: 'usd_exchange_rate', value: rate.toString(), updated_at: new Date().toISOString() });
                      if (error) throw error;
                      setUsdExchangeRate(rate);
                      alert("Cotización de dólar actualizada correctamente.");
                      loadAllData(true);
                    } catch (err) {
                      alert("Error al actualizar cotización: " + (err as any).message);
                    } finally {
                      setIsUpdatingUsdRate(false);
                    }
                  }}
                  className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg px-2.5 py-1.5 text-xs font-black transition-all flex items-center gap-1 shrink-0"
                >
                  {isUpdatingUsdRate ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Actualizar"}
                </button>
              </div>
            </div>
          </div>

          {isPricelistFormOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150 max-h-[95vh] overflow-y-auto">
              <form onSubmit={handleImportPriceList} className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl p-6 space-y-6">
                <div className="flex justify-between items-center border-b pb-4">
                  <div>
                    <h3 className="text-xl font-black text-slate-900">Importar Lista de Costos</h3>
                    <p className="text-xs text-slate-500 font-medium">Asociá un Excel pegando los datos ordenados en columnas.</p>
                  </div>
                  <button type="button" onClick={() => setIsPricelistFormOpen(false)} className="p-1 hover:bg-slate-100 rounded-full">
                    <X className="w-5 h-5 text-slate-500" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Proveedor *</label>
                    <select
                      required
                      value={selectedSupplierId}
                      onChange={e => setSelectedSupplierId(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border bg-slate-50 font-bold text-sm text-slate-800"
                    >
                      <option value="">-- Seleccionar --</option>
                      {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Identificador/Nro de Lista *</label>
                    <input type="text" required placeholder="Ej. L-ROTO-0526" value={newPlNumber} onChange={e => setNewPlNumber(e.target.value)} className="w-full px-4 py-3 rounded-xl border bg-slate-50 font-bold text-sm text-slate-800" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Moneda *</label>
                    <select
                      required
                      value={newPlCurrency}
                      onChange={e => setNewPlCurrency(e.target.value as any)}
                      className="w-full px-4 py-3 rounded-xl border bg-slate-50 font-bold text-sm text-slate-800"
                    >
                      <option value="ARS">Pesos (ARS)</option>
                      <option value="USD">Dólares (USD)</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Fecha de Vigencia</label>
                    <DatePickerDDMMYYYY
                      value={newPlDate}
                      onChange={setNewPlDate}
                      required
                      className="text-sm"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 p-3 bg-blue-50 text-blue-800 text-xs rounded-xl font-medium border border-blue-100">
                  <HelpCircle className="w-4 h-4 text-blue-600 shrink-0" />
                  <p>
                    Copiá columnas de tu Excel y pegalas abajo. El formato esperado es: 
                    <span className="font-bold font-mono bg-blue-100 px-1 py-0.5 rounded mx-1">SKU , COSTO_LISTA , DTO(opcional) , TIPO_DTO(percentage/fixed) , IVA_PCT(opcional)</span>. 
                    El primer renglón se ignora si contiene títulos de columna.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Datos del Listado (Pegar aquí)</label>
                  <textarea
                    rows={8}
                    required
                    value={plRawText}
                    onChange={e => setPlRawText(e.target.value)}
                    placeholder="TANQ-500,12000,5,percentage,21&#10;TANQ-1000,24000,10,percentage,21"
                    className="w-full px-4 py-3 rounded-xl border bg-slate-50 font-mono text-xs focus:ring-2 focus:ring-brand-500/20 outline-none"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="makeActive"
                    checked={newPlActive}
                    onChange={e => setNewPlActive(e.target.checked)}
                    className="rounded text-brand-600 focus:ring-brand-500 cursor-pointer w-4 h-4"
                  />
                  <label htmlFor="makeActive" className="text-xs font-bold text-slate-700 cursor-pointer">Fijar inmediatamente como lista de costos activa para el cálculo de precios.</label>
                </div>

                <div className="border-t pt-4 flex justify-end gap-3">
                  <button type="button" onClick={() => setIsPricelistFormOpen(false)} className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-xl">Cancelar</button>
                  <Button type="submit" disabled={submittingPl} className="px-6 py-2.5 rounded-xl font-bold flex items-center gap-2">
                    {submittingPl ? <Loader2 className="w-4 h-4 animate-spin" /> : <ListPlus className="w-4 h-4" />}
                    {submittingPl ? "Cargando..." : "Importar Artículos"}
                  </Button>
                </div>
              </form>
            </div>
          )}

          <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-wider text-slate-400">Proveedor</th>
                  <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-wider text-slate-400">Identificador</th>
                  <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-wider text-slate-400">Moneda</th>
                  <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-wider text-slate-400">Fecha Carga</th>
                  <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-wider text-slate-400">Estado</th>
                  <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-wider text-slate-400 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pricelists.map(pl => {
                  const supplier = suppliers.find(s => s.id === pl.supplier_id);
                  const plCurrency = (pl as any).currency || 'ARS';
                  return (
                    <tr key={pl.id} className="hover:bg-slate-50/40 transition-colors">
                      <td className="px-4 py-2 font-bold text-slate-800 text-xs">{supplier?.name || "Desconocido"}</td>
                      <td className="px-4 py-2 font-bold text-xs text-slate-600">{pl.list_number}</td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black ${
                          plCurrency === 'USD' ? 'text-amber-700 bg-amber-50 border border-amber-100' : 'text-blue-700 bg-blue-50 border border-blue-100'
                        }`}>
                          {plCurrency}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-[11px] font-bold text-slate-400">{formatDateDDMMYYYY(pl.created_at)}</td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                          pl.is_active ? 'text-emerald-700 bg-emerald-50 border border-emerald-100' : 'text-slate-400 bg-slate-50'
                        }`}>
                          {pl.is_active ? 'ACTIVA (Uso Costos)' : 'Histórica'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleViewPriceListItems(pl)}
                            className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-brand-600 rounded-lg transition-colors cursor-pointer"
                            title="Ver Contenido"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {!pl.is_active && (
                            <button
                              type="button"
                              onClick={() => handleTogglePriceList(pl.id, pl.supplier_id)}
                              className="px-2.5 py-1 bg-brand-50 text-brand-700 border border-brand-100 rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-brand-600 hover:text-white transition-all cursor-pointer"
                            >
                              Activar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {pricelists.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-slate-500 font-medium">No se importaron listas de precios aún.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUBTAB 3: PRECIOS Y FÓRMULAS */}
      {activeSubTab === 'relations' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200/60 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-black text-slate-900 text-sm">Márgenes y Fórmulas</h3>
              <p className="text-xs text-slate-400">Configurá si un producto tiene precio manual o dinámico (Costo + Margen).</p>
            </div>
            
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
              <input
                type="text"
                placeholder="Buscar por artículo o SKU..."
                value={searchRelationTerm}
                onChange={e => setSearchRelationTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border outline-none bg-slate-50 focus:ring-2 focus:ring-brand-500/10 font-bold"
              />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-wider text-slate-400">Producto</th>
                  <th className="px-3 py-2.5 text-[9px] font-black uppercase tracking-wider text-slate-400">Fórmula</th>
                  <th className="px-3 py-2.5 text-[9px] font-black uppercase tracking-wider text-slate-400">Proveedor Principal</th>
                  <th className="px-3 py-2.5 text-[9px] font-black uppercase tracking-wider text-slate-400">Margen Min. (%)</th>
                  <th className="px-3 py-2.5 text-[9px] font-black uppercase tracking-wider text-slate-400">Margen May. (%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProducts.map(p => {
                  const rel = relations.find(r => r.product_id === p.id && r.is_primary) || relations.find(r => r.product_id === p.id);
                  const hasAlert = alerts.some(a => a.product_id === p.id);
                  
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/40 transition-colors">
                      <td className="px-4 py-1.5">
                        <div className="font-bold text-slate-800 text-xs leading-snug flex items-center">
                          {p.name}
                          {hasAlert && (
                            <span 
                              onClick={() => setActiveSubTab('alerts')}
                              className="inline-flex items-center text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider gap-0.5 border border-amber-200 animate-pulse ml-2 cursor-pointer hover:bg-amber-100" 
                              title="Discrepancia de costo pendiente de resolución en Compras"
                            >
                              ⚠️ Alerta Costo
                            </span>
                          )}
                        </div>
                        <div className="text-[9px] font-black text-slate-400 uppercase tracking-wider">{p.sku || "SIN SKU"}</div>
                      </td>
                      <td className="px-3 py-1.5">
                        <select
                          value={p.fixed_price ? "fixed" : "dynamic"}
                          onChange={e => handleTogglePriceFormula(p.id, e.target.value === "fixed")}
                          className={`px-2 py-1 rounded-lg text-[10px] font-black border outline-none ${
                            p.fixed_price ? 'bg-slate-50 text-slate-500 border-slate-200' : 'bg-brand-50 text-brand-700 border-brand-100'
                          }`}
                        >
                          <option value="fixed">Fijo (Manual)</option>
                          <option value="dynamic">Dinámico (Costo+%)</option>
                        </select>
                      </td>
                      <td className="px-3 py-1.5">
                        <select
                          value={rel?.supplier_id || ""}
                          onChange={e => handleRelationChange(p.id, e.target.value, true)}
                          className="px-2 py-1 rounded-lg text-[10px] font-bold border border-slate-200 bg-white outline-none"
                        >
                          <option value="">-- Sin Vincular --</option>
                          {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={p.markup_percentage || 0}
                            onChange={e => handleUpdateMarkup(p.id, 'retail', Number(e.target.value))}
                            disabled={p.fixed_price}
                            className="w-12 px-1.5 py-0.5 text-xs font-bold border border-slate-200 rounded text-right focus:ring-1 focus:ring-brand-500/10 disabled:bg-slate-50"
                          />
                          <span className="text-[10px] font-bold text-slate-400">%</span>
                        </div>
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={p.markup_wholesale_percentage || 0}
                            onChange={e => handleUpdateMarkup(p.id, 'wholesale', Number(e.target.value))}
                            disabled={p.fixed_price}
                            className="w-12 px-1.5 py-0.5 text-xs font-bold border border-slate-200 rounded text-right focus:ring-1 focus:ring-brand-500/10 disabled:bg-slate-50"
                          />
                          <span className="text-[10px] font-bold text-slate-400">%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUBTAB 4: REGISTRAR COMPRA (NUEVA FACTURA) */}
      {activeSubTab === 'new_purchase' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Formulario Principal de la Factura */}
          <div className="lg:col-span-2 space-y-6">
            <form onSubmit={handleSavePurchase} className="bg-white rounded-3xl p-6 border border-slate-200/60 shadow-sm space-y-6">
              <div className="flex items-center gap-2 border-b pb-4 text-slate-800">
                <ShoppingBag className="w-5 h-5 text-brand-600" />
                <h3 className="text-base font-black">Cargar Factura / Remito de Compra</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Proveedor *</label>
                  <select
                    required
                    value={purchaseSupplierId}
                    onChange={e => setPurchaseSupplierId(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border bg-slate-50 font-bold text-xs"
                  >
                    <option value="">-- Seleccionar Proveedor --</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Número de Comprobante *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. FC-A-0001-00001234"
                    value={purchaseInvoiceNumber}
                    onChange={e => setPurchaseInvoiceNumber(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border bg-slate-50 font-bold text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Fecha de Compra *</label>
                  <DatePickerDDMMYYYY
                    value={purchaseDate}
                    onChange={setPurchaseDate}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Fecha de Vencimiento</label>
                  <DatePickerDDMMYYYY
                    value={purchaseDueDate}
                    onChange={setPurchaseDueDate}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Moneda *</label>
                  <select
                    value={purchaseCurrency}
                    onChange={e => setPurchaseCurrency(e.target.value as any)}
                    className="w-full px-4 py-3 rounded-xl border bg-slate-50 font-bold text-xs"
                  >
                    <option value="ARS">Pesos Argentinos (ARS)</option>
                    <option value="USD">Dólares Estadounidenses (USD)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Centro de Costo *</label>
                  <select
                    required
                    value={purchaseCostCenterId}
                    onChange={e => setPurchaseCostCenterId(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border bg-slate-50 font-bold text-xs"
                  >
                    <option value="">-- Seleccionar Centro de Costo --</option>
                    {costCenters.map(cc => (
                      <option key={cc.id} value={cc.id}>
                        [{cc.code}] {cc.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Notas Internas</label>
                  <input
                    type="text"
                    placeholder="Detalles sobre entrega o flete..."
                    value={purchaseNotes}
                    onChange={e => setPurchaseNotes(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border bg-slate-50 font-bold text-xs"
                  />
                </div>
              </div>

              {/* Sección de pago inmediato */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/50 space-y-4">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="payImmediately"
                    checked={payImmediately}
                    onChange={e => {
                      setPayImmediately(e.target.checked);
                      if (e.target.checked) setImmediatePaymentAmount(totalPurchaseFormAmount.toString());
                    }}
                    className="rounded text-brand-600 focus:ring-brand-500 cursor-pointer w-4 h-4"
                  />
                  <label htmlFor="payImmediately" className="text-xs font-bold text-slate-700 cursor-pointer select-none">
                    Registrar pago inmediato hacia esta compra (Amortizar)
                  </label>
                </div>

                {payImmediately && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 animate-in fade-in duration-100">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Monto a Pagar ({purchaseCurrency})</label>
                      <input
                        type="number"
                        placeholder="0.00"
                        value={immediatePaymentAmount}
                        onChange={e => setImmediatePaymentAmount(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border bg-white font-bold text-xs text-right"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Medio de Pago</label>
                      <select
                        value={immediatePaymentMethodId}
                        onChange={e => setImmediatePaymentMethodId(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border bg-white font-bold text-xs"
                      >
                        {paymentMethods.map(pm => (
                          <option key={pm.id} value={pm.id}>
                            {pm.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between border-t pt-4">
                <div>
                  <span className="text-[10px] font-black uppercase text-slate-400">Total Compra</span>
                  <div className="text-2xl font-black text-slate-900">
                    {formatPrice(totalPurchaseFormAmount)}
                  </div>
                </div>

                <Button 
                  type="submit" 
                  disabled={isSubmittingPurchase || purchaseItems.length === 0} 
                  className="rounded-xl px-6 py-3 font-bold gap-2 text-xs"
                >
                  {isSubmittingPurchase ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Registrando...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" /> Registrar Compra
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>

          {/* Selector y Carga de Artículos (Detalle) */}
          <div className="space-y-6">
            <div className="bg-white rounded-3xl p-6 border border-slate-200/60 shadow-sm space-y-6">
              <div className="flex items-center gap-2 border-b pb-4 text-slate-800">
                <Plus className="w-5 h-5 text-brand-600" />
                <h3 className="text-base font-black">Agregar Artículos</h3>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Producto *</label>
                  <div className="relative" onClick={e => e.stopPropagation()}>
                    <input
                      type="text"
                      placeholder="-- Buscar Producto --"
                      value={productSearchQuery}
                      onChange={e => {
                        setProductSearchQuery(e.target.value);
                        setShowProductSearchDropdown(true);
                      }}
                      onFocus={() => {
                        setShowProductSearchDropdown(true);
                        setProductSearchQuery("");
                      }}
                      onBlur={() => {
                        setTimeout(() => {
                          setShowProductSearchDropdown(false);
                          const matched = products.find(p => p.id === currentItemProductId);
                          if (matched) {
                            setProductSearchQuery(matched.name + (matched.sku ? ` (${matched.sku})` : ''));
                          } else {
                            setProductSearchQuery("");
                          }
                        }, 200);
                      }}
                      className="w-full pl-4 pr-10 py-3 rounded-xl border border-slate-200 bg-slate-50 font-bold text-xs outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 transition-all cursor-pointer text-slate-800"
                    />
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />

                    {showProductSearchDropdown && (
                      <div className="absolute left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg z-50 py-1">
                        {(() => {
                          const query = productSearchQuery.toLowerCase().trim();
                          const filtered = products.filter(p => {
                            const nameMatch = p.name.toLowerCase().includes(query);
                            const skuMatch = p.sku ? p.sku.toLowerCase().includes(query) : false;
                            return nameMatch || skuMatch;
                          });

                          if (filtered.length === 0) {
                            return (
                              <div className="px-4 py-2 text-xs text-slate-500 italic">
                                No se encontraron productos
                              </div>
                            );
                          }

                          return filtered.map(p => (
                            <button
                              key={p.id}
                              type="button"
                              onMouseDown={() => {
                                setCurrentItemProductId(p.id);
                                setProductSearchQuery(p.name + (p.sku ? ` (${p.sku})` : ''));
                                setShowProductSearchDropdown(false);

                                // Trigger the auto-fill cost logic that was in the original select's onChange
                                const rel = relations.find(r => r.product_id === p.id && r.is_primary) || relations.find(r => r.product_id === p.id);
                                const supplierId = rel?.supplier_id;
                                if (supplierId) {
                                  setCurrentItemUnitCost("");
                                }
                              }}
                              className={`w-full px-4 py-2.5 text-left text-xs font-bold transition-all block border-b border-slate-50 last:border-0 ${
                                currentItemProductId === p.id
                                  ? 'bg-brand-50 text-brand-700 font-black'
                                  : 'text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <div className="flex flex-col">
                                <span className="text-[11px] leading-tight">{p.name}</span>
                                {p.sku && (
                                  <span className="text-[9px] text-slate-400 font-mono mt-0.5">SKU: {p.sku}</span>
                                )}
                              </div>
                            </button>
                          ));
                        })()}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Cantidad *</label>
                    <input
                      type="number"
                      min="1"
                      value={currentItemQuantity}
                      onChange={e => setCurrentItemQuantity(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border bg-slate-50 font-bold text-xs text-right"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Costo Unit. *</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="0.00"
                      value={currentItemUnitCost}
                      onChange={e => setCurrentItemUnitCost(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border bg-slate-50 font-bold text-xs text-right"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAddPurchaseItem}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-sm shadow-slate-900/10 flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" /> Cargar al Detalle
                </button>
              </div>
            </div>

            {/* Listado temporal de artículos agregados */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200/60 shadow-sm space-y-4">
              <div className="flex justify-between items-center border-b pb-3">
                <span className="text-xs font-black text-slate-700 uppercase">Detalle de Comprobante</span>
                <span className="bg-brand-50 text-brand-700 text-[10px] px-2 py-0.5 rounded font-black">
                  {purchaseItems.length} Ítem(s)
                </span>
              </div>

              <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto pr-1">
                {purchaseItems.map((item, idx) => (
                  <div key={idx} className="py-2.5 flex justify-between items-start gap-2 text-xs">
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-slate-800 truncate">{item.name}</div>
                      <div className="text-[10px] text-slate-400 font-bold font-mono uppercase tracking-wider">{item.sku}</div>
                      <div className="text-[10px] text-slate-500 font-semibold mt-0.5">
                        {item.quantity} u. x {formatPrice(item.unitCost)}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="font-black text-slate-900 text-right">
                        {formatPrice(item.quantity * item.unitCost)}
                      </div>
                      <button 
                        onClick={() => handleRemovePurchaseItem(idx)}
                        className="text-slate-300 hover:text-red-500 transition-colors p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}

                {purchaseItems.length === 0 && (
                  <div className="py-6 text-center text-slate-400 font-medium text-xs">
                    No cargaste ítems a la factura todavía.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 5: HISTORIAL DE COMPRAS */}
      {activeSubTab === 'purchases_history' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-wider text-slate-400">Proveedor</th>
                  <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-wider text-slate-400">Nro Factura</th>
                  <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-wider text-slate-400">Fecha</th>
                  <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-wider text-slate-400">Monto Total</th>
                  <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-wider text-slate-400">Monto Pagado</th>
                  <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-wider text-slate-400">Estado</th>
                  <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-wider text-slate-400 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {purchases.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50/40 transition-colors">
                    <td className="px-4 py-3 font-bold text-slate-800 text-xs">{p.supplier?.name || "Desconocido"}</td>
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs text-slate-600 font-bold">{p.invoice_number}</div>
                      {p.cost_centers && (
                        <div className="text-[10px] text-brand-600 font-extrabold mt-0.5">
                          [{p.cost_centers.code}]
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 font-semibold">
                      {formatDateDDMMYYYY(p.purchase_date)}
                    </td>
                    <td className="px-4 py-3 font-black text-xs text-slate-900">
                      {formatPrice(p.total_amount)} <span className="text-[10px] text-slate-400">{p.currency}</span>
                    </td>
                    <td className="px-4 py-3 font-bold text-xs text-emerald-600">
                      {formatPrice(p.paid_amount)} <span className="text-[10px] text-slate-400">{p.currency}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                        p.status === 'Pagado' ? 'text-emerald-700 bg-emerald-50 border border-emerald-100' :
                        p.status === 'Parcial' ? 'text-amber-700 bg-amber-50 border border-amber-100' :
                        p.status === 'Anulado' ? 'text-red-700 bg-red-50 border border-red-100' :
                        'text-slate-500 bg-slate-50 border border-slate-100'
                      }`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleViewPurchaseDetails(p)}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all inline-flex items-center gap-1"
                      >
                        <Eye className="w-3 h-3" /> Ver Detalle
                      </button>
                    </td>
                  </tr>
                ))}
                {purchases.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-slate-500 font-medium">
                      No se registraron facturas de compras todavía.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUBTAB 6: ALERTAS DE COSTOS */}
      {activeSubTab === 'alerts' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3 text-amber-900">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-black text-sm">Discrepancias de Costos Detectadas</h4>
              <p className="text-xs text-amber-800/90 font-semibold mt-1">
                El sistema detectó compras con costos unitarios diferentes a los registrados en las listas de catálogo activas. 
                Podés actualizar el precio de costo del catálogo en un clic o ignorar la alerta si es un cambio temporal.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-wider text-slate-400">Producto</th>
                  <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-wider text-slate-400">Origen Alerta</th>
                  <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-wider text-slate-400 text-right">Costo Catálogo</th>
                  <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-wider text-slate-400 text-right">Costo Factura</th>
                  <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-wider text-slate-400 text-center">Variación</th>
                  <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-wider text-slate-400 text-right">Resolución Rápida</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {alerts.map(alt => {
                  const diffPct = alt.catalog_cost > 0 
                    ? ((alt.purchase_cost - alt.catalog_cost) / alt.catalog_cost) * 100 
                    : 100;
                  
                  return (
                    <tr key={alt.id} className="hover:bg-slate-50/40 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-800 text-xs leading-snug">{alt.product?.name || "Producto sin nombre"}</div>
                        <div className="text-[10px] font-mono text-slate-400 font-bold uppercase tracking-wider mt-0.5">{alt.product?.sku || "SIN SKU"}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 font-medium">
                        <div className="font-bold text-slate-700">Factura {alt.purchase?.invoice_number}</div>
                        <div className="text-[10px] text-slate-400 font-semibold">{alt.purchase?.supplier?.name}</div>
                      </td>
                      <td className="px-4 py-3 font-bold text-xs text-slate-500 text-right">
                        {formatPrice(alt.catalog_cost)}
                      </td>
                      <td className="px-4 py-3 font-black text-xs text-slate-900 text-right">
                        {formatPrice(alt.purchase_cost)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black ${
                          diffPct > 0 ? 'text-rose-700 bg-rose-50' : 'text-emerald-700 bg-emerald-50'
                        }`}>
                          {diffPct > 0 ? '+' : ''}{diffPct.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleResolveAlert(alt, 'Actualizada')}
                            className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition-all inline-flex items-center gap-1 shadow-sm"
                          >
                            <Check className="w-3 h-3" /> Actualizar Catálogo
                          </button>
                          <button
                            onClick={() => handleResolveAlert(alt, 'Ignorada')}
                            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all inline-flex items-center gap-1"
                          >
                            <X className="w-3 h-3" /> Ignorar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {alerts.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-slate-500 font-medium">
                      No hay discrepancias de costos pendientes. ¡Catálogo al día!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUBTAB 7: PEDIDOS EN ESPERA */}
      {activeSubTab === 'hold_orders' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3 text-amber-900">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-black text-sm">Pedidos en Espera de Stock</h4>
              <p className="text-xs text-amber-800/90 font-semibold mt-1">
                A continuación se listan los pedidos que fueron cargados con estado "En Espera" debido a falta de stock de algún producto. 
                Utilizá este reporte para priorizar las compras de los productos que están bloqueando entregas a clientes.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-wider text-slate-400">Pedido / Cliente</th>
                  <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-wider text-slate-400">Fecha Pedido</th>
                  <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-wider text-slate-400">Producto Faltante</th>
                  <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-wider text-slate-400">Motivo / Notas</th>
                  <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-wider text-slate-400 text-right">Monto Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
                {holdOrders.map(order => (
                  <tr key={order.id} className="hover:bg-slate-50/40 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-black text-slate-900 text-xs">{order.customer_name}</div>
                      <div className="text-[10px] text-slate-400 font-bold tracking-wider mt-0.5">
                        CÓDIGO: {order.legacy_code || order.id.substring(0, 8)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 font-semibold">
                      {order.order_date ? formatDateDDMMYYYY(order.order_date) : 'S/D'}
                    </td>
                    <td className="px-4 py-3">
                      {order.hold_product ? (
                        <div>
                          <span className="inline-flex items-center px-2 py-0.5 bg-rose-50 border border-rose-200 text-rose-700 rounded text-[9.5px] font-black uppercase">
                            {order.hold_product.name}
                          </span>
                          {order.hold_product.sku && (
                            <div className="text-[8.5px] font-mono text-slate-400 font-bold uppercase mt-0.5">
                              SKU: {order.hold_product.sku}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400 italic text-[11px] font-semibold">Sin producto específico</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-650 font-medium">
                      {order.hold_reason || "-"}
                    </td>
                    <td className="px-4 py-3 text-right font-black text-xs text-slate-900">
                      {formatPrice(order.total_amount)}
                    </td>
                  </tr>
                ))}
                {holdOrders.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-500 font-medium">
                      No hay pedidos en espera de stock en este momento.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {/* SUBTAB 8: RECLAMOS Y CAMBIOS (EVALUACIÓN DE COMPRAS) */}
      {activeSubTab === 'claims_exchanges' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200/60 shadow-sm">
            <div>
              <h3 className="font-black text-slate-900 text-sm">Evaluación de Reclamos y Cambios</h3>
              <p className="text-xs text-slate-400">Bandeja de reclamos y cambios de producto reportados por los vendedores.</p>
            </div>
            {/* Search filter */}
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por cliente..."
                value={searchClaimTerm}
                onChange={e => setSearchClaimTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-500/10 bg-slate-50 font-bold text-xs"
              />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-wider text-slate-400">Fecha</th>
                  <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-wider text-slate-400">Cliente / Pedido</th>
                  <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-wider text-slate-400">Operación</th>
                  <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-wider text-slate-400">Estado</th>
                  <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-wider text-slate-400 text-right">Diferencia</th>
                  <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-wider text-slate-400 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-bold text-slate-700 text-xs">
                {claims
                  .filter(c => !searchClaimTerm || c.orders?.customer_name?.toLowerCase().includes(searchClaimTerm.toLowerCase()))
                  .map(claim => (
                    <tr key={claim.id} className="hover:bg-slate-50/40 transition-colors">
                      <td className="px-4 py-3 text-slate-500 font-semibold whitespace-nowrap">
                        {formatDateDDMMYYYY(claim.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-black text-slate-900">{claim.orders?.customer_name || 'Cliente Desconocido'}</div>
                        <div className="text-[9.5px] text-slate-400 font-bold tracking-wider mt-0.5">
                          PEDIDO ORIGINAL: {claim.orders?.legacy_code || claim.order_id?.substring(0,8)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase ${
                          claim.type === 'devolucion' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 
                          claim.type === 'cambio' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 
                          claim.type === 'despacho' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                          'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}>
                          {claim.type === 'devolucion' ? 'Devolución' : 
                           claim.type === 'cambio' ? 'Cambio' : 
                           claim.type === 'despacho' ? 'Error Despacho' : 'Garantía'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                          claim.status === 'Abierto' || claim.status === 'Pendiente' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                          claim.status === 'Resuelto' || claim.status === 'Completado' || claim.status === 'Aprobado' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                          'bg-red-50 text-red-700 border border-red-200'
                        }`}>
                          {claim.status === 'Pendiente' ? 'Abierto' : 
                           claim.status === 'Completado' || claim.status === 'Aprobado' ? 'Resuelto' : 
                           claim.status || 'Abierto'}
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-right font-black ${
                        claim.difference_amount === 0 ? 'text-slate-800' : 
                        claim.difference_amount > 0 ? 'text-amber-600' : 'text-emerald-600'
                      }`}>
                        {formatPrice(claim.difference_amount)}
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <Button 
                          onClick={() => handleViewClaimDetail(claim)} 
                          variant="secondary"
                          size="sm"
                          className="rounded-lg font-black uppercase tracking-wider text-[10px]"
                        >
                          {claim.status === 'Abierto' || claim.status === 'Pendiente' ? 'Evaluar' : 'Ver Detalle'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                {claims.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-slate-500 font-medium">
                      No se encontraron reclamos registrados en el sistema.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}


      {/* MODAL DETALLES DE COMPRA */}
      {selectedPurchase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl p-6 space-y-6">
            <div className="flex justify-between items-center border-b pb-4">
              <div>
                <h3 className="text-lg font-black text-slate-900">
                  Comprobante: {selectedPurchase.invoice_number}
                </h3>
                <p className="text-xs text-slate-400 font-semibold mt-0.5">
                  Proveedor: {selectedPurchase.supplier?.name} | Fecha: {formatDateDDMMYYYY(selectedPurchase.purchase_date)}
                </p>
              </div>
              <button 
                type="button" 
                onClick={() => setSelectedPurchase(null)} 
                className="p-1 hover:bg-slate-100 rounded-full"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            {/* Pestañas dentro del detalle */}
            <div className="flex gap-2 border-b pb-1 border-slate-100">
              <button 
                onClick={() => setDetailTab('items')}
                className={`px-4 py-2 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${
                  detailTab === 'items' 
                    ? 'border-brand-600 text-brand-600' 
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                Artículos Recibidos
              </button>
              <button 
                onClick={() => setDetailTab('payments')}
                className={`px-4 py-2 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${
                  detailTab === 'payments' 
                    ? 'border-brand-600 text-brand-600' 
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                Pagos y Conciliación
              </button>
            </div>

            {detailTab === 'items' && (
              <div className="space-y-4">
                <h4 className="text-xs font-black text-slate-600 uppercase tracking-widest">
                  Artículos Recibidos (Ingreso a Stock)
                </h4>

                <div className="border border-slate-100 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100 font-bold text-slate-400">
                        <th className="px-4 py-2">Producto</th>
                        <th className="px-4 py-2 text-right">Cantidad</th>
                        <th className="px-4 py-2 text-right">Costo Unitario</th>
                        <th className="px-4 py-2 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {loadingDetail ? (
                        <tr>
                          <td colSpan={4} className="py-8 text-center">
                            <Loader2 className="w-6 h-6 animate-spin mx-auto text-brand-300" />
                          </td>
                        </tr>
                      ) : purchaseItemsDetail.map(item => (
                        <tr key={item.id} className="hover:bg-slate-50/50">
                          <td className="px-4 py-2.5">
                            <div className="font-bold text-slate-800">{item.product?.name}</div>
                            <div className="text-[10px] font-mono text-slate-400 font-semibold uppercase">{item.product?.sku}</div>
                          </td>
                          <td className="px-4 py-2.5 text-right font-bold text-slate-700">{item.quantity}</td>
                          <td className="px-4 py-2.5 text-right font-bold text-slate-600">{formatPrice(item.unit_cost)}</td>
                          <td className="px-4 py-2.5 text-right font-black text-slate-900">
                            {formatPrice(item.quantity * item.unit_cost)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <div className="text-xs font-bold text-slate-500">
                    Estado de pago: <span className="font-black text-slate-800 uppercase text-[10px]">{selectedPurchase.status}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-black text-slate-400 uppercase block">Total Comprobante</span>
                    <span className="text-xl font-black text-slate-900">
                      {formatPrice(selectedPurchase.total_amount)} {selectedPurchase.currency}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {detailTab === 'payments' && (
              <div className="space-y-6">
                {/* Balance summary cards */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-slate-50 border border-slate-200/60 p-3 rounded-xl">
                    <span className="text-[9px] font-black text-slate-400 uppercase">Total Factura</span>
                    <div className="text-xs font-black text-slate-850 mt-0.5">{formatPrice(selectedPurchase.total_amount)} {selectedPurchase.currency}</div>
                  </div>
                  <div className="bg-emerald-50/50 border border-emerald-105 p-3 rounded-xl">
                    <span className="text-[9px] font-black text-emerald-600 uppercase">Monto Pagado</span>
                    <div className="text-xs font-black text-emerald-700 mt-0.5">{formatPrice(selectedPurchase.paid_amount)} {selectedPurchase.currency}</div>
                  </div>
                  <div className="bg-amber-50/50 border border-amber-105 p-3 rounded-xl">
                    <span className="text-[9px] font-black text-amber-600 uppercase">Saldo Restante</span>
                    <div className="text-xs font-black text-amber-700 mt-0.5">
                      {formatPrice(Math.max(0, selectedPurchase.total_amount - selectedPurchase.paid_amount))} {selectedPurchase.currency}
                    </div>
                  </div>
                </div>

                {/* Associated payments table */}
                <div className="space-y-2">
                  <h4 className="text-xs font-black text-slate-600 uppercase tracking-widest">Pagos Realizados</h4>
                  {loadingPayments ? (
                    <div className="py-6 text-center">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto text-brand-500" />
                    </div>
                  ) : associatedPayments.length === 0 ? (
                    <p className="text-xs text-slate-400 italic py-2">No hay pagos registrados para esta compra.</p>
                  ) : (
                    <div className="border border-slate-100 rounded-xl overflow-hidden max-h-36 overflow-y-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-100 font-bold text-slate-400">
                            <th className="px-3 py-1.5">Fecha</th>
                            <th className="px-3 py-1.5">Monto</th>
                            <th className="px-3 py-1.5">Medio</th>
                            <th className="px-3 py-1.5">Detalles</th>
                            <th className="px-3 py-1.5 text-right">Acción</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {associatedPayments.map(pay => (
                            <tr key={pay.id} className="hover:bg-slate-50/30">
                              <td className="px-3 py-2 text-slate-500">
                                {formatDateDDMMYYYY(pay.created_at)}
                              </td>
                              <td className="px-3 py-2 font-black text-slate-850">
                                {formatPrice(pay.amount)} {pay.currency}
                              </td>
                              <td className="px-3 py-2 font-medium text-slate-600">
                                {pay.payment_methods?.name || "Efectivo"}
                              </td>
                              <td className="px-3 py-2 text-slate-500 truncate max-w-[120px]" title={pay.notes}>
                                {pay.notes}
                              </td>
                              <td className="px-3 py-2 text-right">
                                <button
                                  onClick={() => handleUnlinkPayment(pay.id)}
                                  className="text-[10px] font-black uppercase text-rose-600 hover:text-rose-800 tracking-wider hover:underline"
                                >
                                  Desvincular
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Form panels for registration or linking */}
                {selectedPurchase.total_amount - selectedPurchase.paid_amount > 0 && (
                  <div className="border-t pt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Register New Payment Form */}
                    <form onSubmit={handleRegisterNewPayment} className="space-y-3 bg-slate-50/40 border border-slate-100 p-3 rounded-2xl">
                      <h5 className="text-[10px] font-black uppercase text-slate-600 tracking-wider">Registrar Nuevo Pago</h5>
                      
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[9px] font-black uppercase text-slate-400">Monto</label>
                          <input
                            type="number"
                            required
                            step="any"
                            max={selectedPurchase.total_amount - selectedPurchase.paid_amount}
                            placeholder="0.00"
                            value={newPaymentAmount}
                            onChange={e => setNewPaymentAmount(e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs font-bold border rounded-lg bg-white"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black uppercase text-slate-400">Medio</label>
                          <select
                            value={newPaymentMethodId}
                            onChange={e => setNewPaymentMethodId(e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs font-bold border rounded-lg bg-white"
                          >
                            <option value="">Medio...</option>
                            {paymentMethods.map(pm => (
                              <option key={pm.id} value={pm.id}>{pm.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase text-slate-400">Observaciones</label>
                        <input
                          type="text"
                          placeholder="Notas..."
                          value={newPaymentNotes}
                          onChange={e => setNewPaymentNotes(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs font-bold border rounded-lg bg-white"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={submittingNewPayment}
                        className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5"
                      >
                        {submittingNewPayment ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Registrar Pago
                      </button>
                    </form>

                    {/* Impute/Link Existing Egreso Form */}
                    <div className="space-y-3 bg-slate-50/40 border border-slate-100 p-3 rounded-2xl flex flex-col justify-between">
                      <div>
                        <h5 className="text-[10px] font-black uppercase text-slate-600 tracking-wider">Vincular Egreso Caja</h5>
                        <p className="text-[9px] text-slate-400 mt-0.5 leading-snug">Imputá un movimiento egreso de caja huérfano en {selectedPurchase.currency}.</p>
                        
                        <div className="mt-2 space-y-1">
                          <label className="text-[9px] font-black uppercase text-slate-400">Movimiento Libre</label>
                          <select
                            value={selectedEgresoId}
                            onChange={e => setSelectedEgresoId(e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs font-bold border rounded-lg bg-white"
                          >
                            <option value="">Seleccione movimiento...</option>
                            {unreconciledEgresos.map(e => (
                              <option key={e.id} value={e.id}>
                                [{formatDateDDMMYYYY(e.created_at)}] {e.concept || e.category} - {formatPrice(e.amount)} {e.currency}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleLinkEgreso}
                        disabled={submittingLink || !selectedEgresoId}
                        className="w-full py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        {submittingLink ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />} Vincular Egreso
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="border-t pt-4 flex justify-end">
              <button 
                type="button" 
                onClick={() => setSelectedPurchase(null)} 
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-sm"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* MODAL EVALUACIÓN DE RECLAMO / CAMBIO */}
      {selectedClaim && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl p-6 my-8 space-y-6">
            <div className="flex justify-between items-center border-b pb-4">
              <div>
                <span className="text-[9px] font-black text-brand-600 uppercase tracking-widest bg-brand-50 border border-brand-100 px-2 py-0.5 rounded-full">
                  Postventa ERP • Estado: {selectedClaim.status === 'Pendiente' ? 'Abierto' : selectedClaim.status || 'Abierto'}
                </span>
                <h3 className="text-xl font-black text-slate-900 mt-2">
                  Evaluar Reclamo / Cambio
                </h3>
                <p className="text-xs text-slate-400 font-semibold mt-0.5">
                  Cliente: {selectedClaim.orders?.customer_name} | Pedido Original: {selectedClaim.orders?.legacy_code || selectedClaim.order_id?.substring(0,8)}
                </p>
              </div>
              <button 
                type="button" 
                onClick={() => setSelectedClaim(null)} 
                className="p-1 hover:bg-slate-100 rounded-full"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            {loadingClaimDetail ? (
              <div className="flex justify-center py-8"><Loader2 className="animate-spin text-brand-600 w-8 h-8" /></div>
            ) : (
              <div className="space-y-6">
                 {/* Reason & Comments */}
                <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl space-y-4 text-xs">
                  <div>
                    <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Motivo reportado por Vendedor</span>
                    <span className="text-slate-800 font-bold">{selectedClaim.reason || 'Sin motivo específico'}</span>
                  </div>
                  {selectedClaim.specifications && (
                    <div className="border-t border-slate-200/60 pt-2">
                      <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Especificación del Reclamo</span>
                      <span className="text-slate-800 font-bold">{selectedClaim.specifications}</span>
                    </div>
                  )}
                  {selectedClaim.problem_explanation && (
                    <div className="border-t border-slate-200/60 pt-2">
                      <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Explicación del Problema</span>
                      <p className="text-slate-650 font-medium whitespace-pre-wrap">{selectedClaim.problem_explanation}</p>
                    </div>
                  )}
                  {selectedClaim.notes && (
                    <div className="border-t border-slate-200/60 pt-2">
                      <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Aclaraciones adicionales</span>
                      <p className="text-slate-650 font-medium whitespace-pre-wrap">{selectedClaim.notes}</p>
                    </div>
                  )}
                  {selectedClaim.whaticket_link && (
                    <div className="border-t border-slate-200/60 pt-2">
                      <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Conversación / Whaticket</span>
                      <a 
                        href={selectedClaim.whaticket_link} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 transition-colors font-bold text-[10px] uppercase tracking-wider border border-emerald-200/50"
                      >
                        <Link2 className="w-3.5 h-3.5" />
                        Abrir Conversación Whaticket
                      </a>
                    </div>
                  )}
                  {selectedClaim.attachments && Array.isArray(selectedClaim.attachments) && selectedClaim.attachments.length > 0 && (
                    <div className="border-t border-slate-200/60 pt-2">
                      <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Fotos o Documentos Adjuntos</span>
                      <div className="grid grid-cols-4 gap-2">
                        {selectedClaim.attachments.map((url: string, i: number) => {
                          const isImg = url.match(/\.(jpeg|jpg|gif|png|webp)/i);
                          return (
                            <a 
                              key={i} 
                              href={url} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="relative group rounded-lg overflow-hidden border border-slate-200 bg-white h-12 flex items-center justify-center hover:shadow-sm transition-all"
                            >
                              {isImg ? (
                                <img src={url} alt={`adjunto-${i}`} className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-[8px] text-slate-500 font-bold uppercase truncate px-1">Ver Doc #{i+1}</span>
                              )}
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Contact and Salesperson Information */}
                <div className="bg-slate-50 border border-slate-200/60 p-4 rounded-2xl space-y-3 text-xs">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <h4 className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                      Datos de Contacto y Vendedor
                    </h4>
                    {selectedClaim.orders?.sellers?.full_name && (
                      <span className="text-[10px] bg-slate-200/80 text-slate-700 font-bold px-2 py-0.5 rounded">
                        Vendedor: {selectedClaim.orders.sellers.full_name}
                      </span>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-slate-700">
                    <div>
                      <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Teléfono Principal</span>
                      {selectedClaim.orders?.clients?.phone_primary ? (
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="font-extrabold text-slate-900">{selectedClaim.orders.clients.phone_primary}</span>
                          <a 
                            href={`https://wa.me/${selectedClaim.orders.clients.phone_primary.replace(/[^0-9]/g, "")}`}
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-emerald-600 hover:text-emerald-700 transition-colors font-bold text-[10px] uppercase underline flex items-center gap-0.5"
                          >
                            WhatsApp
                          </a>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">No registrado</span>
                      )}
                    </div>

                    <div>
                      <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Teléfono Secundario</span>
                      <span className="font-bold text-slate-800">
                        {selectedClaim.orders?.clients?.phone_secondary || <span className="text-slate-400 italic">No registrado</span>}
                      </span>
                    </div>

                    <div className="md:col-span-2">
                      <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Dirección de Entrega / Facturación</span>
                      <p className="font-medium text-slate-800 mt-0.5 font-bold">
                        {selectedClaim.orders?.address} {selectedClaim.orders?.locality ? `, ${selectedClaim.orders.locality}` : ""}
                        {selectedClaim.orders?.clients?.billing_address && (
                          <span className="block text-[10px] text-slate-400 font-normal mt-0.5 font-medium">
                            Facturación: {selectedClaim.orders.clients.billing_address}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Resolution Message / Client Response */}
                <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl space-y-2">
                  <span className="block text-[10px] font-black text-slate-500 uppercase tracking-wider">
                    Mensaje de Resolución / Respuesta al Cliente
                  </span>
                  
                  {selectedClaim.status === 'Abierto' || selectedClaim.status === 'Pendiente' ? (
                    <div className="space-y-2">
                      <textarea
                        value={resolutionMessage}
                        onChange={(e) => setResolutionMessage(e.target.value)}
                        placeholder="Escriba la respuesta o resolución oficial que recibirá el cliente (ej: Reclamo aprobado, se coordinó entrega de cambio)..."
                        className="w-full min-h-[90px] p-3 text-xs font-bold border border-slate-200 rounded-xl focus:ring-4 focus:ring-brand-500/10 bg-white"
                      />
                      <div className="flex gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setResolutionMessage(
                              `Estimado cliente, su reclamo por el pedido #${selectedClaim.orders?.legacy_code || selectedClaim.order_id?.substring(0,8)} ha sido APROBADO. Nos contactaremos a la brevedad para coordinar la entrega.`
                            );
                          }}
                          className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[9px] font-black uppercase text-slate-600 tracking-wider transition-colors"
                        >
                          Cargar Plantilla Aprobado
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setResolutionMessage(
                              `Estimado cliente, lamentamos informarle que su reclamo por el pedido #${selectedClaim.orders?.legacy_code || selectedClaim.order_id?.substring(0,8)} ha sido RECHAZADO por el siguiente motivo: `
                            );
                          }}
                          className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[9px] font-black uppercase text-slate-600 tracking-wider transition-colors"
                        >
                          Cargar Plantilla Rechazado
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white p-3 rounded-xl border border-slate-150 text-xs text-slate-700 font-bold whitespace-pre-wrap">
                      {selectedClaim.resolution_message || <span className="text-slate-400 italic">No se registró un mensaje de resolución.</span>}
                    </div>
                  )}
                </div>

                {/* Return Items */}
                {claimReturnItems.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Productos que el cliente Devuelve</h4>
                    <div className="border border-slate-100 rounded-2xl divide-y divide-slate-50 overflow-hidden bg-white text-xs">
                      {claimReturnItems.map(item => (
                        <div key={item.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 font-bold">
                          <div>
                            <span className="block text-slate-800">{item.products?.name}</span>
                            <span className="block text-[10px] text-slate-400 font-bold">
                              SKU: {item.products?.sku || 'N/A'} • Cantidad: {item.quantity} un.
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-black text-slate-400 uppercase">Destino Físico:</span>
                            <select
                              value={item.restock_action}
                              disabled={selectedClaim.status !== 'Abierto' && selectedClaim.status !== 'Pendiente'}
                              onChange={async (e) => {
                                const val = e.target.value;
                                setClaimReturnItems(claimReturnItems.map(ri => ri.id === item.id ? { ...ri, restock_action: val } : ri));
                                await supabase.from("return_items").update({ restock_action: val }).eq("id", item.id);
                              }}
                              className="px-2 py-1 bg-slate-50 border border-slate-100 rounded-lg text-xs font-bold"
                            >
                              <option value="reingreso_stock">Reingreso a Stock</option>
                              <option value="descarte_defectuoso">Descarte por Defectuoso (Merma)</option>
                            </select>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Search / Add Products for Change */}
                {(selectedClaim.status === 'Abierto' || selectedClaim.status === 'Pendiente') && (
                  <div className="space-y-2">
                    <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Buscar y Agregar Productos de Cambio</h4>
                    <div className="relative">
                      <div className="relative z-10">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Buscar producto por nombre o SKU..."
                          value={exchangeSearchQuery}
                          onFocus={() => setShowProductDropdown(true)}
                          onChange={(e) => {
                            setExchangeSearchQuery(e.target.value);
                            setShowProductDropdown(true);
                          }}
                          className="w-full pl-11 pr-10 py-2.5 rounded-xl border border-slate-100 focus:ring-4 focus:ring-brand-500/10 bg-slate-50 font-bold text-xs"
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

                      {showProductDropdown && (
                        <>
                          <div 
                            className="fixed inset-0 z-0 cursor-default" 
                            onClick={() => setShowProductDropdown(false)} 
                          />
                          <div className="absolute z-20 w-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl max-h-48 overflow-y-auto divide-y divide-slate-100 animate-in fade-in slide-in-from-top-1 duration-150">
                            {products
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
                                    handleAddClaimExchangeItem(p);
                                    setExchangeSearchQuery("");
                                    setShowProductDropdown(false);
                                  }}
                                  className="w-full flex items-center justify-between p-3 text-left hover:bg-slate-50 transition-colors cursor-pointer"
                                >
                                  <div>
                                    <span className="block font-black text-slate-800 text-xs">{p.name}</span>
                                    <span className="block text-[10px] text-slate-400 font-bold uppercase mt-0.5">
                                      SKU: {p.sku || 'N/A'}
                                    </span>
                                  </div>
                                  <span className="font-black text-brand-600 text-xs shrink-0 pl-3">
                                    {formatPrice(p.price || 0)}
                                  </span>
                                </button>
                              ))}
                            {products.filter(p => 
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
                  </div>
                )}

                {/* Exchange Items */}
                {claimExchangeItems.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Productos que se entregan a Cambio</h4>
                    <div className="border border-slate-100 rounded-2xl divide-y divide-slate-50 overflow-hidden bg-white text-xs">
                      {claimExchangeItems.map(item => {
                        const isPending = selectedClaim.status === 'Abierto' || selectedClaim.status === 'Pendiente';
                        return (
                          <div key={item.id} className="p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-4 font-bold">
                            <div className="flex-1">
                              <span className="block text-slate-800">{item.products?.name}</span>
                              <span className="block text-[10px] text-slate-400 font-bold">
                                SKU: {item.products?.sku || 'N/A'}
                              </span>
                            </div>
                            
                            {isPending ? (
                              <div className="flex items-center gap-4">
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] font-black text-slate-400 uppercase">Cant:</span>
                                  <input
                                    type="number"
                                    value={item.quantity}
                                    onChange={(e) => handleUpdateClaimExchangeQty(item.id, parseInt(e.target.value) || 1)}
                                    className="w-14 px-2 py-1 rounded-lg border border-slate-100 font-black text-xs text-center"
                                  />
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] font-black text-slate-400 uppercase">Precio:</span>
                                  <input
                                    type="number"
                                    value={item.unit_price}
                                    onChange={(e) => handleUpdateClaimExchangePrice(item.id, parseFloat(e.target.value) || 0)}
                                    className="w-20 px-2 py-1 rounded-lg border border-slate-100 font-black text-xs text-center text-brand-600"
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveClaimExchangeItem(item.id)}
                                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <div className="text-right">
                                <span className="block text-slate-800">{item.quantity} un.</span>
                                <span className="block text-[10px] text-slate-400 font-bold">{formatPrice(item.unit_price)} c/u</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Rejection Reason display */}
                {selectedClaim.status === 'Rechazado' && selectedClaim.rejection_reason && (
                  <div className="p-4 bg-red-50 border border-red-150 rounded-2xl space-y-1.5 text-xs text-red-700 font-bold">
                    <span className="block text-[10px] uppercase text-red-500 tracking-wider">Motivo de Rechazo:</span>
                    <p className="font-extrabold">{selectedClaim.rejection_reason}</p>
                  </div>
                )}

                {/* Accounting settlement */}
                {(selectedClaim.status === 'Abierto' || selectedClaim.status === 'Pendiente') && (
                  <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl space-y-4 text-xs font-bold">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 uppercase text-[10px] tracking-wider">Monto de Liquidación Final:</span>
                      <span className={`text-sm font-black ${
                        calculatedDifferenceAmount === 0 ? 'text-slate-800' :
                        calculatedDifferenceAmount > 0 ? 'text-amber-600' : 'text-emerald-600'
                      }`}>
                        {calculatedDifferenceAmount === 0 ? '$0,00' : 
                         calculatedDifferenceAmount > 0 ? `Cliente paga diferencia de: ${formatPrice(calculatedDifferenceAmount)}` : 
                         `Reembolso a favor de cliente: ${formatPrice(Math.abs(calculatedDifferenceAmount))}`}
                      </span>
                    </div>

                    {calculatedDifferenceAmount !== 0 && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-slate-200/60">
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Método de Imputación</label>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => setEvalSettlementMethod('caja')}
                              className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border ${
                                evalSettlementMethod === 'caja' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-150 hover:bg-slate-50'
                              }`}
                            >
                              Efectivo / Caja
                            </button>
                            <button
                              type="button"
                              disabled={!selectedClaim.orders?.client_id}
                              onClick={() => setEvalSettlementMethod('cuenta_corriente')}
                              className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border ${
                                evalSettlementMethod === 'cuenta_corriente' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-150 hover:bg-slate-50 disabled:opacity-30'
                              }`}
                              title={!selectedClaim.orders?.client_id ? "El pedido no tiene cliente registrado para Cuenta Corriente" : ""}
                            >
                              Cta. Corriente
                            </button>
                          </div>
                        </div>

                        {evalSettlementMethod === 'caja' && (
                          <div className="space-y-1.5">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Medio de Pago</label>
                            <select
                              value={evalPaymentMethodId}
                              onChange={(e) => setEvalPaymentMethodId(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-slate-150 rounded-xl text-xs font-bold text-slate-700"
                            >
                              {paymentMethods.map(pm => (
                                <option key={pm.id} value={pm.id}>{pm.name}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t justify-end">
                  <Button 
                    type="button"
                    onClick={() => setSelectedClaim(null)} 
                    variant="outline"
                    className="rounded-xl px-5 py-2.5 font-bold text-xs uppercase"
                  >
                    Cerrar
                  </Button>
                  
                  {(selectedClaim.status === 'Abierto' || selectedClaim.status === 'Pendiente') && (
                    <>
                      <Button 
                        type="button"
                        onClick={() => handleRejectClaim(selectedClaim.id)} 
                        variant="secondary"
                        disabled={evaluatingClaimId !== null}
                        className="rounded-xl px-5 py-2.5 font-bold text-xs uppercase text-red-600 bg-red-50 hover:bg-red-100 hover:text-red-700"
                      >
                        {evaluatingClaimId === selectedClaim.id ? <Loader2 className="animate-spin w-4 h-4" /> : "Rechazar Reclamo"}
                      </Button>
                      <Button 
                        type="button"
                        onClick={() => handleApproveClaim(selectedClaim)} 
                        disabled={evaluatingClaimId !== null}
                        className="rounded-xl px-6 py-2.5 font-black text-xs uppercase tracking-widest gap-1.5"
                      >
                        {evaluatingClaimId === selectedClaim.id ? <Loader2 className="animate-spin w-4 h-4" /> : (
                          <>
                            <CheckCircle2 className="w-4 h-4" /> Aprobar Reclamo / Cambio
                          </>
                        )}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUBTAB: RECETAS (BOM) */}
      {activeSubTab === 'boms' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left panel: List of manufactured/assembled products */}
          <div className="lg:col-span-1 bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm space-y-4">
            <div className="flex justify-between items-center mb-1">
              <h3 className="font-black text-slate-900 text-sm">Productos</h3>
            </div>
            
            {/* Filter buttons */}
            <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200/40">
              <button
                type="button"
                onClick={() => setBomFilterType('production')}
                className={`flex-1 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                  bomFilterType === 'production' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Fabricados
              </button>
              <button
                type="button"
                onClick={() => setBomFilterType('comprado')}
                className={`flex-1 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                  bomFilterType === 'comprado' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Comprados
              </button>
              <button
                type="button"
                onClick={() => setBomFilterType('all')}
                className={`flex-1 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                  bomFilterType === 'all' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Todos
              </button>
            </div>
            
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {products
                .filter(p => {
                  if (p.is_generic) return false;
                  if (bomFilterType === 'production') return p.production_type === 'fabricado' || p.production_type === 'ensamblado';
                  if (bomFilterType === 'comprado') return p.production_type === 'comprado';
                  return true;
                })
                .map(p => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setSelectedBomProductId(p.id);
                      fetchBom(p.id);
                    }}
                    className={`w-full text-left p-3.5 rounded-xl border transition-all flex items-center justify-between ${
                      selectedBomProductId === p.id 
                        ? 'border-brand-500 bg-brand-50/40 shadow-sm' 
                        : 'border-slate-100 hover:bg-slate-50'
                    }`}
                  >
                    <div className="min-w-0 flex-1 mr-2">
                      <span className="text-[8px] font-black text-brand-600 uppercase tracking-wider block mb-0.5">
                        {p.production_type === 'fabricado' ? 'Fabricado' : p.production_type === 'ensamblado' ? 'Ensamblado' : 'Comprado'}
                      </span>
                      <span className="text-[11px] font-bold text-slate-800 block truncate">{p.name}</span>
                      <span className="text-[9px] text-slate-400 font-mono">{p.sku || 'SIN SKU'}</span>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className="text-xs font-black text-slate-700 block">
                        {formatPrice(p.cost_price || 0)}
                      </span>
                      <span className="text-[9px] text-slate-400 font-semibold block">Costo unitario</span>
                    </div>
                  </button>
                ))}
              {products.filter(p => {
                if (p.is_generic) return false;
                if (bomFilterType === 'production') return p.production_type === 'fabricado' || p.production_type === 'ensamblado';
                if (bomFilterType === 'comprado') return p.production_type === 'comprado';
                return true;
              }).length === 0 && (
                <div className="p-8 text-center text-slate-400 text-xs font-semibold">
                  No hay productos para el filtro seleccionado.
                </div>
              )}
            </div>
          </div>

          {/* Right panel: BOM Details and Editor */}
          <div className="lg:col-span-2 space-y-6">
            {selectedBomProductId ? (
              <>
                {/* Cost Summary Card */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <span className="text-[9px] font-black text-brand-600 uppercase tracking-widest block">Desglose de Costos</span>
                      <h2 className="text-lg font-black text-slate-900 tracking-tight">
                        {products.find(p => p.id === selectedBomProductId)?.name}
                      </h2>
                      <span className="text-xs font-bold text-slate-400">SKU: {products.find(p => p.id === selectedBomProductId)?.sku || '-'}</span>
                    </div>
                    
                    <div className="text-right">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Precio de Venta</span>
                      <span className="text-base font-black text-slate-900">
                        {formatPrice(products.find(p => p.id === selectedBomProductId)?.price || 0)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100 shadow-inner">
                    <div className="space-y-1">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Costo Componentes</span>
                      <span className="text-sm font-bold text-slate-700 block font-mono">
                        {formatPrice(
                          bomComponents.reduce((sum, item) => 
                            sum + ((item.component?.cost_price || 0) * item.quantity * (1 + (item.waste_percentage || 0) / 100))
                          , 0)
                        )}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Mano de Obra</span>
                      <span className="text-sm font-bold text-slate-700 block font-mono">
                        {formatPrice(parseFloat(bomLaborCost) || 0)}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Gastos Overhead</span>
                      <span className="text-sm font-bold text-slate-700 block font-mono">
                        {formatPrice(parseFloat(bomOverheadCost) || 0)}
                      </span>
                    </div>
                    <div className="space-y-1 border-t md:border-t-0 md:border-l border-slate-200 pt-2 md:pt-0 md:pl-4">
                      {isBomProductComprado ? (
                        <>
                          <span className="text-[9px] font-black text-brand-600 uppercase tracking-wider block">Costo Fab. Simulado</span>
                          <span className="text-base font-black text-brand-600 block font-mono" title="Costo de producción estimado">
                            {formatPrice(bomSimulatedCost)}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="text-[9px] font-black text-brand-600 uppercase tracking-wider block">Costo Unitario Total</span>
                          <span className="text-base font-black text-brand-600 block font-mono">
                            {formatPrice(currentBomProduct?.cost_price || 0)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {isBomProductComprado && currentBomProduct && (
                    <div className="mt-4 p-4 rounded-xl border border-slate-100 bg-slate-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-inner">
                      <div className="flex items-center gap-3">
                        <div className={`p-2.5 rounded-xl ${
                          bomSimulatedCost < (currentBomProduct.cost_price || 0) ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-200/60 text-slate-600'
                        }`}>
                          <Scale className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block">Análisis de Conveniencia (Make vs. Buy)</span>
                          <span className="text-xs font-bold text-slate-800 block">
                            Costo de Compra Actual: <span className="font-mono">{formatPrice(currentBomProduct.cost_price || 0)}</span>
                          </span>
                          <span className="text-[10px] font-semibold text-slate-500 block">
                            {bomSimulatedCost < (currentBomProduct.cost_price || 0) ? (
                              <span className="text-emerald-600 font-black">
                                ¡Conviene fabricar! Ahorro unitario de {formatPrice((currentBomProduct.cost_price || 0) - bomSimulatedCost)} ({(((currentBomProduct.cost_price || 0) - bomSimulatedCost) / (currentBomProduct.cost_price || 1) * 100).toFixed(1)}%)
                              </span>
                            ) : (
                              <span className="text-slate-500 font-bold">
                                Conviene comprar. Fabricarlo internamente costaría {formatPrice(bomSimulatedCost - (currentBomProduct.cost_price || 0))} más.
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handlePromoteToFabricado(currentBomProduct.id)}
                        className="sm:self-center px-3 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors shadow-sm cursor-pointer"
                      >
                        Cambiar a Fabricado
                      </button>
                    </div>
                  )}

                  {/* Edit Direct Costs (Mano de Obra, Overhead) */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 pt-6 border-t border-slate-100 items-end">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Costo Mano de Obra (ARS)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700"
                        value={bomLaborCost}
                        onChange={e => setBomLaborCost(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Gastos Indirectos / Overhead (ARS)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700"
                        value={bomOverheadCost}
                        onChange={e => setBomOverheadCost(e.target.value)}
                      />
                    </div>
                    <div>
                      <Button
                        type="button"
                        onClick={handleSaveBomCosts}
                        disabled={savingBomCosts}
                        className="w-full h-9 rounded-xl font-bold text-xs uppercase"
                      >
                        {savingBomCosts ? <Loader2 className="animate-spin w-4 h-4 mx-auto" /> : "Guardar Costos"}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Recipe Editor Card */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm space-y-6">
                  <h3 className="font-black text-slate-900 text-sm">Componentes de la Receta (BOM)</h3>
                  
                  {/* Form to add component */}
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="sm:col-span-2 space-y-1 relative" onClick={e => e.stopPropagation()}>
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Buscar Componente / Insumo</label>
                      <input
                        type="text"
                        placeholder="Seleccionar un componente..."
                        value={componentSearchQuery}
                        onChange={e => {
                          setComponentSearchQuery(e.target.value);
                          setShowComponentSearchDropdown(true);
                        }}
                        onFocus={() => {
                          setShowComponentSearchDropdown(true);
                          setComponentSearchQuery("");
                        }}
                        onBlur={() => {
                          setTimeout(() => {
                            setShowComponentSearchDropdown(false);
                            const matched = products.find(p => p.id === selectedComponentId);
                            if (matched) {
                              setComponentSearchQuery((matched.sku ? `[${matched.sku}] ` : '') + matched.name);
                            } else {
                              setComponentSearchQuery("");
                            }
                          }, 200);
                        }}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 transition-all cursor-pointer pr-8"
                      />
                      <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />

                      {showComponentSearchDropdown && (
                        <div className="absolute left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg z-50 py-1">
                          {(() => {
                            const query = componentSearchQuery.toLowerCase().trim();
                            const filtered = products.filter(p => {
                              // Must not be the parent product itself
                              if (p.id === selectedBomProductId) return false;
                              // Must be an insumo
                              const isInsumo = p.is_insumo || p.category === 'Insumos' || p.category === 'Materia Prima';
                              if (!isInsumo) return false;

                              const nameMatch = p.name.toLowerCase().includes(query);
                              const skuMatch = p.sku ? p.sku.toLowerCase().includes(query) : false;
                              return nameMatch || skuMatch;
                            });

                            if (filtered.length === 0) {
                              return (
                                <div className="px-4 py-2 text-xs text-slate-500 italic">
                                  No se encontraron insumos
                                </div>
                              );
                            }

                            return filtered.map(p => (
                              <button
                                key={p.id}
                                type="button"
                                onMouseDown={() => {
                                  setSelectedComponentId(p.id);
                                  setComponentSearchQuery((p.sku ? `[${p.sku}] ` : '') + p.name);
                                  setShowComponentSearchDropdown(false);
                                }}
                                className={`w-full px-4 py-2.5 text-left text-xs font-bold transition-all block border-b border-slate-50 last:border-0 ${
                                  selectedComponentId === p.id
                                    ? 'bg-brand-50 text-brand-700 font-black'
                                    : 'text-slate-700 hover:bg-slate-50'
                                }`}
                              >
                                <div className="flex justify-between items-center">
                                  <div className="flex flex-col">
                                    <span className="leading-tight">{p.name}</span>
                                    {p.sku && (
                                      <span className="text-[9px] text-slate-400 font-mono mt-0.5">SKU: {p.sku}</span>
                                    )}
                                  </div>
                                  <span className="text-[9px] text-slate-500 font-mono flex-shrink-0 ml-2">
                                    Costo: {formatPrice(p.cost_price || 0)}
                                  </span>
                                </div>
                              </button>
                            ));
                          })()}
                        </div>
                      )}
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Cant. Requerida</label>
                      <input
                        type="number"
                        step="0.001"
                        min="0.001"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700"
                        value={bomComponentQuantity}
                        onChange={e => setBomComponentQuantity(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">% Merma / Desperdicio</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700"
                        value={bomComponentWaste}
                        onChange={e => setBomComponentWaste(e.target.value)}
                      />
                    </div>

                    <div className="sm:col-span-4 flex justify-end">
                      <Button
                        type="button"
                        onClick={handleAddBomComponent}
                        className="rounded-xl px-5 py-2.5 font-bold text-xs uppercase"
                      >
                        Agregar Componente
                      </Button>
                    </div>
                  </div>

                  {/* List of current components */}
                  <div className="overflow-x-auto">
                    {loadingBom ? (
                      <div className="flex justify-center p-8">
                        <Loader2 className="animate-spin text-brand-600 w-6 h-6" />
                      </div>
                    ) : (
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-100">
                            <th className="py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">SKU</th>
                            <th className="py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Componente</th>
                            <th className="py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Cant. Necesaria</th>
                            <th className="py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Merma</th>
                            <th className="py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Costo Unit. Componente</th>
                            <th className="py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Costo Total</th>
                            <th className="py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Acciones</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {bomComponents.map(item => {
                            const unitCost = item.component?.cost_price || 0;
                            const totalQty = item.quantity * (1 + (item.waste_percentage || 0) / 100);
                            const totalCost = unitCost * totalQty;

                            return (
                              <tr key={item.id} className="text-xs hover:bg-slate-50/50 transition-colors">
                                <td className="py-3.5 font-mono text-[10px] text-slate-500">{item.component?.sku || '-'}</td>
                                <td className="py-3.5 font-bold text-slate-700">{item.component?.name || 'Producto no encontrado'}</td>
                                <td className="py-3.5 text-right font-semibold text-slate-700">{item.quantity}</td>
                                <td className="py-3.5 text-right font-semibold text-slate-500">{item.waste_percentage}%</td>
                                <td className="py-3.5 text-right font-mono text-slate-600">{formatPrice(unitCost)}</td>
                                <td className="py-3.5 text-right font-bold text-brand-600">{formatPrice(totalCost)}</td>
                                <td className="py-3.5 text-center">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteBomComponent(item.id)}
                                    className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg transition-colors"
                                    title="Eliminar de receta"
                                  >
                                    <Trash2 className="w-4 h-4 mx-auto" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                          {bomComponents.length === 0 && (
                            <tr>
                              <td colSpan={7} className="py-8 text-center text-slate-400 text-xs">
                                Esta receta está vacía. Sumá componentes arriba para comenzar.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-white p-12 rounded-2xl border border-slate-200/60 shadow-sm text-center text-slate-400 text-xs">
                Seleccioná un producto de producción de la izquierda para ver su receta.
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUBTAB: ORDENES DE PRODUCCION */}
      {activeSubTab === 'production' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Form and stock check panel */}
          <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm space-y-6">
            <h3 className="font-black text-slate-900 text-sm">Registrar Nueva Producción / Armado</h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2 space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Producto a Fabricar / Ensamblar</label>
                <select
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700"
                  value={prodProductId}
                  onChange={e => {
                    setProdProductId(e.target.value);
                    loadProductionBom(e.target.value);
                  }}
                >
                  <option value="">Seleccionar un producto terminado...</option>
                  {products
                    .filter(p => p.production_type === 'fabricado' || p.production_type === 'ensamblado')
                    .map(p => (
                      <option key={p.id} value={p.id}>
                        {p.sku ? `[${p.sku}] ` : ''}{p.name}
                      </option>
                    ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cantidad a Producir</label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700"
                  value={prodQuantity}
                  onChange={e => setProdQuantity(e.target.value)}
                />
              </div>

              <div className="sm:col-span-3 space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Notas de Producción / Observaciones</label>
                <textarea
                  placeholder="Ej: Lote de producción nº 104, usando pigmentos alternativos..."
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium h-20 resize-none"
                  value={prodNotes}
                  onChange={e => setProdNotes(e.target.value)}
                />
              </div>
            </div>

            {prodProductId && prodComponents.length > 0 && (
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <div className="flex justify-between items-center">
                  <h4 className="font-black text-slate-900 text-xs">Simulación y Swaps de Insumos</h4>
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider text-right">
                    Selecciona qué variante/color del stock real deseas consumir.
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-150">
                        <th className="py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Insumo Receta</th>
                        <th className="py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Uso</th>
                        <th className="py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Swapear por Variante / Color / Proveedor</th>
                        <th className="py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Cant. Unitaria</th>
                        <th className="py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Total Consumido</th>
                        <th className="py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Stock Físico</th>
                        <th className="py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {prodComponents.map((comp, idx) => {
                        const variantProduct = products.find(p => p.id === comp.selected_variant_id);
                        const stock = variantProduct?.stock_physical || 0;
                        const qtyToProduce = parseFloat(prodQuantity) || 0;
                        const totalNeeded = comp.quantity_to_consume * qtyToProduce;
                        const isStockSufficient = stock >= totalNeeded;

                        return (
                          <tr key={comp.bom_id} className="text-xs hover:bg-slate-50/50">
                            <td className="py-3">
                              <span className="text-[10px] font-bold text-slate-700 block">{comp.default_name}</span>
                              <span className="text-[8px] font-mono text-slate-400 block">{comp.default_sku}</span>
                            </td>
                            <td className="py-3">
                              <span className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                                {products.find(p => p.id === comp.product_id)?.insumo_use || 'Todos'}
                              </span>
                            </td>
                            <td className="py-3">
                              <select
                                className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-700 w-full max-w-[200px]"
                                value={comp.selected_variant_id}
                                onChange={e => {
                                  const updated = [...prodComponents];
                                  updated[idx] = { ...updated[idx], selected_variant_id: e.target.value };
                                  setProdComponents(updated);
                                }}
                              >
                                {comp.variants.map((v: any) => (
                                  <option key={v.id} value={v.id}>
                                    {v.variant_type && v.variant_type !== 'estandar' ? `${v.name} (${v.variant_type})` : v.name}
                                    {v.brand ? ` - ${v.brand}` : ''} (Stock: {v.stock_physical || 0})
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-3 text-right font-semibold text-slate-600">{comp.quantity_to_consume}</td>
                            <td className="py-3 text-right font-bold text-slate-800">{totalNeeded}</td>
                            <td className="py-3 text-right font-semibold text-slate-600">{stock}</td>
                            <td className="py-3 text-center">
                              {isStockSufficient ? (
                                <span className="inline-block bg-emerald-50 text-emerald-600 text-[9px] font-black px-2 py-0.5 rounded shadow-sm">OK</span>
                              ) : (
                                <span className="inline-block bg-red-50 text-red-500 text-[9px] font-black px-2 py-0.5 rounded shadow-sm animate-pulse">STOCK INSUFICIENTE</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
                  <Button
                    type="button"
                    onClick={handleRegisterProduction}
                    disabled={isRegisteringProduction || prodComponents.some(comp => {
                      const variantProduct = products.find(p => p.id === comp.selected_variant_id);
                      return (variantProduct?.stock_physical || 0) < (comp.quantity_to_consume * (parseFloat(prodQuantity) || 0));
                    })}
                    className="rounded-xl px-6 py-3 font-black text-xs uppercase tracking-widest flex items-center gap-1.5"
                  >
                    {isRegisteringProduction ? <Loader2 className="animate-spin w-4 h-4" /> : (
                      <>
                        <Check className="w-4 h-4" /> Finalizar y Cargar Stock
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {prodProductId && prodComponents.length === 0 && (
              <div className="p-8 text-center text-slate-400 text-xs border border-slate-100 rounded-xl bg-slate-50/50">
                ⚠️ Este producto no tiene una receta (BOM) configurada. Creala en la pestaña "Recetas (BOM)" antes de poder producirlo.
              </div>
            )}
          </div>

          {/* Right panel: Informational text about stock impact */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm space-y-4">
              <h4 className="font-black text-slate-900 text-sm">💡 Reglas de Impacto de Stock</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Cuando registras una orden de producción, el sistema ejecuta de forma automática:
              </p>
              <ul className="text-xs text-slate-500 space-y-3 list-disc pl-4">
                <li>
                  <strong className="text-slate-700">Consumo de Insumos:</strong> Se descuentan del inventario las materias primas especificadas en la tabla de simulación (tipo <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[10px]">Produccion Consumo</code>).
                </li>
                <li>
                  <strong className="text-slate-700">Ingreso de Producto:</strong> Se suman al stock físico y actual la cantidad fabricada/ensamblada del producto final (tipo <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[10px]">Produccion Ingreso</code>).
                </li>
                <li>
                  <strong className="text-slate-700">Historial y Auditoría:</strong> Queda registrada una orden en la base de datos vinculando el usuario responsable, fecha y consumos exactos.
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB: INSUMOS */}
      {activeSubTab === 'insumos' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-center bg-white p-4 rounded-xl border border-slate-200/60 shadow-sm gap-4">
            <div className="min-w-0 flex-1">
              <h3 className="font-black text-slate-900 text-sm">Inventario de Insumos y Materias Primas</h3>
              <p className="text-[10px] text-slate-400 font-semibold">
                Control y visualización de stock físico, costos de fábrica y uso exclusivo de insumos.
              </p>
            </div>
            
            <div className="flex gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:flex-initial">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar insumo..."
                  className="pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-4 focus:ring-brand-500/10 outline-none w-full sm:w-64 bg-slate-50"
                  value={insumosSearchQuery}
                  onChange={e => setInsumosSearchQuery(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-150 bg-slate-50/50">
                    <th className="py-3 px-6 text-[9px] font-black text-slate-400 uppercase tracking-widest">SKU</th>
                    <th className="py-3 px-6 text-[9px] font-black text-slate-400 uppercase tracking-widest">Insumo / Nombre</th>
                    <th className="py-3 px-6 text-[9px] font-black text-slate-400 uppercase tracking-widest">Categoría</th>
                    <th className="py-3 px-6 text-[9px] font-black text-slate-400 uppercase tracking-widest">Uso Autorizado</th>
                    <th className="py-3 px-6 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Stock Físico</th>
                    <th className="py-3 px-6 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Costo Unitario</th>
                    <th className="py-3 px-6 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {products
                    .filter(p => p.is_insumo || p.category === 'Insumos' || p.category === 'Materia Prima')
                    .filter(p => 
                      p.name.toLowerCase().includes(insumosSearchQuery.toLowerCase()) || 
                      (p.sku && p.sku.toLowerCase().includes(insumosSearchQuery.toLowerCase()))
                    )
                    .map(p => (
                      <tr key={p.id} className="text-xs hover:bg-slate-50/40">
                        <td className="py-4 px-6 font-mono text-[10px] text-slate-500 font-bold">{p.sku || '-'}</td>
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-800">{p.name}</span>
                            {p.is_generic && (
                              <span className="bg-brand-100 text-brand-700 text-[8px] font-black px-1.5 py-0.5 rounded shadow-sm">
                                GENÉRICO
                              </span>
                            )}
                          </div>
                          {p.brand && <span className="text-[10px] text-slate-400 font-semibold block">{p.brand}</span>}
                          {p.is_generic && p.mapped_real_product_id && (
                            <span className="text-[9px] text-brand-600 font-bold block mt-0.5">
                              🔗 Mapeado a: {products.find(x => x.id === p.mapped_real_product_id)?.name || 'Insumo no encontrado'}
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-6 text-slate-500 font-semibold">{p.category}</td>
                        <td className="py-4 px-6">
                          <span className="inline-block bg-slate-100 text-slate-600 text-[9px] font-black uppercase px-2 py-0.5 rounded">
                            {p.insumo_use === 'fabricacion' ? 'Sólo Fabricación' : 
                             p.insumo_use === 'ensamblado' ? 'Sólo Ensamblado' : 
                             p.insumo_use === 'ensamblado_venta' ? 'Ensamblado y Venta' : 'Cualquiera'}
                          </span>
                        </td>
                        <td className={`py-4 px-6 text-right font-black ${
                          (!p.is_generic && (p.stock_physical || 0) <= 5) ? 'text-red-500 font-black' : 'text-slate-800'
                        }`}>
                          {p.is_generic ? (
                            <span className="text-slate-400 font-semibold" title="Stock del insumo real mapeado">
                              {products.find(x => x.id === p.mapped_real_product_id)?.stock_physical || 0} (Mapeado)
                            </span>
                          ) : (
                            p.stock_physical || 0
                          )}
                        </td>
                        <td className="py-4 px-6 text-right font-mono text-slate-600 font-bold">
                          {formatPrice(p.cost_price || 0)}
                        </td>
                        <td className="py-4 px-6 text-center">
                          {p.is_generic ? (
                            <button
                              onClick={() => {
                                setSelectedGenericToMap(p);
                                setNewMappedRealProductId(p.mapped_real_product_id || "");
                              }}
                              className="inline-flex items-center px-3 py-1.5 border border-slate-200 rounded-lg hover:border-brand-500 hover:text-brand-600 font-bold text-[10px] uppercase transition-colors"
                            >
                              <Link2 className="w-3.5 h-3.5 mr-1" /> Cambiar Mapeo
                            </button>
                          ) : (
                            <button
                              onClick={() => setSelectedInsumoToAdjust(p)}
                              className="inline-flex items-center px-3 py-1.5 border border-slate-200 rounded-lg hover:border-brand-500 hover:text-brand-600 font-bold text-[10px] uppercase transition-colors"
                            >
                              <ListPlus className="w-3.5 h-3.5 mr-1" /> Ajustar Stock
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  {products.filter(p => p.is_insumo || p.category === 'Insumos' || p.category === 'Materia Prima').length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-12 px-6 text-center text-slate-400 text-xs">
                        No se encontraron insumos o materias primas. Marca productos como "Es Insumo" desde el Catálogo.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Quick Adjustment Modal */}
          {selectedInsumoToAdjust && (
            <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-md z-[200] flex items-center justify-center p-6">
              <div className="bg-white rounded-[2rem] w-full max-w-md shadow-3xl border border-white/20 p-8 scale-in-center">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-black text-slate-900 tracking-tight">Ajustar Stock de Insumo</h3>
                  <button onClick={() => setSelectedInsumoToAdjust(null)} className="p-2 hover:bg-slate-100 rounded-xl transition-all">
                    <X className="w-5 h-5 text-slate-400" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <span className="text-[9px] font-black text-brand-600 block uppercase tracking-widest mb-1">Insumo Seleccionado</span>
                    <span className="text-sm font-bold text-slate-800 block">{selectedInsumoToAdjust.name}</span>
                    <span className="text-[10px] font-mono text-slate-400 font-semibold block">SKU: {selectedInsumoToAdjust.sku}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Tipo de Ajuste</label>
                      <select
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700"
                        value={insumoAdjustType}
                        onChange={e => setInsumoAdjustType(e.target.value as any)}
                      >
                        <option value="ingreso">Ingreso (Suma stock)</option>
                        <option value="egreso">Egreso (Resta stock)</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Cantidad</label>
                      <input
                        type="number"
                        step="0.001"
                        min="0.001"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700"
                        value={insumoAdjustQty}
                        onChange={e => setInsumoAdjustQty(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="flex gap-3 pt-6">
                    <Button
                      type="button"
                      onClick={handleAdjustInsumoStock}
                      disabled={isAdjustingInsumo}
                      className="flex-1 rounded-xl h-12 text-xs font-bold uppercase tracking-widest"
                    >
                      {isAdjustingInsumo ? <Loader2 className="animate-spin w-4 h-4 mx-auto" /> : "Confirmar Ajuste"}
                    </Button>
                    <Button
                      type="button"
                      onClick={() => setSelectedInsumoToAdjust(null)}
                      variant="outline"
                      className="rounded-xl h-12 font-bold text-xs uppercase"
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Centralized Mapping Modal for Generic Insumos */}
          {selectedGenericToMap && (
            <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-md z-[200] flex items-center justify-center p-6">
              <div className="bg-white rounded-[2rem] w-full max-w-md shadow-3xl border border-white/20 p-8 scale-in-center">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-black text-slate-900 tracking-tight">Cambiar Mapeo de Insumo Genérico</h3>
                  <button onClick={() => setSelectedGenericToMap(null)} className="p-2 hover:bg-slate-100 rounded-xl transition-all">
                    <X className="w-5 h-5 text-slate-400" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <span className="text-[9px] font-black text-brand-600 block uppercase tracking-widest mb-1">Insumo Genérico</span>
                    <span className="text-sm font-bold text-slate-800 block">{selectedGenericToMap.name}</span>
                    <span className="text-[10px] font-mono text-slate-400 font-semibold block">SKU: {selectedGenericToMap.sku || '-'}</span>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Insumo Real Mapeado</label>
                    <select
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700"
                      value={newMappedRealProductId}
                      onChange={e => setNewMappedRealProductId(e.target.value)}
                    >
                      <option value="">-- No mapeado / Seleccionar insumo real --</option>
                      {products
                        .filter(p => !p.is_generic && (p.is_insumo || p.category === 'Insumos' || p.category === 'Materia Prima') && p.id !== selectedGenericToMap.id)
                        .map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name} {p.sku ? `(${p.sku})` : ''} - {formatPrice(p.cost_price || 0)}
                          </option>
                        ))}
                    </select>
                    <p className="text-[9px] text-slate-400 mt-1 leading-normal">
                      Al cambiar el mapeo, se actualizará automáticamente el costo de este insumo genérico y se recalcularán los costos de todas las recetas (BOM) en las que se utiliza.
                    </p>
                  </div>

                  <div className="flex gap-3 pt-6">
                    <Button
                      type="button"
                      onClick={handleUpdateGenericMapping}
                      disabled={isUpdatingMapping}
                      className="flex-1 rounded-xl h-12 text-xs font-bold uppercase tracking-widest"
                    >
                      {isUpdatingMapping ? <Loader2 className="animate-spin w-4 h-4 mx-auto" /> : "Guardar Mapeo"}
                    </Button>
                    <Button
                      type="button"
                      onClick={() => setSelectedGenericToMap(null)}
                      variant="outline"
                      className="rounded-xl h-12 font-bold text-xs uppercase"
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Modal for Inspecting Price List Items */}
          {inspectingPriceList && (
            <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-md z-[200] flex items-center justify-center p-6">
              <div className="bg-white rounded-[2rem] w-full max-w-4xl shadow-3xl border border-white/20 p-8 scale-in-center flex flex-col max-h-[85vh]">
                <div className="flex justify-between items-center mb-4 shrink-0">
                  <div>
                    <h3 className="text-lg font-black text-slate-900 tracking-tight">Contenido de Lista: {inspectingPriceList.list_number}</h3>
                    <p className="text-xs text-slate-400 font-bold mt-1">
                      Proveedor: {suppliers.find(s => s.id === inspectingPriceList.supplier_id)?.name || 'Desconocido'} | Moneda: {(inspectingPriceList as any).currency || 'ARS'} | Creada: {formatDateDDMMYYYY(inspectingPriceList.created_at)}
                    </p>
                  </div>
                  <button onClick={() => setInspectingPriceList(null)} className="p-2 hover:bg-slate-100 rounded-xl transition-all">
                    <X className="w-5 h-5 text-slate-400" />
                  </button>
                </div>

                {/* Buscador dentro del modal */}
                <div className="relative mb-4 shrink-0">
                  <input
                    type="text"
                    placeholder="Buscar por SKU o nombre de producto..."
                    value={plModalSearchQuery}
                    onChange={e => setPlModalSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500/10 outline-none text-xs font-bold text-slate-700 bg-slate-50"
                  />
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>

                {/* Contenido (Tabla o Loader) */}
                <div className="flex-1 overflow-y-auto min-h-0 border border-slate-100 rounded-2xl bg-slate-50/30">
                  {loadingInspectingItems ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-3">
                      <Loader2 className="animate-spin text-brand-600 w-8 h-8" />
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Cargando artículos...</span>
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100 sticky top-0 z-10">
                          <th className="px-6 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">SKU</th>
                          <th className="px-6 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Producto</th>
                          <th className="px-6 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Costo Lista</th>
                          <th className="px-6 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Descuento</th>
                          <th className="px-6 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">IVA</th>
                          <th className="px-6 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Costo Final (c/IVA)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(() => {
                          const query = plModalSearchQuery.toLowerCase().trim();
                          const filtered = inspectingItems.filter(item => {
                            const comp = products.find(p => p.sku === item.sku);
                            const nameMatch = comp ? comp.name.toLowerCase().includes(query) : false;
                            const skuMatch = item.sku.toLowerCase().includes(query);
                            return nameMatch || skuMatch;
                          });

                          if (filtered.length === 0) {
                            return (
                              <tr>
                                <td colSpan={6} className="py-12 text-center text-slate-400 text-xs font-bold uppercase tracking-wide">
                                  No se encontraron artículos en esta lista
                                </td>
                              </tr>
                            );
                          }

                          return filtered.map(item => {
                            const comp = products.find(p => p.sku === item.sku);
                            
                            // Format helper to preserve original list currency
                            const formatLocalPrice = (val: number) => {
                              if ((inspectingPriceList as any).currency === 'USD') {
                                return 'USD ' + val.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                              }
                              return formatPrice(val);
                            };

                            return (
                              <tr key={item.id} className="text-xs hover:bg-slate-50 transition-colors bg-white">
                                <td className="px-6 py-3 font-mono text-[10px] text-slate-500 font-bold">{item.sku}</td>
                                <td className="px-6 py-3 font-bold text-slate-700">{comp ? comp.name : <span className="text-slate-400 italic">Desconocido (No coincide en Catálogo)</span>}</td>
                                <td className="px-6 py-3 text-right font-mono text-slate-600 font-bold">{formatLocalPrice(item.list_cost)}</td>
                                <td className="px-6 py-3 text-center text-slate-600 font-bold">
                                  {item.discount ? (
                                    <span>
                                      {item.discount_type === 'percentage' ? `${item.discount}%` : formatLocalPrice(item.discount)}
                                    </span>
                                  ) : (
                                    <span className="text-slate-300">-</span>
                                  )}
                                </td>
                                <td className="px-6 py-3 text-center text-slate-500 font-semibold">{item.taxes || 21}%</td>
                                <td className="px-6 py-3 text-right font-bold text-brand-600 font-mono">{formatLocalPrice(item.final_cost)}</td>
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  )}
                </div>

                <div className="mt-6 flex justify-end shrink-0">
                  <Button type="button" onClick={() => setInspectingPriceList(null)} className="rounded-xl px-6 py-3 font-bold text-xs uppercase tracking-wider">
                    Cerrar
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUBTAB: MAKE VS BUY & SUPPLIER COMPARISON */}
      {activeSubTab === 'make_vs_buy' && (
        <div className="space-y-6">
          {/* Header Card */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm gap-4">
            <div className="min-w-0 flex-1">
              <h3 className="font-black text-slate-900 text-sm">Análisis de Costos y Decisiones de Suministro</h3>
              <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                Tablero estratégico para decidir si conviene fabricar o comprar (Make vs. Buy) y comparar precios de proveedores vigentes.
              </p>
            </div>
            
            <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200/40 shrink-0">
              <button
                type="button"
                onClick={() => setMakeVsBuySubTab('make_vs_buy_kpis')}
                className={`py-1.5 px-3.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                  makeVsBuySubTab === 'make_vs_buy_kpis' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Scale className="w-3.5 h-3.5" /> Make vs. Buy
              </button>
              <button
                type="button"
                onClick={() => {
                  setMakeVsBuySubTab('supplier_comparison');
                  if (products.length > 0 && !compareProductId) {
                    const firstInsumo = products.find(p => p.is_insumo || p.category === 'Insumos' || p.category === 'Materia Prima' || p.category?.toLowerCase().includes('tanque'));
                    if (firstInsumo) {
                      setCompareProductId(firstInsumo.id);
                      fetchSupplierComparison(firstInsumo.id);
                    }
                  }
                }}
                className={`py-1.5 px-3.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                  makeVsBuySubTab === 'supplier_comparison' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5" /> Comparador de Proveedores
              </button>
            </div>
          </div>

          {/* TAB 1: MAKE VS BUY ANALYSIS */}
          {makeVsBuySubTab === 'make_vs_buy_kpis' && (() => {
            // Filter products that are comprado and have a BOM
            const boughtWithBOM = products.filter(p => p.production_type === 'comprado' && allBoms.some(b => b.parent_product_id === p.id));
            
            const convenientesFabricar = boughtWithBOM.filter(p => {
              const simCost = getSimulatedBomCost(p.id);
              return simCost < (p.cost_price || 0);
            });
            
            const convenientesComprar = boughtWithBOM.filter(p => {
              const simCost = getSimulatedBomCost(p.id);
              return simCost >= (p.cost_price || 0);
            });

            const maxAhorroPotencial = boughtWithBOM.reduce((sum, p) => {
              const simCost = getSimulatedBomCost(p.id);
              const diff = (p.cost_price || 0) - simCost;
              return diff > 0 ? sum + diff : sum;
            }, 0);

            return (
              <div className="space-y-6">
                {/* KPI Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-brand-50 text-brand-600 rounded-xl">
                      <ClipboardList className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Productos Analizados</span>
                      <span className="text-xl font-black text-slate-800 block">{boughtWithBOM.length}</span>
                    </div>
                  </div>

                  <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                      <Scale className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Conviene Fabricar</span>
                      <span className="text-xl font-black text-emerald-600 block">{convenientesFabricar.length}</span>
                    </div>
                  </div>

                  <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-slate-100 text-slate-500 rounded-xl">
                      <ShoppingBag className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Conviene Comprar</span>
                      <span className="text-xl font-black text-slate-700 block">{convenientesComprar.length}</span>
                    </div>
                  </div>

                  <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
                      <DollarSign className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Ahorro Unitario Máximo</span>
                      <span className="text-xl font-black text-amber-600 block">{formatPrice(maxAhorroPotencial)}</span>
                    </div>
                  </div>
                </div>

                {/* Table */}
                <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-slate-100">
                    <h4 className="font-black text-slate-900 text-xs uppercase tracking-wider">Ranking de Ahorro y Oportunidad de Fabricación propia</h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-150 bg-slate-50/50">
                          <th className="py-3 px-6 text-[9px] font-black text-slate-400 uppercase tracking-widest">Producto</th>
                          <th className="py-3 px-6 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Costo de Compra</th>
                          <th className="py-3 px-6 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Costo Fab. Simulado</th>
                          <th className="py-3 px-6 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Diferencia / Ahorro</th>
                          <th className="py-3 px-6 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Conclusión</th>
                          <th className="py-3 px-6 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {boughtWithBOM.map(p => {
                          const purchaseCost = p.cost_price || 0;
                          const simCost = getSimulatedBomCost(p.id);
                          const diff = purchaseCost - simCost;
                          const pct = purchaseCost > 0 ? (diff / purchaseCost) * 100 : 0;
                          const conviene = diff > 0;

                          return (
                            <tr key={p.id} className="text-xs hover:bg-slate-50/40">
                              <td className="py-4 px-6">
                                <span className="font-bold text-slate-800 block">{p.name}</span>
                                <span className="text-[10px] text-slate-450 font-mono block">SKU: {p.sku || '-'} | {p.category}</span>
                              </td>
                              <td className="py-4 px-6 text-right font-mono font-bold text-slate-700">
                                {formatPrice(purchaseCost)}
                              </td>
                              <td className="py-4 px-6 text-right font-mono font-bold text-slate-700">
                                {formatPrice(simCost)}
                              </td>
                              <td className={`py-4 px-6 text-right font-mono font-black ${
                                conviene ? 'text-emerald-600' : 'text-slate-500'
                              }`}>
                                {conviene ? '+' : ''}{formatPrice(diff)} ({pct.toFixed(1)}%)
                              </td>
                              <td className="py-4 px-6 text-center">
                                <span className={`inline-block text-[9px] font-black uppercase px-2 py-0.5 rounded shadow-sm border ${
                                  conviene ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-100 text-slate-600 border-slate-200/50'
                                }`}>
                                  {conviene ? 'Conviene Fabricar' : 'Conviene Comprar'}
                                </span>
                              </td>
                              <td className="py-4 px-6 text-center">
                                <div className="inline-flex gap-2">
                                  <button
                                    onClick={() => {
                                      setSelectedBomProductId(p.id);
                                      setBomFilterType('comprado');
                                      setActiveSubTab('boms');
                                      fetchBom(p.id);
                                    }}
                                    className="px-2.5 py-1.5 border border-slate-200 hover:border-brand-500 hover:text-brand-600 font-bold text-[10px] uppercase rounded-lg transition-colors cursor-pointer"
                                  >
                                    Ver Receta
                                  </button>
                                  <button
                                    onClick={() => handlePromoteToFabricado(p.id)}
                                    className="px-2.5 py-1.5 bg-brand-600 hover:bg-brand-700 text-white font-bold text-[10px] uppercase rounded-lg transition-colors cursor-pointer"
                                  >
                                    Cambiar a Fabricado
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        {boughtWithBOM.length === 0 && (
                          <tr>
                            <td colSpan={6} className="py-12 px-6 text-center text-slate-400 text-xs font-semibold">
                              No hay productos comprados con recetas (BOM) configuradas para simulación. 
                              Crea recetas en la pestaña de Recetas (BOM) filtrando por "Comprados".
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* TAB 2: SUPPLIER PRICE COMPARISON */}
          {makeVsBuySubTab === 'supplier_comparison' && (
            <div className="space-y-6">
              {/* Product Selection */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm space-y-4">
                <div className="max-w-xl space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Seleccionar Producto a Comparar</label>
                  <select
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 cursor-pointer focus:ring-4 focus:ring-brand-500/10 outline-none"
                    value={compareProductId}
                    onChange={e => {
                      setCompareProductId(e.target.value);
                      fetchSupplierComparison(e.target.value);
                    }}
                  >
                    <option value="">-- Seleccionar --</option>
                    {products
                      .filter(p => !p.is_generic)
                      .map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name} {p.sku ? `(${p.sku})` : ''} - [{p.production_type === 'comprado' ? 'Comprado' : 'Fabricado'}]
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {compareProductId ? (
                <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                    <h4 className="font-black text-slate-900 text-xs uppercase tracking-wider">
                      Proveedores en Listas de Precios Activas
                    </h4>
                    {loadingComparison && <Loader2 className="w-4 h-4 text-brand-600 animate-spin" />}
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-150 bg-slate-50/50">
                          <th className="py-3 px-6 text-[9px] font-black text-slate-400 uppercase tracking-widest">Proveedor</th>
                          <th className="py-3 px-6 text-[9px] font-black text-slate-400 uppercase tracking-widest">Identificador Lista</th>
                          <th className="py-3 px-6 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Costo Lista</th>
                          <th className="py-3 px-6 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Descuento</th>
                          <th className="py-3 px-6 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Costo Neto (Base)</th>
                          <th className="py-3 px-6 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Costo Final (c/IVA)</th>
                          <th className="py-3 px-6 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Estado / Relación</th>
                          <th className="py-3 px-6 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {supplierComparisonItems.map((item, idx) => {
                          const isCheapest = idx === 0;
                          const differencePct = idx > 0 ? ((item.netCost - supplierComparisonItems[0].netCost) / supplierComparisonItems[0].netCost) * 100 : 0;
                          const currentRelation = relations.find(r => r.product_id === compareProductId && r.supplier_id === item.supplierId);
                          const isPrimary = currentRelation?.is_primary || false;

                          return (
                            <tr key={item.id} className="text-xs hover:bg-slate-50/40">
                              <td className="py-4 px-6">
                                <span className="font-bold text-slate-800 block">{item.supplierName}</span>
                                {item.validFrom && <span className="text-[9px] text-slate-400 block mt-0.5">Vence/Vigente desde: {formatDateDDMMYYYY(item.validFrom)}</span>}
                              </td>
                              <td className="py-4 px-6 text-slate-500 font-semibold">{item.listNumber}</td>
                              <td className="py-4 px-6 text-right font-mono text-slate-600">{formatPrice(item.list_cost)}</td>
                              <td className="py-4 px-6 text-right font-mono text-slate-600">
                                {item.discount > 0 ? (
                                  <span>{item.discount_type === 'percentage' ? `${item.discount}%` : formatPrice(item.discount)}</span>
                                ) : (
                                  <span className="text-slate-350">-</span>
                                )}
                              </td>
                              <td className={`py-4 px-6 text-right font-mono font-black ${
                                isCheapest ? 'text-emerald-600 text-sm' : 'text-slate-850'
                              }`}>
                                {formatPrice(item.netCost)}
                                {idx > 0 && (
                                  <span className="block text-[8px] text-red-500 font-extrabold mt-0.5">
                                    +{differencePct.toFixed(1)}%
                                  </span>
                                )}
                              </td>
                              <td className="py-4 px-6 text-right font-mono text-slate-500">{formatPrice(item.totalCost)}</td>
                              <td className="py-4 px-6 text-center">
                                <div className="flex flex-col items-center gap-1">
                                  {isCheapest && (
                                    <span className="bg-emerald-50 text-emerald-700 text-[8px] font-black px-2 py-0.5 rounded border border-emerald-100 shadow-sm uppercase tracking-wide">
                                      Más Económico
                                    </span>
                                  )}
                                  {isPrimary ? (
                                    <span className="bg-brand-50 text-brand-700 text-[8px] font-black px-2 py-0.5 rounded border border-brand-100 shadow-sm uppercase tracking-wide">
                                      Proveedor Principal
                                    </span>
                                  ) : (
                                    <span className="text-[9px] text-slate-400 font-semibold">Vinculado</span>
                                  )}
                                </div>
                              </td>
                              <td className="py-4 px-6 text-center">
                                {!isPrimary ? (
                                  <button
                                    onClick={() => handleSetPrimarySupplier(compareProductId, item.supplierId)}
                                    className="px-2.5 py-1.5 border border-slate-200 hover:border-brand-500 hover:text-brand-600 font-bold text-[10px] uppercase rounded-lg transition-colors cursor-pointer"
                                  >
                                    Hacer Principal
                                  </button>
                                ) : (
                                  <span className="text-[10px] text-slate-400 font-bold uppercase">Actual Principal</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        {supplierComparisonItems.length === 0 && (
                          <tr>
                            <td colSpan={8} className="py-12 px-6 text-center text-slate-400 text-xs font-semibold">
                              No se encontraron registros de este SKU en las listas de precios vigentes de ningún proveedor. 
                              Asegúrate de que el SKU coincida y que las listas estén marcadas como activas.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="bg-white p-12 text-center text-slate-400 text-xs border border-slate-200/60 rounded-2xl shadow-sm">
                  Selecciona un producto arriba para comparar precios vigentes entre diferentes proveedores.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* SUBTAB: BOM EXPLORER (TREE, COMPARE, WHERE-USED) */}
      {activeSubTab === 'bom_explorer' && (() => {
        const productsWithBom = products.filter(p => allBoms.some(b => b.parent_product_id === p.id));
        const activeExplorerProduct = products.find(p => p.id === explorerProductId) || productsWithBom[0];

        const getComponentCategoryGroup = (compProduct: any) => {
          if (!compProduct) return "Otros Componentes";
          const cat = (compProduct.category || "").toLowerCase();
          const name = (compProduct.name || "").toLowerCase();
          if (cat.includes("resina") || cat.includes("materia prima") || name.includes("recuperado") || name.includes("virgen") || name.includes("polietileno") || name.includes("material")) {
            return "Resinas";
          }
          if (cat.includes("accesorio") || cat.includes("conexion") || name.includes("brida") || name.includes("descompresor") || name.includes("tapa") || name.includes("acople") || name.includes("aro")) {
            return "Accesorios y Conexiones";
          }
          if (cat.includes("etiqueta") || cat.includes("embalaje") || cat.includes("packaging") || name.includes("etiqueta") || name.includes("garant") || name.includes("bolsa")) {
            return "Etiquetas y Embalaje";
          }
          return "Otros Componentes";
        };

        const activeProductBoms = activeExplorerProduct ? allBoms.filter(b => b.parent_product_id === activeExplorerProduct.id) : [];
        
        const groups: Record<string, any[]> = {
          'Resinas': [],
          'Accesorios y Conexiones': [],
          'Etiquetas y Embalaje': [],
          'Otros Componentes': []
        };

        activeProductBoms.forEach(bom => {
          const compProduct = products.find(p => p.id === bom.component_product_id);
          const groupName = getComponentCategoryGroup(compProduct);
          groups[groupName].push({
            ...bom,
            component: compProduct
          });
        });

        const groupCosts: Record<string, number> = {};
        let totalMaterialCost = 0;
        Object.keys(groups).forEach(groupName => {
          const cost = groups[groupName].reduce((sum, item) => {
            const unitCost = item.component?.cost_price || 0;
            const qty = Number(item.quantity) || 0;
            const waste = Number(item.waste_percentage) || 0;
            return sum + (unitCost * qty * (1 + waste / 100));
          }, 0);
          groupCosts[groupName] = cost;
          totalMaterialCost += cost;
        });

        const labor = activeExplorerProduct?.labor_cost || 0;
        const overhead = activeExplorerProduct?.overhead_cost || 0;
        const totalSimulatedCost = totalMaterialCost + labor + overhead;

        const selectedInsumo = products.find(p => p.id === reverseInsumoId);
        const usages = allBoms.filter(b => b.component_product_id === reverseInsumoId);

        const prodA = products.find(p => p.id === compareProductAId);
        const prodB = products.find(p => p.id === compareProductBId);
        const bomsA = allBoms.filter(b => b.parent_product_id === compareProductAId);
        const bomsB = allBoms.filter(b => b.parent_product_id === compareProductBId);

        const simCostA = compareProductAId ? getSimulatedBomCost(compareProductAId) : 0;
        const simCostB = compareProductBId ? getSimulatedBomCost(compareProductBId) : 0;

        const unifiedCompIds = Array.from(new Set([
          ...bomsA.map(b => b.component_product_id),
          ...bomsB.map(b => b.component_product_id)
        ]));

        return (
          <div className="space-y-6">
            {/* Header / Sub-tabs card */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm gap-4">
              <div>
                <h3 className="font-black text-slate-900 text-sm">Explorador y Analizador de Composición (BOM)</h3>
                <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                  Visualiza de forma clara la estructura de costos de tus productos, compara recetas y audita dónde se consumen las materias primas.
                </p>
              </div>
              
              <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200/40 shrink-0">
                <button
                  type="button"
                  onClick={() => setBomExplorerTab('tree')}
                  className={`py-1.5 px-3.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                    bomExplorerTab === 'tree' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" /> Árbol de Composición
                </button>
                <button
                  type="button"
                  onClick={() => setBomExplorerTab('compare')}
                  className={`py-1.5 px-3.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                    bomExplorerTab === 'compare' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Columns className="w-3.5 h-3.5" /> Comparar Fórmulas
                </button>
                <button
                  type="button"
                  onClick={() => setBomExplorerTab('where_used')}
                  className={`py-1.5 px-3.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                    bomExplorerTab === 'where_used' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <GitPullRequest className="w-3.5 h-3.5" /> Dónde se usa (Inverso)
                </button>
              </div>
            </div>

            {/* TAB 1: TREE VIEW */}
            {bomExplorerTab === 'tree' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Select Panel */}
                <div className="lg:col-span-1 space-y-4">
                  <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm space-y-4">
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Producto Fabricado o Ensamblado</label>
                      <select
                        className="w-full px-3 py-2.5 bg-slate-50 hover:bg-slate-100/50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 cursor-pointer focus:ring-4 focus:ring-brand-500/10 outline-none transition-all"
                        value={explorerProductId}
                        onChange={e => setExplorerProductId(e.target.value)}
                      >
                        <option value="">-- Seleccionar Producto --</option>
                        {productsWithBom.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name} {p.sku ? `(${p.sku})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    {activeExplorerProduct && (
                      <div className="pt-4 border-t border-slate-100 space-y-3">
                        <h4 className="text-[11px] font-black text-slate-500 uppercase tracking-wider">Resumen de Costo de Receta</h4>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                            <span className="text-[9px] font-semibold text-slate-400 block">Total Materiales</span>
                            <span className="font-mono font-bold text-slate-700 block mt-0.5">{formatPrice(totalMaterialCost)}</span>
                          </div>
                          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                            <span className="text-[9px] font-semibold text-slate-400 block">Mano de Obra</span>
                            <span className="font-mono font-bold text-slate-700 block mt-0.5">{formatPrice(labor)}</span>
                          </div>
                          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                            <span className="text-[9px] font-semibold text-slate-400 block">Gastos Generales</span>
                            <span className="font-mono font-bold text-slate-700 block mt-0.5">{formatPrice(overhead)}</span>
                          </div>
                          <div className="bg-brand-50/50 p-2.5 rounded-lg border border-brand-100/40">
                            <span className="text-[9px] font-bold text-brand-650 block">Costo Simulado</span>
                            <span className="font-mono font-black text-brand-600 block mt-0.5">{formatPrice(totalSimulatedCost)}</span>
                          </div>
                        </div>

                        {activeExplorerProduct.price > 0 && (
                          <div className="bg-emerald-50/40 p-3 rounded-xl border border-emerald-100/50 flex justify-between items-center text-xs">
                            <div>
                              <span className="text-[9px] font-semibold text-emerald-600 block">Margen sobre Costo Simulado</span>
                              <span className="font-black text-emerald-700 block mt-0.5">
                                {(((activeExplorerProduct.price - totalSimulatedCost) / activeExplorerProduct.price) * 100).toFixed(1)}%
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="text-[9px] font-semibold text-slate-400 block">Precio Venta (Lista)</span>
                              <span className="font-mono font-bold text-slate-700 block mt-0.5">{formatPrice(activeExplorerProduct.price)}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Tree View Panel */}
                <div className="lg:col-span-2">
                  {activeExplorerProduct ? (
                    <div className="bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm space-y-4">
                      {/* Tree Root */}
                      <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                        <div className="p-2 bg-brand-50 text-brand-600 rounded-xl">
                          <Layers className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-black text-slate-800 text-sm">{activeExplorerProduct.name}</h4>
                          <span className="text-[10px] font-mono text-slate-400 font-bold block">
                            SKU: {activeExplorerProduct.sku || '-'} | Tipo: {activeExplorerProduct.production_type}
                          </span>
                        </div>
                      </div>

                      {/* Tree Body */}
                      <div className="space-y-3">
                        {Object.keys(groups).map(groupName => {
                          const isExpanded = explorerExpandedCategories[groupName] ?? true;
                          const groupItems = groups[groupName];
                          const groupCost = groupCosts[groupName] || 0;
                          const groupPercentage = totalSimulatedCost > 0 ? (groupCost / totalSimulatedCost) * 100 : 0;

                          if (groupItems.length === 0 && groupName !== 'Otros Componentes') return null;

                          return (
                            <div key={groupName} className="border border-slate-150 rounded-xl overflow-hidden transition-all duration-300">
                              {/* Category Header */}
                              <button
                                type="button"
                                onClick={() => setExplorerExpandedCategories(prev => ({ ...prev, [groupName]: !isExpanded }))}
                                className="w-full flex items-center justify-between p-3.5 bg-slate-50/60 hover:bg-slate-50 transition-all text-left outline-none cursor-pointer border-b border-slate-100"
                              >
                                <div className="flex items-center gap-2">
                                  {isExpanded ? (
                                    <ChevronDown className="w-4 h-4 text-slate-500 transition-transform duration-300" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4 text-slate-500 transition-transform duration-300" />
                                  )}
                                  {isExpanded ? (
                                    <FolderOpen className="w-4 h-4 text-brand-500" />
                                  ) : (
                                    <Folder className="w-4 h-4 text-brand-500" />
                                  )}
                                  <span className="font-extrabold text-slate-700 text-xs tracking-tight">{groupName}</span>
                                  <span className="bg-slate-100 text-[9px] px-1.5 py-0.5 rounded-full font-bold text-slate-500 border border-slate-200">
                                    {groupItems.length} {groupItems.length === 1 ? 'ítem' : 'ítems'}
                                  </span>
                                </div>
                                
                                <div className="flex items-center gap-4">
                                  <div className="text-right">
                                    <span className="font-mono font-bold text-xs text-slate-700 block">{formatPrice(groupCost)}</span>
                                    <span className="text-[9px] text-slate-400 font-semibold block">{groupPercentage.toFixed(1)}% del costo</span>
                                  </div>
                                </div>
                              </button>

                              {/* Category Children */}
                              {isExpanded && (
                                <div className="divide-y divide-slate-100 bg-white">
                                  {groupItems.map(item => {
                                    const qty = Number(item.quantity);
                                    const waste = Number(item.waste_percentage || 0);
                                    const effectiveQty = qty * (1 + waste / 100);
                                    const costPrice = item.component?.cost_price || 0;
                                    const totalItemCost = effectiveQty * costPrice;
                                    const itemPercentage = totalSimulatedCost > 0 ? (totalItemCost / totalSimulatedCost) * 100 : 0;

                                    return (
                                      <div key={item.id} className="flex items-center justify-between p-3.5 pl-9 hover:bg-slate-50/30 text-xs">
                                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                          <div className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
                                          <div className="min-w-0">
                                            <span className="font-bold text-slate-700 truncate block">{item.component?.name || 'Componente Desconocido'}</span>
                                            <span className="text-[10px] text-slate-400 block font-mono">
                                              SKU: {item.component?.sku || '-'} | Costo base: {formatPrice(costPrice)}
                                            </span>
                                          </div>
                                        </div>

                                        <div className="flex items-center gap-6 shrink-0">
                                          <div className="text-right">
                                            <span className="font-bold text-slate-700 block">Cant: {qty.toFixed(2)}</span>
                                            {waste > 0 && <span className="text-[9px] text-amber-500 font-semibold block">Merma: +{waste}% ({effectiveQty.toFixed(2)})</span>}
                                          </div>
                                          
                                          <div className="text-right w-24">
                                            <span className="font-mono font-bold text-slate-800 block">{formatPrice(totalItemCost)}</span>
                                            <span className="text-[9px] text-slate-400 font-semibold block">{itemPercentage.toFixed(1)}%</span>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {/* Labor and Overhead Nodes */}
                        <div className="border border-slate-150 rounded-xl overflow-hidden">
                          <button
                            type="button"
                            onClick={() => setExplorerExpandedCategories(prev => ({ ...prev, 'Costos de Fabricación': !(prev['Costos de Fabricación'] ?? true) }))}
                            className="w-full flex items-center justify-between p-3.5 bg-slate-50/60 hover:bg-slate-50 transition-all text-left outline-none cursor-pointer border-b border-slate-100"
                          >
                            <div className="flex items-center gap-2">
                              {(explorerExpandedCategories['Costos de Fabricación'] ?? true) ? (
                                <ChevronDown className="w-4 h-4 text-slate-500" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-slate-500" />
                              )}
                              <FolderOpen className="w-4 h-4 text-emerald-500" />
                              <span className="font-extrabold text-slate-700 text-xs tracking-tight">Costos Operativos de Fabricación</span>
                            </div>
                            <div className="text-right">
                              <span className="font-mono font-bold text-xs text-slate-700 block">{formatPrice(labor + overhead)}</span>
                              <span className="text-[9px] text-slate-400 font-semibold block">
                                {(totalSimulatedCost > 0 ? ((labor + overhead) / totalSimulatedCost) * 100 : 0).toFixed(1)}% del costo
                              </span>
                            </div>
                          </button>

                          {(explorerExpandedCategories['Costos de Fabricación'] ?? true) && (
                            <div className="divide-y divide-slate-100 bg-white">
                              <div className="flex items-center justify-between p-3.5 pl-9 hover:bg-slate-50/30 text-xs">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                  <div>
                                    <span className="font-bold text-slate-700 block">Mano de Obra Directa</span>
                                    <span className="text-[10px] text-slate-400 block">Costo de personal y operarios</span>
                                  </div>
                                </div>
                                <div className="text-right w-24 shrink-0">
                                  <span className="font-mono font-bold text-slate-800 block">{formatPrice(labor)}</span>
                                  <span className="text-[9px] text-slate-400 font-semibold block">
                                    {(totalSimulatedCost > 0 ? (labor / totalSimulatedCost) * 100 : 0).toFixed(1)}%
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center justify-between p-3.5 pl-9 hover:bg-slate-50/30 text-xs">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                  <div>
                                    <span className="font-bold text-slate-700 block">Gastos Generales (Overhead)</span>
                                    <span className="text-[10px] text-slate-400 block">Energía, amortizaciones y fijos</span>
                                  </div>
                                </div>
                                <div className="text-right w-24 shrink-0">
                                  <span className="font-mono font-bold text-slate-800 block">{formatPrice(overhead)}</span>
                                  <span className="text-[9px] text-slate-400 font-semibold block">
                                    {(totalSimulatedCost > 0 ? (overhead / totalSimulatedCost) * 100 : 0).toFixed(1)}%
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white p-12 text-center text-slate-400 text-xs border border-slate-200/60 rounded-2xl shadow-sm">
                      Selecciona un producto en el panel de la izquierda para comenzar a explorar su receta de fabricación en árbol.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: SIDE BY SIDE COMPARATOR */}
            {bomExplorerTab === 'compare' && (
              <div className="space-y-6">
                {/* Selector Card */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Producto A (Referencia)</label>
                      <select
                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 cursor-pointer focus:ring-4 focus:ring-brand-500/10 outline-none"
                        value={compareProductAId}
                        onChange={e => setCompareProductAId(e.target.value)}
                      >
                        <option value="">-- Seleccionar Producto A --</option>
                        {productsWithBom.map(p => (
                          <option key={p.id} value={p.id} disabled={p.id === compareProductBId}>
                            {p.name} {p.sku ? `(${p.sku})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Producto B (Comparativa)</label>
                      <select
                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 cursor-pointer focus:ring-4 focus:ring-brand-500/10 outline-none"
                        value={compareProductBId}
                        onChange={e => setCompareProductBId(e.target.value)}
                      >
                        <option value="">-- Seleccionar Producto B --</option>
                        {productsWithBom.map(p => (
                          <option key={p.id} value={p.id} disabled={p.id === compareProductAId}>
                            {p.name} {p.sku ? `(${p.sku})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {prodA && prodB ? (
                  <div className="space-y-6">
                    {/* KPIs Comparison row */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Product A Quick Summary */}
                      <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm flex flex-col justify-between">
                        <div>
                          <span className="text-[9px] font-black text-brand-600 uppercase tracking-wider block">Producto A: {prodA.name}</span>
                          <span className="text-xl font-mono font-black text-slate-800 mt-2 block">{formatPrice(simCostA)}</span>
                          <span className="text-[10px] text-slate-400 font-semibold mt-1 block">Costo total simulado</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-100 text-[10px]">
                          <div>
                            <span className="text-slate-400 font-semibold block">Materiales:</span>
                            <span className="font-bold text-slate-700">{formatPrice(simCostA - (prodA.labor_cost || 0) - (prodA.overhead_cost || 0))}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 font-semibold block">Mano de Obra:</span>
                            <span className="font-bold text-slate-700">{formatPrice(prodA.labor_cost || 0)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Cost Delta Card */}
                      <div className="bg-slate-900 text-white p-5 rounded-2xl shadow-md flex flex-col justify-between items-center text-center">
                        <span className="text-[9px] font-black text-slate-350 uppercase tracking-widest block">Diferencia de Costos (B vs. A)</span>
                        <div className="my-2">
                          <span className={`text-2xl font-black ${
                            simCostB - simCostA > 0 ? 'text-rose-400' : 'text-emerald-400'
                          }`}>
                            {simCostB - simCostA > 0 ? '+' : ''}{formatPrice(simCostB - simCostA)}
                          </span>
                          <span className="block text-[10px] text-slate-300 font-semibold mt-0.5">
                            {simCostA > 0 ? `${(((simCostB - simCostA) / simCostA) * 100).toFixed(1)}%` : '-'}
                          </span>
                        </div>
                        <p className="text-[9px] text-slate-350 leading-relaxed font-semibold">
                          {simCostB - simCostA > 0 
                            ? "El Producto B es más caro de fabricar que el Producto A debido a mayor composición."
                            : "El Producto B representa una alternativa más económica en insumos o mano de obra."
                          }
                        </p>
                      </div>

                      {/* Product B Quick Summary */}
                      <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm flex flex-col justify-between">
                        <div>
                          <span className="text-[9px] font-black text-brand-600 uppercase tracking-wider block">Producto B: {prodB.name}</span>
                          <span className="text-xl font-mono font-black text-slate-800 mt-2 block">{formatPrice(simCostB)}</span>
                          <span className="text-[10px] text-slate-400 font-semibold mt-1 block">Costo total simulado</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-100 text-[10px]">
                          <div>
                            <span className="text-slate-400 font-semibold block">Materiales:</span>
                            <span className="font-bold text-slate-700">{formatPrice(simCostB - (prodB.labor_cost || 0) - (prodB.overhead_cost || 0))}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 font-semibold block">Mano de Obra:</span>
                            <span className="font-bold text-slate-700">{formatPrice(prodB.labor_cost || 0)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Comparison Table */}
                    <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
                      <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                        <h4 className="font-black text-slate-900 text-xs uppercase tracking-wider">
                          Discrepancias e Insumos en Recetas
                        </h4>
                        <div className="flex gap-4 text-[9px] font-bold">
                          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-rose-50 border border-rose-200"></span> Insumo ausente</span>
                          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-amber-50 border border-amber-200"></span> Cantidades distintas</span>
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-slate-150 bg-slate-50/50">
                              <th className="py-3 px-6 text-[9px] font-black text-slate-400 uppercase tracking-widest w-1/3">Insumo</th>
                              <th className="py-3 px-4 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Cant. Producto A</th>
                              <th className="py-3 px-4 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Costo A</th>
                              <th className="py-3 px-4 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Cant. Producto B</th>
                              <th className="py-3 px-4 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Costo B</th>
                              <th className="py-3 px-4 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Diferencia Costo</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {unifiedCompIds.map(compId => {
                              const comp = products.find(p => p.id === compId);
                              const linkA = bomsA.find(b => b.component_product_id === compId);
                              const linkB = bomsB.find(b => b.component_product_id === compId);

                              const hasA = !!linkA;
                              const hasB = !!linkB;

                              const qtyA = linkA ? Number(linkA.quantity) : 0;
                              const wasteA = linkA ? Number(linkA.waste_percentage || 0) : 0;
                              const effectiveQtyA = qtyA * (1 + wasteA / 100);

                              const qtyB = linkB ? Number(linkB.quantity) : 0;
                              const wasteB = linkB ? Number(linkB.waste_percentage || 0) : 0;
                              const effectiveQtyB = qtyB * (1 + wasteB / 100);

                              const unitCost = comp?.cost_price || 0;

                              const costA = hasA ? effectiveQtyA * unitCost : 0;
                              const costB = hasB ? effectiveQtyB * unitCost : 0;
                              const costDiff = costB - costA;

                              let rowBg = "";

                              if (!hasA || !hasB) {
                                rowBg = "bg-rose-50/40 hover:bg-rose-50/60";
                              } else if (qtyA !== qtyB || wasteA !== wasteB) {
                                rowBg = "bg-amber-50/40 hover:bg-amber-50/60";
                              }

                              return (
                                <tr key={compId} className={`text-xs ${rowBg} transition-colors`}>
                                  <td className="py-3.5 px-6">
                                    <span className="font-bold text-slate-700 block">{comp?.name || 'Insumo Desconocido'}</span>
                                    <span className="text-[9px] text-slate-450 font-mono block">
                                      SKU: {comp?.sku || '-'} | Costo Unitario: {formatPrice(unitCost)}
                                    </span>
                                  </td>
                                  
                                  <td className="py-3.5 px-4 text-right font-semibold text-slate-600">
                                    {hasA ? (
                                      <span>
                                        {qtyA.toFixed(2)}
                                        {wasteA > 0 && <span className="text-[9px] text-slate-400 block font-normal">+{wasteA}% merma</span>}
                                      </span>
                                    ) : (
                                      <span className="text-rose-650 font-extrabold">Ausente</span>
                                    )}
                                  </td>
                                  <td className="py-3.5 px-4 text-right font-mono text-slate-650">
                                    {hasA ? formatPrice(costA) : '$0.00'}
                                  </td>

                                  <td className="py-3.5 px-4 text-right font-semibold text-slate-600">
                                    {hasB ? (
                                      <span>
                                        {qtyB.toFixed(2)}
                                        {wasteB > 0 && <span className="text-[9px] text-slate-400 block font-normal">+{wasteB}% merma</span>}
                                      </span>
                                    ) : (
                                      <span className="text-rose-650 font-extrabold">Ausente</span>
                                    )}
                                  </td>
                                  <td className="py-3.5 px-4 text-right font-mono text-slate-650">
                                    {hasB ? formatPrice(costB) : '$0.00'}
                                  </td>

                                  <td className={`py-3.5 px-4 text-right font-mono font-bold ${
                                    costDiff > 0 ? 'text-rose-650' : costDiff < 0 ? 'text-emerald-650' : 'text-slate-400'
                                  }`}>
                                    {costDiff > 0 ? '+' : ''}{formatPrice(costDiff)}
                                  </td>
                                </tr>
                              );
                            })}

                            <tr className="bg-slate-50/50 font-semibold text-xs">
                              <td className="py-3.5 px-6 font-bold text-slate-700">Mano de Obra Directa</td>
                              <td colSpan={2} className="py-3.5 px-4 text-right font-mono text-slate-650">{formatPrice(prodA.labor_cost || 0)}</td>
                              <td colSpan={2} className="py-3.5 px-4 text-right font-mono text-slate-650">{formatPrice(prodB.labor_cost || 0)}</td>
                              <td className={`py-3.5 px-4 text-right font-mono font-bold ${
                                ((prodB.labor_cost || 0) - (prodA.labor_cost || 0)) > 0 ? 'text-rose-650' : ((prodB.labor_cost || 0) - (prodA.labor_cost || 0)) < 0 ? 'text-emerald-650' : 'text-slate-400'
                              }`}>
                                {((prodB.labor_cost || 0) - (prodA.labor_cost || 0)) > 0 ? '+' : ''}{formatPrice((prodB.labor_cost || 0) - (prodA.labor_cost || 0))}
                              </td>
                            </tr>
                            <tr className="bg-slate-50/50 font-semibold text-xs">
                              <td className="py-3.5 px-6 font-bold text-slate-700">Gastos Generales (Overhead)</td>
                              <td colSpan={2} className="py-3.5 px-4 text-right font-mono text-slate-650">{formatPrice(prodA.overhead_cost || 0)}</td>
                              <td colSpan={2} className="py-3.5 px-4 text-right font-mono text-slate-650">{formatPrice(prodB.overhead_cost || 0)}</td>
                              <td className={`py-3.5 px-4 text-right font-mono font-bold ${
                                ((prodB.overhead_cost || 0) - (prodA.overhead_cost || 0)) > 0 ? 'text-rose-650' : ((prodB.overhead_cost || 0) - (prodA.overhead_cost || 0)) < 0 ? 'text-emerald-650' : 'text-slate-400'
                              }`}>
                                {((prodB.overhead_cost || 0) - (prodA.overhead_cost || 0)) > 0 ? '+' : ''}{formatPrice((prodB.overhead_cost || 0) - (prodA.overhead_cost || 0))}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white p-12 text-center text-slate-400 text-xs border border-slate-200/60 rounded-2xl shadow-sm">
                    Selecciona el Producto A y el Producto B en los selectores de arriba para ver la comparación detallada de sus componentes y costos asociados.
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: WHERE USED LOOKUP */}
            {bomExplorerTab === 'where_used' && (
              <div className="space-y-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm space-y-4">
                  <div className="max-w-xl space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Materia Prima / Insumo a Buscar</label>
                    <select
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 cursor-pointer focus:ring-4 focus:ring-brand-500/10 outline-none"
                      value={reverseInsumoId}
                      onChange={e => setReverseInsumoId(e.target.value)}
                    >
                      <option value="">-- Seleccionar Insumo --</option>
                      {products
                        .filter(p => allBoms.some(b => b.component_product_id === p.id))
                        .map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name} {p.sku ? `(${p.sku})` : ''} - [Costo: {formatPrice(p.cost_price || 0)}]
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                {selectedInsumo ? (
                  <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-100">
                      <h4 className="font-black text-slate-900 text-xs uppercase tracking-wider">
                        Productos Fabricados que consumen: <span className="text-brand-650 normal-case font-extrabold">{selectedInsumo.name}</span>
                      </h4>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-150 bg-slate-50/50">
                            <th className="py-3 px-6 text-[9px] font-black text-slate-400 uppercase tracking-widest">Producto Destino (Padre)</th>
                            <th className="py-3 px-6 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Tipo Producción</th>
                            <th className="py-3 px-6 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Cantidad de Insumo</th>
                            <th className="py-3 px-6 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Merma Configurada</th>
                            <th className="py-3 px-6 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Costo Insumo en Receta</th>
                            <th className="py-3 px-6 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Costo Simulado Total</th>
                            <th className="py-3 px-6 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">% Peso en Costo</th>
                            <th className="py-3 px-6 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Acciones</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {usages.map(usage => {
                            const parent = products.find(p => p.id === usage.parent_product_id);
                            if (!parent) return null;

                            const qty = Number(usage.quantity);
                            const waste = Number(usage.waste_percentage || 0);
                            const effectiveQty = qty * (1 + waste / 100);
                            const insumoCostPrice = selectedInsumo.cost_price || 0;
                            const inputContribution = effectiveQty * insumoCostPrice;

                            const parentSimCost = getSimulatedBomCost(parent.id);
                            const costPercentage = parentSimCost > 0 ? (inputContribution / parentSimCost) * 100 : 0;

                            return (
                              <tr key={usage.id} className="text-xs hover:bg-slate-50/40">
                                <td className="py-4 px-6">
                                  <span className="font-bold text-slate-800 block">{parent.name}</span>
                                  <span className="text-[10px] text-slate-450 block font-mono">SKU: {parent.sku || '-'} | {parent.category}</span>
                                </td>
                                <td className="py-4 px-6 text-center">
                                  <span className={`inline-block text-[9px] font-bold uppercase px-2 py-0.5 rounded shadow-sm border ${
                                    parent.production_type === 'fabricado' ? 'bg-indigo-50 text-indigo-750 border-indigo-100' : 'bg-blue-50 text-blue-700 border-blue-100'
                                  }`}>
                                    {parent.production_type}
                                  </span>
                                </td>
                                <td className="py-4 px-6 text-right font-mono font-bold text-slate-700">
                                  {qty.toFixed(2)}
                                </td>
                                <td className="py-4 px-6 text-right font-mono font-semibold text-slate-500">
                                  {waste > 0 ? `+${waste}%` : '-'}
                                </td>
                                <td className="py-4 px-6 text-right font-mono font-bold text-slate-700">
                                  {formatPrice(inputContribution)}
                                </td>
                                <td className="py-4 px-6 text-right font-mono text-slate-650">
                                  {formatPrice(parentSimCost)}
                                </td>
                                <td className="py-4 px-6 text-right font-mono font-black text-slate-850">
                                  {costPercentage.toFixed(1)}%
                                </td>
                                <td className="py-4 px-6 text-center">
                                  <button
                                    onClick={() => {
                                      setExplorerProductId(parent.id);
                                      setBomExplorerTab('tree');
                                    }}
                                    className="px-2.5 py-1.5 bg-brand-50 hover:bg-brand-100 hover:text-brand-650 text-brand-600 font-black text-[10px] uppercase rounded-lg transition-colors cursor-pointer border border-brand-150 shadow-sm"
                                  >
                                    Ver en Árbol
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                          {usages.length === 0 && (
                            <tr>
                              <td colSpan={8} className="py-12 px-6 text-center text-slate-400 text-xs font-semibold">
                                Este insumo no se utiliza actualmente en ninguna receta activa de productos fabricados.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white p-12 text-center text-slate-400 text-xs border border-slate-200/60 rounded-2xl shadow-sm">
                    Selecciona una materia prima o insumo arriba para ver en qué recetas se utiliza y qué porcentaje del costo de fabricación representa.
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
