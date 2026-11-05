import {validCalendarDate} from '@/lib/dates/dateFields';
import {OperationError} from '@/lib/financialOperations/validation';

export const wallets = {binance:'Binance', redot:'Redot', ads:'Publicidad prepaga'} as const;
export type Wallet = keyof typeof wallets;

export const movementKinds = {
  opening: {label:'Saldo inicial', wallets:['binance','redot','ads']},
  p2p: {label:'Compra P2P de USDT', wallets:['binance']},
  transfer: {label:'Transferencia de Binance a Redot', wallets:['binance']},
  ad_funding: {label:'Carga de saldo publicitario', wallets:['binance','redot']},
  ad_spend: {label:'Consumo de saldo publicitario', wallets:['ads']},
  service: {label:'Servicio del exterior', wallets:['redot']},
  redot_ads: {label:'Pago directo de publicidad', wallets:['redot']},
  personal: {label:'Consumo personal', wallets:['redot']},
  fee: {label:'Comisión debitada por separado', wallets:['binance','redot']},
} satisfies Record<string,{label:string;wallets:Wallet[]}>;

export type MovementKind = keyof typeof movementKinds;
export const tracksOriginalAmount = (kind: MovementKind) => ['service','redot_ads','personal'].includes(kind);

export type Entry = {
  id:string; day:string; kind:MovementKind; wallet:Wallet; reference:string; detail:string;
  amount:string; credited:string|null; bank_amount:string|null; bank_code:string|null;
  bank_account:string|null; bank_transaction_id:string|null; transfer_fee:string|null; bank_matches:boolean|null; original_amount:string|null;
  original_currency:string|null; void_reason:string|null;
};

export type Reconciliation = {
  balances: Partial<Record<Wallet,{amount:string;hasOpening:boolean}>> | null;
  entries: Entry[];
};

export function validateCryptoEntry(value: unknown) {
  if (!value || typeof value !== 'object') throw new OperationError('Completá los datos del movimiento.');
  const input = value as Record<string,unknown>;
  const read = (key:string) => typeof input[key] === 'string' ? input[key].trim() : '';
  const kind = read('kind') as MovementKind;
  const wallet = read('wallet') as Wallet;
  if (!Object.prototype.hasOwnProperty.call(movementKinds,kind) || !movementKinds[kind].wallets.some(candidate => candidate === wallet)) {
    throw new OperationError('Elegí un movimiento y una cuenta compatibles.');
  }
  const day = read('day');
  if (!validCalendarDate(day)) {
    throw new OperationError('Ingresá una fecha válida.');
  }
  const reference = read('reference'), detail = read('detail');
  if (!reference || reference.length > 200 || detail.length > 1000) throw new OperationError('Revisá la referencia y el detalle.');

  function amount(key:string, places=8, allowZero=false) {
    const text = read(key).replace(',','.');
    if (!new RegExp('^\\d{1,12}(?:\\.\\d{1,'+places+'})?$').test(text) || (!allowZero && Number(text) <= 0)) {
      throw new OperationError('Ingresá los importes requeridos con hasta '+places+' decimales y sin separador de miles.');
    }
    return text;
  }

  const originalCurrency = read('original_currency').toUpperCase();
  const hasOriginal = tracksOriginalAmount(kind) && Boolean(originalCurrency || read('original_amount'));
  if (hasOriginal && !/^[A-Z]{3}$/.test(originalCurrency)) throw new OperationError('Ingresá la moneda del cargo, por ejemplo USD.');
  const bankCode = read('bank_code').toUpperCase();
  if (kind === 'p2p' && !/^[A-Z0-9-]{3,40}$/.test(bankCode)) throw new OperationError('Ingresá el código del egreso del ERP.');
  const primary = amount('amount',wallet === 'ads' ? 2 : 8,kind === 'opening');
  const credited = kind === 'transfer' ? amount('credited') : kind === 'ad_funding' ? amount('credited',2) : null;


  return {
    kind, wallet, day, reference, detail, amount:primary, credited,
    bank_code:kind === 'p2p' ? bankCode : null,
    bank_amount:kind === 'p2p' ? amount('bank_amount',2) : null,
    original_amount:hasOriginal ? amount('original_amount') : null,
    original_currency:hasOriginal ? originalCurrency : null,
  };
}
