"use client";

import React, { useState, useEffect } from "react";
import { Calendar, User, MapPin, CreditCard, Truck, PackagePlus, Save, Loader2, Search, Plus, Trash2, X, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { supabase } from "@/lib/supabase";
import { Product } from "@/types";
import { formatPrice } from "@/lib/utils";

interface OrderItem extends Product {
  quantity: number;
  customPrice: number;
}

export default function PedidosPage() {
  const [activeTab, setActiveTab] = useState<'form' | 'list'>('form');
  const [submitting, setSubmitting] = useState(false);

  const [products, setProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [usageCounts, setUsageCounts] = useState<Record<string, number>>({});
  
  const [role, setRole] = useState<'seller' | 'admin'>('seller');
  const [listType, setListType] = useState<'mis_pedidos' | 'todos'>('mis_pedidos');
  const [orders, setOrders] = useState<any[]>([]);

  // Form State
  const [entregaInicial, setEntregaInicial] = useState("");
  const [entregaMaxima, setEntregaMaxima] = useState("");
  const [cliente, setCliente] = useState("");
  const [localidad, setLocalidad] = useState("");
  const [direccion, setDireccion] = useState("");
  const [linkMaps, setLinkMaps] = useState("");
  const [flete, setFlete] = useState("");

  const paymentMethods = [
    { id: "1", name: "Efectivo / Transferencia", surcharge_percentage: 0 },
    { id: "2", name: "Tarjeta Crédito 3 Cuotas", surcharge_percentage: 15 },
    { id: "3", name: "Tarjeta Crédito 6 Cuotas", surcharge_percentage: 34 },
  ];
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState("");

  const [showSummaryModal, setShowSummaryModal] = useState(false);

  useEffect(() => {
    async function fetchProducts() {
      const { data } = await supabase.from("products").select("*").order("name");
      if (data) setProducts(data);
    }
    async function checkRole() {
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        const { data: sellerData } = await supabase.from('sellers').select('role').eq('id', userData.user.id).single();
        if (sellerData && sellerData.role === 'admin') {
          setRole('admin');
        }
      }
    }
    fetchProducts();
    checkRole();
    
    // Cargar uso frecuente
    try {
      const counts = JSON.parse(localStorage.getItem('product_usage_counts') || '{}');
      setUsageCounts(counts);
    } catch(e) {}
  }, []);

  const frequentProducts = React.useMemo(() => {
    if (products.length === 0) return [];
    const sortedIds = Object.keys(usageCounts).sort((a, b) => usageCounts[b] - usageCounts[a]);
    return sortedIds
      .map(id => products.find(p => p.id === id))
      .filter(Boolean)
      .slice(0, 10) as Product[];
  }, [products, usageCounts]);

  useEffect(() => {
    async function fetchOrders() {
      if (activeTab === 'list') {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) return;
        
        let query = supabase.from('orders').select('*').order('created_at', { ascending: false });
        if (listType === 'mis_pedidos' || role !== 'admin') {
          query = query.eq('seller_id', userData.user.id);
        }
        
        const { data } = await query;
        if (data) setOrders(data);
      }
    }
    fetchOrders();
  }, [activeTab, listType, role]);

  const searchTerms = searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
  const filteredProducts = products.filter(p => {
    if (searchTerms.length === 0) return false;
    const searchableText = `${p.name} ${p.sku || ''}`.toLowerCase();
    return searchTerms.every(term => searchableText.includes(term));
  }).slice(0, 10);

  const addItem = (product: Product) => {
    const existing = orderItems.find(i => i.id === product.id);
    if (existing) {
      setOrderItems(orderItems.map(i => i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      setOrderItems([...orderItems, { ...product, quantity: 1, customPrice: product.price }]);
    }
    setSearchTerm("");
    
    // Guardar uso en localStorage
    try {
      const counts = { ...usageCounts };
      counts[product.id] = (counts[product.id] || 0) + 1;
      localStorage.setItem('product_usage_counts', JSON.stringify(counts));
      setUsageCounts(counts);
    } catch (e) {}
  };

  const removeItem = (id: string) => {
    setOrderItems(orderItems.filter(i => i.id !== id));
  };

  const updateQuantity = (id: string, qty: number) => {
    if (qty < 1) return;
    setOrderItems(orderItems.map(i => i.id === id ? { ...i, quantity: qty } : i));
  };

  const updateCustomPrice = (id: string, price: number) => {
    setOrderItems(orderItems.map(i => i.id === id ? { ...i, customPrice: price } : i));
  };

  const selectedPaymentMethod = paymentMethods.find(p => p.id === selectedPaymentMethodId);
  const subtotal = orderItems.reduce((acc, item) => acc + item.customPrice * item.quantity, 0);
  const surcharge = selectedPaymentMethod ? subtotal * (selectedPaymentMethod.surcharge_percentage / 100) : 0;
  const total = subtotal + surcharge;

  const handleInitialSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (orderItems.length === 0) {
      alert("Debes agregar al menos un producto al pedido.");
      return;
    }
    setShowSummaryModal(true);
  };

  const confirmAndSubmit = async () => {
    setShowSummaryModal(false);
    setSubmitting(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("No user authenticated");
      
      const seller_id = userData.user.id;

      const { data: orderData, error: orderError } = await supabase.from('orders').insert({
        seller_id,
        initial_delivery_date: entregaInicial,
        max_delivery_date: entregaMaxima,
        order_date: new Date().toISOString(),
        customer_name: cliente,
        locality,
        address: direccion,
        google_maps_link: linkMaps,
        payment_method_id: selectedPaymentMethodId,
        freight_type: flete,
        total_amount: total,
        status: 'Pendiente'
      }).select().single();

      if (orderError) throw orderError;

      const itemsToInsert = orderItems.map(item => ({
        order_id: orderData.id,
        product_id: item.id,
        product_name: item.name,
        quantity: item.quantity,
        unit_price: item.customPrice,
        subtotal: item.customPrice * item.quantity
      }));

      const { error: itemsError } = await supabase.from('order_items').insert(itemsToInsert);
      if (itemsError) throw itemsError;

      alert("Pedido cargado con éxito.");
      
      // Reset form
      setEntregaInicial("");
      setEntregaMaxima("");
      setCliente("");
      setLocalidad("");
      setDireccion("");
      setLinkMaps("");
      setFlete("");
      setSelectedPaymentMethodId("");
      setOrderItems([]);
      
      setActiveTab('list');
    } catch (error) {
      console.error(error);
      alert("Error al cargar el pedido.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter">Gestión de Pedidos</h1>
          <p className="text-slate-500 font-medium mt-1">Carga de ventas confirmadas y seguimiento.</p>
        </div>
        
        <div className="flex bg-slate-200/50 p-1 rounded-2xl">
          <button 
            onClick={() => setActiveTab('form')}
            className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${activeTab === 'form' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Nuevo Pedido
          </button>
          <button 
            onClick={() => { setActiveTab('list'); setListType('mis_pedidos'); }}
            className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${activeTab === 'list' && listType === 'mis_pedidos' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Mis Pedidos
          </button>
          {role === 'admin' && (
            <button 
              onClick={() => { setActiveTab('list'); setListType('todos'); }}
              className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${activeTab === 'list' && listType === 'todos' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Todos los Pedidos
            </button>
          )}
        </div>
      </div>

      {activeTab === 'form' ? (
        <form onSubmit={handleInitialSubmit} className="bg-white p-8 rounded-[2.5rem] shadow-xl shadow-slate-200/40 border border-slate-100 relative">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10">
            
            {/* Fechas */}
            <div className="space-y-6">
              <h3 className="flex items-center gap-2 font-black text-slate-800 border-b border-slate-100 pb-2">
                <Calendar className="w-5 h-5 text-brand-500" /> Fechas
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Entrega Inicial</label>
                  <input type="date" required value={entregaInicial} onChange={e => setEntregaInicial(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500/20 bg-slate-50 font-bold" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Entrega Máxima</label>
                  <input type="date" required value={entregaMaxima} onChange={e => setEntregaMaxima(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500/20 bg-slate-50 font-bold" />
                </div>
              </div>
            </div>

            {/* Cliente */}
            <div className="space-y-6">
              <h3 className="flex items-center gap-2 font-black text-slate-800 border-b border-slate-100 pb-2">
                <User className="w-5 h-5 text-brand-500" /> Cliente
              </h3>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Nombre Completo</label>
                <input type="text" required value={cliente} onChange={e => setCliente(e.target.value)} placeholder="Ej. Juan Pérez" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500/20 bg-slate-50 font-bold" />
              </div>
            </div>

            {/* Ubicación */}
            <div className="space-y-6 md:col-span-2">
              <h3 className="flex items-center gap-2 font-black text-slate-800 border-b border-slate-100 pb-2">
                <MapPin className="w-5 h-5 text-brand-500" /> Ubicación y Entrega
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Localidad</label>
                  <input type="text" required value={localidad} onChange={e => setLocalidad(e.target.value)} placeholder="Ej. Paso del Rey" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500/20 bg-slate-50 font-bold" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Dirección Exacta</label>
                  <input type="text" required value={direccion} onChange={e => setDireccion(e.target.value)} placeholder="Ej. San Martín 123" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500/20 bg-slate-50 font-bold" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Link Google Maps</label>
                  <input type="url" value={linkMaps} onChange={e => setLinkMaps(e.target.value)} placeholder="https://maps.google.com/..." className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500/20 bg-slate-50 font-bold" />
                </div>
              </div>
            </div>

            {/* Cobro y Flete */}
            <div className="space-y-6 md:col-span-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <h3 className="flex items-center gap-2 font-black text-slate-800 border-b border-slate-100 pb-2 mb-4">
                    <CreditCard className="w-5 h-5 text-brand-500" /> Método de Pago
                  </h3>
                  <select required value={selectedPaymentMethodId} onChange={e => setSelectedPaymentMethodId(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500/20 bg-slate-50 font-bold outline-none cursor-pointer">
                    <option value="">Seleccionar método...</option>
                    {paymentMethods.map(pm => (
                       <option key={pm.id} value={pm.id}>{pm.name} {pm.surcharge_percentage > 0 ? `(+${pm.surcharge_percentage}%)` : ''}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <h3 className="flex items-center gap-2 font-black text-slate-800 border-b border-slate-100 pb-2 mb-4">
                    <Truck className="w-5 h-5 text-brand-500" /> Tipo de Flete
                  </h3>
                  <select required value={flete} onChange={e => setFlete(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500/20 bg-slate-50 font-bold outline-none cursor-pointer">
                    <option value="">Seleccionar flete...</option>
                    <option value="Logística Propia">Logística Propia (Zono)</option>
                    <option value="Tercerizado">Flete Tercerizado</option>
                    <option value="Retiro en Sucursal">Retiro en Sucursal</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Productos */}
            <div className="space-y-6 md:col-span-2">
              <h3 className="flex items-center gap-2 font-black text-slate-800 border-b border-slate-100 pb-2">
                <PackagePlus className="w-5 h-5 text-brand-500" /> Productos a Cargar
              </h3>
              
              <div className="space-y-6">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                  <input 
                    type="text" 
                    className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500/20 outline-none font-bold bg-slate-50"
                    placeholder="Buscar producto por nombre o interno (SKU)..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                
                {/* Tags de productos más utilizados */}
                {frequentProducts.length > 0 && !searchTerm && (
                  <div className="-mt-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Más Utilizados</p>
                    <div className="flex flex-wrap gap-2">
                      {frequentProducts.map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => addItem(p)}
                          className="px-2.5 py-1 bg-brand-50 border border-brand-100 text-brand-600 hover:bg-brand-600 hover:text-white rounded-md text-[10px] font-black uppercase tracking-wide transition-all shadow-sm flex items-center gap-1 group"
                          title={p.name}
                        >
                          <Plus className="w-3 h-3 text-brand-400 group-hover:text-white transition-colors" />
                          {p.sku || p.name.substring(0, 20) + '...'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                
                {searchTerm && (
                  <div className="border border-slate-100 rounded-xl overflow-hidden bg-slate-50">
                    {filteredProducts.map(p => (
                      <div key={p.id} className="flex justify-between items-center p-3 hover:bg-white border-b border-slate-100 last:border-0 transition-colors">
                        <div>
                          <p className="text-[10px] font-black text-brand-500 uppercase tracking-widest">{p.sku || "SIN INTERNO"}</p>
                          <p className="font-bold text-sm text-slate-800">{p.name}</p>
                          <p className="text-xs text-brand-600 font-bold">{formatPrice(p.price)}</p>
                        </div>
                        <button 
                          type="button"
                          onClick={() => addItem(p)}
                          className="p-2 bg-brand-100 text-brand-600 rounded-lg hover:bg-brand-500 hover:text-white transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    {filteredProducts.length === 0 && <div className="p-4 text-center text-sm text-slate-500 font-medium">No se encontraron productos.</div>}
                  </div>
                )}

                {orderItems.length > 0 ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-sm text-slate-800">Productos Agregados:</h4>
                      <button 
                        type="button"
                        onClick={() => setOrderItems([])}
                        className="text-xs font-bold text-slate-400 hover:text-red-500 transition-colors flex items-center gap-1"
                        title="Vaciar lista"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Limpiar
                      </button>
                    </div>
                    {orderItems.map(item => (
                      <div key={item.id} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl relative group">
                        <button 
                          type="button"
                          onClick={() => removeItem(item.id)}
                          className="absolute -top-2 -right-2 bg-red-100 text-red-600 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <p className="text-[10px] font-black text-brand-500 uppercase tracking-widest mb-1">{item.sku || "SIN INTERNO"}</p>
                        <p className="font-bold text-slate-800 text-sm mb-3 pr-6">{item.name}</p>
                        
                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <div className="flex items-center bg-white border border-slate-200 rounded-lg overflow-hidden">
                            <button type="button" onClick={() => updateQuantity(item.id, item.quantity - 1)} className="px-3 py-1 font-black text-slate-500 hover:bg-slate-50">-</button>
                            <span className="px-2 font-bold text-sm min-w-[2rem] text-center">{item.quantity}</span>
                            <button type="button" onClick={() => updateQuantity(item.id, item.quantity + 1)} className="px-3 py-1 font-black text-slate-500 hover:bg-slate-50">+</button>
                          </div>
                          
                          <div className="flex items-center gap-2">
                             <span className="text-xs font-bold text-slate-400">$</span>
                             <input 
                               type="number" 
                               value={item.customPrice}
                               onChange={(e) => updateCustomPrice(item.id, Number(e.target.value))}
                               className="w-24 px-2 py-1 text-sm font-bold border border-slate-200 rounded-lg text-right focus:ring-2 focus:ring-brand-500/20 outline-none"
                             />
                          </div>
                        </div>
                      </div>
                    ))}
                    <div className="text-right pt-2 font-black text-lg text-slate-900 border-t border-slate-100">
                      Subtotal: {formatPrice(subtotal)}
                    </div>
                  </div>
                ) : (
                  <div className="p-8 border-2 border-dashed border-slate-200 rounded-2xl text-center bg-slate-50 text-slate-500 font-medium text-sm">
                    Aún no agregaste productos al pedido.
                  </div>
                )}
              </div>
            </div>

          </div>

          <div className="mt-10 pt-6 border-t border-slate-100 flex justify-end">
            <Button type="submit" disabled={submitting} className="px-10 py-6 rounded-2xl text-lg font-black flex items-center gap-2">
              Ver Resumen de Pedido
            </Button>
          </div>
        </form>
      ) : (
        <div className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/40 border border-slate-100 overflow-hidden">
           <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Cliente / Fecha</th>
                  <th className="px-4 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Localidad</th>
                  <th className="px-4 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Estado</th>
                  <th className="px-4 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {orders.length > 0 ? orders.map((p, i) => (
                  <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                     <td className="px-6 py-4">
                       <div className="font-bold text-slate-900 text-sm">{p.customer_name}</div>
                       <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{new Date(p.created_at).toLocaleDateString()}</div>
                     </td>
                     <td className="px-4 py-4 text-sm font-bold text-slate-600">{p.locality}</td>
                     <td className="px-4 py-4">
                       <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${
                          p.status === 'Entregado' ? 'text-emerald-600 bg-emerald-50' : 
                          p.status === 'Pendiente' ? 'text-orange-600 bg-orange-50' : 
                          'text-blue-600 bg-blue-50'
                       }`}>
                         {p.status}
                       </span>
                     </td>
                     <td className="px-4 py-4 text-sm font-black text-slate-900">{formatPrice(p.total_amount)}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-slate-500 font-medium">No se encontraron pedidos.</td>
                  </tr>
                )}
              </tbody>
           </table>
        </div>
      )}

      {/* Summary Modal */}
      {showSummaryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-3xl">
              <div>
                <h2 className="text-xl font-black text-slate-900">Resumen del Pedido</h2>
                <p className="text-sm font-medium text-slate-500">Revisá los datos antes de confirmar.</p>
              </div>
              <button onClick={() => setShowSummaryModal(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
               {/* Resumen Cliente y Envío */}
               <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Cliente</p>
                    <p className="font-bold text-slate-900">{cliente}</p>
                    <p className="text-slate-600 mt-1">{direccion}, {localidad}</p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Fechas de Entrega</p>
                    <p className="font-bold text-slate-900">Desde: {entregaInicial}</p>
                    <p className="font-bold text-slate-900">Hasta: {entregaMaxima}</p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Logística</p>
                    <p className="font-bold text-slate-900">{flete}</p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Método de Pago</p>
                    <p className="font-bold text-slate-900">{selectedPaymentMethod?.name}</p>
                  </div>
               </div>

               {/* Resumen Productos */}
               <div>
                  <h3 className="font-black text-slate-900 mb-3 border-b border-slate-100 pb-2">Productos ({orderItems.length})</h3>
                  <div className="space-y-3">
                    {orderItems.map(item => (
                      <div key={item.id} className="flex justify-between items-center text-sm">
                        <div className="flex items-center gap-2">
                           <span className="font-black text-slate-400">{item.quantity}x</span>
                           <span className="font-bold text-slate-700">{item.sku ? `[${item.sku}] ` : ''}{item.name}</span>
                        </div>
                        <span className="font-bold text-slate-900">{formatPrice(item.customPrice * item.quantity)}</span>
                      </div>
                    ))}
                  </div>
               </div>

               {/* Resumen Totales */}
               <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-2">
                 <div className="flex justify-between text-sm font-bold text-slate-600">
                   <span>Subtotal</span>
                   <span>{formatPrice(subtotal)}</span>
                 </div>
                 {surcharge > 0 && (
                   <div className="flex justify-between text-sm font-bold text-red-500">
                     <span>Recargo ({selectedPaymentMethod?.surcharge_percentage}%)</span>
                     <span>+{formatPrice(surcharge)}</span>
                   </div>
                 )}
                 <div className="flex justify-between text-xl font-black text-slate-900 pt-2 border-t border-slate-200">
                   <span>Total Final</span>
                   <span>{formatPrice(total)}</span>
                 </div>
               </div>
            </div>

            <div className="p-6 border-t border-slate-100 bg-white rounded-b-3xl flex justify-end gap-3">
               <button 
                 onClick={() => setShowSummaryModal(false)}
                 className="px-6 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-colors"
               >
                 Volver y Editar
               </button>
               <Button onClick={confirmAndSubmit} disabled={submitting} className="px-8 py-3 rounded-xl font-black flex items-center gap-2">
                 {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                 {submitting ? "Procesando..." : "Confirmar Carga"}
               </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
