export const VIA_CARGO_LABEL = 'VÍA CARGO';
export const VIA_CARGO_SETTING_ID = 'via_cargo_dispatch';
export const VIA_CARGO_MODES = {
  branch: 'Retiro en sucursal',
  home: 'Entrega a domicilio',
  pending: 'A definir',
} as const;

export interface ViaCargoDestination {
  same_as_client?: boolean;
  mode: keyof typeof VIA_CARGO_MODES;
  name: string;
  document: string;
  phone: string;
  province: string;
  locality: string;
  postal_code: string;
  branch: string;
  address: string;
  maps_url: string;
  references: string;
}

export interface ViaCargoDispatch {
  branch: string;
  address: string;
  locality_id: string;
  locality: string;
  maps_url: string;
  references: string;
}

export const emptyViaCargoDestination = (): ViaCargoDestination => ({
  same_as_client: true,
  mode: 'pending', name: '', document: '', phone: '', province: '', locality: '',
  postal_code: '', branch: '', address: '', maps_url: '', references: '',
});

/** Resolve at save/preview time so customer edits cannot leave a stale recipient. */
export function resolveViaCargoRecipient(destination: ViaCargoDestination, client: { name: string; document: string; phone: string }): ViaCargoDestination {
  return destination.same_as_client ? { ...destination, ...client } : { ...destination };
}
export const emptyViaCargoDispatch = (): ViaCargoDispatch => ({
  branch: '', address: '', locality_id: '', locality: '', maps_url: '', references: '',
});

export function validMapUrl(value: string): boolean {
  if (!value.trim()) return true;
  try { return ['https:', 'http:'].includes(new URL(value).protocol); } catch { return false; }
}

export function validateViaCargo(value: ViaCargoDestination): string | null {
  if (!Object.hasOwn(VIA_CARGO_MODES, value.mode)) return 'Seleccioná la modalidad de Vía Cargo.';
  const required = { name: 'nombre y apellido', document: 'DNI/CUIT', phone: 'teléfono', province: 'provincia', locality: 'localidad', postal_code: 'código postal' } as const;
  for (const [key, label] of Object.entries(required)) {
    if (!value[key as keyof typeof required]?.trim()) return `Completá ${label} del destinatario de Vía Cargo.`;
  }
  if (value.mode === 'home' && !value.address.trim()) return 'Completá la dirección de entrega a domicilio.';
  if (value.mode === 'branch' && !value.branch.trim()) return 'Indicá la sucursal de destino de Vía Cargo.';
  if (!validMapUrl(value.maps_url)) return 'Ingresá un enlace de Maps válido (http o https).';
  return null;
}

/** Single projection shared by ERP, printing, notifications and sheet sync. */
export function deliveryDetailForShipping(instructions: string, postalCode: string, destination: ViaCargoDestination | null): string {
  if (!destination) return [postalCode.trim() ? `CP: ${postalCode.trim()}` : '', instructions.trim()].filter(Boolean).join('\n');
  return [
    `VÍA CARGO — ${VIA_CARGO_MODES[destination.mode].toLocaleUpperCase('es-AR')}`,
    `Destinatario: ${destination.name.trim()} | DNI/CUIT: ${destination.document.trim()}`,
    `Tel.: ${destination.phone.trim()}`,
    `Destino final: ${destination.locality.trim()}, ${destination.province.trim()} | CP: ${destination.postal_code.trim()}`,
    destination.mode === 'branch' ? `Sucursal de retiro: ${destination.branch.trim()}` : '',
    destination.address.trim() ? `${destination.mode === 'home' ? 'Domicilio final' : 'Dirección de destino'}: ${destination.address.trim()}` : '',
    destination.mode === 'pending' ? 'PENDIENTE: definir modalidad y destino antes de despachar.' : '',
    destination.maps_url.trim() ? `Maps del destino final: ${destination.maps_url.trim()}` : '',
    destination.references.trim() ? `Referencias del cliente: ${destination.references.trim()}` : '',
    instructions.trim() ? `Indicaciones adicionales: ${instructions.trim()}` : '',
  ].filter(Boolean).join('\n');
}
