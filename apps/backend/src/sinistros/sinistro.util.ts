import { randomBytes } from 'crypto';

/** Dias após a emissão em que um sinistro é considerado "precoce" (alerta). */
export const SINISTRO_PRECOCE_DIAS = 30;
/** Sinistralidade da loja (%) acima da qual a abertura ganha alerta. */
export const LOJA_SINISTRALIDADE_ALERTA_PCT = 30;
/** Validade do voucher em dias (CLAUDE.md M6). */
export const VOUCHER_VALIDADE_DIAS = 90;

export interface AlertaFraude {
  codigo:
    | 'SINISTRO_PRECOCE'
    | 'DENTRO_CARENCIA'
    | 'BO_ANTERIOR_VIGENCIA'
    | 'CPF_REINCIDENTE'
    | 'LOJA_SINISTRALIDADE_ALTA';
  descricao: string;
}

export interface AvaliacaoFraudeInput {
  aberturaEm: Date;
  vigenciaInicio: Date;
  carenciaAte?: Date | null;
  boData?: Date | null;
  /** Sinistros anteriores do mesmo CPF (qualquer certificado, excluindo este). */
  sinistrosAnterioresDoCpf: number;
  /** Sinistralidade da loja de origem em % (0–100), se conhecida. */
  sinistralidadeLojaPct?: number | null;
}

/**
 * Regras automáticas de alerta antifraude na abertura do sinistro (M6).
 * Alertas NÃO bloqueiam a abertura — marcam o caso para análise humana.
 */
export function avaliarAlertasFraude(input: AvaliacaoFraudeInput): AlertaFraude[] {
  const alertas: AlertaFraude[] = [];
  const diasDesdeEmissao =
    (input.aberturaEm.getTime() - input.vigenciaInicio.getTime()) / 86_400_000;

  if (diasDesdeEmissao < SINISTRO_PRECOCE_DIAS) {
    alertas.push({
      codigo: 'SINISTRO_PRECOCE',
      descricao: `Sinistro aberto ${Math.max(0, Math.floor(diasDesdeEmissao))} dia(s) após o início da vigência (< ${SINISTRO_PRECOCE_DIAS}).`,
    });
  }
  if (input.carenciaAte && input.aberturaEm < input.carenciaAte) {
    alertas.push({
      codigo: 'DENTRO_CARENCIA',
      descricao: 'Sinistro aberto dentro do período de carência de 72h.',
    });
  }
  if (input.boData && input.boData < input.vigenciaInicio) {
    alertas.push({
      codigo: 'BO_ANTERIOR_VIGENCIA',
      descricao: 'Data do B.O. é anterior ao início da vigência do certificado.',
    });
  }
  if (input.sinistrosAnterioresDoCpf > 0) {
    alertas.push({
      codigo: 'CPF_REINCIDENTE',
      descricao: `Cliente já tem ${input.sinistrosAnterioresDoCpf} sinistro(s) anterior(es) no sistema.`,
    });
  }
  if (
    input.sinistralidadeLojaPct != null &&
    input.sinistralidadeLojaPct > LOJA_SINISTRALIDADE_ALERTA_PCT
  ) {
    alertas.push({
      codigo: 'LOJA_SINISTRALIDADE_ALTA',
      descricao: `Loja de origem com sinistralidade de ${input.sinistralidadeLojaPct.toFixed(1)}% (> ${LOJA_SINISTRALIDADE_ALERTA_PCT}%).`,
    });
  }
  return alertas;
}

/**
 * Valor do voucher (M6, regra 13): capital segurado × (1 − franquia%/100).
 * A franquia vem SEMPRE do plano — nunca hard-coded.
 * Ex.: aparelho R$ 3.000, franquia 25% → voucher R$ 2.250 / franquia R$ 750.
 */
export function calcularVoucher(
  capitalSegurado: number,
  franquiaPercentual: number,
): { voucher: number; franquia: number } {
  const franquia = Math.round(capitalSegurado * franquiaPercentual) / 100;
  const voucher = Math.round(capitalSegurado * 100 - franquia * 100) / 100;
  return { voucher, franquia };
}

/** Transições permitidas da esteira (M6). Estados finais não saem mais. */
export const TRANSICOES_SINISTRO: Record<string, string[]> = {
  ABERTO: ['DOCUMENTACAO_PENDENTE', 'EM_ANALISE', 'NEGADO'],
  DOCUMENTACAO_PENDENTE: ['EM_ANALISE', 'NEGADO'],
  EM_ANALISE: ['APROVADO', 'NEGADO', 'DOCUMENTACAO_PENDENTE'],
  APROVADO: [],
  NEGADO: [],
};

export function transicaoValida(de: string, para: string): boolean {
  return (TRANSICOES_SINISTRO[de] ?? []).includes(para);
}

/** Código do voucher: VC-XXXXXXXXXX (sem caracteres ambíguos 0/O/1/I/L). */
export function gerarCodigoVoucher(): string {
  const alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(10);
  let codigo = '';
  for (let i = 0; i < 10; i++) codigo += alfabeto[bytes[i] % alfabeto.length];
  return `VC-${codigo}`;
}
