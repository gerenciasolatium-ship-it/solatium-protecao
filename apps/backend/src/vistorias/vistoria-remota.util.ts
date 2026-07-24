import { createHash, randomBytes } from 'crypto';

/** Validade padrão do link de vistoria remota (env VISTORIA_TOKEN_VALIDADE_MINUTOS). */
export const TOKEN_VALIDADE_MINUTOS = 60;

/** Janela máxima pra renovar o link pela própria página pública (desde a criação). */
export const RENOVACAO_JANELA_HORAS = 24;

/** Intervalo mínimo entre envios de link (renovação/reenvio) — evita spam. */
export const REENVIO_INTERVALO_SEGUNDOS = 60;

/** Fila BullMQ da vistoria remota (lembrete de link prestes a vencer). */
export const FILA_VISTORIA = 'vistoria';
export const JOB_LEMBRETE_VISTORIA = 'lembrete-vistoria';
export interface LembreteVistoriaJob {
  vistoriaId: string;
  /** Token vigente quando o lembrete foi agendado — se mudou, o job se cala. */
  token: string;
}

/** Fotos obrigatórias da vistoria remota, nesta ordem. */
export const TIPOS_FOTO_OBRIGATORIOS = ['frente', 'verso', 'imei'] as const;
export type TipoFoto = (typeof TIPOS_FOTO_OBRIGATORIOS)[number];

/** Tamanho máximo de cada foto em base64 (~1,5 MB de imagem comprimida). */
export const FOTO_BASE64_MAX = 2_000_000;

/** Token público do link: 48 hex chars (não adivinhável, URL-safe). */
export function gerarTokenPublico(): string {
  return randomBytes(24).toString('hex');
}

export function tokenExpirado(tokenExpiraEm: Date | null | undefined, agora = new Date()): boolean {
  return !tokenExpiraEm || tokenExpiraEm < agora;
}

export function normalizarImei(valor: string): string {
  return valor.replace(/\D/g, '');
}

/** IMEI digitado pelo cliente confere com o cadastrado na etapa Dados? */
export function imeiConfere(informado: string, cadastrado: string): boolean {
  const a = normalizarImei(informado);
  return a.length >= 14 && a === normalizarImei(cadastrado);
}

export interface FotoEntrada {
  tipo: string;
  base64: string;
}

/**
 * Valida o conjunto de fotos: exatamente as 3 obrigatórias (frente, verso,
 * tela do IMEI), cada uma dentro do limite e com cara de imagem base64.
 * Retorna a lista de problemas (vazia = ok).
 */
export function validarFotos(fotos: FotoEntrada[]): string[] {
  const problemas: string[] = [];
  const tipos = new Set(fotos.map((f) => f.tipo));
  for (const tipo of TIPOS_FOTO_OBRIGATORIOS) {
    if (!tipos.has(tipo)) problemas.push(`Falta a foto "${tipo}".`);
  }
  for (const foto of fotos) {
    if (!(TIPOS_FOTO_OBRIGATORIOS as readonly string[]).includes(foto.tipo)) {
      problemas.push(`Foto de tipo desconhecido: "${foto.tipo}".`);
      continue;
    }
    if (!foto.base64 || foto.base64.length < 1000) {
      problemas.push(`Foto "${foto.tipo}" vazia ou inválida.`);
    } else if (foto.base64.length > FOTO_BASE64_MAX) {
      problemas.push(`Foto "${foto.tipo}" grande demais (reduza a qualidade).`);
    }
  }
  if (fotos.length > TIPOS_FOTO_OBRIGATORIOS.length) {
    problemas.push('Envie exatamente 3 fotos (frente, verso e tela do IMEI).');
  }
  return problemas;
}

/** SHA-256 do conteúdo da foto — evidência de integridade pro sinistro. */
export function hashFoto(base64: string): string {
  return createHash('sha256').update(Buffer.from(base64, 'base64')).digest('hex');
}

/** Tamanho máximo dos metadados de dispositivo enviados pela página pública. */
export const DISPOSITIVO_MAX = 2000;

export interface DispositivoIdentificado {
  /** Plataforma inferida do navegador que concluiu a vistoria. */
  plataforma: 'iOS' | 'Android' | 'OUTRO';
  /** Modelo reportado pelo navegador (Android via Client Hints/user-agent). */
  modelo?: string;
  gpu?: string;
}

/**
 * Identifica o dispositivo que concluiu a vistoria a partir dos metadados da
 * página pública. Aceita o JSON estruturado (formato atual) e a string legada
 * "userAgent | WxH". Retorna null quando não há dado utilizável.
 */
export function identificarDispositivo(
  dispositivo?: string | null,
): DispositivoIdentificado | null {
  if (!dispositivo?.trim()) return null;
  let ua = dispositivo;
  let modelo: string | undefined;
  let plataformaHint: string | undefined;
  let gpu: string | undefined;
  let toque: number | undefined;
  try {
    const meta = JSON.parse(dispositivo) as Record<string, unknown>;
    if (typeof meta.ua === 'string') ua = meta.ua;
    if (typeof meta.modelo === 'string' && meta.modelo.trim()) modelo = meta.modelo.trim();
    if (typeof meta.plataforma === 'string') plataformaHint = meta.plataforma;
    if (typeof meta.gpu === 'string') gpu = meta.gpu;
    if (typeof meta.toque === 'number') toque = meta.toque;
  } catch {
    // string legada — segue com o próprio texto como user-agent
  }

  if (/android/i.test(ua) || /^android$/i.test(plataformaHint ?? '')) {
    // Sem Client Hints, o modelo costuma vir no UA: "...; SM-S918B) ..."
    if (!modelo) {
      const m = /android [^;)]+;\s*([^;)]+)[;)]/i.exec(ua);
      const candidato = m?.[1]?.trim();
      if (candidato && !/^[a-z]{2}(-[a-z]{2})?$/i.test(candidato)) modelo = candidato;
    }
    return { plataforma: 'Android', modelo, gpu };
  }
  if (/iphone|ipad|ipod/i.test(ua) || /^ios$/i.test(plataformaHint ?? '')) {
    return { plataforma: 'iOS', gpu };
  }
  // iPadOS moderno se anuncia como macOS, mas tem tela de toque.
  if (/macintosh/i.test(ua) && (toque ?? 0) > 1) {
    return { plataforma: 'iOS', gpu };
  }
  return { plataforma: 'OUTRO', modelo, gpu };
}

/** O aparelho segurado é da Apple? (marca ou modelo citando Apple/iPhone/iPad) */
function aparelhoEhApple(aparelho: { marca: string; modelo: string }): boolean {
  return /apple|iphone|ipad/i.test(`${aparelho.marca} ${aparelho.modelo}`);
}

/**
 * Marcas Android inferíveis pelo código de fabricante que o navegador reporta
 * (Client Hints/user-agent). Só entram padrões inequívocos — código ambíguo
 * (ex.: CPH serve a OPPO e OnePlus) lista todas as marcas possíveis.
 */
const MARCAS_POR_CODIGO: Array<{ padrao: RegExp; marcas: string[] }> = [
  { padrao: /^(SM-|GT-|SAMSUNG)/i, marcas: ['samsung'] },
  { padrao: /^(moto ?|XT\d{3,4})/i, marcas: ['motorola'] },
  { padrao: /^(Redmi|POCO|Mi(?:\s|$)|Xiaomi)/i, marcas: ['xiaomi'] },
  { padrao: /^RMX\d/i, marcas: ['realme'] },
  { padrao: /^CPH\d/i, marcas: ['oppo', 'oneplus'] },
  { padrao: /^Pixel ?\d/i, marcas: ['google'] },
  { padrao: /^(vivo |V\d{4})/i, marcas: ['vivo'] },
  { padrao: /^(LM-|LG-)/i, marcas: ['lg'] },
  { padrao: /^ASUS/i, marcas: ['asus'] },
  { padrao: /^Infinix/i, marcas: ['infinix'] },
  { padrao: /^TECNO/i, marcas: ['tecno'] },
  { padrao: /^Nokia/i, marcas: ['nokia'] },
];

/** Vocabulário de marcas que o match fino sabe reconhecer na marca cadastrada. */
const MARCAS_CONHECIDAS = new Set(MARCAS_POR_CODIGO.flatMap((m) => m.marcas));

/** Marcas possíveis do modelo Android reportado pelo navegador ([] = não sei). */
export function marcasDoModeloAndroid(modelo: string | undefined): string[] {
  if (!modelo?.trim()) return [];
  const alvo = modelo.trim();
  for (const { padrao, marcas } of MARCAS_POR_CODIGO) {
    if (padrao.test(alvo)) return marcas;
  }
  return [];
}

/** Normaliza a marca cadastrada pra comparar com o vocabulário ('Samsung ' → 'samsung'). */
function marcaSeguradaConhecida(aparelho: { marca: string }): string | null {
  const marca = aparelho.marca.trim().toLowerCase();
  return MARCAS_CONHECIDAS.has(marca) ? marca : null;
}

/**
 * Cruza o dispositivo que fez a vistoria com o aparelho segurado (antifraude:
 * a vistoria DEVE ser feita do próprio aparelho que está sendo protegido).
 * `compativel: false` só em divergência inequívoca (plataforma trocada ou
 * navegador de computador); casos inconclusivos não bloqueiam — o IMEI continua
 * sendo o gate principal e tudo fica registrado pro backoffice.
 */
export function conferirDispositivo(
  ident: DispositivoIdentificado | null,
  aparelho: { marca: string; modelo: string },
): { compativel: boolean | null; motivo?: string } {
  if (!ident) return { compativel: null };
  const ehApple = aparelhoEhApple(aparelho);
  if (ident.plataforma === 'OUTRO') {
    return {
      compativel: false,
      motivo: 'vistoria concluída em um computador ou navegador não identificado como celular',
    };
  }
  if (ehApple && ident.plataforma === 'Android') {
    return {
      compativel: false,
      motivo: `aparelho segurado é ${aparelho.marca} ${aparelho.modelo}, mas a vistoria foi feita de um Android${ident.modelo ? ` (${ident.modelo})` : ''}`,
    };
  }
  if (!ehApple && ident.plataforma === 'iOS') {
    return {
      compativel: false,
      motivo: `aparelho segurado é ${aparelho.marca} ${aparelho.modelo}, mas a vistoria foi feita de um iPhone/iPad`,
    };
  }
  // Match fino Android: código do fabricante (ex.: SM-S918B) × marca cadastrada.
  // Só reprova quando AMBOS os lados são inequívocos; código desconhecido ou
  // marca fora do vocabulário não bloqueiam (IMEI segue como gate principal).
  if (ident.plataforma === 'Android' && !ehApple) {
    const marcaSegurada = marcaSeguradaConhecida(aparelho);
    const marcasDoDispositivo = marcasDoModeloAndroid(ident.modelo);
    if (marcaSegurada && marcasDoDispositivo.length && !marcasDoDispositivo.includes(marcaSegurada)) {
      return {
        compativel: false,
        motivo: `aparelho segurado é ${aparelho.marca} ${aparelho.modelo}, mas a vistoria foi feita de um ${ident.modelo} (${marcasDoDispositivo.join('/')})`,
      };
    }
  }
  return { compativel: true };
}

// ---------------------------------------------------------------------------
// Geofence: a vistoria acontece no balcão — longe da loja cai pra análise.
// ---------------------------------------------------------------------------

/** Raio padrão aceito em volta da loja (env VISTORIA_RAIO_LOJA_METROS). */
export const RAIO_LOJA_PADRAO_METROS = 500;

/** Teto de desconto pela imprecisão do GPS (precisões absurdas não furam o raio). */
const PRECISAO_MAX_METROS = 200;

/** Distância haversine em metros entre dois pontos lat/lng. */
export function distanciaMetros(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export interface GeofenceResultado {
  /** null = inconclusivo (sem geo do cliente ou loja sem coordenadas). */
  dentroRaio: boolean | null;
  distanciaMetros?: number;
  raioMetros?: number;
  motivo?: string;
}

/**
 * Cruza a geolocalização da vistoria com as coordenadas da loja. Desconta a
 * imprecisão reportada pelo GPS (até 200 m) antes de comparar com o raio;
 * inconclusivo (sem dados de um dos lados) não bloqueia.
 */
export function conferirGeolocalizacao(
  geo: { lat: number; lng: number; precisao?: number } | null | undefined,
  loja: { latitude: number | null; longitude: number | null },
  raioMetros = RAIO_LOJA_PADRAO_METROS,
): GeofenceResultado {
  if (!geo || loja.latitude == null || loja.longitude == null) return { dentroRaio: null };
  const distancia = distanciaMetros(geo, { lat: loja.latitude, lng: loja.longitude });
  const desconto = Math.min(Math.max(geo.precisao ?? 0, 0), PRECISAO_MAX_METROS);
  const efetiva = Math.max(0, distancia - desconto);
  if (efetiva <= raioMetros) return { dentroRaio: true, distanciaMetros: distancia, raioMetros };
  return {
    dentroRaio: false,
    distanciaMetros: distancia,
    raioMetros,
    motivo: `vistoria concluída a ~${distancia >= 1000 ? `${(distancia / 1000).toFixed(1)} km` : `${distancia} m`} da loja (raio aceito: ${raioMetros} m)`,
  };
}

// ---------------------------------------------------------------------------
// OCR do IMEI: o que a foto do *#06# mostra tem que bater com o cadastrado.
// ---------------------------------------------------------------------------

/** Extrai candidatos a IMEI (14–16 dígitos) de um texto livre vindo do OCR. */
export function extrairImeisDeTexto(texto: string): string[] {
  const achados = texto.replace(/[\s.\-–]/g, ' ').match(/\d[\d ]{12,20}\d/g) ?? [];
  const imeis = new Set<string>();
  for (const bruto of achados) {
    const digitos = bruto.replace(/\D/g, '');
    if (digitos.length >= 14 && digitos.length <= 16) imeis.add(digitos);
  }
  return [...imeis];
}

/**
 * O IMEI lido na foto confere com o cadastrado? Compara pelos 14 primeiros
 * dígitos (o 15º é dígito verificador — leitura ruim dele não pode reprovar).
 * null = OCR não leu nenhum IMEI (inconclusivo, não bloqueia).
 */
export function imeiOcrConfere(imeisLidos: string[], cadastrado: string): boolean | null {
  if (!imeisLidos.length) return null;
  const alvo = normalizarImei(cadastrado).slice(0, 14);
  if (alvo.length < 14) return null;
  return imeisLidos.some((lido) => normalizarImei(lido).slice(0, 14) === alvo);
}
