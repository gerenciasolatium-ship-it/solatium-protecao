/**
 * Parser de CSV para importação em massa (M1). Sem dependências:
 * detecta separador (`;` ou `,`), respeita aspas duplas (incluindo escape ""),
 * remove BOM e normaliza cabeçalhos (minúsculos, sem acento, sem espaços).
 */

export interface CsvResultado {
  cabecalhos: string[];
  linhas: Record<string, string>[];
}

export function normalizarCabecalho(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

export function parseCsv(texto: string): CsvResultado {
  const conteudo = texto.replace(/^\uFEFF/, '');
  const linhasBrutas = quebrarLinhas(conteudo);
  if (linhasBrutas.length === 0) return { cabecalhos: [], linhas: [] };

  const separador = detectarSeparador(linhasBrutas[0]);
  const cabecalhos = quebrarCampos(linhasBrutas[0], separador).map(normalizarCabecalho);

  const linhas: Record<string, string>[] = [];
  for (let i = 1; i < linhasBrutas.length; i++) {
    if (!linhasBrutas[i].trim()) continue;
    const campos = quebrarCampos(linhasBrutas[i], separador);
    const linha: Record<string, string> = {};
    cabecalhos.forEach((cab, idx) => {
      linha[cab] = (campos[idx] ?? '').trim();
    });
    linhas.push(linha);
  }
  return { cabecalhos, linhas };
}

function detectarSeparador(cabecalho: string): string {
  // Conta ocorrências fora de aspas; `;` é o padrão do Excel pt-BR.
  let virgulas = 0;
  let pontoVirgulas = 0;
  let dentroAspas = false;
  for (const ch of cabecalho) {
    if (ch === '"') dentroAspas = !dentroAspas;
    else if (!dentroAspas && ch === ',') virgulas++;
    else if (!dentroAspas && ch === ';') pontoVirgulas++;
  }
  return pontoVirgulas >= virgulas ? ';' : ',';
}

/** Quebra em linhas respeitando quebras dentro de aspas. */
function quebrarLinhas(texto: string): string[] {
  const linhas: string[] = [];
  let atual = '';
  let dentroAspas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (ch === '"') {
      dentroAspas = !dentroAspas;
      atual += ch;
    } else if (!dentroAspas && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && texto[i + 1] === '\n') i++;
      linhas.push(atual);
      atual = '';
    } else {
      atual += ch;
    }
  }
  if (atual.length) linhas.push(atual);
  return linhas;
}

function quebrarCampos(linha: string, separador: string): string[] {
  const campos: string[] = [];
  let atual = '';
  let dentroAspas = false;
  for (let i = 0; i < linha.length; i++) {
    const ch = linha[i];
    if (dentroAspas) {
      if (ch === '"') {
        if (linha[i + 1] === '"') {
          atual += '"';
          i++;
        } else {
          dentroAspas = false;
        }
      } else {
        atual += ch;
      }
    } else if (ch === '"') {
      dentroAspas = true;
    } else if (ch === separador) {
      campos.push(atual);
      atual = '';
    } else {
      atual += ch;
    }
  }
  campos.push(atual);
  return campos;
}

export function somenteDigitos(valor: string): string {
  return valor.replace(/\D/g, '');
}
