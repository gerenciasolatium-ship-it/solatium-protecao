import {
  faixaSinistralidade,
  montarSerieMensal,
  pct,
  pctInadimplencia,
  sinistralidadePct,
  ticketMedio,
  ultimosMeses,
} from './dashboard.util';

describe('sinistralidadePct / faixas (M13, meta 30%)', () => {
  it('calcula indenizado/prêmio em %', () => {
    expect(sinistralidadePct(10000, 2500)).toBe(25);
    expect(sinistralidadePct(3000, 1000)).toBe(33.33);
  });

  it('sem prêmio arrecadado → 0 (não divide por zero)', () => {
    expect(sinistralidadePct(0, 500)).toBe(0);
  });

  it('faixas: <20 VERDE, 20–30 AMARELA, >30 VERMELHA', () => {
    expect(faixaSinistralidade(19.99)).toBe('VERDE');
    expect(faixaSinistralidade(20)).toBe('AMARELA');
    expect(faixaSinistralidade(30)).toBe('AMARELA');
    expect(faixaSinistralidade(30.01)).toBe('VERMELHA');
  });
});

describe('ticketMedio / pctInadimplencia', () => {
  it('ticket médio = prêmio total / vendas', () => {
    expect(ticketMedio(897, 3)).toBe(299);
    expect(ticketMedio(0, 0)).toBe(0);
  });

  it('inadimplência por valor: vencido / (vencido + confirmado)', () => {
    expect(pctInadimplencia(200, 800)).toBe(20);
    expect(pctInadimplencia(0, 0)).toBe(0);
  });

  it('pct genérico: recebido/emitido e cancelados/emitidos', () => {
    expect(pct(897, 3588)).toBe(25); // recebeu 25% do prêmio emitido (parcelado)
    expect(pct(3, 40)).toBe(7.5); // 3 cancelamentos em 40 emissões
    expect(pct(10, 0)).toBe(0);
  });
});

describe('ultimosMeses / montarSerieMensal', () => {
  it('gera N meses contínuos terminando no mês de referência', () => {
    const meses = ultimosMeses(3, new Date(Date.UTC(2026, 6, 11))); // jul/2026
    expect(meses).toEqual(['2026-05', '2026-06', '2026-07']);
  });

  it('vira o ano corretamente', () => {
    const meses = ultimosMeses(3, new Date(Date.UTC(2026, 0, 15))); // jan/2026
    expect(meses).toEqual(['2025-11', '2025-12', '2026-01']);
  });

  it('meses sem movimento entram zerados (sem buracos no gráfico)', () => {
    const serie = montarSerieMensal(['2026-05', '2026-06', '2026-07'], {
      vendas: new Map([['2026-07', 4]]),
      emitido: new Map([['2026-07', 4784]]),
      premio: new Map([['2026-07', 1196]]),
      indenizado: new Map([['2026-06', 500]]),
      cancelados: new Map([['2026-06', 1]]),
    });
    expect(serie).toEqual([
      {
        mes: '2026-05',
        vendas: 0,
        emitido: 0,
        premio: 0,
        indenizado: 0,
        cancelados: 0,
        sinistralidadePct: 0,
      },
      {
        mes: '2026-06',
        vendas: 0,
        emitido: 0,
        premio: 0,
        indenizado: 500,
        cancelados: 1,
        sinistralidadePct: 0,
      },
      {
        mes: '2026-07',
        vendas: 4,
        emitido: 4784,
        premio: 1196,
        indenizado: 0,
        cancelados: 0,
        sinistralidadePct: 0,
      },
    ]);
  });
});
