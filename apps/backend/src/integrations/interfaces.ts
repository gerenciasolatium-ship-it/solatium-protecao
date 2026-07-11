/**
 * Interfaces das integrações externas. Implementações reais: Asaas (S3),
 * Digisac (S3), Resend (S3), Cloudflare R2 (S2/S3). Quando as envs da
 * integração não estão presentes, o módulo registra o stub correspondente.
 */

export type FormaPagamentoProvider = 'PIX' | 'CARTAO_RECORRENTE' | 'CARTAO_ANUAL' | 'BOLETO';

export interface ClienteProviderInput {
  nome: string;
  cpf: string;
  email?: string;
  telefone?: string;
  referenciaExterna?: string;
}

export interface SplitInput {
  walletId: string;
  percentual: number; // 30 = 30%
}

export interface CobrancaInput {
  customerId: string;
  formaPagamento: FormaPagamentoProvider;
  /** Valor da cobrança: mensal p/ CARTAO_RECORRENTE, total p/ as demais. */
  valor: number;
  /** Cartão anual parcelado (1 = à vista). */
  parcelas?: number;
  descricao?: string;
  /** Nosso contratoId — volta no webhook como externalReference. */
  referenciaExterna: string;
  /** YYYY-MM-DD (default hoje). */
  vencimento?: string;
  split?: SplitInput[];
}

export interface CobrancaResult {
  /** Id da cobrança no provedor (payment id). */
  provedorId: string;
  /** Id da assinatura, quando CARTAO_RECORRENTE. */
  assinaturaId?: string;
  status: string;
  linkPagamento?: string;
  pixCopiaCola?: string;
  /** QR code Pix (PNG base64, sem prefixo data:). */
  pixQrCodeBase64?: string;
  boletoUrl?: string;
}

export interface PaymentProvider {
  criarCliente(input: ClienteProviderInput): Promise<{ customerId: string }>;
  criarCobranca(input: CobrancaInput): Promise<CobrancaResult>;
  /**
   * Cancela uma cobrança avulsa não paga. Best-effort: cobrança já paga ou
   * inexistente retorna { cancelada: false } (nunca lança) — o chamador decide.
   */
  cancelarCobranca(provedorId: string): Promise<{ cancelada: boolean }>;
  /** Cancela uma assinatura recorrente (evita assinatura órfã cobrando o cartão). */
  cancelarAssinatura(assinaturaId: string): Promise<{ cancelada: boolean }>;
}

export interface MensagemInput {
  telefone: string;
  texto: string;
  anexo?: { nome: string; base64: string; contentType: string };
}

export interface MessagingProvider {
  enviarWhatsapp(input: MensagemInput): Promise<{ enviado: boolean; id?: string }>;
}

export interface EmailInput {
  para: string;
  assunto: string;
  html: string;
  anexos?: { nome: string; base64: string; contentType: string }[];
}

export interface EmailProvider {
  enviarEmail(input: EmailInput): Promise<{ enviado: boolean; id?: string }>;
}

export interface UploadInput {
  chave: string;
  conteudo: Buffer;
  contentType: string;
}

export interface StorageProvider {
  upload(input: UploadInput): Promise<{ url: string }>;
  urlAssinada(chave: string, expiraSegundos?: number): Promise<string>;
}

// Tokens de injeção (DI).
export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
export const MESSAGING_PROVIDER = Symbol('MESSAGING_PROVIDER');
export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');
export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');
