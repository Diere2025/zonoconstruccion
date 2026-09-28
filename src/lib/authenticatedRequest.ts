/** Share concurrent reads and token renewal; never retry permission or server failures. */
export function createAuthenticatedRequester(client: any, fetcher: typeof fetch = fetch) {
  const reads = new Map<string, Promise<any>>();
  let renewal: Promise<any> | null = null;

  async function request(url: string, options?: RequestInit) {
    const send = (token: string) => {
      const headers = new Headers(options?.headers);
      headers.set('Content-Type', 'application/json');
      headers.set('Authorization', `Bearer ${token}`);
      return fetcher(url, { ...options, cache: 'no-store', headers });
    };
    const { data: { session } } = await client.auth.getSession();
    if (!session?.access_token) throw new Error('La sesión venció. Volvé a ingresar.');
    let response = await send(session.access_token);
    if (response.status === 401) {
      const { data: { session: latest } } = await client.auth.getSession();
      let next = latest;
      if (latest?.access_token === session.access_token) {
        if (!renewal) {
          renewal = client.auth.refreshSession().finally(() => { renewal = null; });
        }
        const refreshed = await renewal;
        next = refreshed.data?.session;
      }
      if (next?.access_token) response = await send(next.access_token);
    }
    const payload = await response.json();
    if (!response.ok) {
      const error = payload?.error;
      throw new Error(typeof error === 'string' ? error : error?.message || error?.details || 'No se pudo completar la operación.');
    }
    return payload;
  }

  return (url: string, options?: RequestInit): Promise<any> => {
    if ((options?.method || 'GET').toUpperCase() !== 'GET') return request(url, options);
    // Only identical reads with default options are shared; mutations always run separately.
    if (options) return request(url, options);
    const pending = reads.get(url);
    if (pending) return pending;
    const result = request(url).finally(() => { reads.delete(url); });
    reads.set(url, result);
    return result;
  };
}
