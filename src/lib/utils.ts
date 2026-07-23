import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(price: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price).replace(/\s+/g, '').replace('\u00A0', '');
}

export function formatDateDDMMYYYY(dateInput: Date | string | undefined | null): string {
  if (!dateInput) return "-";
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return "-";
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Retorna la fecha actual en zona horaria Argentina (GMT-3) como string YYYY-MM-DD
 */
export function getArgentinaDateString(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(date);
}

/**
 * Retorna la fecha de N días atrás en zona horaria Argentina (GMT-3) como string YYYY-MM-DD
 */
export function getArgentinaDaysAgoString(daysAgo: number): string {
  const argDateStr = getArgentinaDateString();
  const [year, month, day] = argDateStr.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() - daysAgo);
  
  const resYear = d.getUTCFullYear();
  const resMonth = String(d.getUTCMonth() + 1).padStart(2, '0');
  const resDay = String(d.getUTCDate()).padStart(2, '0');
  return `${resYear}-${resMonth}-${resDay}`;
}

