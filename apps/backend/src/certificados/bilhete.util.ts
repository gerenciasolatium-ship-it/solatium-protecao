/**
 * Regras puras do bilhete (M3) — testáveis sem banco/integrações.
 */

export const CARENCIA_HORAS = 72;
export const VIGENCIA_MESES = 12;

/** PS-AAAA-000001 */
export function formatarNumeroCertificado(ano: number, sequencial: number): string {
  return `PS-${ano}-${String(sequencial).padStart(6, '0')}`;
}

/** Voucher (M6) e exemplo do PDF (M3) leem SEMPRE a franquia do plano. */
export function calcularVoucher(
  capitalSegurado: number,
  franquiaPercentual: number,
): { voucher: number; franquia: number } {
  const franquia = arredondar2(capitalSegurado * (franquiaPercentual / 100));
  return { voucher: arredondar2(capitalSegurado - franquia), franquia };
}

export function calcularVigencia(inicio: Date): { fim: Date; carenciaAte: Date } {
  const fim = new Date(inicio);
  fim.setFullYear(fim.getFullYear() + 1);
  return { fim, carenciaAte: new Date(inicio.getTime() + CARENCIA_HORAS * 3600_000) };
}

export interface RodapeLegal {
  seguradoraNome?: string;
  seguradoraCnpj?: string;
  apoliceNumero?: string;
  processoSusep?: string;
  estipulanteRazao?: string;
  estipulanteCnpj?: string;
  solatiumCnpj?: string;
  condicoesGeraisUrl?: string;
  seguradoraCentralTel?: string;
}

/**
 * REGRA DURA (CLAUDE.md regra 12): sem TODOS os dados da seguradora,
 * o PDF sai com marca d'água "AMBIENTE DE TESTE — SEM VALIDADE".
 */
export function rodapeLegalCompleto(rodape: RodapeLegal): boolean {
  return Boolean(
    rodape.seguradoraNome?.trim() &&
    rodape.seguradoraCnpj?.trim() &&
    rodape.apoliceNumero?.trim() &&
    rodape.processoSusep?.trim() &&
    rodape.estipulanteRazao?.trim() &&
    rodape.estipulanteCnpj?.trim() &&
    rodape.solatiumCnpj?.trim(),
  );
}

/** Últimos 4 dígitos visíveis: •••••••••••3218 */
export function mascararImei(imei: string): string {
  const digitos = imei.replace(/\D/g, '');
  return `${'•'.repeat(Math.max(digitos.length - 4, 0))}${digitos.slice(-4)}`;
}

/** "Rafael Almeida Souza" → "Rafael A. S." (validação pública sem expor dados). */
export function mascararNome(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  if (partes.length === 1) return partes[0];
  return `${partes[0]} ${partes
    .slice(1)
    .map((p) => `${p[0].toUpperCase()}.`)
    .join(' ')}`;
}

export function formatarMoeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatarDataBr(data: Date): string {
  return data.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

export function formatarDataHoraBr(data: Date): string {
  return data.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function arredondar2(valor: number): number {
  return Math.round(valor * 100) / 100;
}
