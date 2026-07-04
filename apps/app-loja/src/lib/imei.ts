/**
 * Validação de IMEI no cliente: 15 dígitos + dígito verificador (Luhn).
 * Espelha a regra do backend (IsImei) para dar feedback em tempo real.
 */

export function apenasDigitos(valor: string): string {
  return valor.replace(/\D/g, '');
}

/** Algoritmo de Luhn (mod 10). Assume string só com dígitos. */
export function luhnValido(numero: string): boolean {
  if (numero.length === 0 || !/^\d+$/.test(numero)) return false;
  let soma = 0;
  let dobrar = false;
  for (let i = numero.length - 1; i >= 0; i -= 1) {
    let d = numero.charCodeAt(i) - 48; // '0' = 48
    if (dobrar) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    soma += d;
    dobrar = !dobrar;
  }
  return soma % 10 === 0;
}

/** IMEI válido = exatamente 15 dígitos e Luhn ok. */
export function imeiValido(imei: string): boolean {
  const d = apenasDigitos(imei);
  return d.length === 15 && luhnValido(d);
}
