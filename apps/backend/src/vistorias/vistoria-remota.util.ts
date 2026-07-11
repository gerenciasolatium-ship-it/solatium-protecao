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
