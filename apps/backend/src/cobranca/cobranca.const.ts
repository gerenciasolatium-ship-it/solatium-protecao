/**
 * Constantes da fila de cobrança num arquivo próprio: ContratosService agenda
 * jobs nela e o CobrancaProcessor consome — importar direto do processor
 * criaria ciclo de módulos ES (processor → ContratosService → processor).
 */
export const FILA_COBRANCA = 'cobranca';
export const JOB_INADIMPLENCIA = 'verificar-inadimplencia';

/** "Não perder venda" (M4): Pix não pago no prazo → boleto no WhatsApp. */
export const JOB_PIX_FALLBACK = 'pix-fallback-boleto';

export interface PixFallbackJob {
  contratoId: string;
  /** Cobrança Pix vigente quando o job foi agendado — se mudou, o job se cala. */
  asaasId: string;
}
