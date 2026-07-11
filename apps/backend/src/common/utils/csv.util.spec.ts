import { normalizarCabecalho, parseCsv, somenteDigitos } from './csv.util';

describe('parseCsv (importação em massa)', () => {
  it('detecta separador ; (padrão Excel pt-BR) e normaliza cabeçalhos', () => {
    const { cabecalhos, linhas } = parseCsv('Nome;CNPJ;Cidade\nLoja A;123;São Paulo\n');
    expect(cabecalhos).toEqual(['nome', 'cnpj', 'cidade']);
    expect(linhas).toEqual([{ nome: 'Loja A', cnpj: '123', cidade: 'São Paulo' }]);
  });

  it('suporta vírgula como separador', () => {
    const { linhas } = parseCsv('nome,cnpj\nLoja B,456');
    expect(linhas).toEqual([{ nome: 'Loja B', cnpj: '456' }]);
  });

  it('respeita aspas com separador e aspas escapadas dentro do campo', () => {
    const { linhas } = parseCsv('nome;obs\n"Loja ""Top""; Centro";ok');
    expect(linhas[0].nome).toBe('Loja "Top"; Centro');
  });

  it('ignora linhas vazias e remove BOM', () => {
    const { linhas } = parseCsv('﻿nome;cnpj\nLoja C;789\n\n\n');
    expect(linhas).toHaveLength(1);
  });

  it('normaliza cabeçalho com acento e espaço', () => {
    expect(normalizarCabecalho(' Razão Social ')).toBe('razao_social');
  });

  it('CRLF do Windows', () => {
    const { linhas } = parseCsv('nome;cnpj\r\nLoja D;111\r\n');
    expect(linhas).toEqual([{ nome: 'Loja D', cnpj: '111' }]);
  });

  it('somenteDigitos limpa máscaras de CNPJ/CPF/telefone', () => {
    expect(somenteDigitos('12.345.678/0001-99')).toBe('12345678000199');
  });
});
