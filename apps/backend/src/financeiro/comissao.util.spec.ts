import {
  ajusteEndosso,
  clawbackProporcional,
  comissaoDevida,
  comissaoTotal,
  memoriaClawback,
  PARCELAS_ANUAL,
} from './comissao.util';

describe('M12 — comissão e clawback proporcional', () => {
  describe('comissaoTotal', () => {
    it('calcula comissão cheia sobre o prêmio anual', () => {
      // Plano Anual R$ 299, comissão de loja 30%.
      expect(comissaoTotal(299, 0.3)).toBe(89.7);
    });
  });

  describe('exemplo central: anual, 2/12 pagas → clawback de 10/12', () => {
    // valorTotal redondo para leitura clara da fração.
    const valorTotal = 1200;

    it('comissão devida = 2/12 do total', () => {
      expect(comissaoDevida(valorTotal, 2)).toBe(200); // 1200 × 2/12
    });

    it('clawback = 10/12 do total', () => {
      expect(clawbackProporcional(valorTotal, 2)).toBe(1000); // 1200 × 10/12
    });

    it('devida + clawback = total (conservação)', () => {
      expect(comissaoDevida(valorTotal, 2) + clawbackProporcional(valorTotal, 2)).toBe(valorTotal);
    });

    it('memória de cálculo reflete o exemplo', () => {
      expect(memoriaClawback(valorTotal, 2)).toEqual({
        valorTotal: 1200,
        parcelasPagas: 2,
        parcelasTotais: 12,
        valorDevido: 200,
        valorClawback: 1000,
      });
    });
  });

  describe('mesmo exemplo com valor não-redondo (R$ 89,70)', () => {
    const total = comissaoTotal(299, 0.3); // 89.70
    it('devida = 14,95 e clawback = 74,75, somando o total', () => {
      expect(comissaoDevida(total, 2)).toBe(14.95);
      expect(clawbackProporcional(total, 2)).toBe(74.75);
      expect(comissaoDevida(total, 2) + clawbackProporcional(total, 2)).toBe(total);
    });
  });

  describe('bordas', () => {
    it('0 parcelas pagas → clawback integral', () => {
      expect(clawbackProporcional(1200, 0)).toBe(1200);
      expect(comissaoDevida(1200, 0)).toBe(0);
    });

    it('12 parcelas pagas → sem clawback', () => {
      expect(clawbackProporcional(1200, PARCELAS_ANUAL)).toBe(0);
      expect(comissaoDevida(1200, PARCELAS_ANUAL)).toBe(1200);
    });

    it('parcelas fora do intervalo são limitadas', () => {
      expect(clawbackProporcional(1200, 20)).toBe(0); // >12 vira 12
      expect(clawbackProporcional(1200, -5)).toBe(1200); // <0 vira 0
    });
  });

  describe('ajusteEndosso', () => {
    it('aumento de prêmio → crédito complementar', () => {
      expect(ajusteEndosso(100, 130)).toEqual({ tipo: 'CREDITO', valor: 30 });
    });
    it('redução de prêmio → clawback da diferença', () => {
      expect(ajusteEndosso(130, 100)).toEqual({ tipo: 'DEBITO_CLAWBACK', valor: 30 });
    });
    it('sem mudança → crédito zero', () => {
      expect(ajusteEndosso(100, 100)).toEqual({ tipo: 'CREDITO', valor: 0 });
    });
  });
});
