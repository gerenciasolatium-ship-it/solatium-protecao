import {
  avaliarAlertasFraude,
  calcularVoucher,
  gerarCodigoVoucher,
  transicaoValida,
} from './sinistro.util';

describe('calcularVoucher (regra 13 — franquia do PLANO)', () => {
  it('aparelho R$ 3.000 com franquia 25% → voucher R$ 2.250 / franquia R$ 750', () => {
    expect(calcularVoucher(3000, 25)).toEqual({ voucher: 2250, franquia: 750 });
  });

  it('arredonda para 2 casas (R$ 2.999,99 / 25%)', () => {
    const { voucher, franquia } = calcularVoucher(2999.99, 25);
    expect(franquia).toBe(750);
    expect(voucher).toBe(2249.99);
  });

  it('franquia 0% → voucher integral', () => {
    expect(calcularVoucher(1500, 0)).toEqual({ voucher: 1500, franquia: 0 });
  });
});

describe('avaliarAlertasFraude', () => {
  const base = {
    aberturaEm: new Date('2026-07-01T12:00:00Z'),
    vigenciaInicio: new Date('2026-01-01T12:00:00Z'),
    carenciaAte: new Date('2026-01-04T12:00:00Z'),
    boData: new Date('2026-06-30T12:00:00Z'),
    sinistrosAnterioresDoCpf: 0,
    sinistralidadeLojaPct: 10,
  };

  it('caso limpo → sem alertas', () => {
    expect(avaliarAlertasFraude(base)).toEqual([]);
  });

  it('sinistro < 30 dias da emissão → SINISTRO_PRECOCE', () => {
    const alertas = avaliarAlertasFraude({
      ...base,
      aberturaEm: new Date('2026-01-15T12:00:00Z'),
      boData: new Date('2026-01-14T12:00:00Z'),
    });
    expect(alertas.map((a) => a.codigo)).toContain('SINISTRO_PRECOCE');
  });

  it('abertura dentro da carência de 72h → DENTRO_CARENCIA + PRECOCE', () => {
    const alertas = avaliarAlertasFraude({
      ...base,
      aberturaEm: new Date('2026-01-02T12:00:00Z'),
      boData: new Date('2026-01-02T11:00:00Z'),
    });
    const codigos = alertas.map((a) => a.codigo);
    expect(codigos).toContain('DENTRO_CARENCIA');
    expect(codigos).toContain('SINISTRO_PRECOCE');
  });

  it('BO anterior à vigência → BO_ANTERIOR_VIGENCIA', () => {
    const alertas = avaliarAlertasFraude({
      ...base,
      boData: new Date('2025-12-25T12:00:00Z'),
    });
    expect(alertas.map((a) => a.codigo)).toEqual(['BO_ANTERIOR_VIGENCIA']);
  });

  it('CPF com sinistro anterior → CPF_REINCIDENTE', () => {
    const alertas = avaliarAlertasFraude({ ...base, sinistrosAnterioresDoCpf: 2 });
    expect(alertas.map((a) => a.codigo)).toEqual(['CPF_REINCIDENTE']);
  });

  it('loja acima de 30% de sinistralidade → LOJA_SINISTRALIDADE_ALTA', () => {
    const alertas = avaliarAlertasFraude({ ...base, sinistralidadeLojaPct: 42.5 });
    expect(alertas.map((a) => a.codigo)).toEqual(['LOJA_SINISTRALIDADE_ALTA']);
  });

  it('sem BO informado → não avalia a regra do BO', () => {
    const alertas = avaliarAlertasFraude({ ...base, boData: null });
    expect(alertas).toEqual([]);
  });
});

describe('transicaoValida (esteira M6)', () => {
  it('segue ABERTO → DOCUMENTACAO_PENDENTE → EM_ANALISE → APROVADO', () => {
    expect(transicaoValida('ABERTO', 'DOCUMENTACAO_PENDENTE')).toBe(true);
    expect(transicaoValida('DOCUMENTACAO_PENDENTE', 'EM_ANALISE')).toBe(true);
    expect(transicaoValida('EM_ANALISE', 'APROVADO')).toBe(true);
  });

  it('estados finais não transicionam', () => {
    expect(transicaoValida('APROVADO', 'NEGADO')).toBe(false);
    expect(transicaoValida('NEGADO', 'EM_ANALISE')).toBe(false);
  });

  it('não aprova direto de ABERTO (análise obrigatória)', () => {
    expect(transicaoValida('ABERTO', 'APROVADO')).toBe(false);
  });
});

describe('gerarCodigoVoucher', () => {
  it('formato VC-XXXXXXXXXX sem caracteres ambíguos', () => {
    for (let i = 0; i < 50; i++) {
      const codigo = gerarCodigoVoucher();
      expect(codigo).toMatch(/^VC-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$/);
    }
  });
});
