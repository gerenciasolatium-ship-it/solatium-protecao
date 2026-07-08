import { apenasDigitos } from './imei';

/** Validação de CPF pelos dois dígitos verificadores (mesma regra do backend). */
export function cpfValido(valor: string): boolean {
  const cpf = apenasDigitos(valor);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const dv = (baseLen: number): number => {
    let soma = 0;
    let peso = baseLen + 1;
    for (let i = 0; i < baseLen; i++) {
      soma += (cpf.charCodeAt(i) - 48) * peso;
      peso--;
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  return dv(9) === cpf.charCodeAt(9) - 48 && dv(10) === cpf.charCodeAt(10) - 48;
}
