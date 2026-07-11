/** Utilidades puras dos dashboards (M9/M13) — testáveis sem banco. */

/** Meta de sinistralidade (CLAUDE.md M13): verde <20%, amarela 20–30%, vermelha >30%. */
export const META_SINISTRALIDADE_PCT = 30;

export type FaixaSinistralidade = 'VERDE' | 'AMARELA' | 'VERMELHA';

export function arredondar2(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/** Sinistralidade = indenizações pagas / prêmio arrecadado, em % (0 quando sem prêmio). */
export function sinistralidadePct(premio: number, indenizado: number): number {
  if (premio <= 0) return 0;
  return arredondar2((indenizado / premio) * 100);
}

export function faixaSinistralidade(pct: number): FaixaSinistralidade {
  if (pct < 20) return 'VERDE';
  if (pct <= META_SINISTRALIDADE_PCT) return 'AMARELA';
  return 'VERMELHA';
}

export function ticketMedio(premioTotal: number, quantidade: number): number {
  if (quantidade <= 0) return 0;
  return arredondar2(premioTotal / quantidade);
}

/** Percentual de inadimplência por valor: vencido / (vencido + confirmado). */
export function pctInadimplencia(valorVencido: number, valorConfirmado: number): number {
  const base = valorVencido + valorConfirmado;
  if (base <= 0) return 0;
  return arredondar2((valorVencido / base) * 100);
}

/** Percentual simples parte/total em % (0 quando não há base). */
export function pct(parte: number, total: number): number {
  if (total <= 0) return 0;
  return arredondar2((parte / total) * 100);
}

/** Rótulos YYYY-MM dos últimos `n` meses, do mais antigo ao atual. */
export function ultimosMeses(n: number, referencia: Date = new Date()): string[] {
  const meses: string[] = [];
  const ano = referencia.getUTCFullYear();
  const mes = referencia.getUTCMonth();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(ano, mes - i, 1));
    meses.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return meses;
}

export interface PontoSerieMensal {
  mes: string; // YYYY-MM
  vendas: number;
  /** Prêmio EMITIDO no mês (contratos vendidos — valor cheio, mesmo parcelado). */
  emitido: number;
  /** Prêmio RECEBIDO no mês (pagamentos confirmados — o que entrou de fato). */
  premio: number;
  indenizado: number;
  cancelados: number;
  sinistralidadePct: number;
}

export interface AgregadosMensais {
  vendas: Map<string, number>;
  emitido: Map<string, number>;
  premio: Map<string, number>;
  indenizado: Map<string, number>;
  cancelados: Map<string, number>;
}

/**
 * Junta os agregados mensais (vendas, prêmio emitido, prêmio recebido,
 * indenizações, cancelamentos) numa série contínua — meses sem movimento
 * entram zerados (gráfico sem buracos).
 */
export function montarSerieMensal(
  meses: string[],
  agregados: AgregadosMensais,
): PontoSerieMensal[] {
  return meses.map((mes) => {
    const premio = arredondar2(agregados.premio.get(mes) ?? 0);
    const indenizado = arredondar2(agregados.indenizado.get(mes) ?? 0);
    return {
      mes,
      vendas: agregados.vendas.get(mes) ?? 0,
      emitido: arredondar2(agregados.emitido.get(mes) ?? 0),
      premio,
      indenizado,
      cancelados: agregados.cancelados.get(mes) ?? 0,
      sinistralidadePct: sinistralidadePct(premio, indenizado),
    };
  });
}
