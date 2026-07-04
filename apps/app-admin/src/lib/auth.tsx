import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { UsuarioPublico } from '@solatium/shared';
import { ROLES_ADMIN } from '@solatium/shared';
import { api, tokenStore, ApiError } from './api';

interface AuthContextValue {
  usuario: UsuarioPublico | null;
  carregando: boolean;
  entrar: (email: string, senha: string) => Promise<void>;
  sair: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioPublico | null>(null);
  const [carregando, setCarregando] = useState(true);

  // Ao montar: se há token salvo, tenta recuperar o perfil.
  useEffect(() => {
    let ativo = true;
    async function iniciar() {
      if (!tokenStore.access) {
        setCarregando(false);
        return;
      }
      try {
        const perfil = await api.me();
        if (ativo) {
          if (ROLES_ADMIN.includes(perfil.role)) {
            setUsuario(perfil);
          } else {
            tokenStore.limpar();
          }
        }
      } catch {
        tokenStore.limpar();
      } finally {
        if (ativo) setCarregando(false);
      }
    }
    void iniciar();
    return () => {
      ativo = false;
    };
  }, []);

  async function entrar(email: string, senha: string): Promise<void> {
    const resposta = await api.login(email, senha);
    // Este app é exclusivo do backoffice: bloqueia roles de loja.
    if (!ROLES_ADMIN.includes(resposta.usuario.role)) {
      tokenStore.limpar();
      throw new ApiError('Acesso restrito ao backoffice', 403);
    }
    tokenStore.salvar(resposta.accessToken, resposta.refreshToken);
    setUsuario(resposta.usuario);
  }

  function sair(): void {
    tokenStore.limpar();
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
