import { createContext, useContext, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, refreshCsrf, setCsrfToken, ApiError } from './lib/api';

export type Administrator = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  permissions: string[];
};

type SessionValue = {
  admin: Administrator | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const [booting, setBooting] = useState(true);
  const me = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      try {
        const administrator = await api<Administrator>('/api/v1/auth/me');
        await refreshCsrf();
        return administrator;
      } catch (error) {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return null;
        throw error;
      } finally {
        setBooting(false);
      }
    },
    retry: false,
  });

  async function login(email: string, password: string) {
    const result = await api<{ administrator: Administrator & { effectivePermissions?: string[] }; csrfToken: string }>('/api/v1/auth/login', {
      method: 'POST',
      json: { email, password },
    });
    setCsrfToken(result.csrfToken);
    const admin: Administrator = {
      id: result.administrator.id,
      fullName: result.administrator.fullName,
      email: result.administrator.email,
      role: result.administrator.role,
      permissions: result.administrator.effectivePermissions ?? result.administrator.permissions ?? [],
    };
    client.setQueryData(['session'], admin);
  }

  async function logout() {
    await api('/api/v1/auth/logout', { method: 'POST', json: {} });
    setCsrfToken(null);
    client.setQueryData(['session'], null);
    client.clear();
  }

  return (
    <SessionContext.Provider value={{ admin: me.data ?? null, loading: booting || me.isLoading, login, logout }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('Session is unavailable');
  return value;
}

export function useCan() {
  const { admin } = useSession();
  return (permission: string) => Boolean(admin?.permissions.includes(permission));
}
