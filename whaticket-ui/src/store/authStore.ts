import { create } from 'zustand';
import { User } from '../types';
import { api } from '../services/api';
import { connectSocket, disconnectSocket } from '../services/socket';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<boolean>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,

  checkAuth: async () => {
    const storedToken = localStorage.getItem('whaticket_token');
    const storedUser = localStorage.getItem('whaticket_user');

    if (!storedToken) {
      set({ user: null, token: null, isAuthenticated: false, isLoading: false });
      return false;
    }

    try {
      if (storedUser) {
        set({ user: JSON.parse(storedUser), token: storedToken, isAuthenticated: true });
      }

      // Validar o refrescar token
      const { data } = await api.post('/auth/refresh_token', {}, { withCredentials: true });
      localStorage.setItem('whaticket_token', data.token);
      localStorage.setItem('whaticket_user', JSON.stringify(data.user));
      if (data.user?.companyId) {
        localStorage.setItem('companyId', String(data.user.companyId));
      }

      set({
        user: data.user,
        token: data.token,
        isAuthenticated: true,
        isLoading: false,
      });

      connectSocket(data.token);
      return true;
    } catch {
      // Fallback: si tenemos token guardado, mantenemos mientras no se compruebe error fatal
      if (storedToken && storedUser) {
        const parsed = JSON.parse(storedUser);
        if (parsed?.companyId) {
          localStorage.setItem('companyId', String(parsed.companyId));
        }
        set({
          user: parsed,
          token: storedToken,
          isAuthenticated: true,
          isLoading: false,
        });
        connectSocket(storedToken);
        return true;
      }

      set({ user: null, token: null, isAuthenticated: false, isLoading: false });
      return false;
    }
  },

  login: async (email: string, password: string) => {
    set({ isLoading: true });
    try {
      const { data } = await api.post('/auth/login', { email, password });
      const { token, user } = data;

      localStorage.setItem('whaticket_token', token);
      localStorage.setItem('whaticket_user', JSON.stringify(user));
      if (user?.companyId) {
        localStorage.setItem('companyId', String(user.companyId));
      }

      set({
        user,
        token,
        isAuthenticated: true,
        isLoading: false,
      });

      connectSocket(token);
    } catch (err: any) {
      set({ isLoading: false });
      throw new Error(
        err.response?.data?.error ||
          err.response?.data?.message ||
          'Error al iniciar sesión. Verifica tus credenciales.'
      );
    }
  },

  logout: async () => {
    try {
      await api.delete('/auth/logout');
    } catch {
      // Ignore network errors on logout
    } finally {
      localStorage.removeItem('whaticket_token');
      localStorage.removeItem('whaticket_user');
      disconnectSocket();
      set({
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  },
}));

// Listener para expiración de sesión
if (typeof window !== 'undefined') {
  window.addEventListener('whaticket_auth_expired', () => {
    useAuthStore.getState().logout();
  });
}
