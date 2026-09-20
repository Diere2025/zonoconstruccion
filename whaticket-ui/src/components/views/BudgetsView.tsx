import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  TrendingUp,
  MessageSquare,
  DollarSign,
  User,
  Calendar,
  Phone,
  RefreshCw,
  Eye,
  Copy,
  ExternalLink,
  X
} from 'lucide-react';
import { Budget, BudgetMetrics, Ticket } from '../../types';
import { fetchBudgets, updateBudgetStatus } from '../../services/catalogService';
import { formatPhoneNumber } from '../../utils/phone';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface BudgetsViewProps {
  onNavigateToChat: (ticket: Ticket | any) => void;
}

export const BudgetsView: React.FC<BudgetsViewProps> = ({ onNavigateToChat }) => {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [metrics, setMetrics] = useState<BudgetMetrics>({
    totalCount: 0,
    openCount: 0,
    openTotalAmount: 0,
    pendingCount: 0,
    pendingTotalAmount: 0,
    wonCount: 0,
    wonTotalAmount: 0,
    lostCount: 0,
    lostTotalAmount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [searchParam, setSearchParam] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedBudgetForDetail, setSelectedBudgetForDetail] = useState<Budget | null>(null);

  const loadBudgets = async () => {
    setLoading(true);
    try {
      const data = await fetchBudgets({
        searchParam: searchParam.trim(),
        status: selectedStatus,
      });
      setBudgets(data.budgets || []);
      if (data.metrics) {
        setMetrics(data.metrics);
      }
    } catch (err: any) {
      console.error('Error loading budgets:', err);
      toast.error('Error al cargar la lista de presupuestos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadBudgets();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchParam, selectedStatus]);

  const handleStatusChange = async (budget: Budget, newStatus: 'open' | 'pending' | 'won' | 'lost') => {
    try {
      const updated = await updateBudgetStatus(budget.id, newStatus);
      setBudgets((prev) => prev.map((b) => (b.id === budget.id ? { ...b, status: newStatus } : b)));
      toast.success(`Estado actualizado a ${getStatusLabel(newStatus)}`);
      // Refresh metrics
      fetchBudgets().then((d) => d.metrics && setMetrics(d.metrics));
    } catch (err) {
      toast.error('Error al actualizar el estado');
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0,
    }).format(val || 0);
  };

  const getStatusLabel = (st: string) => {
    switch (st) {
      case 'open':
        return 'Abierto';
      case 'pending':
        return 'En Seguimiento';
      case 'won':
        return 'Ganado';
      case 'lost':
        return 'Perdido';
      default:
        return st;
    }
  };

  const getStatusBadge = (st: string) => {
    switch (st) {
      case 'open':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            <Clock className="w-3 h-3" />
            Abierto
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <AlertCircle className="w-3 h-3" />
            En Seguimiento
          </span>
        );
      case 'won':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" />
            Ganado / Concretado
          </span>
        );
      case 'lost':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
            <XCircle className="w-3 h-3" />
            Perdido
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-900 overflow-hidden select-none">
      {/* Top Header */}
      <div className="px-6 py-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-600 to-red-500 flex items-center justify-center text-white shadow-md shadow-red-500/20">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-lg text-slate-800 dark:text-slate-100">
              Seguimiento de Presupuestos
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Control de cotizaciones abiertas, pendientes y conversión de ventas
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={loadBudgets}
          className="px-3 py-1.5 text-xs font-bold rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center gap-1.5 transition-all cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {/* KPI Cards */}
      <div className="p-6 pb-2 grid grid-cols-2 md:grid-cols-4 gap-4 flex-shrink-0">
        {/* Total Abiertos */}
        <div className="bg-white dark:bg-slate-800/80 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase">Abiertos</span>
            <span className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2">
            <span className="font-black text-xl text-slate-900 dark:text-slate-100 font-mono">
              {formatCurrency(metrics.openTotalAmount)}
            </span>
            <p className="text-xs text-blue-600 font-bold mt-0.5">
              {metrics.openCount} presupuestos activos
            </p>
          </div>
        </div>

        {/* En Seguimiento */}
        <div className="bg-white dark:bg-slate-800/80 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase">En Seguimiento</span>
            <span className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <AlertCircle className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2">
            <span className="font-black text-xl text-slate-900 dark:text-slate-100 font-mono">
              {formatCurrency(metrics.pendingTotalAmount)}
            </span>
            <p className="text-xs text-amber-600 font-bold mt-0.5">
              {metrics.pendingCount} en negociación
            </p>
          </div>
        </div>

        {/* Ganados / Concretados */}
        <div className="bg-white dark:bg-slate-800/80 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase">Ganados</span>
            <span className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2">
            <span className="font-black text-xl text-emerald-600 dark:text-emerald-400 font-mono">
              {formatCurrency(metrics.wonTotalAmount)}
            </span>
            <p className="text-xs text-emerald-600 font-bold mt-0.5">
              {metrics.wonCount} ventas cerradas
            </p>
          </div>
        </div>

        {/* Tasa de Conversión */}
        <div className="bg-white dark:bg-slate-800/80 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase">Tasa de Conversión</span>
            <span className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2">
            <span className="font-black text-xl text-slate-900 dark:text-slate-100 font-mono">
              {metrics.totalCount > 0
                ? `${Math.round((metrics.wonCount / metrics.totalCount) * 100)}%`
                : '0%'}
            </span>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              {metrics.totalCount} emitidos en total
            </p>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="p-6 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 flex-shrink-0">
        {/* Status filters */}
        <div className="flex items-center gap-1.5 bg-slate-200/80 dark:bg-slate-800 p-1 rounded-xl w-full sm:w-auto overflow-x-auto">
          {[
            { id: 'all', label: 'Todos' },
            { id: 'open', label: 'Abiertos' },
            { id: 'pending', label: 'En Seguimiento' },
            { id: 'won', label: 'Ganados' },
            { id: 'lost', label: 'Perdidos' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSelectedStatus(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                selectedStatus === tab.id
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchParam}
            onChange={(e) => setSearchParam(e.target.value)}
            placeholder="Buscar por cliente, teléfono o #ZC..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-100 shadow-xs"
          />
        </div>
      </div>

      {/* Main Table Content */}
      <div className="flex-1 px-6 pb-6 overflow-hidden">
        <div className="h-full bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-col shadow-xs overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="h-64 flex flex-col items-center justify-center gap-2 text-slate-400">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs">Cargando presupuestos...</span>
              </div>
            ) : budgets.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-slate-400 text-center p-6">
                <FileText className="w-10 h-10 stroke-[1.5] text-slate-300 dark:text-slate-700 mb-2" />
                <p className="font-bold text-xs text-slate-700 dark:text-slate-300">
                  No se encontraron presupuestos
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Genera una cotización desde cualquier conversación en la bandeja de entrada.
                </p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Código / Fecha</th>
                    <th className="py-3 px-4">Cliente</th>
                    <th className="py-3 px-4">Vendedor</th>
                    <th className="py-3 px-4">Productos</th>
                    <th className="py-3 px-4">Total</th>
                    <th className="py-3 px-4">Estado</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 text-xs">
                  {budgets.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-700/30 transition-colors">
                      {/* Código / Fecha */}
                      <td className="py-3 px-4">
                        <span className="font-extrabold text-blue-600 dark:text-blue-400 font-mono">
                          #{b.code}
                        </span>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {b.createdAt ? format(new Date(b.createdAt), 'dd/MM/yyyy HH:mm') : '-'}
                        </p>
                      </td>

                      {/* Cliente */}
                      <td className="py-3 px-4">
                        <span className="font-bold text-slate-900 dark:text-slate-100">
                          {b.contact?.name || 'Cliente'}
                        </span>
                        <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                          {formatPhoneNumber(b.contact?.number)}
                        </p>
                      </td>

                      {/* Vendedor */}
                      <td className="py-3 px-4">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          {b.user?.name || 'Asignado'}
                        </span>
                      </td>

                      {/* Productos Resumen */}
                      <td className="py-3 px-4 max-w-xs">
                        <div className="truncate text-slate-600 dark:text-slate-300" title={b.items?.map(it => `${it.quantity}x ${it.name}`).join(', ')}>
                          {b.items && b.items.length > 0
                            ? b.items.map((it) => `${it.quantity}x ${it.name}`).join(', ')
                            : 'Sin ítems'}
                        </div>
                      </td>

                      {/* Total */}
                      <td className="py-3 px-4">
                        <span className="font-extrabold text-sm text-slate-900 dark:text-slate-100 font-mono">
                          {formatCurrency(b.total)}
                        </span>
                        <p className="text-[10px] text-slate-400">
                          {b.paymentMethod || 'Efectivo / Transf'}
                        </p>
                      </td>

                      {/* Estado Dropdown */}
                      <td className="py-3 px-4">
                        <select
                          value={b.status}
                          onChange={(e) => handleStatusChange(b, e.target.value as any)}
                          className="text-xs font-bold rounded-lg py-1 px-2 border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 focus:outline-none cursor-pointer"
                        >
                          <option value="open">Abierto</option>
                          <option value="pending">En Seguimiento</option>
                          <option value="won">Ganado / Concretado</option>
                          <option value="lost">Perdido</option>
                        </select>
                      </td>

                      {/* Acciones */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Ir al Chat */}
                          <button
                            type="button"
                            onClick={() => onNavigateToChat(b.ticket || { id: b.ticketId, contact: b.contact })}
                            className="px-2.5 py-1.5 text-xs font-bold rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-300 hover:bg-blue-100 flex items-center gap-1 cursor-pointer shadow-2xs"
                            title="Ir a la conversación para realizar seguimiento"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            Ir al chat
                          </button>

                          {/* Ver Detalle */}
                          <button
                            type="button"
                            onClick={() => setSelectedBudgetForDetail(b)}
                            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
                            title="Ver detalle del presupuesto"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedBudgetForDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-rose-500" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Presupuesto #{selectedBudgetForDetail.code}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBudgetForDetail(null)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-3 overflow-y-auto max-h-[70vh] text-xs">
              <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">Cliente:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {selectedBudgetForDetail.contact?.name || 'Cliente'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Teléfono:</span>
                  <span className="font-mono text-slate-800 dark:text-slate-200">
                    {formatPhoneNumber(selectedBudgetForDetail.contact?.number)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Vendedor:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {selectedBudgetForDetail.user?.name || 'Vendedor'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Estado:</span>
                  <span>{getStatusBadge(selectedBudgetForDetail.status)}</span>
                </div>
              </div>

              <div>
                <h5 className="font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase text-[10px] tracking-wider">
                  Ítems Cotizados
                </h5>
                <div className="space-y-1.5">
                  {selectedBudgetForDetail.items?.map((it, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-700/60"
                    >
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {it.quantity}x {it.name}
                      </span>
                      <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                        {formatCurrency(it.price * it.quantity)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between items-baseline">
                <span className="font-bold text-sm text-slate-800 dark:text-slate-200">TOTAL:</span>
                <span className="font-black text-lg text-emerald-600 font-mono">
                  {formatCurrency(selectedBudgetForDetail.total)}
                </span>
              </div>

              {selectedBudgetForDetail.summaryText && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-[10px] uppercase text-slate-400">Texto WhatsApp</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(selectedBudgetForDetail.summaryText || '');
                        toast.success('Texto copiado');
                      }}
                      className="text-[11px] text-blue-600 hover:underline flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" />
                      Copiar
                    </button>
                  </div>
                  <pre className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-[11px] font-mono whitespace-pre-wrap text-slate-700 dark:text-slate-300 max-h-36 overflow-y-auto">
                    {selectedBudgetForDetail.summaryText}
                  </pre>
                </div>
              )}
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  const b = selectedBudgetForDetail;
                  setSelectedBudgetForDetail(null);
                  onNavigateToChat(b.ticket || { id: b.ticketId, contact: b.contact });
                }}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Ir a la conversación
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
