import type { LoginResponse, Paginacao, UsuarioPublico } from '@solatium/shared';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000/api';

const ACCESS_KEY = 'solatium.admin.accessToken';
const REFRESH_KEY = 'solatium.admin.refreshToken';

/** Armazenamento simples dos tokens em localStorage. */
export const tokenStore = {
  get access(): string | null {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh(): string | null {
    return localStorage.getItem(REFRESH_KEY);
  },
  salvar(accessToken: string, refreshToken: string): void {
    localStorage.setItem(ACCESS_KEY, accessToken);
    localStorage.setItem(REFRESH_KEY, refreshToken);
  },
  limpar(): void {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

/** Erro de API com mensagem já normalizada em português. */
export class ApiError extends Error {
  statusCode: number;
  constructor(mensagem: string, statusCode: number) {
    super(mensagem);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

interface CorpoErro {
  statusCode?: number;
  erro?: string;
  mensagem?: string | string[];
}

function extrairMensagem(corpo: CorpoErro | null, statusCode: number): string {
  if (corpo) {
    const m = corpo.mensagem;
    if (Array.isArray(m) && m.length > 0) return m.join(' ');
    if (typeof m === 'string' && m.trim()) return m;
    if (corpo.erro) return corpo.erro;
  }
  return `Erro na requisição (HTTP ${statusCode}).`;
}

async function lerJson<T>(res: Response): Promise<T | null> {
  const texto = await res.text();
  if (!texto) return null;
  try {
    return JSON.parse(texto) as T;
  } catch {
    return null;
  }
}

/** Tenta renovar os tokens usando o refresh token. Retorna true se renovou. */
async function renovarTokens(): Promise<boolean> {
  const refreshToken = tokenStore.refresh;
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const data = await lerJson<LoginResponse>(res);
    if (!data?.accessToken || !data?.refreshToken) return false;
    tokenStore.salvar(data.accessToken, data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

interface OpcoesRequest {
  autenticado?: boolean;
  tentarRefresh?: boolean;
}

async function request<T>(
  metodo: string,
  caminho: string,
  corpo?: unknown,
  opcoes: OpcoesRequest = {},
): Promise<T> {
  const { autenticado = true, tentarRefresh = true } = opcoes;

  const headers: Record<string, string> = {};
  if (corpo !== undefined) headers['Content-Type'] = 'application/json';
  if (autenticado && tokenStore.access) {
    headers['Authorization'] = `Bearer ${tokenStore.access}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${caminho}`, {
      method: metodo,
      headers,
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    });
  } catch {
    throw new ApiError('Não foi possível conectar ao servidor.', 0);
  }

  // Sessão expirada: tenta renovar uma única vez e repete a chamada.
  if (res.status === 401 && autenticado && tentarRefresh) {
    const renovou = await renovarTokens();
    if (renovou) {
      return request<T>(metodo, caminho, corpo, { autenticado, tentarRefresh: false });
    }
    tokenStore.limpar();
  }

  if (!res.ok) {
    const corpoErro = await lerJson<CorpoErro>(res);
    throw new ApiError(extrairMensagem(corpoErro, res.status), res.status);
  }

  if (res.status === 204) return undefined as T;
  const data = await lerJson<T>(res);
  return data as T;
}

interface ParamsListagem {
  pagina: number;
  porPagina: number;
  busca?: string;
}

function montarQuery(params: ParamsListagem): string {
  const q = new URLSearchParams();
  q.set('pagina', String(params.pagina));
  q.set('porPagina', String(params.porPagina));
  if (params.busca && params.busca.trim()) q.set('busca', params.busca.trim());
  return `?${q.toString()}`;
}

export const api = {
  // --- Autenticação ---
  login(email: string, senha: string): Promise<LoginResponse> {
    return request<LoginResponse>(
      'POST',
      '/auth/login',
      { email, senha },
      { autenticado: false, tentarRefresh: false },
    );
  },
  me(): Promise<UsuarioPublico> {
    return request<UsuarioPublico>('GET', '/auth/me');
  },

  // --- CRUD genérico ---
  listar<T>(recurso: string, params: ParamsListagem): Promise<Paginacao<T>> {
    return request<Paginacao<T>>('GET', `/${recurso}${montarQuery(params)}`);
  },
  obter<T>(recurso: string, id: string): Promise<T> {
    return request<T>('GET', `/${recurso}/${id}`);
  },
  criar<T>(recurso: string, corpo: unknown): Promise<T> {
    return request<T>('POST', `/${recurso}`, corpo);
  },
  atualizar<T>(recurso: string, id: string, corpo: unknown): Promise<T> {
    return request<T>('PATCH', `/${recurso}/${id}`, corpo);
  },
  remover(recurso: string, id: string): Promise<void> {
    return request<void>('DELETE', `/${recurso}/${id}`);
  },

  // --- Chamadas fora do CRUD (dashboards, ações, importação) ---
  get<T>(caminho: string): Promise<T> {
    return request<T>('GET', caminho);
  },
  post<T>(caminho: string, corpo?: unknown): Promise<T> {
    return request<T>('POST', caminho, corpo ?? {});
  },
  patch<T>(caminho: string, corpo?: unknown): Promise<T> {
    return request<T>('PATCH', caminho, corpo ?? {});
  },
};
