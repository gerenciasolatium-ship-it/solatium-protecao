import { useCallback, useEffect, useState } from 'react';
import { Header } from '../components/Header';
import { apiFetch, ApiError } from '../lib/api';

interface CertificadoResumo {
  id: string;
  numero: string;
  status: string;
  cliente: { nome: string; cpf: string };
  aparelho: { marca: string; modelo: string; imei: string };
}

interface Sinistro {
  id: string;
  status: string;
  relato?: string | null;
  boUrl?: string | null;
  createdAt: string;
  cliente: { nome: string };
  certificado: { numero: string; aparelho: { marca: string; modelo: string } };
  voucher?: { codigo: string; valor: string; validade: string; status: string } | null;
}

interface Paginado<T> {
  itens: T[];
  total: number;
}

const STATUS_LABEL: Record<string, { rotulo: string; classe: string }> = {
  ABERTO: { rotulo: 'Aberto', classe: 'bg-slate-100 text-slate-700' },
  DOCUMENTACAO_PENDENTE: { rotulo: 'Falta B.O.', classe: 'bg-amber-100 text-amber-800' },
  EM_ANALISE: { rotulo: 'Em análise', classe: 'bg-blue-100 text-blue-800' },
  APROVADO: { rotulo: 'Aprovado ✓', classe: 'bg-green-100 text-green-800' },
  NEGADO: { rotulo: 'Negado', classe: 'bg-red-100 text-red-800' },
};

function moeda(valor: string | number): string {
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function Sinistros() {
  const [sinistros, setSinistros] = useState<Sinistro[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // Fluxo de abertura
  const [abrindo, setAbrindo] = useState(false);
  const [buscaCert, setBuscaCert] = useState('');
  const [certificados, setCertificados] = useState<CertificadoResumo[]>([]);
  const [certificado, setCertificado] = useState<CertificadoResumo | null>(null);
  const [relato, setRelato] = useState('');
  const [boUrl, setBoUrl] = useState('');
  const [boData, setBoData] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erroAbrir, setErroAbrir] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await apiFetch<Paginado<Sinistro>>('/sinistros', {
        query: { pagina: 1, porPagina: 50 },
      });
      setSinistros(r.itens);
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Erro ao carregar sinistros.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Busca de certificado (debounce simples)
  useEffect(() => {
    if (!abrindo || certificado) return;
    const t = setTimeout(async () => {
      try {
        const r = await apiFetch<Paginado<CertificadoResumo>>('/certificados', {
          query: { pagina: 1, porPagina: 5, busca: buscaCert || undefined },
        });
        setCertificados(r.itens.filter((c) => c.status === 'ATIVO'));
      } catch {
        setCertificados([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [abrindo, buscaCert, certificado]);

  async function abrirSinistro(): Promise<void> {
    if (!certificado) return;
    setEnviando(true);
    setErroAbrir(null);
    try {
      await apiFetch('/sinistros', {
        method: 'POST',
        body: {
          certificadoId: certificado.id,
          ...(relato.trim() ? { relato: relato.trim() } : {}),
          ...(boUrl.trim() ? { boUrl: boUrl.trim() } : {}),
          ...(boData ? { boData: new Date(`${boData}T12:00:00-03:00`).toISOString() } : {}),
        },
      });
      setAbrindo(false);
      setCertificado(null);
      setRelato('');
      setBoUrl('');
      setBoData('');
      setBuscaCert('');
      await carregar();
    } catch (e) {
      setErroAbrir(e instanceof ApiError ? e.message : 'Erro ao abrir o sinistro.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="min-h-screen">
      <Header titulo="Sinistros" voltar />

      <main className="mx-auto max-w-app px-4 py-5">
        {!abrindo && (
          <button
            onClick={() => setAbrindo(true)}
            className="mb-5 w-full rounded-2xl bg-sol-verde p-4 text-lg font-semibold text-white shadow-sm transition active:scale-[0.99]"
          >
            🚨 Abrir sinistro
          </button>
        )}

        {abrindo && (
          <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold text-slate-900">Abrir sinistro</h2>

            {!certificado ? (
              <>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Certificado do cliente
                </label>
                <input
                  value={buscaCert}
                  onChange={(e) => setBuscaCert(e.target.value)}
                  placeholder="Nº do certificado, nome ou IMEI…"
                  className="w-full rounded-xl border border-slate-300 px-3 py-3 text-base outline-none focus:border-sol-azul"
                />
                <div className="mt-2 space-y-2">
                  {certificados.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setCertificado(c)}
                      className="block w-full rounded-xl border border-slate-200 p-3 text-left transition active:bg-slate-50"
                    >
                      <div className="font-medium text-slate-900">{c.numero}</div>
                      <div className="text-sm text-slate-500">
                        {c.cliente.nome} — {c.aparelho.marca} {c.aparelho.modelo} (IMEI …
                        {c.aparelho.imei.slice(-4)})
                      </div>
                    </button>
                  ))}
                  {buscaCert && certificados.length === 0 && (
                    <p className="py-2 text-sm text-slate-400">
                      Nenhum certificado ATIVO encontrado.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="mb-3 rounded-xl bg-slate-50 p-3">
                  <div className="font-medium text-slate-900">{certificado.numero}</div>
                  <div className="text-sm text-slate-500">
                    {certificado.cliente.nome} — {certificado.aparelho.marca}{' '}
                    {certificado.aparelho.modelo}
                  </div>
                  <button
                    onClick={() => setCertificado(null)}
                    className="mt-1 text-sm font-medium text-sol-azul"
                  >
                    Trocar certificado
                  </button>
                </div>

                <label className="mb-1 block text-sm font-medium text-slate-700">
                  O que aconteceu?
                </label>
                <textarea
                  value={relato}
                  onChange={(e) => setRelato(e.target.value)}
                  placeholder="Relato do cliente (roubo/furto, onde, quando)…"
                  className="min-h-24 w-full rounded-xl border border-slate-300 px-3 py-3 text-base outline-none focus:border-sol-azul"
                />

                <label className="mb-1 mt-3 block text-sm font-medium text-slate-700">
                  Link do B.O. digital (obrigatório para aprovação)
                </label>
                <input
                  value={boUrl}
                  onChange={(e) => setBoUrl(e.target.value)}
                  placeholder="https://…"
                  className="w-full rounded-xl border border-slate-300 px-3 py-3 text-base outline-none focus:border-sol-azul"
                />

                <label className="mb-1 mt-3 block text-sm font-medium text-slate-700">
                  Data do B.O.
                </label>
                <input
                  type="date"
                  value={boData}
                  onChange={(e) => setBoData(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-3 text-base outline-none focus:border-sol-azul"
                />

                {erroAbrir && (
                  <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {erroAbrir}
                  </div>
                )}

                <button
                  onClick={() => void abrirSinistro()}
                  disabled={enviando}
                  className="mt-4 w-full rounded-xl bg-sol-verde py-3 text-base font-semibold text-white transition active:scale-[0.99] disabled:opacity-50"
                >
                  {enviando ? 'Abrindo…' : 'Confirmar abertura'}
                </button>
              </>
            )}

            <button
              onClick={() => {
                setAbrindo(false);
                setCertificado(null);
              }}
              className="mt-2 w-full rounded-xl border border-slate-300 py-3 text-base font-medium text-slate-700"
            >
              Cancelar
            </button>
          </section>
        )}

        {erro && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {erro}
          </div>
        )}

        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Sinistros da loja
        </h2>
        {carregando ? (
          <p className="py-6 text-center text-slate-400">Carregando…</p>
        ) : sinistros.length === 0 ? (
          <p className="py-6 text-center text-slate-400">Nenhum sinistro registrado.</p>
        ) : (
          <div className="space-y-2">
            {sinistros.map((s) => {
              const info = STATUS_LABEL[s.status] ?? {
                rotulo: s.status,
                classe: 'bg-slate-100 text-slate-700',
              };
              return (
                <div
                  key={s.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-slate-900">{s.certificado.numero}</div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${info.classe}`}
                    >
                      {info.rotulo}
                    </span>
                  </div>
                  <div className="mt-0.5 text-sm text-slate-500">
                    {s.cliente.nome} — {s.certificado.aparelho.marca}{' '}
                    {s.certificado.aparelho.modelo}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-400">
                    Aberto em {new Date(s.createdAt).toLocaleDateString('pt-BR')}
                  </div>
                  {s.voucher && (
                    <div className="mt-2 rounded-xl bg-green-50 p-3 text-sm text-green-800">
                      🎟 Voucher <strong>{s.voucher.codigo}</strong> — {moeda(s.voucher.valor)}{' '}
                      {s.voucher.status === 'RESGATADO'
                        ? '(já resgatado)'
                        : `— válido até ${new Date(s.voucher.validade).toLocaleDateString('pt-BR')}`}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
