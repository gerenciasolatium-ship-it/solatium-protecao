import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Paginacao } from '@solatium/shared';
import { Header } from '../components/Header';
import { apiFetch, ApiError } from '../lib/api';

interface Cliente {
  id: string;
  nome: string;
  cpf: string;
  telefoneWhatsapp: string;
  email?: string | null;
}

const POR_PAGINA = 20;

function formatarCpf(cpf: string): string {
  const d = cpf.replace(/\D/g, '').slice(0, 11);
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function Clientes() {
  const [busca, setBusca] = useState('');
  const [buscaAtiva, setBuscaAtiva] = useState('');
  const [itens, setItens] = useState<Cliente[]>([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  // Debounce da busca.
  useEffect(() => {
    const t = setTimeout(() => setBuscaAtiva(busca.trim()), 350);
    return () => clearTimeout(t);
  }, [busca]);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    setErro('');
    apiFetch<Paginacao<Cliente>>('/clientes', {
      query: { pagina: 1, porPagina: POR_PAGINA, busca: buscaAtiva },
    })
      .then((resp) => {
        if (!ativo) return;
        setItens(resp.itens);
        setTotal(resp.total);
      })
      .catch((err) => {
        if (!ativo) return;
        setItens([]);
        setTotal(0);
        setErro(err instanceof ApiError ? err.message : 'Não foi possível carregar os clientes.');
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, [buscaAtiva]);

  return (
    <div className="min-h-screen">
      <Header titulo="Meus Clientes" voltar />

      <main className="mx-auto max-w-app px-4 py-4">
        <input
          type="search"
          className="campo"
          placeholder="Buscar por nome, CPF ou telefone…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />

        <div className="mt-4">
          {carregando ? (
            <p className="py-10 text-center text-slate-500">Carregando…</p>
          ) : erro ? (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {erro}
            </p>
          ) : itens.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              <p className="text-lg">Nenhum cliente encontrado.</p>
              <p className="mt-1 text-sm">Cadastre o primeiro tocando no botão abaixo.</p>
            </div>
          ) : (
            <>
              <p className="mb-2 text-sm text-slate-500">
                {total} cliente{total === 1 ? '' : 's'}
              </p>
              <ul className="flex flex-col gap-2">
                {itens.map((c) => (
                  <li key={c.id} className="card">
                    <p className="font-semibold text-slate-900">{c.nome}</p>
                    <p className="text-sm text-slate-500">
                      {formatarCpf(c.cpf)} · {c.telefoneWhatsapp}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </main>

      {/* Botão flutuante de cadastro, ao alcance do polegar. */}
      <Link to="/clientes/novo" className="fixed inset-x-0 bottom-0 mx-auto max-w-app px-4 pb-5">
        <span className="btn-verde shadow-lg">+ Novo cliente</span>
      </Link>
    </div>
  );
}
