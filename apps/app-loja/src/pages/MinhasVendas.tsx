import { useEffect, useState } from 'react';
import { Header } from '../components/Header';
import { apiFetch, ApiError } from '../lib/api';

interface ResumoLoja {
  loja: { id: string; nome: string };
  vidasAtivas: number;
  vendasMes: { quantidade: number; premio: number; ticketMedio: number };
  comissoes: { saldoContaCorrente: number; creditadasTotal: number };
  inadimplencia: { parcelasVencidas: number; valorVencido: number };
  sinistralidade: {
    pct12m: number;
    faixa: string;
    meta: number;
    premio12m: number;
    indenizado12m: number;
    margemAteVerde: number;
  };
  sinistrosEmAndamento: number;
  vouchersPendentes: { quantidade: number; valor: number };
  serieMensal: Array<{ mes: string; vendas: number; premio: number }>;
}

const FAIXA_INFO: Record<string, { cor: string; emoji: string; texto: string }> = {
  VERDE: { cor: 'text-green-700 bg-green-50 border-green-200', emoji: '🟢', texto: 'Faixa verde' },
  AMARELA: {
    cor: 'text-amber-700 bg-amber-50 border-amber-200',
    emoji: '🟡',
    texto: 'Atenção — perto da meta de 30%',
  },
  VERMELHA: {
    cor: 'text-red-700 bg-red-50 border-red-200',
    emoji: '🔴',
    texto: 'Acima da meta de 30%',
  },
};

function moeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function CartaoNumero({
  rotulo,
  valor,
  detalhe,
}: {
  rotulo: string;
  valor: string;
  detalhe?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{rotulo}</div>
      <div
        className="mt-1 text-2xl font-bold text-slate-900"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {valor}
      </div>
      {detalhe && <div className="mt-0.5 text-xs text-slate-500">{detalhe}</div>}
    </div>
  );
}

/** Dashboard da loja (M9/M13): vendas, comissões e a própria sinistralidade. */
export function MinhasVendas() {
  const [resumo, setResumo] = useState<ResumoLoja | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<ResumoLoja>('/dashboard/loja')
      .then(setResumo)
      .catch((e) => setErro(e instanceof ApiError ? e.message : 'Erro ao carregar o painel.'));
  }, []);

  const faixa = resumo ? (FAIXA_INFO[resumo.sinistralidade.faixa] ?? FAIXA_INFO.VERDE) : null;

  return (
    <div className="min-h-screen">
      <Header titulo="Minhas Vendas" voltar />

      <main className="mx-auto max-w-app px-4 py-5">
        {erro && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {erro}
          </div>
        )}
        {!resumo && !erro && <p className="py-10 text-center text-slate-400">Carregando…</p>}

        {resumo && faixa && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <CartaoNumero
                rotulo="Vendas no mês"
                valor={String(resumo.vendasMes.quantidade)}
                detalhe={moeda(resumo.vendasMes.premio)}
              />
              <CartaoNumero rotulo="Vidas ativas" valor={String(resumo.vidasAtivas)} />
              <CartaoNumero
                rotulo="Saldo de comissões"
                valor={moeda(resumo.comissoes.saldoContaCorrente)}
                detalhe={`${moeda(resumo.comissoes.creditadasTotal)} creditadas no total`}
              />
              <CartaoNumero
                rotulo="Vouchers a resgatar"
                valor={String(resumo.vouchersPendentes.quantidade)}
                detalhe={moeda(resumo.vouchersPendentes.valor)}
              />
            </div>

            {/* Sinistralidade da loja (M13 — transparência) */}
            <div className={`rounded-2xl border p-4 ${faixa.cor}`}>
              <div className="flex items-center justify-between">
                <span className="font-semibold">
                  {faixa.emoji} Sinistralidade da loja (12 meses)
                </span>
                <span className="text-2xl font-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {resumo.sinistralidade.pct12m.toLocaleString('pt-BR', {
                    maximumFractionDigits: 1,
                  })}
                  %
                </span>
              </div>
              <p className="mt-1 text-sm opacity-90">{faixa.texto}.</p>
              {resumo.sinistralidade.faixa === 'VERDE' ? (
                <p className="mt-1 text-xs opacity-75">
                  Margem até sair da faixa verde: {moeda(resumo.sinistralidade.margemAteVerde)} em
                  indenizações. Loja na faixa verde participa do profit share. 💪
                </p>
              ) : (
                <p className="mt-1 text-xs opacity-75">
                  Vistorias caprichadas no balcão derrubam esse número — a faixa verde ({'<'} 20%)
                  garante o profit share.
                </p>
              )}
            </div>

            {resumo.inadimplencia.parcelasVencidas > 0 && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                ⚠️ {resumo.inadimplencia.parcelasVencidas} parcela(s) de clientes em atraso (
                {moeda(resumo.inadimplencia.valorVencido)}). Cliente em atraso 15+ dias perde a
                cobertura — vale um toque no cliente.
              </div>
            )}

            {resumo.sinistrosEmAndamento > 0 && (
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
                📋 {resumo.sinistrosEmAndamento} sinistro(s) em andamento na loja.
              </div>
            )}

            {/* Últimos 6 meses (mini-barras) */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">
                Vendas — últimos 6 meses
              </div>
              <div className="flex items-end justify-between gap-2" style={{ height: 96 }}>
                {resumo.serieMensal.slice(-6).map((p) => {
                  const maximo = Math.max(1, ...resumo.serieMensal.slice(-6).map((x) => x.vendas));
                  const altura = Math.max(4, (p.vendas / maximo) * 80);
                  return (
                    <div
                      key={p.mes}
                      className="flex flex-1 flex-col items-center justify-end gap-1"
                    >
                      <span
                        className="text-xs font-medium text-slate-600"
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        {p.vendas}
                      </span>
                      <div
                        className="w-full max-w-8 rounded-t bg-sol-azul"
                        style={{ height: altura }}
                        title={`${p.mes}: ${p.vendas} venda(s)`}
                      />
                      <span className="text-[10px] text-slate-400">{p.mes.slice(5)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
