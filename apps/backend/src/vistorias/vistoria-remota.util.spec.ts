import {
  gerarTokenPublico,
  hashFoto,
  imeiConfere,
  tokenExpirado,
  validarFotos,
} from './vistoria-remota.util';

const FOTO_OK = 'a'.repeat(2000);

describe('vistoria remota — token', () => {
  it('token público: 48 hex chars, não repetido', () => {
    const vistos = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const t = gerarTokenPublico();
      expect(t).toMatch(/^[0-9a-f]{48}$/);
      expect(vistos.has(t)).toBe(false);
      vistos.add(t);
    }
  });

  it('expiração: passado/ausente expira, futuro não', () => {
    const agora = new Date('2026-07-11T12:00:00Z');
    expect(tokenExpirado(new Date('2026-07-11T11:59:00Z'), agora)).toBe(true);
    expect(tokenExpirado(null, agora)).toBe(true);
    expect(tokenExpirado(new Date('2026-07-11T12:30:00Z'), agora)).toBe(false);
  });
});

describe('vistoria remota — IMEI', () => {
  it('confere ignorando máscara', () => {
    expect(imeiConfere('35-014716-025943-6', '350147160259436')).toBe(true);
  });

  it('divergente ou curto demais não confere', () => {
    expect(imeiConfere('350147160259437', '350147160259436')).toBe(false);
    expect(imeiConfere('1234', '350147160259436')).toBe(false);
  });
});

describe('vistoria remota — fotos', () => {
  it('aceita exatamente frente + verso + imei', () => {
    expect(
      validarFotos([
        { tipo: 'frente', base64: FOTO_OK },
        { tipo: 'verso', base64: FOTO_OK },
        { tipo: 'imei', base64: FOTO_OK },
      ]),
    ).toEqual([]);
  });

  it('acusa foto faltando, tipo desconhecido e foto vazia', () => {
    const problemas = validarFotos([
      { tipo: 'frente', base64: FOTO_OK },
      { tipo: 'selfie', base64: FOTO_OK },
      { tipo: 'imei', base64: 'x' },
    ]);
    expect(problemas.join(' ')).toContain('Falta a foto "verso"');
    expect(problemas.join(' ')).toContain('desconhecido');
    expect(problemas.join(' ')).toContain('vazia ou inválida');
  });

  it('acusa foto acima do limite', () => {
    const problemas = validarFotos([
      { tipo: 'frente', base64: 'a'.repeat(2_000_001) },
      { tipo: 'verso', base64: FOTO_OK },
      { tipo: 'imei', base64: FOTO_OK },
    ]);
    expect(problemas.join(' ')).toContain('grande demais');
  });

  it('hash da foto é sha256 estável', () => {
    const h = hashFoto(Buffer.from('conteudo').toString('base64'));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashFoto(Buffer.from('conteudo').toString('base64'))).toBe(h);
  });
});
