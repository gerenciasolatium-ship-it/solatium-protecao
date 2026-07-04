import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

/** Bloqueia rotas quando não há vendedor autenticado. */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { usuario, carregando } = useAuth();

  if (carregando) {
    return (
      <div className="grid min-h-screen place-items-center text-sol-azul">
        <span className="animate-pulse text-lg font-medium">Carregando…</span>
      </div>
    );
  }

  if (!usuario) return <Navigate to="/login" replace />;

  return <>{children}</>;
}
