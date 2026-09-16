/**
 * Utilidades para deteccion, formateo y copiado de numeros de telefono.
 * - Para Argentina: omite el prefijo 549 o 54 tanto en la visualizacion como al copiar.
 * - Para otros paises: mantiene el codigo de pais.
 */

export const isArgentineNumber = (rawNumber?: string | null): boolean => {
  if (!rawNumber) return false;
  const digits = rawNumber.replace(/\D/g, '');
  // 549 seguido de 10 digitos (13 digitos) o 54 seguido de 10 digitos (12 digitos)
  if (digits.startsWith('549') && digits.length >= 12) return true;
  if (digits.startsWith('54') && digits.length === 12) return true;
  return false;
};

/**
 * Devuelve el numero limpio para copiar en portapapeles.
 * - Si es Argentina: quita 549 / 54 (ej: '1121635943').
 * - Si es de otro pais: devuelve el numero completo.
 */
export const cleanPhoneForCopy = (rawNumber?: string | null): string => {
  if (!rawNumber) return '';
  const digits = rawNumber.replace(/\D/g, '');

  if (isArgentineNumber(digits)) {
    if (digits.startsWith('549')) {
      return digits.slice(3);
    }
    if (digits.startsWith('54')) {
      return digits.slice(2);
    }
  }

  return digits || rawNumber.trim();
};

/**
 * Formatea el numero para mostrar en la interfaz.
 * - Si es Argentina: quita el 549 y formatea prolijo (ej: '11 2163-5943').
 * - Si es de otro pais: muestra con prefijo internacional '+' (ej: '+55 11 99999-9999').
 */
export const formatPhoneNumber = (rawNumber?: string | null): string => {
  if (!rawNumber) return '';
  const digits = rawNumber.replace(/\D/g, '');

  if (isArgentineNumber(digits)) {
    const local = cleanPhoneForCopy(digits);
    if (local.length === 10) {
      // Formato AMBA/CABA: 11 XXXX-XXXX
      if (local.startsWith('11')) {
        return `${local.slice(0, 2)} ${local.slice(2, 6)}-${local.slice(6)}`;
      }
      // Formato interior 3 digitos (ej: 351, 341, 261, 221): XXX XXX-XXXX
      return `${local.slice(0, 3)} ${local.slice(3, 6)}-${local.slice(6)}`;
    }
    return local;
  }

  // Otros paises
  if (digits.length > 8) {
    return `+${digits}`;
  }

  return rawNumber;
};
