/**
 * Interfaces das integrações externas. As implementações reais (Asaas, Digisac,
 * Cloudflare R2) entram nas Sprints 2/3 — aqui ficam só os contratos + stubs,
 * conforme regra de trabalho da Sprint 1 (não inventar integrações ainda).
 */

export interface CobrancaInput {
  clienteId: string;
  valor: number;
  tipo: 'PIX' | 'CARTAO' | 'BOLETO';
  descricao?: string;
  splitLojaId?: string;
  comissaoPct?: number;
}

export interface CobrancaResult {
  provedorId: string;
  status: string;
  linkPagamento?: string;
  pixCopiaCola?: string;
  boletoUrl?: string;
}

export interface PaymentProvider {
  criarCobranca(input: CobrancaInput): Promise<CobrancaResult>;
}

export interface MensagemInput {
  telefone: string;
  template: string;
  variaveis?: Record<string, string>;
  anexoUrl?: string;
}

export interface MessagingProvider {
  enviarWhatsapp(input: MensagemInput): Promise<{ enviado: boolean; id?: string }>;
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

// Tokens de injeção (DI) para as próximas sprints.
export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
export const MESSAGING_PROVIDER = Symbol('MESSAGING_PROVIDER');
export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');
