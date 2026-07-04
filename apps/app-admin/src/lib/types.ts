import type { LojaStatus, PlanoPeriodicidade } from '@solatium/shared';

/**
 * Modelos de leitura das entidades retornadas pela API REST (NestJS/Prisma).
 * Campos opcionais refletem colunas que podem vir nulas do backend.
 */

export interface Loja {
  id: string;
  nome: string;
  cnpj: string;
  email?: string | null;
  telefone?: string | null;
  responsavelNome?: string | null;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  bancoNome?: string | null;
  bancoAgencia?: string | null;
  bancoConta?: string | null;
  bancoTipoConta?: string | null;
  pixChave?: string | null;
  comissaoPct?: number | null;
  status?: LojaStatus;
}

export interface Vendedor {
  id: string;
  nome: string;
  cpf: string;
  telefone?: string | null;
  email?: string | null;
  lojaId: string;
  ativo?: boolean;
}

export interface Plano {
  id: string;
  nome: string;
  descricao?: string | null;
  periodicidade: PlanoPeriodicidade;
  premioMensal?: number | null;
  premioAnual?: number | null;
  franquia?: number | null;
  capitalSegurado: number;
  valorAparelhoMin?: number | null;
  valorAparelhoMax?: number | null;
  ativo?: boolean;
}

export interface Cliente {
  id: string;
  nome: string;
  cpf: string;
  telefoneWhatsapp: string;
  email?: string | null;
}
