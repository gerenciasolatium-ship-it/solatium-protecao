import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';

interface Cartao {
  recurso: string;
  rotulo: string;
  para: string;
}

const cartoes: Cartao[] = [
  { recurso: 'lojas', rotulo: 'Lojas', para: '/lojas' },
  { recurso: 'vendedores', rotulo: 'Vendedores', para: '/vendedores' },
  { recurso: 'planos', rotulo: 'Planos', para: '/planos' },
  { recurso: 'clientes', rotulo: 'Clientes', para: '/clientes' },
];

export default function Dashboard() {
  const { usuario } = useAuth();
  const [totais, setTotais] = useState<Record<string, number | null>>({});
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    async function carregar() {
      try {
        const resultados = await Promise.all(
          cartoes.map((c) =>
            api
              .listar<unknown>(c.recurso, { pagina: 1, porPagina: 1 })
              .then((r) => [c.recurso, r.total] as const)
              .catch(() => [c.recurso, null] as const),
          ),
        );
        if (ativo) {
          setTotais(Object.fromEntries(resultados));
        }
      } catch (e) {
        if (ativo) setErro(e instanceof ApiError ? e.message : 'Erro ao carregar totais.');
      }
    }
    void carregar();
    return () => {
      ativo = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-sol-azul">
          Olá, {usuario?.nome?.split(' ')[0] ?? 'operador'}
        </h1>
        <p className="text-sm text-slate-500">Visão geral dos cadastros da plataforma.</p>
      </div>

      {erro && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {erro}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cartoes.map((c) => {
          const valor = totais[c.recurso];
          return (
            <Link
              key={c.recurso}
              to={c.para}
              className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:border-sol-verde hover:shadow"
            >
              <div className="text-sm font-medium text-slate-500">{c.rotulo}</div>
              <div className="mt-2 text-3xl font-bold text-sol-azul">
                {valor === undefined ? '…' : (valor ?? '—')}
              </div>
              <div className="mt-1 text-xs text-slate-400">Total cadastrado</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
