/** Prazo padrão pro Pix do balcão ser pago antes de virar boleto (env PIX_FALLBACK_BOLETO_MINUTOS; 0 desliga). */
export const PIX_FALLBACK_PADRAO_MINUTOS = 30;

/** Vencimento do boleto gerado pelo fallback (dias corridos). */
export const BOLETO_FALLBACK_VENCIMENTO_DIAS = 3;

export interface FallbackPixContexto {
  /** asaasId que o job carregou (a cobrança Pix daquele momento). */
  jobAsaasId: string;
  /** asaasId da cobrança corrente no checkout do contrato. */
  checkoutAsaasId?: string | null;
  temCertificado: boolean;
  temPagamentoConfirmado: boolean;
  /** Status atual do pagamento Pix do job (null = não encontrado). */
  statusPagamentoPix?: string | null;
}

/**
 * O fallback Pix→boleto só roda se NADA mudou desde o agendamento: mesma
 * cobrança no checkout (vendedor não trocou a forma), Pix ainda PENDENTE e
 * contrato sem pagamento confirmado/certificado. Qualquer outra situação =
 * não fazer nada (idempotente e à prova de corrida com o webhook).
 */
export function podeAplicarFallbackPix(ctx: FallbackPixContexto): {
  aplicar: boolean;
  motivo?: string;
} {
  if (ctx.temCertificado) return { aplicar: false, motivo: 'contrato já emitido' };
  if (ctx.temPagamentoConfirmado) return { aplicar: false, motivo: 'pagamento já confirmado' };
  if (!ctx.checkoutAsaasId || ctx.checkoutAsaasId !== ctx.jobAsaasId) {
    return { aplicar: false, motivo: 'cobrança do checkout mudou (vendedor gerou outra)' };
  }
  if (ctx.statusPagamentoPix !== 'PENDENTE') {
    return { aplicar: false, motivo: `pagamento Pix está ${ctx.statusPagamentoPix ?? 'ausente'}` };
  }
  return { aplicar: true };
}
