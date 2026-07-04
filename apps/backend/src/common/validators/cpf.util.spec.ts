import { isCpfValido, normalizarCpf } from './cpf.util';

describe('CPF', () => {
  it('aceita CPFs válidos', () => {
    expect(isCpfValido('529.982.247-25')).toBe(true);
    expect(isCpfValido('111.444.777-35')).toBe(true);
    expect(isCpfValido('52998224725')).toBe(true);
  });

  it('rejeita CPF com dígito verificador errado', () => {
    expect(isCpfValido('529.982.247-24')).toBe(false);
    expect(isCpfValido('11144477734')).toBe(false);
  });

  it('rejeita sequências repetidas', () => {
    expect(isCpfValido('00000000000')).toBe(false);
    expect(isCpfValido('111.111.111-11')).toBe(false);
  });

  it('rejeita comprimento inválido', () => {
    expect(isCpfValido('123')).toBe(false);
    expect(isCpfValido('')).toBe(false);
  });

  it('normaliza removendo máscara', () => {
    expect(normalizarCpf('529.982.247-25')).toBe('52998224725');
  });
});
