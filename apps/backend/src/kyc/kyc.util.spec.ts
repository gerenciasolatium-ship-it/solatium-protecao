import { mascararCpfAuditoria, nascimentoParaIso } from './kyc.util';

describe('kyc.util', () => {
  it('mascara CPF para auditoria sem expor os dígitos do meio', () => {
    expect(mascararCpfAuditoria('52998224725')).toBe('529******25');
    expect(mascararCpfAuditoria('529.982.247-25')).toBe('529******25');
    expect(mascararCpfAuditoria('123')).toBe('***********');
  });

  it('normaliza nascimento nos 3 formatos de provedor', () => {
    expect(nascimentoParaIso('20051990')).toBe('1990-05-20'); // Serpro DDMMYYYY
    expect(nascimentoParaIso('20/05/1990')).toBe('1990-05-20');
    expect(nascimentoParaIso('1990-05-20T00:00:00Z')).toBe('1990-05-20');
    expect(nascimentoParaIso('')).toBeNull();
    expect(nascimentoParaIso('abc')).toBeNull();
    expect(nascimentoParaIso(undefined)).toBeNull();
  });
});
