import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

interface HeaderProps {
  titulo: string;
  /** Mostra a seta de voltar (padrão: false). */
  voltar?: boolean;
}

/** Cabeçalho simples e fixo, na cor da marca. */
export function Header({ titulo, voltar = false }: HeaderProps) {
  const { usuario, sair } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-10 bg-sol-azul text-white shadow">
      <div className="mx-auto flex max-w-app items-center gap-3 px-4 py-3">
        {voltar && (
          <button
            onClick={() => navigate(-1)}
            aria-label="Voltar"
            className="-ml-1 rounded-lg px-2 py-1 text-2xl leading-none active:bg-white/10"
          >
            ‹
          </button>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs text-white/70">Proteção Solatium</p>
          <h1 className="truncate text-lg font-semibold leading-tight">{titulo}</h1>
        </div>
        {usuario && (
          <button
            onClick={sair}
            className="shrink-0 rounded-lg bg-white/10 px-3 py-2 text-sm font-medium active:bg-white/20"
          >
            Sair
          </button>
        )}
      </div>
    </header>
  );
}
