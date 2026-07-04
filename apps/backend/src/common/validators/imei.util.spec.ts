import { isImeiValido, luhnCheck, normalizarImei } from './imei.util';

describe('IMEI (Luhn)', () => {
  it('aceita IMEIs válidos conhecidos', () => {
    // IMEIs de teste que passam no dígito verificador de Luhn.
    expect(isImeiValido('490154203237518')).toBe(true);
    expect(isImeiValido('356938035643809')).toBe(true);
  });

  it('aceita IMEI válido com máscara/espacos', () => {
    expect(isImeiValido('49-015420-323751-8')).toBe(true);
  });

  it('rejeita IMEI com dígito verificador errado', () => {
    expect(isImeiValido('490154203237519')).toBe(false);
  });

  it('rejeita comprimento diferente de 15', () => {
    expect(isImeiValido('12345')).toBe(false);
    expect(isImeiValido('4901542032375180')).toBe(false);
  });

  it('rejeita valores vazios ou não numéricos', () => {
    expect(isImeiValido('')).toBe(false);
    expect(isImeiValido('abcdefghijklmno')).toBe(false);
  });

  it('normaliza removendo não-dígitos', () => {
    expect(normalizarImei('490 154 203 237 518')).toBe('490154203237518');
  });

  it('luhnCheck funciona isoladamente', () => {
    expect(luhnCheck('490154203237518')).toBe(true);
    expect(luhnCheck('490154203237519')).toBe(false);
  });
});
