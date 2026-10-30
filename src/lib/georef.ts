export interface GeoProvince { id: string; name: string }
export interface GeoLocality extends GeoProvince { province: GeoProvince; department: string }

export function normalizeGeography(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('es-AR');
}

/** Fixed upstream and bounded searches; no customer contact data is sent to Georef. */
export function georefUrl(kind: string, query: string, province: string): URL {
  if (!['provinces', 'localities'].includes(kind) || query.length > 80 || province.length > 80) throw new Error('INVALID_SEARCH');
  const url = new URL(`https://apis.datos.gob.ar/georef/api/v2.0/${kind === 'provinces' ? 'provincias' : 'localidades'}`);
  url.searchParams.set('max', kind === 'provinces' ? '100' : '20');
  url.searchParams.set('orden', 'nombre');
  url.searchParams.set('campos', kind === 'provinces' ? 'id,nombre' : 'id,nombre,provincia,departamento');
  if (kind === 'localities') {
    if (query.trim().length < 2) throw new Error('INVALID_SEARCH');
    url.searchParams.set('nombre', query.trim());
    if (province.trim()) url.searchParams.set('provincia', province.trim());
  }
  return url;
}

export function georefResults(kind: string, payload: unknown): GeoProvince[] | GeoLocality[] {
  const body = payload as { provincias?: unknown; localidades?: unknown } | null;
  const rows = kind === 'provinces' ? body?.provincias : body?.localidades;
  if (!Array.isArray(rows)) throw new Error('INVALID_RESPONSE');
  return rows.flatMap(row => {
    if (!row || typeof row.id !== 'string' || typeof row.nombre !== 'string') return [];
    const basic = { id: row.id, name: row.nombre };
    if (kind === 'provinces') return [basic];
    if (typeof row.provincia?.id !== 'string' || typeof row.provincia?.nombre !== 'string') return [];
    return [{ ...basic, province: { id: row.provincia.id, name: row.provincia.nombre }, department: typeof row.departamento?.nombre === 'string' ? row.departamento.nombre : '' }];
  });
}
