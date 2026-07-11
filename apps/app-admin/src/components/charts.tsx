import { useState } from 'react';
import { formatarMoeda } from '../lib/ui';

/**
 * Gráficos SVG do dashboard executivo (M9/M13). Sem dependências.
 * Paleta validada (validate_palette.js, superfície branca, ΔE CVD ≥22,6):
 * emitido/recebido = dois tons do MESMO azul (mesma medida, antes→depois),
 * indenizações = vermelho. Cores de status são reservadas (faixa de
 * sinistralidade) e sempre acompanham rótulo textual.
 */
export const COR_EMITIDO = '#5598e7'; // prêmio emitido (venda, valor cheio)
export const COR_RECEBIDO = '#1c5cab'; // prêmio recebido (caixa de fato)
export const COR_SERIE_2 = '#e34948'; // indenizações pagas
const COR_GRADE = '#e1e0d9';
const COR_EIXO = '#898781';
const COR_META = '#52514e';

export const CORES_FAIXA: Record<string, { cor: string; rotulo: string }> = {
  VERDE: { cor: '#0ca30c', rotulo: 'Verde (< 20%)' },
  AMARELA: { cor: '#c98500', rotulo: 'Amarela (20–30%)' },
  VERMELHA: { cor: '#d03b3b', rotulo: 'Vermelha (> 30%)' },
};

export interface PontoMensal {
  mes: string;
  vendas: number;
  emitido: number;
  premio: number;
  indenizado: number;
  cancelados: number;
  sinistralidadePct: number;
}

const MESES_CURTOS = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];

export function rotuloMes(mes: string): string {
  const [ano, m] = mes.split('-');
  const nome = MESES_CURTOS[Number(m) - 1] ?? mes;
  return m === '01' ? `${nome}/${ano.slice(2)}` : nome;
}

function formatarCompacto(valor: number): string {
  if (valor >= 1_000_000)
    return `${(valor / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}M`;
  if (valor >= 1_000)
    return `${(valor / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k`;
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

interface TooltipState {
  indice: number;
  x: number;
}

/** Barras agrupadas: prêmio emitido × recebido × indenizações (mesma unidade, R$). */
export function GraficoPremioIndenizado({ dados }: { dados: PontoMensal[] }) {
  const [hover, setHover] = useState<TooltipState | null>(null);
  const largura = 720;
  const altura = 220;
  const margem = { topo: 12, direita: 8, baixo: 24, esquerda: 46 };
  const areaL = largura - margem.esquerda - margem.direita;
  const areaA = altura - margem.topo - margem.baixo;
  const maximo = Math.max(1, ...dados.map((d) => Math.max(d.emitido, d.premio, d.indenizado)));
  const passo = areaL / Math.max(1, dados.length);
  const larguraBarra = Math.min(11, (passo - 10) / 3);

  const ticks = [0, 0.5, 1].map((f) => ({
    y: margem.topo + areaA * (1 - f),
    valor: maximo * f,
  }));

  const ponto = hover != null ? dados[hover.indice] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${largura} ${altura}`}
        className="w-full"
        role="img"
        aria-label="Prêmio arrecadado e indenizações pagas por mês"
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t.y}>
            <line
              x1={margem.esquerda}
              x2={largura - margem.direita}
              y1={t.y}
              y2={t.y}
              stroke={COR_GRADE}
              strokeWidth={1}
            />
            <text
              x={margem.esquerda - 6}
              y={t.y + 3.5}
              textAnchor="end"
              fontSize={10}
              fill={COR_EIXO}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {formatarCompacto(t.valor)}
            </text>
          </g>
        ))}
        {dados.map((d, i) => {
          const x0 = margem.esquerda + passo * i + passo / 2;
          const base = margem.topo + areaA;
          const opacidade = hover == null || hover.indice === i ? 1 : 0.45;
          const barras = [
            { valor: d.emitido, cor: COR_EMITIDO },
            { valor: d.premio, cor: COR_RECEBIDO },
            { valor: d.indenizado, cor: COR_SERIE_2 },
          ];
          return (
            <g key={d.mes}>
              {/* Área de hover maior que as marcas (hit target) */}
              <rect
                x={margem.esquerda + passo * i}
                y={margem.topo}
                width={passo}
                height={areaA}
                fill="transparent"
                onMouseEnter={() => setHover({ indice: i, x: x0 })}
              />
              {barras.map((b, j) => {
                const h = (b.valor / maximo) * areaA;
                const x = x0 + (j - 1.5) * (larguraBarra + 2) + 1;
                return (
                  <rect
                    key={b.cor}
                    x={x}
                    y={base - h}
                    width={larguraBarra}
                    height={Math.max(h, b.valor > 0 ? 2 : 0)}
                    rx={h > 4 ? 3 : 0}
                    fill={b.cor}
                    opacity={opacidade}
                    pointerEvents="none"
                  />
                );
              })}
              <text x={x0} y={altura - 8} textAnchor="middle" fontSize={10} fill={COR_EIXO}>
                {rotuloMes(d.mes)}
              </text>
            </g>
          );
        })}
        <line
          x1={margem.esquerda}
          x2={largura - margem.direita}
          y1={margem.topo + areaA}
          y2={margem.topo + areaA}
          stroke="#c3c2b7"
          strokeWidth={1}
        />
      </svg>

      {ponto && hover && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded border border-slate-200 bg-white px-3 py-2 text-xs shadow-md"
          style={{ left: `${(hover.x / largura) * 100}%` }}
        >
          <div className="font-medium text-slate-800">{rotuloMes(ponto.mes)}</div>
          <div className="mt-1 space-y-0.5 whitespace-nowrap text-slate-600">
            <div>
              <span
                className="mr-1 inline-block h-2 w-2 rounded-sm"
                style={{ background: COR_EMITIDO }}
              />
              Emitido: <strong>{formatarMoeda(ponto.emitido)}</strong>
            </div>
            <div>
              <span
                className="mr-1 inline-block h-2 w-2 rounded-sm"
                style={{ background: COR_RECEBIDO }}
              />
              Recebido: <strong>{formatarMoeda(ponto.premio)}</strong>
            </div>
            <div>
              <span
                className="mr-1 inline-block h-2 w-2 rounded-sm"
                style={{ background: COR_SERIE_2 }}
              />
              Indenizações: <strong>{formatarMoeda(ponto.indenizado)}</strong>
            </div>
            <div className="text-slate-500">
              {ponto.vendas} venda(s)
              {ponto.cancelados > 0 ? ` · ${ponto.cancelados} cancelamento(s)` : ''}
            </div>
          </div>
        </div>
      )}

      <div className="mt-1 flex items-center gap-4 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: COR_EMITIDO }}
          />
          Prêmio emitido
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: COR_RECEBIDO }}
          />
          Prêmio recebido
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: COR_SERIE_2 }}
          />
          Indenizações pagas
        </span>
      </div>
    </div>
  );
}

/** Linha de sinistralidade % mês a mês com a meta de 30% como referência. */
export function GraficoSinistralidade({ dados, meta }: { dados: PontoMensal[]; meta: number }) {
  const [hover, setHover] = useState<TooltipState | null>(null);
  const largura = 720;
  const altura = 170;
  const margem = { topo: 14, direita: 8, baixo: 24, esquerda: 40 };
  const areaL = largura - margem.esquerda - margem.direita;
  const areaA = altura - margem.topo - margem.baixo;
  const maximo = Math.max(meta * 1.4, ...dados.map((d) => d.sinistralidadePct)) || 1;
  const passo = areaL / Math.max(1, dados.length);

  const x = (i: number) => margem.esquerda + passo * i + passo / 2;
  const y = (v: number) => margem.topo + areaA * (1 - v / maximo);
  const caminho = dados
    .map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.sinistralidadePct).toFixed(1)}`)
    .join(' ');
  const yMeta = y(meta);
  const ponto = hover != null ? dados[hover.indice] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${largura} ${altura}`}
        className="w-full"
        role="img"
        aria-label={`Sinistralidade mensal em % com meta de ${meta}%`}
        onMouseLeave={() => setHover(null)}
      >
        <line
          x1={margem.esquerda}
          x2={largura - margem.direita}
          y1={margem.topo + areaA}
          y2={margem.topo + areaA}
          stroke="#c3c2b7"
          strokeWidth={1}
        />
        {/* Meta 30%: referência tracejada com rótulo (nunca só cor) */}
        <line
          x1={margem.esquerda}
          x2={largura - margem.direita}
          y1={yMeta}
          y2={yMeta}
          stroke={COR_META}
          strokeWidth={1}
          strokeDasharray="4 4"
        />
        <text
          x={largura - margem.direita}
          y={yMeta - 4}
          textAnchor="end"
          fontSize={10}
          fill={COR_META}
        >
          meta {meta}%
        </text>

        {hover != null && (
          <line
            x1={x(hover.indice)}
            x2={x(hover.indice)}
            y1={margem.topo}
            y2={margem.topo + areaA}
            stroke={COR_GRADE}
            strokeWidth={1}
          />
        )}

        <path
          d={caminho}
          fill="none"
          stroke={COR_SERIE_2}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {dados.map((d, i) => (
          <g key={d.mes}>
            <rect
              x={margem.esquerda + passo * i}
              y={margem.topo}
              width={passo}
              height={areaA}
              fill="transparent"
              onMouseEnter={() => setHover({ indice: i, x: x(i) })}
            />
            {(hover?.indice === i || d.sinistralidadePct > 0) && (
              <circle
                cx={x(i)}
                cy={y(d.sinistralidadePct)}
                r={hover?.indice === i ? 4 : 2.5}
                fill={COR_SERIE_2}
                stroke="#fff"
                strokeWidth={hover?.indice === i ? 2 : 0}
                pointerEvents="none"
              />
            )}
            <text x={x(i)} y={altura - 8} textAnchor="middle" fontSize={10} fill={COR_EIXO}>
              {rotuloMes(d.mes)}
            </text>
          </g>
        ))}
      </svg>

      {ponto && hover && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded border border-slate-200 bg-white px-3 py-2 text-xs shadow-md"
          style={{ left: `${(hover.x / largura) * 100}%` }}
        >
          <div className="font-medium text-slate-800">{rotuloMes(ponto.mes)}</div>
          <div className="whitespace-nowrap text-slate-600">
            Sinistralidade: <strong>{ponto.sinistralidadePct.toLocaleString('pt-BR')}%</strong>
          </div>
        </div>
      )}
    </div>
  );
}

/** Medidor da sinistralidade acumulada contra a meta (M13 — leitura de razão vs limite). */
export function MedidorSinistralidade({
  pct,
  meta,
  faixa,
}: {
  pct: number;
  meta: number;
  faixa: string;
}) {
  const escala = Math.max(meta * 2, pct * 1.15, 1);
  const preenchido = Math.min(100, (pct / escala) * 100);
  const posMeta = Math.min(100, (meta / escala) * 100);
  const info = CORES_FAIXA[faixa] ?? CORES_FAIXA.VERDE;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span
          className="text-3xl font-bold text-slate-900"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
        </span>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
          style={{ background: info.cor }}
        >
          {faixa === 'VERDE' ? '✓' : faixa === 'AMARELA' ? '!' : '✕'} {info.rotulo}
        </span>
      </div>
      <div className="relative mt-3 h-3 overflow-visible rounded-full bg-slate-100">
        <div
          className="h-3 rounded-full transition-all"
          style={{ width: `${preenchido}%`, background: info.cor }}
        />
        <div
          className="absolute -top-1 h-5 w-0.5 bg-slate-500"
          style={{ left: `${posMeta}%` }}
          title={`Meta: ${meta}%`}
        />
        <div
          className="absolute top-5 -translate-x-1/2 text-[10px] text-slate-500"
          style={{ left: `${posMeta}%` }}
        >
          meta {meta}%
        </div>
      </div>
    </div>
  );
}
