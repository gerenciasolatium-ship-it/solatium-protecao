import { podeAplicarFallbackPix } from './pix-fallback.util';

const BASE = {
  jobAsaasId: 'pay-pix-1',
  checkoutAsaasId: 'pay-pix-1',
  temCertificado: false,
  temPagamentoConfirmado: false,
  statusPagamentoPix: 'PENDENTE',
};

describe('fallback Pix→boleto — decisão', () => {
  it('aplica quando nada mudou: mesmo checkout, Pix PENDENTE, sem confirmação/emissão', () => {
    expect(podeAplicarFallbackPix(BASE)).toEqual({ aplicar: true });
  });

  it('não aplica se o contrato já emitiu certificado', () => {
    const r = podeAplicarFallbackPix({ ...BASE, temCertificado: true });
    expect(r.aplicar).toBe(false);
    expect(r.motivo).toContain('emitido');
  });

  it('não aplica se já existe pagamento confirmado (corrida com o webhook)', () => {
    const r = podeAplicarFallbackPix({ ...BASE, temPagamentoConfirmado: true });
    expect(r.aplicar).toBe(false);
    expect(r.motivo).toContain('confirmado');
  });

  it('não aplica se o vendedor já gerou outra cobrança (checkout mudou)', () => {
    expect(podeAplicarFallbackPix({ ...BASE, checkoutAsaasId: 'pay-outra' }).aplicar).toBe(false);
    expect(podeAplicarFallbackPix({ ...BASE, checkoutAsaasId: null }).aplicar).toBe(false);
  });

  it('não aplica se o Pix não está mais PENDENTE (pago, cancelado ou sumiu)', () => {
    for (const status of ['CONFIRMADO', 'CANCELADO', 'ESTORNADO', null]) {
      const r = podeAplicarFallbackPix({ ...BASE, statusPagamentoPix: status });
      expect(r.aplicar).toBe(false);
    }
  });
});
