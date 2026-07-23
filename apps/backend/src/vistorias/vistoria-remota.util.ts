import { createHash, randomBytes } from 'crypto';

/** Validade do link de vistoria remota enviado ao cliente (M2). */
export const TOKEN_VALIDADE_MINUTOS = 30;

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
  return { compativel: true };
}
