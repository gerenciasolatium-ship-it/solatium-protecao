import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { LoginResponse, UsuarioPublico } from '@solatium/shared';
import { apiFetch, limparSessao, salvarTokens, STORAGE } from './api';

interface AuthContextValue {
  usuario: UsuarioPublico | null;
  carregando: boolean;
  entrar: (email: string, senha: string) => Promise<void>;
  sair: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function usuarioSalvo(): UsuarioPublico | null {
  const raw = localStorage.getItem(STORAGE.usuario);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UsuarioPublico;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioPublico | null>(usuarioSalvo);
  const [carregando, setCarregando] = useState(true);

  // Ao montar: se há token, valida com /auth/me e atualiza o perfil.
  useEffect(() => {
    const token = localStorage.getItem(STORAGE.access);
    if (!token) {
      setCarregando(false);
      return;
    }
    let ativo = true;
    apiFetch<UsuarioPublico>('/auth/me')
      .then((u) => {
        if (!ativo) return;
        setUsuario(u);
        localStorage.setItem(STORAGE.usuario, JSON.stringify(u));
      })
      .catch(() => {
        if (!ativo) return;
        limparSessao();
        setUsuario(null);
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, []);

  async function entrar(email: string, senha: string): Promise<void> {
    const data = await apiFetch<LoginResponse>('/auth/login', {
      method: 'POST',
      body: { email, senha },
      auth: false,
    });
    salvarTokens(data);
    setUsuario(data.usuario);
  }

  function sair(): void {
    // best-effort no servidor; a sessão local é sempre limpa
    void apiFetch('/auth/logout', { method: 'POST' }).catch(() => undefined);
    limparSessao();
    setUsuario(null);
  }

  return (
    <AuthContext.Provider value={{ usuario, carregando, entrar, sair }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>.');
  return ctx;
}
