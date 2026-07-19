"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Plus, Edit2, Trash2, Save, X, Image as ImageIcon, Search, Loader2, Upload, Settings, LogOut, CheckCircle2, Download, Menu, RefreshCw, Eye, EyeOff, AlertTriangle, FileText, Sparkles, Check, Coins } from "lucide-react";
import { cn, formatPrice } from "@/lib/utils";
import { Product } from "@/types";
import { supabase } from "@/lib/supabase";
import Image from "next/image";
import { ProductFormModal } from "@/components/ui/ProductFormModal";
import { LinkOrphanModal } from "@/components/ui/LinkOrphanModal";

export default function AdminPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [submittingType, setSubmittingType] = useState<'manual' | 'sheets' | null>(null);
  const [cleaningDuplicates, setCleaningDuplicates] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<{message: string, isError: boolean} | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  

  
  // Settings State
  const [aboutImageUrl, setAboutImageUrl] = useState('');
  const [settingsFile, setSettingsFile] = useState<File | null>(null);
  const [landingProductId, setLandingProductId] = useState('');
  const [landingCategories, setLandingCategories] = useState<string[]>([]);
  const [tanquesCategories, setTanquesCategories] = useState<string[]>([]);

  // Import State
  const [importData, setImportData] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);

  // Costs Import State
  const [costsImportData, setCostsImportData] = useState("");
  const [costsImportStatus, setCostsImportStatus] = useState<string | null>(null);
  const [costsImportErrors, setCostsImportErrors] = useState<string[]>([]);
  const [submittingCostsType, setSubmittingCostsType] = useState<'manual' | 'sheets' | null>(null);
  const [costsImportLogs, setCostsImportLogs] = useState<string[]>([]);
  const costsConsoleRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (costsConsoleRef.current) {
      costsConsoleRef.current.scrollTop = costsConsoleRef.current.scrollHeight;
    }
  }, [costsImportLogs]);

  // Form State
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);

  // Orphans State
  const [orphans, setOrphans] = useState<any[]>([]);
  const [loadingOrphans, setLoadingOrphans] = useState(false);
  const [orphanSearchTerm, setOrphanSearchTerm] = useState("");

  // Tab State
  const [activeTab, setActiveTab] = useState<'products' | 'import' | 'orphans' | 'settings' | 'profitability'>('products');

  // Profitability Analysis State
  const [profitabilitySuppliers, setProfitabilitySuppliers] = useState<any[]>([]);
  const [profitabilityRelations, setProfitabilityRelations] = useState<any[]>([]);
  const [profitabilityItems, setProfitabilityItems] = useState<any[]>([]);
  const [loadingProfitability, setLoadingProfitability] = useState(false);
  const [profitabilitySearch, setProfitabilitySearch] = useState("");
  const [profitabilityFilter, setProfitabilityFilter] = useState<'all' | 'missing_cost' | 'has_cost' | 'negative_margin'>('all');
  const [profitabilityActiveOnly, setProfitabilityActiveOnly] = useState(true);
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [editingPriceValue, setEditingPriceValue] = useState("");

  const fetchProfitabilityData = async () => {
    setLoadingProfitability(true);
    try {
      const [suppRes, relRes, plRes] = await Promise.all([
        supabase.from('suppliers').select('id, name'),
        supabase.from('product_supplier_relations').select('product_id, supplier_id, is_primary'),
        supabase.from('price_lists').select('id, supplier_id').eq('is_active', true)
      ]);

      if (suppRes.data) setProfitabilitySuppliers(suppRes.data);
      if (relRes.data) setProfitabilityRelations(relRes.data);

      if (plRes.data && plRes.data.length > 0) {
        const activeListIds = plRes.data.map(pl => pl.id);
        const { data: items, error: itemsErr } = await supabase
          .from('price_list_items')
          .select('price_list_id, sku, list_cost, final_cost, taxes')
          .in('price_list_id', activeListIds);
        
        if (items) setProfitabilityItems(items);
        if (itemsErr) console.error("Error loading price list items:", itemsErr);
      } else {
        setProfitabilityItems([]);
      }
    } catch (err) {
      console.error("Error fetching profitability data:", err);
    } finally {
      setLoadingProfitability(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'profitability') {
      fetchProfitabilityData();
    }
  }, [activeTab]);

  const saveQuickPrice = async (productId: string) => {
    const val = parseFloat(editingPriceValue.replace(/\./g, "").replace(",", "."));
    if (!isNaN(val)) {
      await handleQuickUpdate(productId, 'price', val);
    }
    setEditingPriceId(null);
  };

  // Link Orphan State
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [linkingOrphanName, setLinkingOrphanName] = useState("");
  const [linkingSkuCandidate, setLinkingSkuCandidate] = useState("");

  const handleOpenLinkModal = (name: string, skuCandidate: string) => {
    setLinkingOrphanName(name);
    setLinkingSkuCandidate(skuCandidate);
    setIsLinkModalOpen(true);
  };

  useEffect(() => {
    fetchProducts();
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase.from('site_settings').select('*').in('id', ['about_image_url', 'landing_hero_product_id', 'landing_categories', 'tanques_categories']);
      if (error) {
        console.warn("No se encontró configuración previa en Supabase:", error.message);
        return;
      }
      if (data) {
        const aboutImg = data.find(d => d.id === 'about_image_url');
        const heroProduct = data.find(d => d.id === 'landing_hero_product_id');
        const landingCats = data.find(d => d.id === 'landing_categories');
        const tanquesCats = data.find(d => d.id === 'tanques_categories');

        if (aboutImg) setAboutImageUrl(aboutImg.value);
        if (heroProduct) setLandingProductId(heroProduct.value);
        if (landingCats && landingCats.value) setLandingCategories(landingCats.value.split(',').filter(Boolean));
        if (tanquesCats && tanquesCats.value) setTanquesCategories(tanquesCats.value.split(',').filter(Boolean));
      }
    } catch (err) {
      console.error("Error cargando ajustes:", err);
    }
  };

  async function fetchProducts() {
    setLoading(true);
    let allProducts: any[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;
    
    try {
      while (hasMore) {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .order('created_at', { ascending: false })
          .range(page * pageSize, (page + 1) * pageSize - 1);
          
        if (error) throw error;
        if (data && data.length > 0) {
          allProducts = [...allProducts, ...data];
          page++;
          if (data.length < pageSize) {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      }
      setProducts(allProducts);
    } catch (err) {
      console.error("Error cargando productos:", err);
    } finally {
      setLoading(false);
    }
  }

  const handleOpenForm = (product?: Product) => {
    setEditingProduct(product || null);
    setIsFormOpen(true);
  };

  // Handle ?edit=ID parameter for deep-linking from catalog
  useEffect(() => {
    if (products.length > 0) {
      const urlParams = new URLSearchParams(window.location.search);
      const editId = urlParams.get('edit');
      if (editId) {
        const product = products.find(p => p.id === editId);
        if (product) {
          handleOpenForm(product);
          // Clean the URL without reloading
          const newUrl = window.location.pathname;
          window.history.replaceState({}, '', newUrl);
        }
      }
    }
  }, [products]);

  // Load orphans when activeTab changes to 'orphans'
  useEffect(() => {
    if (activeTab === 'orphans') {
      fetchOrphanProducts();
    }
  }, [activeTab]);


  // Actualización rápida inline (precio, categoría, destacado, liquidación)
  const handleQuickUpdate = async (productId: string, field: string, value: any) => {
    // Actualizar estado local inmediatamente
    setProducts(prev => prev.map(p => p.id === productId ? { ...p, [field]: value } : p));
    // Persistir en Supabase
    const { error } = await supabase.from('products').update({ [field]: value }).eq('id', productId);
    if (error) {
      alert('Error al actualizar: ' + error.message);
      fetchProducts(); // Revertir
    }
  };

  const handleSettingsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    let finalUrl = aboutImageUrl;

    try {
      if (settingsFile) {
        const fileExt = settingsFile.name.split('.').pop();
        const filePath = `settings/about-${Math.random()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from('product-images').upload(filePath, settingsFile);
        
        if (uploadError) {
          console.error("Error al subir imagen de fábrica:", uploadError);
          alert("Error al subir la imagen: " + uploadError.message);
          setSavingSettings(false);
          return;
        }

        const { data: publicUrlData } = supabase.storage.from('product-images').getPublicUrl(filePath);
        finalUrl = publicUrlData.publicUrl;
      }

      const { error } = await supabase.from('site_settings').upsert([
        { id: 'about_image_url', value: finalUrl },
        { id: 'landing_hero_product_id', value: landingProductId },
        { id: 'landing_categories', value: landingCategories.join(',') },
        { id: 'tanques_categories', value: tanquesCategories.join(',') },
      ]);
      
      if (error) {
        console.error("Error en upsert de site_settings:", error);
        alert("🚨 Error de Base de Datos:\n" + error.message);
      } else {
        setAboutImageUrl(finalUrl); 
        setSettingsFile(null); 
        alert("✅ ¡Configuración guardada con éxito!"); 
        fetchSettings();
      }
    } catch (err) {
      console.error("Error crítico en ajustes:", err);
      alert("Error inesperado en los ajustes.");
    } finally {
      setSavingSettings(false);
    }
  };

  const parseCSV = (csvText: string) => {
    const result: string[][] = [];
    let currentWord = '';
    let inQuotes = false;
    let currentRow: string[] = [];
    
    // Normalizamos saltos de línea por si viene de Windows (\r\n) -> (\n)
    const text = csvText.replace(/\r\n/g, '\n');
    
    // Autodetectar delimitador según primera línea
    const firstLine = text.split('\n')[0] || '';
    const delimiter = firstLine.includes(';') ? ';' : ',';
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (inQuotes) {
        if (char === '"' && nextChar === '"') {
          currentWord += '"';
          i++;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          currentWord += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === delimiter) {
          currentRow.push(currentWord.trim());
          currentWord = '';
        } else if (char === '\n') {
          currentRow.push(currentWord.trim());
          if (currentRow.length > 1 || currentRow[0] !== '') {
            result.push(currentRow);
          }
          currentRow = [];
          currentWord = '';
        } else {
          currentWord += char;
        }
      }
    }
    
    currentRow.push(currentWord.trim());
    if (currentRow.length > 1 || currentRow[0] !== '') {
      result.push(currentRow);
    }
    
    return result;
  };

  const processData = async (data: string) => {
    if (!data.trim()) {
      setSubmittingType(null);
      return;
    }
    setImportStatus("Procesando...");
    setImportErrors([]);
    
    const rows = parseCSV(data);
    let updatedCount = 0;
    let errors = 0;
    const errorMessages: string[] = [];

    // Pre-cargar SKUs para hacer match case-insensitive
    const { data: existingProducts } = await supabase.from('products').select('sku');
    const skuMap = new Map<string, string>(); // lowercase -> real case
    if (existingProducts) {
      existingProducts.forEach(p => {
        if (p.sku) skuMap.set(p.sku.toLowerCase().trim(), p.sku);
      });
    }

    for (const parts of rows) {
      if (!parts[0] || parts[0].toLowerCase().startsWith("sku")) continue; // Saltar cabecera
      if (parts.length < 2) continue;

      let sku = parts[0].trim();
      // Si el SKU existe pero con otras mayúsculas/minúsculas, usamos el original para no duplicar
      const realSku = skuMap.get(sku.toLowerCase());
      if (realSku) {
        sku = realSku;
      }

      // Si vienen exactamente 2 columnas, asumimos SKU y Precio
      if (parts.length === 2) {
        const priceStr = parts[1] || "0";
        const cleanStr = priceStr.replace(/[$\s]/g, ""); // Remover "$" y espacios
        let price = parseFloat(cleanStr.replace(/\./g, "").replace(",", "."));
        
        if (isNaN(price)) { 
          price = 0;
        }
        
        // Intentar actualizar primero
        const { error: updateError, data } = await supabase
          .from('products')
          .update({ price })
          .eq('sku', sku)
          .select();

        if (updateError) {
          errors++;
          errorMessages.push(`SKU ${sku}: ${updateError.message}`);
        } else if (!data || data.length === 0) {
          // No existe, crearlo como interno/oculto
          const upsertPayload = {
            sku,
            name: `[Interno] ${sku}`,
            price,
            category: 'Interno',
            image_url: '', // Sin imagen
            is_active: false // Inactivo por defecto al ser interno
          };
          const { error: insertError } = await supabase.from('products').insert(upsertPayload);
          if (insertError) {
             errors++;
             errorMessages.push(`SKU ${sku}: Error al crear (${insertError.message})`);
          } else {
             updatedCount++;
          }
        } else {
          updatedCount++;
        }

      } else {
        // Formato completo de 10 columnas, usamos UPSERT
        const upsertPayload: any = { sku };
        const name = parts[1] || `[Interno] ${sku}`;
        const priceStr = parts[2] || "0";
        const category = parts[3] || "Interno";
        const brand = parts[4] || "";
        const dimensions = parts[5] || "";
        const is_on_sale = parts[6] ? parts[6].toLowerCase() === 'true' : false;
        const is_featured = parts[7] ? parts[7].toLowerCase() === 'true' : false;
        const description = parts[8] || "";
        const image_url = parts[9] || "";
        
        const cleanStr = priceStr.replace(/[$\s]/g, "");
        let price = parseFloat(cleanStr.replace(/\./g, "").replace(",", "."));
        
        if (isNaN(price)) { 
          price = 0;
        }

        upsertPayload.name = name;
        upsertPayload.price = price;
        upsertPayload.category = category;
        upsertPayload.brand = brand;
        upsertPayload.dimensions = dimensions;
        upsertPayload.is_on_sale = is_on_sale;
        upsertPayload.is_featured = is_featured;
        upsertPayload.description = description;
        upsertPayload.image_url = image_url;

        const { error } = await supabase.from('products').upsert(upsertPayload, { onConflict: 'sku' });
        if (error) {
          errors++;
          errorMessages.push(`SKU ${sku}: ${error.message}`);
        } else {
          updatedCount++;
        }
      }
    }

    const errorDetails = errors > 0 ? ` Revisar los detalles abajo o descargar el log.` : "";
    setImportStatus(`Completado: ${updatedCount} actualizados, ${errors} errores.${errorDetails}`);
    setImportErrors(errorMessages);
    fetchProducts();
    setSubmittingType(null);
  };

  const handleGoogleSheetsSync = async () => {
    setSubmittingType('sheets');
    setImportStatus("Descargando planilla desde Google Sheets...");
    setImportErrors([]);
    try {
      const response = await fetch("https://docs.google.com/spreadsheets/d/1K3c_6SMScaTkSI3FMDnQPVyj-c7MSqQEoWW4q3mL3Jg/export?format=csv&gid=508601925");
      if (!response.ok) throw new Error("Error al descargar la planilla. Verificá que sea pública.");
      
      const csvText = await response.text();
      const rows = parseCSV(csvText);
      
      let syntheticCsv = "SKU,Precio\\n"; // Cabecera para que sea ignorada
      let count = 0;
      
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row[1] || row[1].toLowerCase() === "producto" || row[1].trim() === "") continue;
        // Columna B (1) es SKU/Nombre, Columna C (2) es Precio
        const sku = row[1].replace(/"/g, '""'); // Escapar comillas dobles
        const price = row[2] || "0";
        syntheticCsv += `"${sku}","${price}"\n`;
        count++;
      }
      
      if (count === 0) {
         setImportStatus("No se encontraron productos válidos en la planilla.");
         setSubmittingType(null);
         return;
      }
      
      setImportStatus(`Procesando ${count} productos desde Google Sheets...`);
      // Llamamos al processData enviándole este CSV sintético que armamos
      // Ya tiene exactamente 2 columnas (SKU y Precio)
      processData(syntheticCsv);
    } catch (e: any) {
      setImportStatus(`Error de sincronización: ${e.message}`);
      setSubmittingType(null);
    }
  };

  const normalizeProductName = (name: string): string => {
    if (!name) return "";
    return name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Remove accents
      .replace(/[^a-z0-9]/g, "")      // Remove all non-alphanumeric characters
      .trim();
  };

  const findProductMatch = (sheetName: string, dbProductsList: any[]) => {
    const normSheet = normalizeProductName(sheetName);
    
    // 1. Exact cleaned match
    let match = dbProductsList.find(p => normalizeProductName(p.name) === normSheet || (p.sku && normalizeProductName(p.sku) === normSheet));
    if (match) return match;

    // 2. Split by '-' and match parts
    const sheetParts = sheetName.split('-').map(p => p.trim());
    if (sheetParts.length > 1) {
      for (const part of sheetParts) {
        if (!part) continue;
        const normPart = normalizeProductName(part);
        match = dbProductsList.find(p => normalizeProductName(p.name) === normPart || (p.sku && normalizeProductName(p.sku) === normPart));
        if (match) return match;
      }
    }

    // 3. Fallback: Substring match
    match = dbProductsList.find(p => {
      const normDb = normalizeProductName(p.name);
      if (normDb.length > 10 && normSheet.length > 10) {
        return normSheet.includes(normDb) || normDb.includes(normSheet);
      }
      return false;
    });

    return match || null;
  };

  const processCostsData = async (data: string) => {
    if (!data.trim()) {
      setSubmittingCostsType(null);
      return;
    }
    setCostsImportStatus("Procesando costos...");
    setCostsImportErrors([]);
    setCostsImportLogs([]);

    const log = (msg: string) => {
      setCostsImportLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
    };

    try {
      log("Iniciando importación y sincronización de costos...");
      const rows = parseCSV(data);
      log(`Planilla parseada con éxito: ${rows.length} filas encontradas.`);
      let updatedCount = 0;
      let errors = 0;
      const errorMessages: string[] = [];

      // 1. Use loaded products
      log("Cargando catálogo de productos desde la base de datos...");
      const dbProducts = products;
      log(`  ✅ Catálogo cargado: ${dbProducts?.length || 0} productos.`);

      // 2. Fetch suppliers
      log("Cargando listado de proveedores...");
      const { data: dbSuppliers, error: errSupp } = await supabase.from('suppliers').select('id, name');
      if (errSupp) throw new Error(`Error en proveedores: ${errSupp.message}`);
      log(`  ✅ Proveedores cargados: ${dbSuppliers?.length || 0} proveedores.`);

      // 3. Fetch product-supplier relations
      log("Cargando relaciones de proveedores...");
      const { data: relations, error: errRel } = await supabase.from('product_supplier_relations').select('product_id, supplier_id, is_primary');
      if (errRel) throw new Error(`Error en relaciones: ${errRel.message}`);
      log(`  ✅ Relaciones cargadas: ${relations?.length || 0} registros.`);

      // 4. Fetch active price lists
      log("Cargando listas de precios activas...");
      const { data: priceLists, error: errPl } = await supabase.from('price_lists').select('id, supplier_id, is_active').eq('is_active', true);
      if (errPl) throw new Error(`Error en listas de precios: ${errPl.message}`);
      log(`  ✅ Listas activas cargadas: ${priceLists?.length || 0} registros.`);

      // 5. Download BDProductos
      log("Descargando planilla de equivalencias BDProductos desde Google Sheets...");
      const bdProductsUrl = "https://docs.google.com/spreadsheets/d/1FRVREzG1O_m8SENpTv-bOgu7AmnS-Em-cxCy-5_fmGI/export?format=csv&gid=1789541813";
      
      const bdSuppMap = new Map<string, string>();
      try {
        const bdRes = await fetch(bdProductsUrl, { cache: 'no-store' });
        if (bdRes.ok) {
          const bdText = await bdRes.text();
          const bdRows = parseCSV(bdText);
          bdRows.forEach(row => {
            const prod = row[0]?.trim();
            const supp = row[2]?.trim();
            if (prod && supp) {
              bdSuppMap.set(normalizeProductName(prod), supp);
            }
          });
          log(`  ✅ BDProductos cargada con éxito: ${bdRows.length} filas.`);
        } else {
          log("  ⚠️ No se pudo descargar la planilla de equivalencias. Se usarán datos existentes en DB.");
        }
      } catch (errBd: any) {
        log(`  ⚠️ Error al descargar equivalencias: ${errBd.message}`);
      }

      log("Comenzando mapeo y resolución de productos...");

      const mappedRows: Array<{
        product: any;
        supplierId: string;
        cost: number;
        taxes: number;
      }> = [];

      const activeListMap = new Map<string, string>();
      priceLists.forEach(pl => activeListMap.set(pl.supplier_id, pl.id));

      const relationsMap = new Map<string, string[]>();
      relations.forEach(r => {
        const list = relationsMap.get(r.product_id) || [];
        if (r.is_primary) {
          list.unshift(r.supplier_id);
        } else {
          list.push(r.supplier_id);
        }
        relationsMap.set(r.product_id, list);
      });

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (i === 0 && (!row[0] || row[0].toLowerCase().startsWith("producto"))) {
          continue; // Saltar cabecera
        }
        if (row.length < 2) continue;

        const sheetProdName = row[0]?.trim();
        if (!sheetProdName) continue;

        let costStr = "";
        let taxesStr = "21%";
        if (row.length >= 5) {
          costStr = row[4] || "";
          taxesStr = row[3] || "21%";
        } else if (row.length >= 2) {
          costStr = row[1] || "";
        }

        const cleanCostStr = costStr.replace(/[$\s]/g, "");
        let cost = parseFloat(cleanCostStr.replace(/\./g, "").replace(",", "."));
        if (isNaN(cost)) {
          cost = 0;
        }

        const cleanTaxesStr = taxesStr.replace(/[%$\s]/g, "");
        let taxes = parseFloat(cleanTaxesStr.replace(/\./g, "").replace(",", "."));
        if (isNaN(taxes)) {
          taxes = 21.0;
        }

        const matchedProduct = findProductMatch(sheetProdName, dbProducts);
        if (!matchedProduct) {
          errors++;
          errorMessages.push(`Fila ${i + 1}: No se encontró el producto "${sheetProdName}" en la base de datos.`);
          continue;
        }

        let supplierId = "";
        const prodSuppliers = relationsMap.get(matchedProduct.id);
        if (prodSuppliers && prodSuppliers.length > 0) {
          supplierId = prodSuppliers[0];
        } else {
          // Resolve supplier from BDProductos map
          const normName = normalizeProductName(matchedProduct.name);
          const suppName = bdSuppMap.get(normName) || bdSuppMap.get(normalizeProductName(sheetProdName));
          let matchedSupplier = null;

          if (suppName) {
            matchedSupplier = dbSuppliers.find(s => normalizeProductName(s.name) === normalizeProductName(suppName));
          }

          // Fallback to name prefix matching
          if (!matchedSupplier) {
            const sheetParts = sheetProdName.split('-').map(p => p.trim());
            const prefix = sheetParts[0];
            matchedSupplier = dbSuppliers.find(s => normalizeProductName(s.name) === normalizeProductName(prefix));
          }

          // Fallback to generic supplier
          if (!matchedSupplier) {
            matchedSupplier = dbSuppliers.find(s => 
              s.name.toLowerCase() === "varios" || s.name.toLowerCase() === "zono"
            ) || dbSuppliers[0];
          }

          if (matchedSupplier) {
            supplierId = matchedSupplier.id;
            log(`  -> Vinculación dinámica: asociando "${matchedProduct.name}" con proveedor "${matchedSupplier.name}"`);
            const { error: relErr } = await supabase
              .from('product_supplier_relations')
              .insert({
                product_id: matchedProduct.id,
                supplier_id: supplierId,
                is_primary: true
              });
            if (!relErr) {
              relationsMap.set(matchedProduct.id, [supplierId]);
            } else {
              errors++;
              errorMessages.push(`Fila ${i + 1} (${matchedProduct.name}): Error al asociar proveedor "${matchedSupplier.name}": ${relErr.message}`);
              continue;
            }
          } else {
            errors++;
            errorMessages.push(`Fila ${i + 1} (${matchedProduct.name}): No se encontró proveedor asignado ni fallback.`);
            continue;
          }
        }

        mappedRows.push({
          product: matchedProduct,
          supplierId,
          cost,
          taxes
        });
      }

      log(`Mapeo completo. ${mappedRows.length} productos listos para procesar. ${errors} fallas de mapeo.`);

      if (mappedRows.length === 0) {
        setCostsImportStatus(`Completado con errores: ${errors} productos no procesados.`);
        setCostsImportErrors(errorMessages);
        setSubmittingCostsType(null);
        return;
      }

      // Group mapped rows by Supplier ID
      const rowsBySupplier = new Map<string, typeof mappedRows>();
      mappedRows.forEach(row => {
        const list = rowsBySupplier.get(row.supplierId) || [];
        list.push(row);
        rowsBySupplier.set(row.supplierId, list);
      });

      const todayStr = new Date().toISOString().split('T')[0];
      const newListName = `COSTOS-SINC-${todayStr}`;
      
      const totalSuppliers = rowsBySupplier.size;
      let sIdx = 1;

      log(`Actualizando listas de precios para ${totalSuppliers} proveedores en lote...`);

      // Clone, Update and Save for each supplier
      for (const [supplierId, supplierRows] of rowsBySupplier.entries()) {
        const activeListId = activeListMap.get(supplierId);
        const supplierName = dbSuppliers.find(s => s.id === supplierId)?.name || supplierId;

        log(`[${sIdx}/${totalSuppliers}] Analizando proveedor "${supplierName}"...`);
        setCostsImportStatus(`Analizando costos: ${supplierName} (${sIdx} de ${totalSuppliers})...`);

        // 1. Fetch existing list items from the active list if it exists
        let existingListItems: any[] = [];
        if (activeListId) {
          const { data, error } = await supabase
            .from('price_list_items')
            .select('sku, list_cost, discount, discount_type, taxes')
            .eq('price_list_id', activeListId);
          
          if (!error && data) {
            existingListItems = data;
          }
        }

        // 2. Identify variations (changes in cost, taxes, or new items)
        const variations: Array<{
          sku: string;
          oldCost: number;
          newCost: number;
          oldTaxes: number;
          newTaxes: number;
          isNew: boolean;
        }> = [];

        supplierRows.forEach(row => {
          if (!row.product.sku) return;
          const skuKey = row.product.sku.toLowerCase().trim();
          const activeItem = existingListItems.find(item => item.sku.toLowerCase().trim() === skuKey);

          if (activeItem) {
            const oldCost = Number(activeItem.list_cost) || 0;
            const newCost = Number(row.cost) || 0;
            const oldTaxes = Number(activeItem.taxes) || 21;
            const newTaxes = Number(row.taxes) || 21;

            if (oldCost !== newCost || oldTaxes !== newTaxes) {
              variations.push({
                sku: row.product.sku,
                oldCost,
                newCost,
                oldTaxes,
                newTaxes,
                isNew: false
              });
            }
          } else {
            // New item with cost
            const newCost = Number(row.cost) || 0;
            const newTaxes = Number(row.taxes) || 21;
            if (newCost > 0) {
              variations.push({
                sku: row.product.sku,
                oldCost: 0,
                newCost,
                oldTaxes: 0,
                newTaxes,
                isNew: true
              });
            }
          }
        });

        // 3. If there are no variations, skip this supplier
        if (variations.length === 0) {
          log(`  -> Sin variaciones detectadas para "${supplierName}". Se conserva la lista de precios vigente.`);
          sIdx++;
          continue;
        }

        log(`  -> Se detectaron ${variations.length} variaciones de costos.`);
        
        // Log details of each variation
        variations.forEach(v => {
          if (v.isNew) {
            log(`    [NUEVO] ${v.sku}: Costo inicial = $${v.newCost} (IVA: ${v.newTaxes}%)`);
          } else {
            const pct = v.oldCost > 0 ? ((v.newCost - v.oldCost) / v.oldCost * 100).toFixed(1) : '100';
            const sign = v.newCost > v.oldCost ? '+' : '';
            log(`    [CAMBIO] ${v.sku}: $${v.oldCost} -> $${v.newCost} (${sign}${pct}%)`);
          }
        });

        // 4. Create a new inactive price list
        log(`  -> Creando nueva versión de lista de precios "${newListName}"...`);
        const { data: newList, error: newListErr } = await supabase
          .from('price_lists')
          .insert({
            supplier_id: supplierId,
            list_number: newListName,
            is_active: false
          })
          .select()
          .single();

        if (newListErr || !newList) {
          throw new Error(`Error al crear nueva lista de precios para el proveedor: ${newListErr?.message || 'ID vacío'}`);
        }

        // 5. Clone all items from active list
        const finalItems: any[] = [];
        existingListItems.forEach(item => {
          finalItems.push({
            price_list_id: newList.id,
            sku: item.sku,
            list_cost: Number(item.list_cost),
            discount: Number(item.discount),
            discount_type: item.discount_type,
            taxes: Number(item.taxes)
          });
        });

        // 6. Apply only variations (insert new ones or update existing ones)
        variations.forEach(v => {
          const itemKey = v.sku.toLowerCase().trim();
          const target = finalItems.find(item => item.sku.toLowerCase().trim() === itemKey);

          if (target) {
            target.list_cost = v.newCost;
            target.taxes = v.newTaxes;
          } else {
            finalItems.push({
              price_list_id: newList.id,
              sku: v.sku,
              list_cost: v.newCost,
              discount: 0,
              discount_type: 'percentage',
              taxes: v.newTaxes
            });
          }
          updatedCount++;
        });

        // 7. Bulk insert items into new list
        if (finalItems.length > 0) {
          const { error: insertErr } = await supabase
            .from('price_list_items')
            .insert(finalItems);
          
          if (insertErr) {
            throw new Error(`Error al cargar los ítems de lista de precios: ${insertErr.message}`);
          }
        }

        // 8. Swap active lists (deactivate old, activate new)
        log(`  -> Activando nueva lista "${newListName}" en Supabase...`);
        if (activeListId) {
          const { error: deactivateErr } = await supabase
            .from('price_lists')
            .update({ is_active: false })
            .eq('id', activeListId);
          if (deactivateErr) throw deactivateErr;
        }

        const { error: activateErr } = await supabase
          .from('price_lists')
          .update({ is_active: true })
          .eq('id', newList.id);
        if (activateErr) throw activateErr;

        log(`  ✅ Proveedor "${supplierName}" completado y actualizado.`);
        sIdx++;
      }

      log("🎉 Proceso finalizado con éxito.");
      const errorDetails = errors > 0 ? ` Revisar los detalles abajo o descargar el log.` : "";
      setCostsImportStatus(`Sincronización de costos completada: ${updatedCount} actualizados, ${errors} errores.${errorDetails}`);
      setCostsImportErrors(errorMessages);
      fetchProducts();
      setSubmittingCostsType(null);

    } catch (e: any) {
      log(`❌ Error crítico: ${e.message}`);
      setCostsImportStatus(`Error al procesar costos: ${e.message}`);
      setSubmittingCostsType(null);
    }
  };

  const handleGoogleSheetsCostsSync = async () => {
    setSubmittingCostsType('sheets');
    setCostsImportStatus("Descargando planilla de costos desde Google Sheets...");
    setCostsImportErrors([]);
    try {
      const response = await fetch("https://docs.google.com/spreadsheets/d/1q5n2GWzQTQQKrqWLApBV1s8TurN8sk5PIBnYQmitNSE/export?format=csv&gid=698741684", {
        headers: {
          'pragma': 'no-cache',
          'cache-control': 'no-cache'
        }
      });
      if (!response.ok) throw new Error("Error al descargar la planilla. Verificá que sea pública.");
      
      const csvText = await response.text();
      processCostsData(csvText);
    } catch (e: any) {
      setCostsImportStatus(`Error de sincronización: ${e.message}`);
      setSubmittingCostsType(null);
    }
  };

  const handleManualCostsSync = async () => {
    setSubmittingCostsType('manual');
    processCostsData(costsImportData);
  };

  const handleDownloadCSV = () => {
    const header = ["SKU", "Nombre", "Precio", "Categoría", "Marca", "Dimensiones", "Oferta", "Destacado", "Descripción", "URL_Imagen"];
    
    const rows = products.map(p => {
      const escapeCSV = (str: any) => {
        if (str == null) return "";
        let s = String(str);
        if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
          s = '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      };
      
      return [
        escapeCSV(p.sku),
        escapeCSV(p.name),
        p.price,
        escapeCSV(p.category),
        escapeCSV(p.brand),
        escapeCSV(p.dimensions),
        p.is_on_sale ? "true" : "false",
        p.is_featured ? "true" : "false",
        escapeCSV(p.description),
        escapeCSV(p.image_url)
      ].join(",");
    });
    
    const csvContent = [header.join(","), ...rows].join("\n");
    // Añadimos BOM para que Excel detecte correctamente el UTF-8 y los acentos
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' }); 
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const date = new Date().toISOString().split('T')[0];
    a.download = `catalogo_productos_${date}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleMassUpdate = async () => {
    setSubmittingType('manual');
    processData(importData);
  };

  const handleCleanDuplicates = async () => {
    if (!confirm("Esto agrupará todos los productos por SKU y eliminará los duplicados manteniendo el que tenga mejor información. ¿Estás seguro?")) return;
    
    setCleaningDuplicates(true);
    setCleanupResult(null);
    try {
      const { data: allProducts, error } = await supabase.from('products').select('*');
      if (error) throw error;
      if (!allProducts) return;

      // Agrupar por SKU normalizado
      const skuGroups = new Map<string, Product[]>();
      allProducts.forEach(p => {
        if (!p.sku) return;
        const normalizedSku = p.sku.toLowerCase().trim();
        if (!skuGroups.has(normalizedSku)) {
          skuGroups.set(normalizedSku, []);
        }
        skuGroups.get(normalizedSku)!.push(p);
      });

      let deletedCount = 0;

      for (const [sku, group] of skuGroups.entries()) {
        if (group.length > 1) {
          // Evaluar cada producto
          const scoredGroup = group.map(p => {
            let score = 0;
            if (p.image_url) score += 10;
            if (p.category !== 'Interno') score += 5;
            if (!p.name.includes('[Interno]')) score += 5;
            if (p.description) score += 1;
            if (p.brand) score += 1;
            return { product: p, score };
          });

          // Ordenar de mayor a menor puntaje
          scoredGroup.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            // Si empatan, el más antiguo se salva (asumiendo que tiene id menor o fue creado antes)
            return a.product.id < b.product.id ? -1 : 1;
          });

          // Salvar al primero, eliminar al resto
          const toDelete = scoredGroup.slice(1);
          
          for (const item of toDelete) {
            await supabase.from('products').delete().eq('id', item.product.id);
            deletedCount++;
          }
        }
      }

      setCleanupResult({ message: `¡Limpieza exitosa! Se eliminaron ${deletedCount} productos duplicados.`, isError: false });
      if (deletedCount > 0) {
        fetchProducts();
      }
    } catch (e: any) {
      setCleanupResult({ message: `Error al limpiar duplicados: ${e.message}`, isError: true });
    } finally {
      setCleaningDuplicates(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      if (content) {
        await processData(content);
      }
    };
    reader.readAsText(file);
  };

  const handleDelete = async (id: string) => {
    if (confirm("¿Estás seguro de eliminar este producto?")) {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (!error) fetchProducts();
    }
  };

  // Orphans Logic
  const fetchOrphanProducts = async () => {
    setLoadingOrphans(true);
    try {
      const { data, error } = await supabase
        .from('order_items')
        .select('product_name, quantity, unit_price')
        .is('product_id', null);

      if (error) throw error;

      if (data) {
        const groups: Record<string, {
          name: string;
          skuCandidate: string;
          timesOrdered: number;
          totalQuantity: number;
          totalSales: number;
          avgPrice: number;
        }> = {};

        data.forEach(item => {
          const name = item.product_name || "Sin nombre";
          if (!groups[name]) {
            const match = name.match(/\(([^)]+)\)\s*$/);
            const skuCandidate = match ? match[1].trim() : "";
            
            groups[name] = {
              name,
              skuCandidate,
              timesOrdered: 0,
              totalQuantity: 0,
              totalSales: 0,
              avgPrice: 0
            };
          }
          
          const g = groups[name];
          g.timesOrdered += 1;
          g.totalQuantity += item.quantity || 0;
          g.totalSales += (item.quantity || 0) * (item.unit_price || 0);
        });

        const list = Object.values(groups).map(g => {
          g.avgPrice = g.totalQuantity > 0 ? g.totalSales / g.totalQuantity : 0;
          return g;
        });

        list.sort((a, b) => {
          if (b.timesOrdered !== a.timesOrdered) return b.timesOrdered - a.timesOrdered;
          return b.totalSales - a.totalSales;
        });

        setOrphans(list);
      }
    } catch (err: any) {
      console.warn("Error fetching orphans:", err);
      alert("Error al cargar productos huérfanos: " + err.message);
    } finally {
      setLoadingOrphans(false);
    }
  };

  const handleCreateOrphan = (orphan: any) => {
    let cleanName = orphan.name;
    const sku = orphan.skuCandidate;
    
    if (sku) {
      cleanName = cleanName.replace(new RegExp(`\\s*\\(${sku}\\)\\s*$`, 'i'), '').trim();
    }
    
    setEditingProduct({
      sku: sku,
      name: cleanName,
      price: Math.round(orphan.avgPrice || 0),
      category: 'Otros',
      is_active: true,
      description: `Producto histórico creado automáticamente desde el panel de huérfanos. Original: ${orphan.name}`
    });
    setIsFormOpen(true);
  };

  const handleProductSuccess = () => {
    fetchProducts();
    fetchOrphanProducts();
  };

  const searchTerms = searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
  const filteredProducts = products.filter(p => {
    if (searchTerms.length === 0) return true;
    const searchableText = `${p.name} ${p.category} ${p.sku || ''}`.toLowerCase();
    return searchTerms.every(term => searchableText.includes(term));
  });



  // Define processed profitability products and metrics
  const processedProfitabilityProducts = products
    .filter(p => {
      if (profitabilityActiveOnly && p.is_active === false) return false;
      if (profitabilitySearch.trim()) {
        const s = profitabilitySearch.toLowerCase();
        return (
          p.name.toLowerCase().includes(s) ||
          (p.sku && p.sku.toLowerCase().includes(s)) ||
          (p.category && p.category.toLowerCase().includes(s)) ||
          (p.brand && p.brand.toLowerCase().includes(s))
        );
      }
      return true;
    })
    .map(p => {
      const rels = profitabilityRelations.filter(r => r.product_id === p.id);
      const primaryRel = rels.find(r => r.is_primary) || rels[0];
      const supplier = primaryRel ? profitabilitySuppliers.find(s => s.id === primaryRel.supplier_id) : null;
      
      let cost = 0;
      let listCost = 0;
      let taxes = 21;
      let activeItem = null;

      if (primaryRel) {
        activeItem = profitabilityItems.find(item => {
          return p.sku && item.sku.toLowerCase().trim() === p.sku.toLowerCase().trim();
        });

        if (activeItem) {
          cost = Number(activeItem.final_cost) || 0;
          listCost = Number(activeItem.list_cost) || 0;
          taxes = Number(activeItem.taxes) || 21;
        }
      }

      const price = Number(p.price) || 0;
      const marginalContribution = price - listCost;
      const profitMargin = price > 0 ? (marginalContribution / price) * 100 : 0;
      const hasCost = listCost > 0;

      return {
        ...p,
        supplierName: supplier ? supplier.name : "Sin Proveedor",
        listCost,
        taxes,
        cost,
        marginalContribution,
        profitMargin,
        hasCost
      };
    })
    .filter(p => {
      if (profitabilityFilter === 'missing_cost') {
        return !p.hasCost;
      }
      if (profitabilityFilter === 'has_cost') {
        return p.hasCost;
      }
      if (profitabilityFilter === 'negative_margin') {
        return p.hasCost && p.marginalContribution < 0;
      }
      return true;
    });

  // Calculate profitability summary stats
  const totalAnalyzedCount = processedProfitabilityProducts.length;
  const missingCostCount = processedProfitabilityProducts.filter(p => !p.hasCost).length;
  const negativeMarginCount = processedProfitabilityProducts.filter(p => p.hasCost && p.marginalContribution < 0).length;
  
  const productsWithCost = processedProfitabilityProducts.filter(p => p.hasCost);
  const avgProfitMargin = productsWithCost.length > 0
    ? productsWithCost.reduce((sum, p) => sum + p.profitMargin, 0) / productsWithCost.length
    : 0;

  const handleExportProfitabilityCSV = () => {
    const header = [
      "SKU", 
      "Producto", 
      "Categoría", 
      "Marca", 
      "Estado",
      "Proveedor", 
      "Fórmula de Precio",
      "Precio Venta", 
      "Costo sin IVA", 
      "IVA (%)", 
      "Costo final (con IVA)", 
      "Contribución Marginal ($)", 
      "Margen de Rentabilidad (%)"
    ];
    
    const rows = processedProfitabilityProducts.map(p => {
      const escapeCSV = (str: any) => {
        if (str == null) return "";
        let s = String(str);
        if (s.includes(';') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
          s = '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      };
      
      return [
        escapeCSV(p.sku),
        escapeCSV(p.name),
        escapeCSV(p.category),
        escapeCSV(p.brand),
        escapeCSV(p.is_active ? "Activo" : "Inactivo"),
        escapeCSV(p.supplierName),
        escapeCSV(p.fixed_price ? "Fijo (Manual)" : "Dinámico (Costo + %)"),
        p.price,
        p.listCost,
        p.taxes,
        p.cost,
        p.marginalContribution,
        p.hasCost ? p.profitMargin.toFixed(1) : "N/A"
      ];
    });

    const csvContent = "\uFEFF" + [header.join(";"), ...rows.map(r => r.join(";"))].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `analisis_rentabilidad_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="container mx-auto px-6 py-12 max-w-6xl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
        <div>
          <div className="flex flex-col md:flex-row md:items-center gap-4 mb-2">
            <h1 className="text-4xl font-black text-slate-900 tracking-tighter">Panel de Control</h1>
            <button 
              onClick={() => supabase.auth.signOut()} 
              className="flex items-center gap-2 text-[10px] font-black text-red-500 hover:text-white hover:bg-red-500 uppercase tracking-[0.2em] border border-red-100 hover:border-red-500 px-4 py-2 rounded-xl transition-all w-fit"
            >
              <LogOut className="w-3.5 h-3.5" />
              Cerrar Sesión
            </button>
          </div>
          <p className="text-slate-500 font-medium">Gestión total de catálogo e inventario</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex bg-slate-100 p-1 rounded-2xl shadow-inner">
            <button 
              onClick={() => setActiveTab('products')}
              className={cn(
                "px-4 py-2 rounded-xl text-sm font-black transition-all",
                activeTab === 'products' ? "bg-white text-brand-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
              )}
            >
              Productos
            </button>
            <button 
              onClick={() => setActiveTab('import')}
              className={cn(
                "px-4 py-2 rounded-xl text-sm font-black transition-all",
                activeTab === 'import' ? "bg-white text-brand-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
              )}
            >
              Carga Masiva
            </button>
            <button 
              onClick={() => setActiveTab('orphans')}
              className={cn(
                "px-4 py-2 rounded-xl text-sm font-black transition-all",
                activeTab === 'orphans' ? "bg-white text-brand-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
              )}
            >
              Huérfanos
            </button>
            <button 
              onClick={() => setActiveTab('profitability')}
              className={cn(
                "px-4 py-2 rounded-xl text-sm font-black transition-all",
                activeTab === 'profitability' ? "bg-white text-brand-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
              )}
            >
              Costos y Rentabilidad
            </button>
          </div>
          
          {activeTab === 'products' && (
            <Button onClick={() => handleOpenForm()} className="gap-2 rounded-2xl shadow-lg shadow-brand-600/20 py-6">
              <Plus className="w-5 h-5" />
              Nuevo Producto
            </Button>
          )}
        </div>
      </div>

      {activeTab === 'products' ? (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
            <div className="lg:col-span-3 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
              <input 
                type="text" 
                placeholder="Buscar por nombre, SKU o categoría..." 
                className="w-full pl-12 pr-4 py-4 rounded-[1.5rem] border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all font-medium"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="bg-brand-50 p-4 rounded-3xl border border-brand-100 flex flex-col justify-center">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-500 mb-1">Total Items</span>
              <span className="text-3xl font-black text-brand-900 leading-none">{products.length}</span>
            </div>
          </div>

          <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-2xl shadow-slate-200/50 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left table-fixed">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 w-full">Producto / Interno</th>
                    <th className="px-4 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 w-32 md:w-40">Categoría</th>
                    <th className="px-4 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 w-32 md:w-40">Precio (ARS)</th>
                    <th className="px-2 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 text-center w-12" title="Destacado">⭐</th>
                    <th className="px-2 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 text-center w-12" title="Liquidación">🏷️</th>
                    <th className="px-2 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 text-center w-16" title="Visible en Catálogo Público">👁️</th>
                    <th className="px-4 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 text-right w-24">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loading ? (
                    <tr><td colSpan={6} className="py-32 text-center"><Loader2 className="w-10 h-10 animate-spin mx-auto text-brand-200" /></td></tr>
                  ) : filteredProducts.map((product) => (
                    <tr key={product.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center text-slate-300 overflow-hidden border border-slate-100 flex-shrink-0">
                            {product.image_url ? <img src={product.image_url} className="w-full h-full object-cover" /> : <ImageIcon className="w-5 h-5" />}
                          </div>
                          <div className="min-w-0 flex-1 overflow-hidden">
                            <div className="font-bold text-slate-900 text-sm truncate">{product.name}</div>
                            <div className="text-[10px] font-black text-brand-500 uppercase tracking-widest truncate">{product.sku || "SIN SKU"}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <select
                          value={product.category}
                          onChange={(e) => handleQuickUpdate(product.id, 'category', e.target.value)}
                          className="w-full text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-xl border border-slate-200 bg-white focus:ring-4 focus:ring-brand-500/10 focus:border-brand-300 cursor-pointer transition-all outline-none shadow-sm"
                        >
                          {Array.from(new Set(products.map(p => p.category))).sort().map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-4">
                        <input
                          type="text"
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 font-black text-slate-900 text-sm bg-white focus:ring-2 focus:ring-brand-500/20 focus:border-brand-300"
                          defaultValue={new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2 }).format(product.price)}
                          onBlur={(e) => {
                            const val = e.target.value.replace(/\./g, '').replace(',', '.');
                            const num = parseFloat(val);
                            if (!isNaN(num) && num !== product.price) handleQuickUpdate(product.id, 'price', num);
                          }}
                          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                        />
                      </td>
                      <td className="px-4 py-4 text-center">
                        <input
                          type="checkbox"
                          checked={product.is_featured || false}
                          onChange={(e) => handleQuickUpdate(product.id, 'is_featured', e.target.checked)}
                          className="w-5 h-5 rounded-lg border-2 border-slate-300 text-emerald-600 focus:ring-emerald-500/20 cursor-pointer accent-emerald-600"
                          title="Destacado"
                        />
                      </td>
                      <td className="px-4 py-4 text-center">
                        <input
                          type="checkbox"
                          checked={product.is_on_sale || false}
                          onChange={(e) => handleQuickUpdate(product.id, 'is_on_sale', e.target.checked)}
                          className="w-5 h-5 rounded-lg border-2 border-slate-300 text-red-600 focus:ring-red-500/20 cursor-pointer accent-red-600"
                          title="Liquidación"
                        />
                      </td>
                      <td className="px-2 py-4 text-center">
                        <button
                          onClick={() => handleQuickUpdate(product.id, 'is_active', product.is_active === false ? true : false)}
                          className={cn("p-2 rounded-xl transition-all", product.is_active === false ? "bg-slate-100 text-slate-400 hover:bg-slate-200" : "bg-blue-50 text-blue-600 hover:bg-blue-100")}
                          title={product.is_active === false ? "Oculto" : "Visible"}
                        >
                          {product.is_active === false ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => handleOpenForm(product)} className="p-2 text-slate-300 hover:text-brand-600 hover:bg-brand-50 rounded-xl transition-all" title="Editar todo"><Edit2 className="w-4 h-4" /></button>
                          <button onClick={() => handleDelete(product.id)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all" title="Eliminar"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : activeTab === 'import' ? (
        <div className="max-w-4xl">
          <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl border border-slate-100">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 group gap-4">
              <h2 className="text-3xl font-black text-slate-900 tracking-tighter">Carga Masiva de Productos</h2>
              <div className="flex flex-col items-start md:items-end gap-3">
                <button
                  onClick={handleDownloadCSV}
                  className="px-5 py-2.5 bg-brand-50 text-brand-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-brand-100 transition-colors flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Descargar Catálogo Actual (CSV)
                </button>
                <div className="flex gap-4">
                  <a 
                    href="/ejemplo_carga_masiva.csv" 
                    download 
                    className="text-[10px] font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest border-b border-slate-200"
                  >
                    Plantilla de Ejemplo
                  </a>
                </div>
              </div>
            </div>
            
            <div className="mb-6">
              <label className="flex flex-col items-center justify-center gap-3 bg-brand-50 hover:bg-brand-100 text-brand-700 p-8 rounded-[2rem] border-2 border-dashed border-brand-200 cursor-pointer transition-colors group">
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                  <Upload className="w-6 h-6 text-brand-600" />
                </div>
                <div className="text-center">
                  <span className="font-black text-xl block mb-1">Subir Archivo .CSV</span>
                  <span className="font-medium text-brand-600/70 text-sm">Hacé click acá para cargar tu archivo de Excel guardado como CSV</span>
                </div>
                <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>

            <p className="text-slate-500 mb-6 font-medium">O si preferís, pegá los datos manualmente en el cuadro de abajo. Si el SKU coincide, se actualiza el producto.</p>
            
            <div className="space-y-6">
              <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 text-[10px] font-mono text-slate-500 mb-4">
                Orden: SKU, Nombre, Precio, Categoría, Marca, Dimensiones, Oferta (true/false), Destacado (true/false), Descripción, URL Imagen
              </div>
              <textarea 
                className="w-full h-64 p-6 rounded-3xl border border-slate-200 focus:ring-4 focus:ring-brand-500/10 font-mono text-sm leading-relaxed outline-none"
                placeholder={"Ejemplo:\nSKU-1, Producto A, 250000, Tanques, Aquafort, 1x1m, false, true, Mi producto, https://...\nSKU-2, Producto B, 50000, Bombas, Daewoo, 0.5x0.5m, true, false, Una bomba, https://..."}
                value={importData}
                onChange={(e) => setImportData(e.target.value)}
              />
              {importStatus && <div className={`p-4 rounded-2xl text-xs font-bold text-center ${importErrors.length > 0 ? 'bg-red-600 text-white shadow-xl shadow-red-600/20' : 'bg-slate-900 text-white shadow-xl shadow-slate-900/20'}`}>{importStatus}</div>}
              {importErrors.length > 0 && (
                <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
                  <div className="bg-red-50 text-red-700 p-4 rounded-2xl border border-red-100 max-h-48 overflow-y-auto text-[11px] font-mono leading-relaxed shadow-inner">
                    {importErrors.map((err, idx) => (
                      <div key={idx} className="mb-1 border-b border-red-100/50 pb-1 last:border-0">{err}</div>
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      const blob = new Blob(["ERRORES DE CARGA MASIVA\n========================\n\n" + importErrors.join("\n")], { type: 'text/plain;charset=utf-8;' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `log_errores_importacion_${new Date().toISOString().split('T')[0]}.txt`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    }}
                    className="self-end px-5 py-2.5 bg-white text-red-600 border border-red-200 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-red-50 hover:border-red-300 transition-all flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" /> Descargar Log Completo
                  </button>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Button onClick={handleMassUpdate} className="w-full py-8 text-lg font-black rounded-2xl shadow-2xl shadow-brand-600/20" disabled={submittingType !== null}>
                  {submittingType === 'manual' ? <Loader2 className="animate-spin" /> : <Upload className="mr-2" />}
                  Procesar CSV Manual
                </Button>
                <Button onClick={handleGoogleSheetsSync} className="w-full py-8 text-lg font-black bg-green-600 hover:bg-green-700 rounded-2xl shadow-2xl shadow-green-600/20" disabled={submittingType !== null}>
                  {submittingType === 'sheets' ? <Loader2 className="animate-spin" /> : <RefreshCw className="mr-2" />}
                  Sincronizar Google Sheets
                </Button>
              </div>
            </div>
          </div>

          {/* Sincronización de Costos */}
          <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl border border-slate-100 mt-10">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
              <div>
                <h2 className="text-3xl font-black text-slate-900 tracking-tighter">Sincronización de Costos</h2>
                <p className="text-slate-500 font-medium mt-1">
                  Actualiza el costo de lista (`Costo sin IVA`) de los productos mapeándolos por nombre.
                </p>
              </div>
            </div>

            <p className="text-slate-500 mb-6 font-medium">
              Podés sincronizar directamente desde la planilla de Google Sheets o pegar el contenido CSV manualmente abajo.
            </p>

            <div className="space-y-6">
              <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 text-[10px] font-mono text-slate-500 mb-4">
                Orden esperado del CSV manual: Producto (Nombre), P. Lista, Coef, IVA, Costo sin IVA
              </div>
              <textarea 
                className="w-full h-48 p-6 rounded-3xl border border-slate-200 focus:ring-4 focus:ring-brand-500/10 font-mono text-sm leading-relaxed outline-none"
                placeholder={"Ejemplo:\nAlberti - Bidet Largo 3 agujeros, 0, 90%, 21%, 15000\nAlma rústica - Artículo A, 30000, 100%, 21%, 30000"}
                value={costsImportData}
                onChange={(e) => setCostsImportData(e.target.value)}
              />
              {costsImportStatus && (
                <div className={`p-4 rounded-2xl text-xs font-bold text-center ${costsImportErrors.length > 0 ? 'bg-red-600 text-white shadow-xl shadow-red-600/20' : 'bg-slate-900 text-white shadow-xl shadow-slate-900/20'}`}>
                  {costsImportStatus}
                </div>
              )}
              {costsImportLogs.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Consola de Progreso:</span>
                  <div 
                    ref={costsConsoleRef}
                    className="bg-slate-950 text-emerald-400 font-mono text-[10px] p-4 rounded-xl max-h-64 overflow-y-auto space-y-1 shadow-inner leading-relaxed border border-slate-800"
                  >
                    {costsImportLogs.map((log, lIdx) => (
                      <div key={lIdx} className="font-mono">
                        {log}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {costsImportErrors.length > 0 && (
                <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
                  <div className="bg-red-50 text-red-700 p-4 rounded-2xl border border-red-100 max-h-48 overflow-y-auto text-[11px] font-mono leading-relaxed shadow-inner">
                    {costsImportErrors.map((err, idx) => (
                      <div key={idx} className="mb-1 border-b border-red-100/50 pb-1 last:border-0">{err}</div>
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      const blob = new Blob(["ERRORES DE SINCRONIZACION DE COSTOS\n========================\n\n" + costsImportErrors.join("\n")], { type: 'text/plain;charset=utf-8;' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `log_errores_costos_${new Date().toISOString().split('T')[0]}.txt`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    }}
                    className="self-end px-5 py-2.5 bg-white text-red-600 border border-red-200 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-red-50 hover:border-red-300 transition-all flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" /> Descargar Log de Errores Completo
                  </button>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Button 
                  onClick={handleManualCostsSync} 
                  className="w-full py-8 text-lg font-black rounded-2xl shadow-2xl shadow-brand-600/20" 
                  disabled={submittingCostsType !== null}
                >
                  {submittingCostsType === 'manual' ? <Loader2 className="animate-spin" /> : <Upload className="mr-2" />}
                  Procesar Costos CSV Manual
                </Button>
                <Button 
                  onClick={handleGoogleSheetsCostsSync} 
                  className="w-full py-8 text-lg font-black bg-emerald-600 hover:bg-emerald-700 rounded-2xl shadow-2xl shadow-emerald-600/20 text-white" 
                  disabled={submittingCostsType !== null}
                >
                  {submittingCostsType === 'sheets' ? <Loader2 className="animate-spin" /> : <Coins className="mr-2" />}
                  Sincronizar Costos desde Google Sheets
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : activeTab === 'profitability' ? (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Tarjeta de métricas principales */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xl flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Total Productos</span>
                <span className="text-3xl font-black text-slate-900 mt-1 block">{totalAnalyzedCount}</span>
              </div>
              <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400">
                <FileText className="w-6 h-6" />
              </div>
            </div>

            <div className={`p-6 rounded-3xl border shadow-xl flex items-center justify-between transition-all ${
              missingCostCount > 0 ? 'bg-amber-50/50 border-amber-100' : 'bg-white border-slate-100'
            }`}>
              <div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Sin Costo Asignado</span>
                <span className={`text-3xl font-black mt-1 block ${missingCostCount > 0 ? 'text-amber-600' : 'text-slate-900'}`}>{missingCostCount}</span>
              </div>
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                missingCostCount > 0 ? 'bg-amber-100 text-amber-600' : 'bg-slate-50 text-slate-400'
              }`}>
                <AlertTriangle className="w-6 h-6" />
              </div>
            </div>

            <div className={`p-6 rounded-3xl border shadow-xl flex items-center justify-between transition-all ${
              negativeMarginCount > 0 ? 'bg-red-50/50 border-red-100 animate-pulse' : 'bg-white border-slate-100'
            }`}>
              <div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Margen Negativo (Pérdida)</span>
                <span className={`text-3xl font-black mt-1 block ${negativeMarginCount > 0 ? 'text-red-600' : 'text-slate-900'}`}>{negativeMarginCount}</span>
              </div>
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                negativeMarginCount > 0 ? 'bg-red-100 text-red-600' : 'bg-slate-50 text-slate-400'
              }`}>
                <AlertTriangle className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xl flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Rentabilidad Promedio</span>
                <span className="text-3xl font-black text-emerald-600 mt-1 block">
                  {avgProfitMargin > 0 ? `${avgProfitMargin.toFixed(1)}%` : '--'}
                </span>
              </div>
              <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
                <Coins className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* Filtros e informes */}
          <div className="bg-white p-8 rounded-[2rem] shadow-xl border border-slate-100">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-6">
              <div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Análisis de Costos y Margen Comercial</h2>
                <p className="text-xs font-semibold text-slate-400 mt-1">
                  Revisá la contribución marginal y rentabilidad de tus productos en base a los costos cargados y los precios de venta actuales.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleExportProfitabilityCSV}
                  className="px-4 py-2.5 bg-brand-50 text-brand-600 hover:bg-brand-100 rounded-xl text-xs font-black transition-all flex items-center gap-2"
                >
                  <Download className="w-4 h-4" /> Exportar Informe CSV
                </button>
                <button
                  onClick={fetchProfitabilityData}
                  disabled={loadingProfitability}
                  className="px-4 py-2.5 bg-slate-50 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-black transition-all flex items-center gap-2 border border-slate-100"
                >
                  {loadingProfitability ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Actualizar Datos
                </button>
              </div>
            </div>

            {/* Controles de Búsqueda y Filtro */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between pb-6 border-b border-slate-100">
              <div className="relative w-full md:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Buscar por nombre, SKU, marca..."
                  className="w-full pl-9 pr-4 py-2 text-xs font-bold rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-brand-500/10 focus:border-brand-500"
                  value={profitabilitySearch}
                  onChange={e => setProfitabilitySearch(e.target.value)}
                />
              </div>

              <div className="flex flex-wrap gap-2 items-center">
                <button
                  onClick={() => setProfitabilityFilter('all')}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-black transition-all",
                    profitabilityFilter === 'all'
                      ? "bg-slate-900 text-white shadow-md shadow-slate-950/10"
                      : "bg-slate-50 text-slate-500 hover:bg-slate-100"
                  )}
                >
                  Todos
                </button>
                <button
                  onClick={() => setProfitabilityFilter('missing_cost')}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-black transition-all",
                    profitabilityFilter === 'missing_cost'
                      ? "bg-amber-500 text-white shadow-md shadow-amber-500/10"
                      : "bg-amber-50 text-amber-600 hover:bg-amber-100"
                  )}
                >
                  Sin Costo ({products.filter(p => {
                    const rels = profitabilityRelations.filter(r => r.product_id === p.id);
                    const primaryRel = rels.find(r => r.is_primary) || rels[0];
                    if (!primaryRel) return true;
                    const activeItem = profitabilityItems.find(item => p.sku && item.sku.toLowerCase().trim() === p.sku.toLowerCase().trim());
                    return !activeItem || !activeItem.list_cost;
                  }).length})
                </button>
                <button
                  onClick={() => setProfitabilityFilter('has_cost')}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-black transition-all",
                    profitabilityFilter === 'has_cost'
                      ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/10"
                      : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                  )}
                >
                  Con Costo
                </button>
                <button
                  onClick={() => setProfitabilityFilter('negative_margin')}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-black transition-all",
                    profitabilityFilter === 'negative_margin'
                      ? "bg-red-600 text-white shadow-md shadow-red-600/10"
                      : "bg-red-50 text-red-600 hover:bg-red-100"
                  )}
                >
                  A Pérdida ({products.filter(p => {
                    const rels = profitabilityRelations.filter(r => r.product_id === p.id);
                    const primaryRel = rels.find(r => r.is_primary) || rels[0];
                    if (!primaryRel) return false;
                    const activeItem = profitabilityItems.find(item => p.sku && item.sku.toLowerCase().trim() === p.sku.toLowerCase().trim());
                    if (!activeItem || !activeItem.list_cost) return false;
                    return p.price - activeItem.list_cost < 0;
                  }).length})
                </button>

                <div className="h-6 w-px bg-slate-200 mx-2" />

                <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors">
                  <input
                    type="checkbox"
                    checked={profitabilityActiveOnly}
                    onChange={e => setProfitabilityActiveOnly(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/10 cursor-pointer accent-brand-600"
                  />
                  <span>Solo Visibles (Activos)</span>
                </label>
              </div>
            </div>

            {/* Tabla de Resultados */}
            {loadingProfitability ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400 font-bold gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
                Cargando datos financieros...
              </div>
            ) : processedProfitabilityProducts.length === 0 ? (
              <div className="text-center py-20 text-slate-400 font-bold">
                No se encontraron productos que coincidan con los criterios de búsqueda.
              </div>
            ) : (
              <div className="overflow-x-auto mt-6">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Producto</th>
                      <th className="px-3 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Proveedor</th>
                      <th className="px-3 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400 text-right">Precio Venta (Público)</th>
                      <th className="px-3 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400 text-right">Costo (sin IVA)</th>
                      <th className="px-3 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400 text-right">Costo final (con IVA)</th>
                      <th className="px-3 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400 text-right">Contrib. Marginal</th>
                      <th className="px-3 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400 text-right">Rentabilidad</th>
                      <th className="px-3 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400 text-center">Alertas / Estado</th>
                      <th className="px-3 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400 text-center">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {processedProfitabilityProducts.map(p => {
                      const isNegative = p.hasCost && p.marginalContribution < 0;
                      const isLow = p.hasCost && p.profitMargin >= 0 && p.profitMargin < 10;
                      const isDynamicNoCost = !p.fixed_price && !p.hasCost;
                      const hasNoSupplier = p.supplierName === "Sin Proveedor";

                      return (
                        <tr key={p.id} className="hover:bg-slate-50/40 transition-colors">
                          {/* Producto */}
                          <td className="px-4 py-3">
                            <div className="font-bold text-slate-800 text-xs leading-snug">{p.name}</div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">{p.sku || "SIN SKU"}</span>
                              {p.category && (
                                <span className="text-[8px] font-black bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded uppercase tracking-widest">{p.category}</span>
                              )}
                            </div>
                          </td>

                          {/* Proveedor */}
                          <td className="px-3 py-3">
                            <span className={cn(
                              "text-xs font-bold",
                              hasNoSupplier ? "text-slate-400 italic" : "text-slate-700"
                            )}>
                              {p.supplierName}
                            </span>
                          </td>

                          {/* Precio Venta */}
                          <td className="px-3 py-3 font-mono font-bold text-slate-700">
                            {editingPriceId === p.id ? (
                              <input
                                id={`price-edit-input-${p.id}`}
                                type="text"
                                className="w-24 px-2 py-1 text-xs border-2 border-brand-500 rounded outline-none font-bold text-brand-600 focus:ring-1 focus:ring-brand-500/10 text-right bg-white"
                                value={editingPriceValue}
                                onChange={e => setEditingPriceValue(e.target.value)}
                                onBlur={() => saveQuickPrice(p.id)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') {
                                    saveQuickPrice(p.id);
                                  } else if (e.key === 'Escape') {
                                    setEditingPriceId(null);
                                  }
                                }}
                                autoFocus
                              />
                            ) : (
                              <div 
                                onClick={() => {
                                  setEditingPriceId(p.id);
                                  setEditingPriceValue(p.price.toLocaleString('es-AR', { minimumFractionDigits: 0 }));
                                }}
                                className="cursor-pointer hover:bg-slate-100 px-2 py-1 rounded transition-colors text-right flex items-center justify-end gap-1.5 group/price"
                                title="Hacé click para editar precio de venta"
                              >
                                <span className="text-brand-600">{formatPrice(p.price)}</span>
                                <Edit2 className="w-3 h-3 text-slate-300 opacity-0 group-hover/price:opacity-100 transition-opacity" />
                              </div>
                            )}
                          </td>

                          {/* Costo sin IVA */}
                          <td className="px-3 py-3 text-right font-mono text-xs font-bold text-slate-500">
                            {p.hasCost ? formatPrice(p.listCost) : '--'}
                          </td>

                          {/* Costo final con IVA */}
                          <td className="px-3 py-3 text-right font-mono text-xs font-bold text-slate-700">
                            {p.hasCost ? formatPrice(p.cost) : '--'}
                          </td>

                          {/* Contribución Marginal */}
                          <td className={cn(
                            "px-3 py-3 text-right font-mono text-xs font-bold",
                            !p.hasCost ? "text-slate-300" : isNegative ? "text-red-600 bg-red-50/30" : "text-emerald-600"
                          )}>
                            {p.hasCost ? formatPrice(p.marginalContribution) : '--'}
                          </td>

                          {/* Rentabilidad */}
                          <td className={cn(
                            "px-3 py-3 text-right font-mono text-xs font-black",
                            !p.hasCost ? "text-slate-300" : isNegative ? "text-red-700 bg-red-50/50" : "text-emerald-700"
                          )}>
                            {p.hasCost ? `${p.profitMargin.toFixed(1)}%` : 'Sin Costo'}
                          </td>

                          {/* Alertas / Estado */}
                          <td className="px-3 py-3 text-center">
                            <div className="flex flex-col gap-1 items-center justify-center">
                              {isNegative && (
                                <span className="px-2 py-0.5 bg-red-100 text-red-700 border border-red-200 rounded text-[8px] font-black uppercase tracking-widest animate-pulse">
                                  Venta a Pérdida
                                </span>
                              )}
                              {isLow && !isNegative && (
                                <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-[8px] font-black uppercase tracking-widest">
                                  Margen Bajo (&lt;10%)
                                </span>
                              )}
                              {isDynamicNoCost && (
                                <span className="px-2 py-0.5 bg-orange-100 text-orange-700 border border-orange-200 rounded text-[8px] font-black uppercase tracking-widest">
                                  Dinámico Sin Costo
                                </span>
                              )}
                              {hasNoSupplier && (
                                <span className="px-2 py-0.5 bg-slate-100 text-slate-500 border border-slate-200 rounded text-[8px] font-black uppercase tracking-widest">
                                  Sin Proveedor
                                </span>
                              )}
                              {!isNegative && !isLow && !isDynamicNoCost && !hasNoSupplier && p.hasCost && (
                                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded text-[8px] font-black uppercase tracking-widest">
                                  Margen Saludable
                                </span>
                              )}
                              {!p.hasCost && !isDynamicNoCost && (
                                <span className="px-2 py-0.5 bg-slate-100 text-slate-400 border border-slate-200 rounded text-[8px] font-black uppercase tracking-widest">
                                  Sin Costo Cargado
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Acción (Editar) */}
                          <td className="px-3 py-3 text-center">
                            <button
                              onClick={() => handleOpenForm(p)}
                              className="p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200/80 rounded-xl text-slate-600 transition-all shadow-sm"
                              title="Editar producto en formulario"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : activeTab === 'orphans' ? (
        <div className="space-y-6">
          <div className="bg-white p-8 rounded-[2rem] shadow-xl border border-slate-100">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Productos Huérfanos Históricos</h2>
                <p className="text-xs font-semibold text-slate-400 mt-1">
                  Productos que figuran en ítems de pedidos históricos pero no existen en el catálogo actual de la tienda. 
                  Al crearlos, se asociarán automáticamente todos sus pedidos anteriores.
                </p>
              </div>
              <button
                onClick={fetchOrphanProducts}
                disabled={loadingOrphans}
                className="px-4 py-2.5 bg-brand-50 text-brand-600 hover:bg-brand-100 rounded-xl text-xs font-black transition-all flex items-center gap-2"
              >
                {loadingOrphans ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Refrescar
              </button>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 mb-6">
              <div className="flex-1 w-full relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
                <input 
                  type="text" 
                  placeholder="Buscar huérfanos por nombre o SKU candidato..." 
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/10 focus:border-brand-500 transition-all font-medium text-xs bg-white shadow-sm"
                  value={orphanSearchTerm}
                  onChange={(e) => setOrphanSearchTerm(e.target.value)}
                />
              </div>
              <div className="bg-amber-50 px-3 py-2 rounded-xl border border-amber-100 flex items-center gap-2 shrink-0">
                <span className="text-[9px] font-black uppercase tracking-wider text-amber-700">Total Huérfanos</span>
                <span className="text-xs font-black text-amber-900 bg-amber-100/80 px-2 py-0.5 rounded-md">{orphans.length}</span>
              </div>
            </div>

            <div className="bg-slate-50/50 rounded-2xl border border-slate-100 overflow-hidden shadow-inner">
              <div className="overflow-x-auto">
                <table className="w-full text-left table-fixed">
                  <thead>
                    <tr className="bg-slate-100/80 border-b border-slate-200">
                      <th className="px-4 py-3 text-[9px] font-black uppercase tracking-wider text-slate-500 w-2/5">Nombre en Pedido</th>
                      <th className="px-3 py-3 text-[9px] font-black uppercase tracking-wider text-slate-500 w-1/5">SKU Candidato</th>
                      <th className="px-3 py-3 text-[9px] font-black uppercase tracking-wider text-slate-500 text-center w-28">Cant. Pedidos</th>
                      <th className="px-3 py-3 text-[9px] font-black uppercase tracking-wider text-slate-500 text-center w-32">Cant. Vendida</th>
                      <th className="px-3 py-3 text-[9px] font-black uppercase tracking-wider text-slate-500 text-right w-36">Precio Promedio</th>
                      <th className="px-3 py-3 text-[9px] font-black uppercase tracking-wider text-slate-500 text-right w-36">Total Ventas</th>
                      <th className="px-4 py-3 text-[9px] font-black uppercase tracking-wider text-slate-500 text-right w-32">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {loadingOrphans ? (
                      <tr>
                        <td colSpan={7} className="py-16 text-center">
                          <Loader2 className="w-6 h-6 animate-spin mx-auto text-brand-500" />
                          <span className="text-xs font-bold text-slate-400 mt-2 block">Buscando productos huérfanos...</span>
                        </td>
                      </tr>
                    ) : (() => {
                      const orphanSearchTerms = orphanSearchTerm.toLowerCase().split(/\s+/).filter(Boolean);
                      const filteredOrphans = orphans.filter(o => {
                        if (orphanSearchTerms.length === 0) return true;
                        const searchable = `${o.name} ${o.skuCandidate}`.toLowerCase();
                        return orphanSearchTerms.every(term => searchable.includes(term));
                      });

                      if (filteredOrphans.length === 0) {
                        return (
                          <tr>
                            <td colSpan={7} className="py-16 text-center text-slate-400 font-bold text-sm">
                              No se encontraron productos huérfanos que coincidan con la búsqueda.
                            </td>
                          </tr>
                        );
                      }

                      return filteredOrphans.map((orphan, idx) => {
                        const cleanOrphanName = orphan.name.replace(/\s*\([^)]+\)\s*$/, '').trim();
                        const existingMatch = products.find(p => 
                          (orphan.skuCandidate && p.sku?.toLowerCase() === orphan.skuCandidate.toLowerCase()) ||
                          p.sku?.toLowerCase() === orphan.name.toLowerCase() ||
                          p.name?.toLowerCase() === orphan.name.toLowerCase() ||
                          p.name?.toLowerCase() === cleanOrphanName.toLowerCase()
                        );

                        return (
                          <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-3 font-semibold text-slate-800 text-xs truncate" title={orphan.name}>
                              {orphan.name}
                            </td>
                            <td className="px-3 py-3">
                              {orphan.skuCandidate ? (
                                <span className="inline-flex bg-brand-50 text-brand-700 border border-brand-100 text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider">
                                  {orphan.skuCandidate}
                                </span>
                              ) : (
                                <span className="text-slate-400 font-medium text-[11px] italic">No detectado</span>
                              )}
                            </td>
                            <td className="px-3 py-3 text-center text-xs font-bold text-slate-700">
                              {orphan.timesOrdered}
                            </td>
                            <td className="px-3 py-3 text-center text-xs font-bold text-slate-700">
                              {orphan.totalQuantity}
                            </td>
                            <td className="px-3 py-3 text-right text-xs font-bold text-slate-700">
                              {formatPrice(orphan.avgPrice)}
                            </td>
                            <td className="px-3 py-3 text-right text-xs font-extrabold text-brand-600">
                              {formatPrice(orphan.totalSales)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex justify-end gap-2">
                                {existingMatch ? (
                                  <button
                                    onClick={() => handleOpenLinkModal(orphan.name, orphan.skuCandidate)}
                                    className="px-3 py-1.5 bg-brand-600 text-white hover:bg-brand-700 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1 shadow-sm"
                                    title={`Ya existe un producto con este SKU o nombre (${existingMatch.sku})`}
                                  >
                                    <Sparkles className="w-3 h-3" />
                                    Vincular
                                  </button>
                                ) : (
                                  <>
                                    <button
                                      onClick={() => handleCreateOrphan(orphan)}
                                      className="px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-100 hover:bg-emerald-600 hover:text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition-all"
                                    >
                                      Crear
                                    </button>
                                    <button
                                      onClick={() => handleOpenLinkModal(orphan.name, orphan.skuCandidate)}
                                      className="px-2 py-1.5 bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200 hover:text-slate-900 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all"
                                    >
                                      Vincular
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      });
                     })()}
                   </tbody>
                 </table>
               </div>
             </div>
           </div>
         </div>
      ) : (
        <div className="max-w-2xl">
          <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl border border-slate-100">
            <h2 className="text-3xl font-black text-slate-900 mb-8 tracking-tighter">Ajustes de Landings</h2>
            <form onSubmit={handleSettingsSubmit} className="space-y-12">
              
              {/* Sección Landing Principal */}
              <div className="space-y-6 bg-slate-50/50 p-6 rounded-3xl border border-slate-100">
                <div className="border-b border-slate-200 pb-4 mb-6">
                  <h3 className="text-xl font-black text-slate-800">Landing Principal (Inicio)</h3>
                  <p className="text-slate-500 text-sm font-medium">Sitio web general y catálogo</p>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-brand-500 uppercase tracking-[0.2em] mb-4">Orden y Visibilidad de Categorías</label>
                  <div className="flex flex-col gap-2 mb-6 p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
                    {landingCategories.map((cat, index) => (
                      <div
                        key={cat}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData("text/plain", index.toString())}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const fromIndex = parseInt(e.dataTransfer.getData("text/plain"));
                          if (isNaN(fromIndex)) return;
                          const newCats = [...landingCategories];
                          const [movedItem] = newCats.splice(fromIndex, 1);
                          newCats.splice(index, 0, movedItem);
                          setLandingCategories(newCats);
                        }}
                        className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-slate-800 font-bold flex items-center justify-between cursor-move shadow-sm active:scale-[0.98] transition-transform"
                      >
                        <div className="flex items-center gap-3">
                          <Menu className="w-5 h-5 text-slate-400" />
                          {cat}
                        </div>
                        <button
                          type="button"
                          onClick={() => setLandingCategories(prev => prev.filter(c => c !== cat))}
                          className="text-slate-400 hover:text-red-500 transition-colors p-1"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    {landingCategories.length === 0 && (
                       <div className="p-4 rounded-xl border-2 border-dashed border-slate-200 text-slate-400 text-center font-bold text-sm">
                         Ninguna categoría ordenable fijada. Se muestran todas por orden alfabético.
                       </div>
                    )}
                  </div>
                  
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Categorías Ocultas (Agregar al inicio)</label>
                  <div className="flex flex-wrap gap-2">
                    {Array.from(new Set(products.map(p => p.category)))
                      .filter(cat => !landingCategories.includes(cat))
                      .sort()
                      .map(cat => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setLandingCategories(prev => [...prev, cat])}
                          className="px-4 py-2 rounded-xl text-xs font-bold border bg-white text-slate-400 border-slate-200 hover:bg-slate-50 hover:text-brand-600 transition-colors flex items-center gap-2"
                        >
                           <Plus className="w-3 h-3" /> {cat}
                        </button>
                      ))}
                  </div>
                </div>
              </div>

              {/* Sección Landing Tanques */}
              <div className="space-y-6 bg-blue-50/30 p-6 rounded-3xl border border-blue-100/50">
                <div className="border-b border-blue-100 pb-4 mb-6">
                  <h3 className="text-xl font-black text-blue-900">Landing Específica (Tanques)</h3>
                  <p className="text-blue-600/70 text-sm font-medium">Página promocional exclusiva para ventas de agua</p>
                </div>

                <div className="mb-6">
                  <label className="block text-[10px] font-black text-blue-500 uppercase tracking-[0.2em] mb-4">Producto destacado Principal (Hero)</label>
                  <select
                    value={landingProductId}
                    onChange={(e) => setLandingProductId(e.target.value)}
                    className="w-full px-5 py-4 rounded-2xl border border-blue-200 focus:ring-4 focus:ring-blue-500/10 bg-white font-bold text-slate-700 outline-none"
                  >
                    <option value="">Selección Automática (Más caro)</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-blue-500 uppercase tracking-[0.2em] mb-4">Categorías Visibles en Tanques (Arrastrá para ordenar)</label>
                  <div className="flex flex-col gap-2 mb-6 p-4 rounded-2xl bg-white border border-blue-100 shadow-sm">
                    {tanquesCategories.map((cat, index) => (
                      <div
                        key={cat}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData("text/plain", "t-" + index.toString())}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const transferData = e.dataTransfer.getData("text/plain");
                          if (!transferData.startsWith("t-")) return;
                          const fromIndex = parseInt(transferData.replace("t-", ""));
                          if (isNaN(fromIndex)) return;
                          const newCats = [...tanquesCategories];
                          const [movedItem] = newCats.splice(fromIndex, 1);
                          newCats.splice(index, 0, movedItem);
                          setTanquesCategories(newCats);
                        }}
                        className="bg-blue-50/50 p-3 rounded-xl border border-blue-100 text-blue-900 font-bold flex items-center justify-between cursor-move shadow-sm active:scale-[0.98] transition-transform"
                      >
                        <div className="flex items-center gap-3">
                          <Menu className="w-5 h-5 text-blue-300" />
                          {cat}
                        </div>
                        <button
                          type="button"
                          onClick={() => setTanquesCategories(prev => prev.filter(c => c !== cat))}
                          className="text-blue-300 hover:text-red-500 transition-colors p-1"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    {tanquesCategories.length === 0 && (
                       <div className="p-4 rounded-xl border-2 border-dashed border-blue-200 text-blue-400 text-center font-bold text-sm">
                         Ninguna categoría elegida. Se mostrarán TODAS las de la tienda por defecto.
                       </div>
                    )}
                  </div>
                  
                  <label className="block text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] mb-4">Agregar Categorías a Landing Tanques</label>
                  <div className="flex flex-wrap gap-2">
                    {Array.from(new Set(products.map(p => p.category)))
                      .filter(cat => !tanquesCategories.includes(cat))
                      .sort()
                      .map(cat => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setTanquesCategories(prev => [...prev, cat])}
                          className="px-4 py-2 rounded-xl text-xs font-bold border bg-white text-blue-500 border-blue-200 hover:bg-blue-50 transition-colors flex items-center gap-2"
                        >
                           <Plus className="w-3 h-3" /> {cat}
                        </button>
                      ))}
                  </div>
                </div>
              </div>
              
              <Button type="submit" disabled={savingSettings} className="w-full py-8 text-lg shadow-xl shadow-brand-600/20 font-black rounded-[2rem]">
                {savingSettings ? <Loader2 className="animate-spin" /> : "Guardar Configuración"}
              </Button>
            </form>

            <div className="mt-12 pt-12 border-t border-slate-200">
              <div className="bg-red-50/50 p-8 rounded-[2rem] border border-red-100">
                <div className="mb-6">
                  <h3 className="text-2xl font-black text-red-900 flex items-center gap-2">
                    Mantenimiento de Base de Datos
                  </h3>
                  <p className="text-red-700/80 font-medium mt-2">Acciones destructivas para limpiar o reparar el catálogo general.</p>
                </div>
                
                <div className="bg-white p-6 rounded-3xl border border-red-100 shadow-sm flex flex-col gap-4">
                  <div>
                    <h4 className="font-bold text-slate-900 mb-1">Limpiar Productos Duplicados</h4>
                    <p className="text-sm text-slate-500 font-medium">Agrupa productos con el mismo SKU y elimina los que tengan menor información (sin fotos, internos o sin descripción). Mantiene intacto el mejor producto de cada grupo.</p>
                  </div>
                  
                  {cleanupResult && (
                    <div className={`p-4 rounded-xl text-sm font-bold ${cleanupResult.isError ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {cleanupResult.message}
                    </div>
                  )}

                  <button 
                    onClick={handleCleanDuplicates}
                    disabled={cleaningDuplicates}
                    className="w-full sm:w-auto self-start px-6 py-4 bg-red-100 text-red-700 hover:bg-red-600 hover:text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    {cleaningDuplicates ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    Ejecutar Limpieza
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* REUSABLE MODALS */}
      <ProductFormModal 
        product={editingProduct} 
        isOpen={isFormOpen} 
        onClose={() => setIsFormOpen(false)} 
        onSuccess={handleProductSuccess}
        allProducts={products}
      />

      <LinkOrphanModal
        orphanName={linkingOrphanName}
        skuCandidate={linkingSkuCandidate}
        isOpen={isLinkModalOpen}
        onClose={() => setIsLinkModalOpen(false)}
        onSuccess={handleProductSuccess}
        allProducts={products}
      />
    </div>
  );
}
