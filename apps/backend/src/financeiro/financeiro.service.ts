import { Injectable, NotFoundException } from '@nestjs/common';
import type { LancamentoTipo, Prisma } from '@prisma/client';
import type { Paginacao } from '@solatium/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PaginacaoQueryDto } from '../common/dto/paginacao.dto';
import {
  ajusteEndosso,
  arredondar2,
  clawbackProporcional,
  comissaoTotal,
  memoriaClawback,
  PARCELAS_ANUAL,
} from './comissao.util';

type TxClient = Prisma.TransactionClient;

interface RegistrarComissaoEmissaoInput {
  lojaId: string;
  certificadoId: string;
  premioBase: number;
  comissaoPct: number;
  regime: 'ANTECIPADA' | 'PRO_RATA';
  tipo?: 'LOJA' | 'CORRETAGEM';
  parcelasTotais?: number;
}

interface RegistrarClawbackInput {
  comissaoId: string;
  parcelasPagas: number;
  motivo?: string;
}

interface RegistrarAjusteEndossoInput {
  lojaId: string;
  endossoId: string;
  comissaoAntes: number;
  comissaoDepois: number;
  comissaoId?: string;
}

@Injectable()
export class FinanceiroService {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------------
  // Eventos automáticos (chamados por emissão M3 e cancelamento M5)
  // -------------------------------------------------------------------------

  /**
   * Emissão do certificado → cria a comissão e credita a conta-corrente da loja.
   * ANTECIPADA (anual) credita o valor cheio; PRO_RATA fica PREVISTA (crédito mensal na S4).
   */
  async registrarComissaoEmissao(input: RegistrarComissaoEmissaoInput) {
    const {
      lojaId,
      certificadoId,
      premioBase,
      comissaoPct,
      regime,
      tipo = 'LOJA',
      parcelasTotais = PARCELAS_ANUAL,
    } = input;
    const valorTotal = comissaoTotal(premioBase, comissaoPct);

    return this.prisma.$transaction(async (tx) => {
      const comissao = await tx.comissao.create({
        data: {
          lojaId,
          certificadoId,
          tipo,
          regime,
          valorBase: premioBase,
          valorTotal,
          parcelasTotais,
          status: regime === 'ANTECIPADA' ? 'CREDITADA' : 'PREVISTA',
        },
      });

      if (regime === 'ANTECIPADA') {
        await this.lancar(tx, {
          lojaId,
          tipo: 'CREDITO',
          valor: valorTotal,
          referencia: `Comissão ${tipo} — emissão do certificado ${certificadoId}`,
          comissaoId: comissao.id,
        });
      }
      return comissao;
    });
  }

  /**
   * Cancelamento (inadimplência D+30 ou pedido do cliente) → clawback proporcional
   * às parcelas não pagas, com memória de cálculo visível.
   */
  async registrarClawbackCancelamento(input: RegistrarClawbackInput) {
    const { comissaoId, parcelasPagas, motivo } = input;
    return this.prisma.$transaction(async (tx) => {
      const comissao = await tx.comissao.findUnique({ where: { id: comissaoId } });
      if (!comissao) throw new NotFoundException('Comissão não encontrada.');

      const valorTotal = Number(comissao.valorTotal);
      const clawback = clawbackProporcional(valorTotal, parcelasPagas, comissao.parcelasTotais);

      if (clawback <= 0) {
        // Todas as parcelas pagas → nada a estornar.
        await tx.comissao.update({ where: { id: comissaoId }, data: { parcelasPagas } });
        return { clawback: 0, lancamento: null };
      }

      const memoria = {
        ...memoriaClawback(valorTotal, parcelasPagas, comissao.parcelasTotais),
        certificadoId: comissao.certificadoId,
        motivo: motivo ?? 'cancelamento',
      };

      const lancamento = await this.lancar(tx, {
        lojaId: comissao.lojaId,
        tipo: 'DEBITO_CLAWBACK',
        valor: clawback,
        referencia: `Clawback — cancelamento (${parcelasPagas}/${comissao.parcelasTotais} pagas)`,
        comissaoId: comissao.id,
        memoriaCalculo: memoria,
      });

      await tx.comissao.update({
        where: { id: comissaoId },
        data: {
          parcelasPagas,
          valorEstornado: arredondar2(Number(comissao.valorEstornado) + clawback),
          status: parcelasPagas > 0 ? 'PARCIAL_ESTORNADA' : 'ESTORNADA',
        },
      });

      return { clawback, lancamento };
    });
  }

  /** Endosso que altera o prêmio → clawback (reduz) ou crédito complementar (aumenta). */
  async registrarAjusteEndosso(input: RegistrarAjusteEndossoInput) {
    const { tipo, valor } = ajusteEndosso(input.comissaoAntes, input.comissaoDepois);
    if (valor <= 0) return { lancamento: null, tipo, valor };

    return this.prisma.$transaction(async (tx) => {
      const lancamento = await this.lancar(tx, {
        lojaId: input.lojaId,
        tipo,
        valor,
        referencia: `Endosso ${input.endossoId} — ajuste de comissão`,
        comissaoId: input.comissaoId,
      });
      return { lancamento, tipo, valor };
    });
  }

  // -------------------------------------------------------------------------
  // Conta-corrente (consulta e ajuste manual)
  // -------------------------------------------------------------------------

  async ajusteManual(
    lojaId: string,
    dados: { sentido: 'CREDITO' | 'DEBITO'; valor: number; referencia: string },
  ) {
    await this.garantirLoja(lojaId);
    const valorAssinado =
      dados.sentido === 'CREDITO' ? Math.abs(dados.valor) : -Math.abs(dados.valor);
    return this.prisma.$transaction((tx) =>
      this.lancar(tx, {
        lojaId,
        tipo: 'AJUSTE',
        valor: valorAssinado,
        referencia: `Ajuste manual: ${dados.referencia}`,
      }),
    );
  }

  async saldoLoja(lojaId: string): Promise<number> {
    const ultimo = await this.prisma.contaCorrenteLancamento.findFirst({
      where: { lojaId },
      orderBy: { seq: 'desc' },
    });
    return ultimo ? Number(ultimo.saldoApos) : 0;
  }

  async extrato(
    lojaId: string,
    query: PaginacaoQueryDto,
  ): Promise<Paginacao<unknown> & { saldo: number }> {
    await this.garantirLoja(lojaId);
    const { pagina, porPagina } = query;
    const [itens, total, saldo] = await Promise.all([
      this.prisma.contaCorrenteLancamento.findMany({
        where: { lojaId },
        skip: (pagina - 1) * porPagina,
        take: porPagina,
        orderBy: { seq: 'desc' },
      }),
      this.prisma.contaCorrenteLancamento.count({ where: { lojaId } }),
      this.saldoLoja(lojaId),
    ]);
    return { itens, total, pagina, porPagina, saldo };
  }

  async comissoesLoja(lojaId: string, query: PaginacaoQueryDto): Promise<Paginacao<unknown>> {
    await this.garantirLoja(lojaId);
    const { pagina, porPagina } = query;
    const [itens, total] = await this.prisma.$transaction([
      this.prisma.comissao.findMany({
        where: { lojaId },
        skip: (pagina - 1) * porPagina,
        take: porPagina,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.comissao.count({ where: { lojaId } }),
    ]);
    return { itens, total, pagina, porPagina };
  }

  /** Regra 8: saldo negativo bloqueia repasses e retém comissões futuras (aplicado na S4). */
  async repasseBloqueado(lojaId: string): Promise<boolean> {
    return (await this.saldoLoja(lojaId)) < 0;
  }

  // -------------------------------------------------------------------------
  // Internos
  // -------------------------------------------------------------------------

  /** Aplica um lançamento no livro-razão, calculando o saldo resultante. */
  private async lancar(
    tx: TxClient,
    entrada: {
      lojaId: string;
      tipo: LancamentoTipo;
      valor: number; // magnitude p/ CREDITO/DEBITO; assinado p/ AJUSTE
      referencia: string;
      comissaoId?: string | null;
      memoriaCalculo?: Prisma.InputJsonValue;
    },
  ) {
    // Serializa lançamentos concorrentes da mesma loja (read-then-write do
    // saldo). Lock liberado automaticamente no fim da transação.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${entrada.lojaId}))`;
    const ultimo = await tx.contaCorrenteLancamento.findFirst({
      where: { lojaId: entrada.lojaId },
      orderBy: { seq: 'desc' },
    });
    const saldoAnterior = ultimo ? Number(ultimo.saldoApos) : 0;
    const saldoApos = arredondar2(saldoAnterior + this.delta(entrada.tipo, entrada.valor));

    return tx.contaCorrenteLancamento.create({
      data: {
        lojaId: entrada.lojaId,
        tipo: entrada.tipo,
        valor: entrada.tipo === 'AJUSTE' ? entrada.valor : Math.abs(entrada.valor),
        saldoApos,
        referencia: entrada.referencia,
        comissaoId: entrada.comissaoId ?? undefined,
        memoriaCalculo: entrada.memoriaCalculo,
      },
    });
  }

  /** Sinal do lançamento no saldo: crédito soma, clawback subtrai, ajuste é assinado. */
  private delta(tipo: LancamentoTipo, valor: number): number {
    if (tipo === 'CREDITO') return Math.abs(valor);
    if (tipo === 'DEBITO_CLAWBACK') return -Math.abs(valor);
    return valor; // AJUSTE
  }

  private async garantirLoja(lojaId: string) {
    const loja = await this.prisma.loja.findUnique({ where: { id: lojaId } });
    if (!loja) throw new NotFoundException('Loja não encontrada.');
    return loja;
  }
}
