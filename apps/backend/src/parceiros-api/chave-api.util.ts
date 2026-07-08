import { createHash, randomBytes } from 'node:crypto';

/**
 * Chaves de API de parceiro (M11). A chave completa (`psk_...`) só existe na
 * resposta da criação; no banco fica apenas o SHA-256 + um prefixo visível
 * para o admin identificar qual chave é qual.
 */

export const PREFIXO_CHAVE = 'psk_';
const TAMANHO_PREFIXO_VISIVEL = 12; // "psk_" + 8 primeiros hex

export function gerarChaveApi(): { chave: string; prefixo: string; hash: string } {
  const chave = `${PREFIXO_CHAVE}${randomBytes(24).toString('hex')}`;
  return { chave, prefixo: chave.slice(0, TAMANHO_PREFIXO_VISIVEL), hash: hashChaveApi(chave) };
}

export function hashChaveApi(chave: string): string {
  return createHash('sha256').update(chave).digest('hex');
}

/** Código opaco do link pré-preenchido da proposta externa. */
export function gerarCodigoProposta(): string {
  return randomBytes(16).toString('hex');
}
