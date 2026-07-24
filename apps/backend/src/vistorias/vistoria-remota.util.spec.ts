import {
  conferirDispositivo,
  conferirGeolocalizacao,
  distanciaMetros,
  extrairImeisDeTexto,
  gerarTokenPublico,
  hashFoto,
  identificarDispositivo,
  imeiConfere,
  imeiOcrConfere,
  marcasDoModeloAndroid,
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

describe('vistoria remota — identificação do dispositivo', () => {
  const UA_IPHONE =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
  const UA_ANDROID =
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
  const UA_DESKTOP =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

  it('identifica iPhone pelo JSON estruturado', () => {
    const d = identificarDispositivo(JSON.stringify({ ua: UA_IPHONE, toque: 5 }));
    expect(d?.plataforma).toBe('iOS');
  });

  it('identifica Android com modelo via Client Hints', () => {
    const d = identificarDispositivo(JSON.stringify({ ua: UA_ANDROID, modelo: 'SM-S918B' }));
    expect(d?.plataforma).toBe('Android');
    expect(d?.modelo).toBe('SM-S918B');
  });

  it('extrai modelo Android do user-agent quando não há Client Hints', () => {
    const d = identificarDispositivo(JSON.stringify({ ua: UA_ANDROID }));
    expect(d?.plataforma).toBe('Android');
    expect(d?.modelo).toBe('SM-S918B');
  });

  it('aceita a string legada "userAgent | WxH"', () => {
    const d = identificarDispositivo(`${UA_IPHONE} | 390x844`);
    expect(d?.plataforma).toBe('iOS');
  });

  it('iPadOS moderno (UA de Mac + tela de toque) conta como iOS', () => {
    const d = identificarDispositivo(
      JSON.stringify({ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)…', toque: 5 }),
    );
    expect(d?.plataforma).toBe('iOS');
  });

  it('desktop é OUTRO; vazio é null', () => {
    expect(identificarDispositivo(JSON.stringify({ ua: UA_DESKTOP, toque: 0 }))?.plataforma).toBe(
      'OUTRO',
    );
    expect(identificarDispositivo('')).toBeNull();
    expect(identificarDispositivo(undefined)).toBeNull();
  });

  const IPHONE_15 = { marca: 'Apple', modelo: 'iPhone 15 Pro' };
  const GALAXY = { marca: 'Samsung', modelo: 'Galaxy S23 Ultra' };

  it('iPhone segurado + vistoria de iPhone → compatível', () => {
    const r = conferirDispositivo({ plataforma: 'iOS' }, IPHONE_15);
    expect(r.compativel).toBe(true);
  });

  it('iPhone segurado + vistoria de Android → divergente', () => {
    const r = conferirDispositivo({ plataforma: 'Android', modelo: 'SM-S918B' }, IPHONE_15);
    expect(r.compativel).toBe(false);
    expect(r.motivo).toContain('Android (SM-S918B)');
  });

  it('Android segurado + vistoria de iPhone → divergente', () => {
    const r = conferirDispositivo({ plataforma: 'iOS' }, GALAXY);
    expect(r.compativel).toBe(false);
    expect(r.motivo).toContain('iPhone');
  });

  it('vistoria de computador → divergente para qualquer aparelho', () => {
    const r = conferirDispositivo({ plataforma: 'OUTRO' }, GALAXY);
    expect(r.compativel).toBe(false);
    expect(r.motivo).toContain('computador');
  });

  it('sem metadados → inconclusivo (não bloqueia; IMEI segue como gate)', () => {
    const r = conferirDispositivo(null, IPHONE_15);
    expect(r.compativel).toBeNull();
  });
});

describe('vistoria remota — match fino Android (marca pelo código do modelo)', () => {
  it('infere as marcas principais pelos códigos de fabricante', () => {
    expect(marcasDoModeloAndroid('SM-S918B')).toEqual(['samsung']);
    expect(marcasDoModeloAndroid('moto g84 5G')).toEqual(['motorola']);
    expect(marcasDoModeloAndroid('XT2303-2')).toEqual(['motorola']);
    expect(marcasDoModeloAndroid('Redmi Note 13')).toEqual(['xiaomi']);
    expect(marcasDoModeloAndroid('POCO X6 Pro')).toEqual(['xiaomi']);
    expect(marcasDoModeloAndroid('RMX3999')).toEqual(['realme']);
    expect(marcasDoModeloAndroid('CPH2581')).toEqual(['oppo', 'oneplus']);
    expect(marcasDoModeloAndroid('Pixel 8')).toEqual(['google']);
    expect(marcasDoModeloAndroid('V2334')).toEqual(['vivo']);
  });

  it('código desconhecido ou vazio → [] (inconclusivo)', () => {
    expect(marcasDoModeloAndroid('ABC-123')).toEqual([]);
    expect(marcasDoModeloAndroid(undefined)).toEqual([]);
    expect(marcasDoModeloAndroid('')).toEqual([]);
  });

  const GALAXY = { marca: 'Samsung', modelo: 'Galaxy S23 Ultra' };

  it('Samsung segurado + vistoria de um Motorola → divergente', () => {
    const r = conferirDispositivo({ plataforma: 'Android', modelo: 'moto g84 5G' }, GALAXY);
    expect(r.compativel).toBe(false);
    expect(r.motivo).toContain('motorola');
  });

  it('Samsung segurado + vistoria de um Samsung → compatível', () => {
    const r = conferirDispositivo({ plataforma: 'Android', modelo: 'SM-S918B' }, GALAXY);
    expect(r.compativel).toBe(true);
  });

  it('código de modelo desconhecido não bloqueia', () => {
    const r = conferirDispositivo({ plataforma: 'Android', modelo: 'ZZ-000' }, GALAXY);
    expect(r.compativel).toBe(true);
  });

  it('marca segurada fora do vocabulário não bloqueia', () => {
    const r = conferirDispositivo(
      { plataforma: 'Android', modelo: 'SM-S918B' },
      { marca: 'Multilaser', modelo: 'M10' },
    );
    expect(r.compativel).toBe(true);
  });
});

describe('vistoria remota — geofence da loja', () => {
  // Av. Paulista, São Paulo — dois pontos ~370 m entre si e um em Campinas.
  const LOJA = { latitude: -23.5614, longitude: -46.6559 };
  const NA_LOJA = { lat: -23.5614, lng: -46.6559 };
  const PERTO = { lat: -23.5645, lng: -46.6542 }; // ~380 m
  const LONGE = { lat: -22.9099, lng: -47.0626 }; // Campinas, ~80 km

  it('distância haversine bate com a régua', () => {
    expect(distanciaMetros(NA_LOJA, NA_LOJA)).toBe(0);
    const d = distanciaMetros(NA_LOJA, PERTO);
    expect(d).toBeGreaterThan(250);
    expect(d).toBeLessThan(500);
    expect(distanciaMetros(NA_LOJA, LONGE)).toBeGreaterThan(50_000);
  });

  it('dentro do raio → ok; longe → fora com motivo', () => {
    expect(conferirGeolocalizacao(NA_LOJA, LOJA).dentroRaio).toBe(true);
    expect(conferirGeolocalizacao(PERTO, LOJA).dentroRaio).toBe(true);
    const fora = conferirGeolocalizacao(LONGE, LOJA);
    expect(fora.dentroRaio).toBe(false);
    expect(fora.motivo).toContain('km da loja');
  });

  it('imprecisão do GPS desconta até 200 m, não mais', () => {
    const borda = { lat: -23.5674, lng: -46.6559, precisao: 200 }; // ~660 m
    expect(conferirGeolocalizacao(borda, LOJA).dentroRaio).toBe(true);
    const bordaImprecisaDemais = { lat: -23.5704, lng: -46.6559, precisao: 5000 }; // ~1 km
    expect(conferirGeolocalizacao(bordaImprecisaDemais, LOJA).dentroRaio).toBe(false);
  });

  it('sem geo do cliente ou loja sem coordenadas → inconclusivo', () => {
    expect(conferirGeolocalizacao(undefined, LOJA).dentroRaio).toBeNull();
    expect(
      conferirGeolocalizacao(NA_LOJA, { latitude: null, longitude: null }).dentroRaio,
    ).toBeNull();
  });

  it('raio customizado é respeitado', () => {
    expect(conferirGeolocalizacao(PERTO, LOJA, 100).dentroRaio).toBe(false);
  });
});

describe('vistoria remota — OCR do IMEI', () => {
  it('extrai IMEIs de texto livre (com espaços/traços, dual-SIM)', () => {
    const texto = 'IMEI 1: 350147160259436\nIMEI 2: 35-014716-025944-4\nSérie: ABC';
    expect(extrairImeisDeTexto(texto)).toEqual(['350147160259436', '350147160259444']);
  });

  it('dois IMEIs em linhas seguidas não se fundem num número só', () => {
    expect(extrairImeisDeTexto('350147160259436\n350147160259444')).toEqual([
      '350147160259436',
      '350147160259444',
    ]);
  });

  it('ignora sequências curtas/longas demais e deduplica', () => {
    expect(extrairImeisDeTexto('123456 e 350147160259436 e 350147160259436')).toEqual([
      '350147160259436',
    ]);
    expect(extrairImeisDeTexto('VAZIO')).toEqual([]);
  });

  it('confere pelos 14 primeiros dígitos (dígito verificador mal lido não reprova)', () => {
    expect(imeiOcrConfere(['350147160259430'], '350147160259436')).toBe(true);
    expect(imeiOcrConfere(['999999999999999'], '350147160259436')).toBe(false);
  });

  it('dual-SIM: basta um dos IMEIs conferir', () => {
    expect(imeiOcrConfere(['111111111111111', '350147160259436'], '350147160259436')).toBe(true);
  });

  it('nenhum IMEI lido → inconclusivo (null)', () => {
    expect(imeiOcrConfere([], '350147160259436')).toBeNull();
  });
});
