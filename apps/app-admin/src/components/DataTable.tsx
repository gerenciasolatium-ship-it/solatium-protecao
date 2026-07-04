import type { ReactNode } from 'react';

export interface Coluna<T> {
  titulo: string;
  render: (linha: T) => ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  titulo: string;
  colunas: Coluna<T>[];
  dados: T[];
  chave: (linha: T) => string;
  carregando?: boolean;
  erro?: string | null;
  busca: string;
  onBusca: (valor: string) => void;
  buscaPlaceholder?: string;
  pagina: number;
  porPagina: number;
  total: number;
  onPagina: (pagina: number) => void;
  acoes?: ReactNode;
  vazio?: string;
}

export default function DataTable<T>({
  titulo,
  colunas,
  dados,
  chave,
  carregando,
  erro,
  busca,
  onBusca,
  buscaPlaceholder = 'Buscar…',
  pagina,
  porPagina,
  total,
  onPagina,
  acoes,
  vazio = 'Nenhum registro encontrado.',
}: DataTableProps<T>) {
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  const inicio = total === 0 ? 0 : (pagina - 1) * porPagina + 1;
  const fim = Math.min(pagina * porPagina, total);

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <h1 className="text-xl font-semibold text-sol-azul">{titulo}</h1>
        <div className="flex items-center gap-2">
          <input
            type="search"
            value={busca}
            onChange={(e) => onBusca(e.target.value)}
            placeholder={buscaPlaceholder}
            className="w-56 rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sol-azul focus:ring-1 focus:ring-sol-azul"
          />
          {acoes}
        </div>
      </div>

      {erro && (
        <div className="border-b border-red-200 bg-red-50 px-5 py-2 text-sm text-red-700">
          {erro}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {colunas.map((c) => (
                <th key={c.titulo} className={`px-5 py-3 font-medium ${c.className ?? ''}`}>
                  {c.titulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {carregando ? (
              <tr>
                <td colSpan={colunas.length} className="px-5 py-8 text-center text-slate-400">
                  Carregando…
                </td>
              </tr>
            ) : dados.length === 0 ? (
              <tr>
                <td colSpan={colunas.length} className="px-5 py-8 text-center text-slate-400">
                  {vazio}
                </td>
              </tr>
            ) : (
              dados.map((linha) => (
                <tr key={chave(linha)} className="hover:bg-slate-50">
                  {colunas.map((c) => (
                    <td key={c.titulo} className={`px-5 py-3 text-slate-700 ${c.className ?? ''}`}>
                      {c.render(linha)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-3 text-sm text-slate-500">
        <span>{total === 0 ? 'Nenhum registro' : `${inicio}–${fim} de ${total}`}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPagina(pagina - 1)}
            disabled={pagina <= 1}
            className="rounded border border-slate-300 px-3 py-1.5 font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="px-1">
            {pagina} / {totalPaginas}
          </span>
          <button
            type="button"
            onClick={() => onPagina(pagina + 1)}
            disabled={pagina >= totalPaginas}
            className="rounded border border-slate-300 px-3 py-1.5 font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Próxima
          </button>
        </div>
      </div>
    </section>
  );
}
