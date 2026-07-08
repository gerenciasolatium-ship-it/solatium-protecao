/** Helpers puros da consulta de CPF (KYC). */

/** Mascara o CPF para a trilha de auditoria (LGPD): 529******25. */
export function mascararCpfAuditoria(cpf: string): string {
  const d = (cpf ?? '').replace(/\D/g, '');
  if (d.length !== 11) return '***********';
  return `${d.slice(0, 3)}******${d.slice(9)}`;
}

/**
 * Normaliza a data de nascimento dos provedores para ISO (YYYY-MM-DD).
 * Serpro Consulta CPF retorna "DDMMYYYY"; outros usam "DD/MM/YYYY" ou ISO.
 */
export function nascimentoParaIso(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const v = valor.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const barras = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (barras) return `${barras[3]}-${barras[2]}-${barras[1]}`;
  const compacto = v.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (compacto) return `${compacto[3]}-${compacto[2]}-${compacto[1]}`;
  return null;
}
