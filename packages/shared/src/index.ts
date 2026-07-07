/**
 * @solatium/shared — tipos e enums compartilhados entre backend e frontends.
 * A fonte de verdade dos enums é o schema Prisma; estes espelham os mesmos
 * valores (string) para uso no TypeScript do frontend sem depender do Prisma.
 */

// ---------------------------------------------------------------------------
// Papéis / autenticação
// ---------------------------------------------------------------------------
export const Role = {
  ADMIN: 'ADMIN',
  OPERADOR: 'OPERADOR',
  LOJA_ADMIN: 'LOJA_ADMIN',
  LOJA_VENDEDOR: 'LOJA_VENDEDOR',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

/** Papéis que pertencem ao backoffice Solatium (acessam o app-admin). */
export const ROLES_ADMIN: Role[] = [Role.ADMIN, Role.OPERADOR];
/** Papéis que pertencem à loja (acessam o app-loja). */
export const ROLES_LOJA: Role[] = [Role.LOJA_ADMIN, Role.LOJA_VENDEDOR];

// ---------------------------------------------------------------------------
// Enums de status (espelham o schema Prisma)
// ---------------------------------------------------------------------------
export const LojaStatus = {
  ATIVA: 'ATIVA',
  INATIVA: 'INATIVA',
  EM_REVISAO: 'EM_REVISAO',
} as const;
export type LojaStatus = (typeof LojaStatus)[keyof typeof LojaStatus];

export const VistoriaStatus = {
  PENDENTE: 'PENDENTE',
  APROVADA: 'APROVADA',
  EM_ANALISE: 'EM_ANALISE',
  REPROVADA: 'REPROVADA',
} as const;
export type VistoriaStatus = (typeof VistoriaStatus)[keyof typeof VistoriaStatus];

export const CertificadoStatus = {
  ATIVO: 'ATIVO',
  SUSPENSO: 'SUSPENSO',
  CANCELADO: 'CANCELADO',
  EXPIRADO: 'EXPIRADO',
} as const;
export type CertificadoStatus = (typeof CertificadoStatus)[keyof typeof CertificadoStatus];

export const PagamentoTipo = {
  PIX: 'PIX',
  CARTAO: 'CARTAO',
  BOLETO: 'BOLETO',
} as const;
export type PagamentoTipo = (typeof PagamentoTipo)[keyof typeof PagamentoTipo];

export const PagamentoStatus = {
  PENDENTE: 'PENDENTE',
  CONFIRMADO: 'CONFIRMADO',
  VENCIDO: 'VENCIDO',
  ESTORNADO: 'ESTORNADO',
} as const;
export type PagamentoStatus = (typeof PagamentoStatus)[keyof typeof PagamentoStatus];

export const SinistroStatus = {
  ABERTO: 'ABERTO',
  DOCUMENTACAO_PENDENTE: 'DOCUMENTACAO_PENDENTE',
  EM_ANALISE: 'EM_ANALISE',
  APROVADO: 'APROVADO',
  NEGADO: 'NEGADO',
} as const;
export type SinistroStatus = (typeof SinistroStatus)[keyof typeof SinistroStatus];

export const VoucherStatus = {
  EMITIDO: 'EMITIDO',
  RESGATADO: 'RESGATADO',
  EXPIRADO: 'EXPIRADO',
} as const;
export type VoucherStatus = (typeof VoucherStatus)[keyof typeof VoucherStatus];

export const PlanoPeriodicidade = {
  MENSAL: 'MENSAL',
  ANUAL: 'ANUAL',
} as const;
export type PlanoPeriodicidade = (typeof PlanoPeriodicidade)[keyof typeof PlanoPeriodicidade];

export const FormaPagamento = {
  PIX: 'PIX',
  CARTAO_RECORRENTE: 'CARTAO_RECORRENTE',
  CARTAO_ANUAL: 'CARTAO_ANUAL',
  BOLETO: 'BOLETO',
} as const;
export type FormaPagamento = (typeof FormaPagamento)[keyof typeof FormaPagamento];

export const ContratoStatus = {
  AGUARDANDO_PAGAMENTO: 'AGUARDANDO_PAGAMENTO',
  ATIVO: 'ATIVO',
  CANCELADO: 'CANCELADO',
} as const;
export type ContratoStatus = (typeof ContratoStatus)[keyof typeof ContratoStatus];

// ---------------------------------------------------------------------------
// DTOs de API usados pelos frontends
// ---------------------------------------------------------------------------
export interface UsuarioPublico {
  id: string;
  nome: string;
  email: string;
  role: Role;
  lojaId: string | null;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  usuario: UsuarioPublico;
}

export interface Paginacao<T> {
  itens: T[];
  total: number;
  pagina: number;
  porPagina: number;
}

// ---------------------------------------------------------------------------
// Constantes de negócio (defaults configuráveis — CLAUDE.md seções 2/5)
// ---------------------------------------------------------------------------
export const COMISSAO_LOJA_PADRAO = 0.3; // 30%
export const CARENCIA_HORAS_PADRAO = 72;
export const FRANQUIA_PERCENTUAL_PADRAO = 25; // % do capital segurado (fonte: plano)
export const RAIO_LOJA_METROS_PADRAO = 500;
export const VOUCHER_VALIDADE_DIAS_PADRAO = 90;
