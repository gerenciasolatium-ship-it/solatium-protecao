/**
 * Validação de IMEI: 15 dígitos + dígito verificador pelo algoritmo de Luhn.
 * (CLAUDE.md M2 / Sprint 1 — regras de aparelho.)
 */

/** Remove tudo que não for dígito. */
export function normalizarImei(valor: string): string {
  return (valor ?? '').replace(/\D/g, '');
}

/**
 * Retorna true se o IMEI tem 15 dígitos e passa no dígito verificador de Luhn.
 */
export function isImeiValido(valor: string): boolean {
  const imei = normalizarImei(valor);
  if (imei.length !== 15) return false;
  return luhnCheck(imei);
}

/** Validação de Luhn: soma ponderada dos dígitos deve ser múltiplo de 10. */
export function luhnCheck(numero: string): boolean {
  let soma = 0;
  let alternar = false;
  // Percorre da direita para a esquerda.
  for (let i = numero.length - 1; i >= 0; i--) {
    let d = numero.charCodeAt(i) - 48; // '0' = 48
    if (d < 0 || d > 9) return false;
    if (alternar) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    soma += d;
    alternar = !alternar;
  }
  return soma % 10 === 0;
}
