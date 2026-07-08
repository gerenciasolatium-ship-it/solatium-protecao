import { gerarChaveApi, gerarCodigoProposta, hashChaveApi, PREFIXO_CHAVE } from './chave-api.util';

describe('chave-api.util', () => {
  it('gera chave com prefixo psk_ e hash SHA-256 correspondente', () => {
    const { chave, prefixo, hash } = gerarChaveApi();
    expect(chave.startsWith(PREFIXO_CHAVE)).toBe(true);
    expect(chave.length).toBeGreaterThanOrEqual(52); // psk_ + 48 hex
    expect(prefixo).toBe(chave.slice(0, 12));
    expect(hash).toBe(hashChaveApi(chave));
    expect(hash).toHaveLength(64);
  });

  it('gera chaves e códigos únicos', () => {
    const chaves = new Set(Array.from({ length: 50 }, () => gerarChaveApi().chave));
    const codigos = new Set(Array.from({ length: 50 }, () => gerarCodigoProposta()));
    expect(chaves.size).toBe(50);
    expect(codigos.size).toBe(50);
  });

  it('hash é determinístico e não expõe a chave', () => {
    const { chave, hash } = gerarChaveApi();
    expect(hashChaveApi(chave)).toBe(hash);
    expect(hash).not.toContain(chave.slice(4, 20));
  });
});
