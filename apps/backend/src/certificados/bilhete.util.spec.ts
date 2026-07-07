import {
  calcularVigencia,
  calcularVoucher,
  formatarNumeroCertificado,
  mascararImei,
  mascararNome,
  rodapeLegalCompleto,
} from './bilhete.util';

describe('bilhete.util (M3)', () => {
  describe('calcularVoucher — franquia vem do PLANO (CLAUDE.md regra 13)', () => {
    it('exemplo canônico: aparelho 3.000 → voucher 2.250 / franquia 750', () => {
      expect(calcularVoucher(3000, 25)).toEqual({ voucher: 2250, franquia: 750 });
    });

    it('respeita franquia configurada diferente do default', () => {
      expect(calcularVoucher(2000, 30)).toEqual({ voucher: 1400, franquia: 600 });
    });

    it('arredonda para 2 casas', () => {
      const { voucher, franquia } = calcularVoucher(3333.33, 25);
      expect(franquia).toBe(833.33);
      expect(voucher).toBe(2500);
    });
  });

  describe('formatarNumeroCertificado — série própria PS-AAAA-000001', () => {
    it('formata com 6 dígitos', () => {
      expect(formatarNumeroCertificado(2026, 1)).toBe('PS-2026-000001');
      expect(formatarNumeroCertificado(2026, 123)).toBe('PS-2026-000123');
    });

    it('não trunca sequencial acima de 6 dígitos', () => {
      expect(formatarNumeroCertificado(2026, 1234567)).toBe('PS-2026-1234567');
    });
  });

  describe('calcularVigencia — 1 ano + carência 72h', () => {
    it('fim = início + 1 ano; carência = início + 72h', () => {
      const inicio = new Date('2026-07-07T15:30:00-03:00');
      const { fim, carenciaAte } = calcularVigencia(inicio);
      expect(fim.toISOString()).toBe(new Date('2027-07-07T15:30:00-03:00').toISOString());
      expect(carenciaAte.getTime() - inicio.getTime()).toBe(72 * 3600_000);
    });
  });

  describe('rodapeLegalCompleto — REGRA DURA da marca d’água (CLAUDE.md regra 12)', () => {
    const completo = {
      seguradoraNome: 'Seguradora X',
      seguradoraCnpj: '00.000.000/0001-00',
      apoliceNumero: '123',
      processoSusep: '15414.000000/2026-00',
      estipulanteRazao: 'Solatium Proteção LTDA',
      estipulanteCnpj: '11.111.111/0001-11',
      solatiumCnpj: '22.222.222/0001-22',
    };

    it('completo → sem marca d’água', () => {
      expect(rodapeLegalCompleto(completo)).toBe(true);
    });

    it('QUALQUER campo obrigatório ausente ou vazio → marca d’água SEM VALIDADE', () => {
      for (const campo of Object.keys(completo) as (keyof typeof completo)[]) {
        expect(rodapeLegalCompleto({ ...completo, [campo]: undefined })).toBe(false);
        expect(rodapeLegalCompleto({ ...completo, [campo]: '   ' })).toBe(false);
      }
    });

    it('sem nenhuma env → marca d’água', () => {
      expect(rodapeLegalCompleto({})).toBe(false);
    });
  });

  describe('mascaramento da página pública /validar', () => {
    it('IMEI mostra só os últimos 4', () => {
      expect(mascararImei('490154203237518')).toBe('•••••••••••7518');
    });

    it('nome parcial: primeiro nome + iniciais', () => {
      expect(mascararNome('Rafael Almeida Souza')).toBe('Rafael A. S.');
      expect(mascararNome('Ana')).toBe('Ana');
    });
  });
});
