import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

const links = [
  { to: '/', rotulo: 'Painel', fim: true },
  { to: '/lojas', rotulo: 'Lojas', fim: false },
  { to: '/vendedores', rotulo: 'Vendedores', fim: false },
  { to: '/planos', rotulo: 'Planos', fim: false },
  { to: '/modelos', rotulo: 'Modelos', fim: false },
  { to: '/clientes', rotulo: 'Clientes', fim: false },
  { to: '/sinistros', rotulo: 'Sinistros', fim: false },
];

export default function Layout() {
  const { usuario, sair } = useAuth();
  const navigate = useNavigate();

  function handleSair(): void {
    sair();
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex h-full min-h-screen">
      {/* Sidebar */}
      <aside className="flex w-60 shrink-0 flex-col bg-sol-azul text-white">
        <div className="px-5 py-5">
          <div className="text-lg font-bold leading-tight">Proteção Solatium</div>
          <div className="text-xs text-white/60">Backoffice</div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.fim}
              className={({ isActive }) =>
                `block rounded px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'bg-white/15 text-white'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              {l.rotulo}
            </NavLink>
          ))}
        </nav>
        <div className="px-5 py-4 text-xs text-white/40">v0.1 — S1</div>
      </aside>

      {/* Conteúdo */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <div className="text-sm text-slate-500">Área administrativa</div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm font-medium text-slate-800">{usuario?.nome}</div>
              <div className="text-xs text-slate-500">{usuario?.role}</div>
            </div>
            <button
              type="button"
              onClick={handleSair}
              className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Sair
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
