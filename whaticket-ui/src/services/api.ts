import axios from 'axios';

// En producción el backend suele estar en el mismo host o en el puerto 7777.
// En dev usamos http://134.209.72.93:7777 o la variable de entorno.
export const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ||
  (import.meta.env.DEV
    ? '/api-proxy'
    : typeof window !== 'undefined'
    ? window.location.origin
    : 'http://134.209.72.93:7777');

export const api = axios.create({
  baseURL: BACKEND_URL,
  withCredentials: true,
});

// Interceptor para agregar JWT Bearer token y manejar FormData
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('whaticket_token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (config.data instanceof FormData && config.headers) {
    delete config.headers['Content-Type'];
  }
  return config;
});

// Interceptor de respuesta para auto refresh o logout limpio
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: any) => void;
  reject: (reason?: any) => void;
}> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (originalRequest.url?.includes('/auth/login') || originalRequest.url?.includes('/auth/refresh_token')) {
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { data } = await axios.post(
          `${BACKEND_URL}/auth/refresh_token`,
          {},
          { withCredentials: true }
        );
        const newToken = data.token;
        localStorage.setItem('whaticket_token', newToken);
        api.defaults.headers.common.Authorization = `Bearer ${newToken}`;
        processQueue(null, newToken);
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        localStorage.removeItem('whaticket_token');
        localStorage.removeItem('whaticket_user');
        window.dispatchEvent(new Event('whaticket_auth_expired'));
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export const getMediaUrl = (filename?: string | null): string => {
  if (!filename) return '';

  // 1. Si ya es una URL local de tipo blob: o data:, devolverla tal cual
  if (filename.startsWith('blob:') || filename.startsWith('data:')) {
    return filename;
  }

  // 2. Si filename ya contiene una URL absoluta (ej: http://134.209.72.93:7777/public/foto.jpg),
  // extraemos solo la ruta relativa (/public/...) para que SIEMPRE apunte al host/puerto actual.
  let relativePath = filename;
  try {
    if (filename.startsWith('http://') || filename.startsWith('https://')) {
      const parsed = new URL(filename);
      relativePath = parsed.pathname;
    }
  } catch {}

  const clean = relativePath.replace(/^\/+/, '');
  if (clean.startsWith('public/')) {
    return `${BACKEND_URL}/${clean}`;
  }
  return `${BACKEND_URL}/public/${clean}`;
};
