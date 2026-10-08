export type AdvertisingSourceChannel = 'minorista' | 'mayorista' | 'ambos';

export interface AdvertisingSource {
  id: string;
  name: string;
  is_active: boolean;
  channel?: AdvertisingSourceChannel;
  sort_order?: number;
}

const legacyWholesaleNames = ['Cliente', 'Página web', 'Reenviado de Minorista', 'Recomendado', 'Otro'];

export function advertisingSourceChannel(source: AdvertisingSource): AdvertisingSourceChannel {
  return source.channel || (legacyWholesaleNames.includes(source.name) ? 'mayorista' : 'minorista');
}

export function sortAdvertisingSources<T extends AdvertisingSource>(sources: T[]): T[] {
  return [...sources].sort((a, b) =>
    (a.sort_order ?? Number.MAX_SAFE_INTEGER) - (b.sort_order ?? Number.MAX_SAFE_INTEGER)
    || a.name.localeCompare(b.name, 'es') || a.id.localeCompare(b.id)
  );
}

export function advertisingSourcesForChannel(sources: AdvertisingSource[], channel: 'minorista' | 'mayorista'): AdvertisingSource[] {
  return sortAdvertisingSources(sources.filter(source => source.is_active !== false
    && (advertisingSourceChannel(source) === channel || advertisingSourceChannel(source) === 'ambos')));
}
