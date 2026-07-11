import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatarMoeda } from '../lib/ui';
import {
  CORES_FAIXA,
  GraficoPremioIndenizado,
  GraficoSinistralidade,
  MedidorSinistralidade,
  type PontoMensal,
} from '../components/charts';

interface ResumoAdmin {
  geradoEm: string;
  vidasAtivas: number;
  certificadosSuspensos: number;
  totalLojas: number;
  vendasMes: { quantidade: number; premio: number; ticketMedio: number };
  mrr: number;
  inadimplencia: {
    parcelasVencidas: number;
    valorVencido: number;
    pct: number;
    certificadosSuspensos: number;
  };
  sinistralidade: {
    pct12m: number;
    faixa: string;
    meta: number;
    premio12m: number;
    indenizado12m: number;
  };
  sinistros: Record<string, number>;
  funilVistorias: Record<string, number>;
  serieMensal: PontoMensal[];
  rankingLojas: Array<{
    lojaId: string;
    nome: string;
    status: string;
    vidasAtivas: number;
    vendasMes: number;
    premio12m: number;
    indenizado12m: number;
    sinistros12m: number;
    parcelasVencidas: number;
    sinistralidadePct: number;
    faixa: string;
  }>;
}

const ATUALIZAR_MS = 60_000;

function Tile({
  rotulo,
  valor,
  detalhe,
  alerta,
}: {
  rotulo: string;
  valor: string;
  detalhe?: string;
  alerta?: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sm font-medium text-slate-500">{rotulo}</div>
      <div
        className={`mt-2 text-3xl font-bold ${alerta ? 'text-red-600' : 'text-sol-azul'}`}
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {valor}
      </div>
      {detalhe && <div className="mt-1 text-xs text-slate-400">{detalhe}</div>}
    </div>
  );
}

const SINISTRO_LABEL: Record<string, string> = {
  ABERTO: 'Abertos',
  DOCUMENTACAO_PENDENTE: 'Doc. pendente',
  EM_ANALISE: 'Em análise',
  APROVADO: 'Aprovados',
  NEGADO: 'Negados',
};

export default function Dashboard() {
  const { usuario } = useAuth();
  const [resumo, setResumo] = useState<ResumoAdmin | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      setResumo(await api.get<ResumoAdmin>('/dashboard/resumo?top=15'));
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Erro ao carregar o dashboard.');
    }
  }, []);

  useEffect(() => {
    void carregar();
    const t = setInterval(() => void carregar(), ATUALIZAR_MS);
    return () => clearInterval(t);
  }, [carregar]);

  const emAndamento = resumo
    ? (resumo.sinistros.ABERTO ?? 0) +
      (resumo.sinistros.DOCUMENTACAO_PENDENTE ?? 0) +
      (resumo.sinistros.EM_ANALISE ?? 0)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-sol-azul">
            Olá, {usuario?.nome?.split(' ')[0] ?? 'operador'}
          </h1>
          <p className="text-sm text-slate-500">
            Visão executiva da carteira — atualiza a cada minuto.
          </p>
        </div>
        {resumo && (
          <span className="text-xs text-slate-400">{resumo.totalLojas} loja(s) cadastrada(s)</span>
        )}
      </div>

      {erro && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {erro}
        </div>
      )}

      {!resumo && !erro && <div className="py-16 text-center text-slate-400">Carregando…</div>}

      {resumo && (
        <>
          {/* KPIs principais */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Tile
              rotulo="Vidas ativas"
              valor={resumo.vidasAtivas.toLocaleString('pt-BR')}
              detalhe={`${resumo.certificadosSuspensos} suspensa(s) por atraso`}
            />
            <Tile
              rotulo="Vendas no mês"
              valor={resumo.vendasMes.quantidade.toLocaleString('pt-BR')}
              detalhe={`${formatarMoeda(resumo.vendasMes.premio)} — ticket ${formatarMoeda(resumo.vendasMes.ticketMedio)}`}
            />
            <Tile
              rotulo="MRR (carteira ativa)"
              valor={formatarMoeda(resumo.mrr)}
              detalhe="prêmio anualizado ÷ 12"
            />
            <Tile
              rotulo="Inadimplência"
              valor={`${resumo.inadimplencia.pct.toLocaleString('pt-BR')}%`}
              detalhe={`${resumo.inadimplencia.parcelasVencidas} parcela(s) vencida(s) — ${formatarMoeda(resumo.inadimplencia.valorVencido)}`}
              alerta={resumo.inadimplencia.pct > 5}
            />
          </div>

          {/* Sinistralidade (M13) + operação */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
              <div className="mb-1 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-700">
                  Sinistralidade da carteira (12 meses)
                </h2>
                <Link to="/sinistros" className="text-xs font-medium text-sol-azul hover:underline">
                  Ver sinistros →
                </Link>
              </div>
              <MedidorSinistralidade
                pct={resumo.sinistralidade.pct12m}
                meta={resumo.sinistralidade.meta}
                faixa={resumo.sinistralidade.faixa}
              />
              <div className="mt-6 text-xs text-slate-500">
                Prêmio arrecadado {formatarMoeda(resumo.sinistralidade.premio12m)} · Indenizações
                pagas {formatarMoeda(resumo.sinistralidade.indenizado12m)}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-700">Operação</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Sinistros em andamento</dt>
                  <dd className="font-semibold text-slate-800">{emAndamento}</dd>
                </div>
                {Object.entries(SINISTRO_LABEL).map(([status, rotulo]) =>
                  resumo.sinistros[status] ? (
                    <div key={status} className="flex justify-between pl-3">
                      <dt className="text-slate-400">{rotulo}</dt>
                      <dd className="text-slate-600">{resumo.sinistros[status]}</dd>
                    </div>
                  ) : null,
                )}
                <div className="flex justify-between border-t border-slate-100 pt-2">
                  <dt className="text-slate-500">Vistorias pendentes</dt>
                  <dd className="font-semibold text-slate-800">
                    {(resumo.funilVistorias.PENDENTE ?? 0) +
                      (resumo.funilVistorias.EM_ANALISE ?? 0)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Vistorias aprovadas</dt>
                  <dd className="text-slate-600">{resumo.funilVistorias.APROVADA ?? 0}</dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Séries mensais */}
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">
              Prêmio × indenizações por mês (R$)
            </h2>
            <GraficoPremioIndenizado dados={resumo.serieMensal} />
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Sinistralidade mensal (%)</h2>
            <GraficoSinistralidade dados={resumo.serieMensal} meta={resumo.sinistralidade.meta} />
          </div>

          {/* Ranking de lojas (M13 item 4) */}
          <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-700">
                Ranking de lojas por prêmio arrecadado (12 meses)
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-medium">#</th>
                    <th className="px-5 py-3 font-medium">Loja</th>
                    <th className="px-5 py-3 text-right font-medium">Vidas</th>
                    <th className="px-5 py-3 text-right font-medium">Vendas (mês)</th>
                    <th className="px-5 py-3 text-right font-medium">Prêmio 12m</th>
                    <th className="px-5 py-3 text-right font-medium">Indenizações 12m</th>
                    <th className="px-5 py-3 text-right font-medium">Vencidas</th>
                    <th className="px-5 py-3 font-medium">Sinistralidade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {resumo.rankingLojas.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-5 py-8 text-center text-slate-400">
                        Sem movimento na janela de 12 meses.
                      </td>
                    </tr>
                  )}
                  {resumo.rankingLojas.map((l, i) => {
                    const faixa = CORES_FAIXA[l.faixa] ?? CORES_FAIXA.VERDE;
                    return (
                      <tr key={l.lojaId} className="hover:bg-slate-50">
                        <td className="px-5 py-3 text-slate-400">{i + 1}</td>
                        <td className="px-5 py-3">
                          <div className="font-medium text-slate-800">{l.nome}</div>
                          {l.status !== 'ATIVA' && (
                            <span className="text-xs text-amber-600">{l.status}</span>
                          )}
                        </td>
                        <td
                          className="px-5 py-3 text-right text-slate-700"
                          style={{ fontVariantNumeric: 'tabular-nums' }}
                        >
                          {l.vidasAtivas}
                        </td>
                        <td
                          className="px-5 py-3 text-right text-slate-700"
                          style={{ fontVariantNumeric: 'tabular-nums' }}
                        >
                          {l.vendasMes}
                        </td>
                        <td
                          className="px-5 py-3 text-right text-slate-700"
                          style={{ fontVariantNumeric: 'tabular-nums' }}
                        >
                          {formatarMoeda(l.premio12m)}
                        </td>
                        <td
                          className="px-5 py-3 text-right text-slate-700"
                          style={{ fontVariantNumeric: 'tabular-nums' }}
                        >
                          {formatarMoeda(l.indenizado12m)}
                        </td>
                        <td
                          className="px-5 py-3 text-right"
                          style={{ fontVariantNumeric: 'tabular-nums' }}
                        >
                          {l.parcelasVencidas > 0 ? (
                            <span className="font-medium text-red-600">{l.parcelasVencidas}</span>
                          ) : (
                            <span className="text-slate-400">0</span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ background: faixa.cor }}
                            />
                            <span
                              className="text-slate-700"
                              style={{ fontVariantNumeric: 'tabular-nums' }}
                            >
                              {l.sinistralidadePct.toLocaleString('pt-BR', {
                                maximumFractionDigits: 1,
                              })}
                              %
                            </span>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
