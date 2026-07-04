/**
 * Validação de CPF pelos dois dígitos verificadores. (CLAUDE.md M1.)
 */

export function normalizarCpf(valor: string): string {
  return (valor ?? '').replace(/\D/g, '');
}

export function isCpfValido(valor: string): boolean {
  const cpf = normalizarCpf(valor);
  if (cpf.length !== 11) return false;
  // Rejeita sequências repetidas (000..., 111..., etc.)
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

  const dig1 = dv(9);
  const dig2 = dv(10);
  return dig1 === cpf.charCodeAt(9) - 48 && dig2 === cpf.charCodeAt(10) - 48;
}
