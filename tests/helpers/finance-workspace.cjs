const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const accounts = [
  { id: 'cash', name: 'Caja Efectivo Pesos', currency: 'ARS', type: 'efectivo', is_active: true },
  { id: 'bank', name: 'Cuenta Banco', currency: 'ARS', type: 'banco', is_active: true },
  { id: 'usd', name: 'Caja Dólares', currency: 'USD', type: 'efectivo', is_active: true }
];
const transactions = Array.from({ length: 55 }, (_, i) => ({
  id: `tx-${i}`, created_at: '2026-09-28T12:00:00-03:00', type: i % 4 === 0 ? 'ingreso' : 'egreso',
  category: i % 4 === 0 ? 'Recaudación' : 'Gastos Operativos', sub_category: 'Mantenimiento Maquinaria',
  efe_category: 'Repuestos/Mantenimiento Producción', financial_account_id: 'cash',
  financial_accounts: { name: 'Caja Efectivo Pesos', type: 'efectivo' },
  amount: 12000 + i * 1700, currency: 'ARS', running_balance: 3800000 + i * 12000,
  concept: i % 4 === 0 ? 'Cobro venta directa' : 'Compra de elementos y herramientas',
  notes: 'Observación de ejemplo para verificar detalle', is_imported: false
}));

function compile(source, imports, extras = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, {
    exports, require: imports, console, Date, URL, setTimeout, clearTimeout,process:{env:{NODE_ENV:'development'}},
    localStorage: { getItem: () => null, setItem() {} }, ...extras
  });
  return exports;
}

function workspace(overrides = {}, query = '') {
  const source = fs.readFileSync('src/app/admin/finanzas/page.tsx', 'utf8').replace('function FinanceWorkspace()', 'export function FinanceWorkspace()');
  const workspaceSource = source.slice(source.indexOf('export function FinanceWorkspace()'));
  const names = [...workspaceSource.matchAll(/const \[(\w+)(?:,[^\]]*)?\]\s*=\s*useState/g)].map(match => match[1]);
  const state = new Map(Object.entries({ loading: false, financialAccounts: accounts, transactions, startDate: '2026-08-29', endDate: '2026-09-28', ...overrides }));
  let cursor = 0;
  let writes = 0;
  const effects = [];
  const hooks = {
    ...React,
    useState: initial => {
      const name = names[cursor++];
      if (!state.has(name)) state.set(name, typeof initial === 'function' ? initial() : initial);
      return [state.get(name), value => state.set(name, typeof value === 'function' ? value(state.get(name)) : value)];
    },
    useMemo: fn => fn(),
    useRef: value => ({current:value}),
    useEffect: fn => { effects.push(fn); }
  };
  const icons = require('lucide-react');
  const labels = compile(fs.readFileSync('src/lib/financialAccountLabels.ts', 'utf8'), require);
  const componentImports = name => name === 'lucide-react' ? icons : name === '@/lib/financialAccountLabels' ? labels : require(name);
  const searchableSelect = compile(fs.readFileSync('src/components/ui/SearchableSelect.tsx', 'utf8'), componentImports).default;
  const adaptiveSelect=compile(fs.readFileSync('src/components/ui/AdaptiveSelect.tsx','utf8'),name=>name==='./SearchableSelect'?{__esModule:true,default:searchableSelect}:componentImports(name)).default;
  const toolbar = compile(fs.readFileSync('src/components/finanzas/FinanceToolbar.tsx', 'utf8'), name=>name==='@/components/ui/AdaptiveSelect'?{__esModule:true,default:adaptiveSelect}:componentImports(name)).default;
  const modules = {
    'react': hooks,
    'next/navigation': { useSearchParams: () => new URLSearchParams(query), useRouter: () => ({ push() {}, replace() {} }) },
    '@/lib/treasuryTransactionTime': { treasuryToday: () => '2026-09-28', treasuryDateTime: value => `${value}T12:00:00-03:00` },
    '@/lib/supabase': { supabase: { from: () => { writes++; throw new Error('Unexpected database call in UI check'); } } },
    '@/lib/authenticatedRequest': {createAuthenticatedRequester:()=>()=>{throw new Error('Unexpected request in render');}},
    '@/lib/financialOperations/types': compile(fs.readFileSync('src/lib/financialOperations/types.ts','utf8'),require),
    '@/components/finanzas/operations/OperationEditor': {__esModule:true,default:()=>null},
    '@/components/finanzas/operations/OperationChooser': {__esModule:true,default:()=>null},
    'lucide-react': icons,
    '@/components/ui/Button': { Button: props => React.createElement('button', props) },
    '@/lib/utils': { formatPrice: n => `$${Number(n).toLocaleString('es-AR')}`, formatDateDDMMYYYY: value => { const [y,m,d] = value.slice(0,10).split('-'); return `${d}/${m}/${y}`; } },
    '@/components/finanzas/FinanceToolbar': { __esModule: true, default: toolbar },
    '@/components/ui/SearchableSelect': { __esModule: true, default: searchableSelect },
    '@/components/ui/AdaptiveSelect': { __esModule: true, default: adaptiveSelect },
    '@/lib/financialAccountLabels': labels,
    '@/components/finanzas/FinancialConceptManager': { __esModule: true, default: () => null },
    '@/components/finanzas/BankSheetImportModal': { __esModule: true, default: () => null },
    '@/components/finanzas/SupplierAccounts': { __esModule: true, default: () => null }
  };
  const exports = compile(source, name => modules[name] || require(name));
  let tree;
  function render() { cursor = 0; effects.length = 0; tree = exports.FinanceWorkspace(); return tree; }
  function find(predicate, element = tree) {
    if (!element || typeof element !== 'object') return null;
    if (predicate(element)) return element;
    for (const child of React.Children.toArray(element.props?.children)) { const found = find(predicate, child); if (found) return found; }
    return null;
  }
  render();
  return { state, render, find, toolbar: () => find(el => el.type === toolbar).props, markup: () => renderToStaticMarkup(render()), writes: () => writes, effects };
}
module.exports = { workspace, accounts, transactions };
