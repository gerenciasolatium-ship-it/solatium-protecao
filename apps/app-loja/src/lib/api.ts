import type { LoginResponse } from '@solatium/shared';

/** Base da API REST NestJS. Configurável via VITE_API_URL. */
const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000/api';

export const STORAGE = {
  access: 'sol.accessToken',
  refresh: 'sol.refreshToken',
  usuario: 'sol.usuario',
} as const;

/** Erro de API com o statusCode e a mensagem amigável já extraída. */
export class ApiError extends Error {
  readonly statusCode: number;
  constructor(mensagem: string, statusCode: number) {
    super(mensagem);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

/** Erros do backend vêm como { statusCode, erro, mensagem: string | string[] }. */
function extrairMensagem(corpo: unknown, fallback: string): string {
  if (corpo && typeof corpo === 'object' && 'mensagem' in corpo) {
    const m = (corpo as { mensagem: unknown }).mensagem;
    if (typeof m === 'string' && m.trim()) return m;
    if (Array.isArray(m)) {
      const partes = m.filter((x): x is string => typeof x === 'string');
      if (partes.length) return partes.join(' ');
    }
  }
  return fallback;
}

export function limparSessao(): void {
  localStorage.removeItem(STORAGE.access);
  localStorage.removeItem(STORAGE.refresh);
  localStorage.removeItem(STORAGE.usuario);
}

function salvarTokens(data: LoginResponse): void {
  localStorage.setItem(STORAGE.access, data.accessToken);
  localStorage.setItem(STORAGE.refresh, data.refreshToken);
  localStorage.setItem(STORAGE.usuario, JSON.stringify(data.usuario));
}

/** Tenta renovar o access token usando o refresh token guardado. */
async function tentarRefresh(): Promise<boolean> {
  const refreshToken = localStorage.getItem(STORAGE.refresh);
  if (!refreshToken) return false;
  try {
    const resp = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!resp.ok) return false;
    salvarTokens((await resp.json()) as LoginResponse);
    return true;
  } catch {
    return false;
  }
}

interface Opcoes {
  method?: string;
  body?: unknown;
  /** Injeta o Bearer token (padrão: true). */
  auth?: boolean;
  query?: Record<string, string | number | undefined>;
  _retry?: boolean;
}

function montarUrl(caminho: string, query?: Opcoes['query']): string {
  if (!query) return `${API_URL}${caminho}`;
  const params = new URLSearchParams();
  for (const [chave, valor] of Object.entries(query)) {
    if (valor !== undefined && valor !== '') params.set(chave, String(valor));
  }
  const qs = params.toString();
  return `${API_URL}${caminho}${qs ? `?${qs}` : ''}`;
}

/**
 * Wrapper de fetch: injeta o Bearer do localStorage, serializa JSON,
 * faz um refresh transparente em 401 e normaliza os erros da API.
 */
export async function apiFetch<T>(caminho: string, opcoes: Opcoes = {}): Promise<T> {
  const { method = 'GET', body, auth = true, query } = opcoes;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = localStorage.getItem(STORAGE.access);
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const resp = await fetch(montarUrl(caminho, query), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  // 401 → tenta refresh uma única vez e repete a chamada original.
  if (resp.status === 401 && auth && !opcoes._retry) {
    const ok = await tentarRefresh();
    if (ok) return apiFetch<T>(caminho, { ...opcoes, _retry: true });
    limparSessao();
  }

  if (!resp.ok) {
    let corpo: unknown = null;
    try {
      corpo = await resp.json();
    } catch {
      // resposta sem corpo JSON
    }
    throw new ApiError(extrairMensagem(corpo, `Erro ${resp.status}`), resp.status);
  }

  if (resp.status === 204) return undefined as T;
  return (await resp.json()) as T;
}

export { salvarTokens };
