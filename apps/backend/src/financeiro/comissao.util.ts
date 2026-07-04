/**
 * M12 — Cálculo de comissão e clawback proporcional (CLAUDE.md M12 / regra central).
 *
 * Regra: comissão antecipada sobre contrato anual é calculada sobre 12 parcelas.
 * Ao cancelar com N parcelas pagas:
 *   - comissão devida  = valorTotal × (N / 12)
 *   - clawback (estorno) = valorTotal × ((12 − N) / 12)
 * Mesmo racional vale para comissão de LOJA, de CORRETAGEM e pró-labore.
 */

export const PARCELAS_ANUAL = 12;

/** Arredonda para 2 casas (centavos), evitando erros de ponto flutuante. */
export function arredondar2(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

function limitar(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

/** Comissão cheia sobre um prêmio base (ex.: prêmio anual × % da loja). */
export function comissaoTotal(premioBase: number, pct: number): number {
  return arredondar2(premioBase * pct);
}

/** Comissão efetivamente devida quando `parcelasPagas` de `parcelasTotais` foram quitadas. */
export function comissaoDevida(
  valorTotal: number,
  parcelasPagas: number,
  parcelasTotais: number = PARCELAS_ANUAL,
): number {
  if (parcelasTotais <= 0) return 0;
  const n = limitar(parcelasPagas, 0, parcelasTotais);
  return arredondar2((valorTotal * n) / parcelasTotais);
}

/** Clawback: parcela da comissão a estornar, proporcional às parcelas NÃO pagas. */
export function clawbackProporcional(
  valorTotal: number,
  parcelasPagas: number,
  parcelasTotais: number = PARCELAS_ANUAL,
): number {
  if (parcelasTotais <= 0) return 0;
  const n = limitar(parcelasPagas, 0, parcelasTotais);
  return arredondar2((valorTotal * (parcelasTotais - n)) / parcelasTotais);
}

export interface MemoriaClawback {
  valorTotal: number;
  parcelasPagas: number;
  parcelasTotais: number;
  valorDevido: number;
  valorClawback: number;
}

/** Monta a memória de cálculo visível do clawback (para auditoria/relatório). */
export function memoriaClawback(
  valorTotal: number,
  parcelasPagas: number,
  parcelasTotais: number = PARCELAS_ANUAL,
): MemoriaClawback {
  return {
    valorTotal: arredondar2(valorTotal),
    parcelasPagas,
    parcelasTotais,
    valorDevido: comissaoDevida(valorTotal, parcelasPagas, parcelasTotais),
    valorClawback: clawbackProporcional(valorTotal, parcelasPagas, parcelasTotais),
  };
}

/**
 * Ajuste de comissão por endosso: reduz prêmio → clawback da diferença;
 * aumenta prêmio → crédito complementar.
 */
export function ajusteEndosso(
  comissaoAntes: number,
  comissaoDepois: number,
): { tipo: 'CREDITO' | 'DEBITO_CLAWBACK'; valor: number } {
  const delta = arredondar2(comissaoDepois - comissaoAntes);
  return delta >= 0
    ? { tipo: 'CREDITO', valor: delta }
    : { tipo: 'DEBITO_CLAWBACK', valor: Math.abs(delta) };
}
