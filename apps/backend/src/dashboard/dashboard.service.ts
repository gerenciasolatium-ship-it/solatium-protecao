import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceiroService } from '../financeiro/financeiro.service';
import {
  META_SINISTRALIDADE_PCT,
  PontoSerieMensal,
  arredondar2,
  faixaSinistralidade,
  montarSerieMensal,
  pctInadimplencia,
  sinistralidadePct,
  ticketMedio,
  ultimosMeses,
} from './dashboard.util';

const MESES_SERIE = 12;

interface LinhaMes {
  mes: string;
  total: number;
}

export interface RankingLoja {
  lojaId: string;
  nome: string;
  status: string;
  vidasAtivas: number;
  vendasMes: number;
  premio12m: number;
  indenizado12m: number;
  sinistros12m: number;
  parcelasVencidas: number;
  sinistralidadePct: number;
  faixa: string;
}

/**
 * Dashboards executivos (M9) + sinistralidade com meta de 30% (M13).
 * Tudo agregado no banco (groupBy/SQL) — nunca carrega a carteira em memória,
 * pra escalar a milhares de lojas.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly financeiro: FinanceiroService,
  ) {}

  /** Visão do backoffice Solatium: carteira inteira + ranking de lojas. */
  async resumoAdmin(top = 20) {
    const agora = new Date();
    const inicioMes = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1));
    const inicio12m = this.inicioJanela12m(agora);

    const [
      vidasAtivas,
      suspensos,
      vendasMes,
      premioMesRow,
      mrrRow,
      inadimplencia,
      confirmado12m,
      sinistrosPorStatus,
      indenizado12m,
      funilVistorias,
      serieMensal,
      rankingLojas,
      totalLojas,
    ] = await Promise.all([
      this.prisma.certificado.count({ where: { status: 'ATIVO' } }),
      this.prisma.certificado.count({ where: { status: 'SUSPENSO' } }),
      this.prisma.certificado.count({ where: { createdAt: { gte: inicioMes } } }),
      this.premioVendidoDesde(inicioMes),
      this.mrr(),
      this.prisma.pagamento.aggregate({
        _count: { _all: true },
        _sum: { valor: true },
        where: { status: 'VENCIDO' },
      }),
      this.prisma.pagamento.aggregate({
        _sum: { valor: true },
        where: { status: 'CONFIRMADO', pagoEm: { gte: inicio12m } },
      }),
      this.prisma.sinistro.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.sinistro.aggregate({
        _sum: { valorIndenizacao: true },
        where: { status: 'APROVADO', decididoEm: { gte: inicio12m } },
      }),
      this.prisma.vistoria.groupBy({ by: ['status'], _count: { _all: true } }),
      this.serieMensal(),
      this.ranking(inicio12m, inicioMes, top),
      this.prisma.loja.count(),
    ]);

    const premio12m = Number(confirmado12m._sum.valor ?? 0);
    const indenizado = Number(indenizado12m._sum.valorIndenizacao ?? 0);
    const valorVencido = Number(inadimplencia._sum.valor ?? 0);
    const pctSinistralidade = sinistralidadePct(premio12m, indenizado);

    return {
      geradoEm: agora,
      vidasAtivas,
      certificadosSuspensos: suspensos,
      totalLojas,
      vendasMes: {
        quantidade: vendasMes,
        premio: premioMesRow,
        ticketMedio: ticketMedio(premioMesRow, vendasMes),
      },
      mrr: mrrRow,
      inadimplencia: {
        parcelasVencidas: inadimplencia._count._all,
        valorVencido: arredondar2(valorVencido),
        pct: pctInadimplencia(valorVencido, premio12m),
        certificadosSuspensos: suspensos,
      },
      sinistralidade: {
        pct12m: pctSinistralidade,
        faixa: faixaSinistralidade(pctSinistralidade),
        meta: META_SINISTRALIDADE_PCT,
        premio12m: arredondar2(premio12m),
        indenizado12m: arredondar2(indenizado),
      },
      sinistros: Object.fromEntries(
        sinistrosPorStatus.map((s) => [s.status, s._count._all]),
      ) as Record<string, number>,
      funilVistorias: Object.fromEntries(
        funilVistorias.map((v) => [v.status, v._count._all]),
      ) as Record<string, number>,
      serieMensal,
      rankingLojas,
    };
  }

  /** Visão da loja: números próprios + posição/transparência de sinistralidade. */
  async resumoLoja(lojaId: string) {
    const loja = await this.prisma.loja.findUnique({
      where: { id: lojaId },
      select: { id: true, nome: true, status: true },
    });
    if (!loja) throw new NotFoundException('Loja não encontrada.');

    const agora = new Date();
    const inicioMes = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1));
    const inicio12m = this.inicioJanela12m(agora);

    const [
      vidasAtivas,
      vendasMes,
      premioMes,
      confirmado12m,
      indenizado12m,
      vencidos,
      saldo,
      comissoes12m,
      vouchersPendentes,
      sinistrosAndamento,
      serieMensal,
    ] = await Promise.all([
      this.prisma.certificado.count({ where: { lojaId, status: 'ATIVO' } }),
      this.prisma.certificado.count({ where: { lojaId, createdAt: { gte: inicioMes } } }),
      this.premioVendidoDesde(inicioMes, lojaId),
      this.prisma.pagamento.aggregate({
        _sum: { valor: true },
        where: { status: 'CONFIRMADO', pagoEm: { gte: inicio12m }, contrato: { lojaId } },
      }),
      this.prisma.sinistro.aggregate({
        _sum: { valorIndenizacao: true },
        where: { lojaId, status: 'APROVADO', decididoEm: { gte: inicio12m } },
      }),
      this.prisma.pagamento.aggregate({
        _count: { _all: true },
        _sum: { valor: true },
        where: { status: 'VENCIDO', contrato: { lojaId } },
      }),
      this.financeiro.saldoLoja(lojaId),
      this.prisma.comissao.aggregate({
        _sum: { valorTotal: true },
        where: { lojaId, status: { in: ['CREDITADA', 'PARCIAL_ESTORNADA'] } },
      }),
      this.prisma.voucher.aggregate({
        _count: { _all: true },
        _sum: { valor: true },
        where: { status: 'EMITIDO', sinistro: { lojaId } },
      }),
      this.prisma.sinistro.count({
        where: { lojaId, status: { in: ['ABERTO', 'DOCUMENTACAO_PENDENTE', 'EM_ANALISE'] } },
      }),
      this.serieMensal(lojaId),
    ]);

    const premio12m = Number(confirmado12m._sum.valor ?? 0);
    const indenizado = Number(indenizado12m._sum.valorIndenizacao ?? 0);
    const pct = sinistralidadePct(premio12m, indenizado);

    return {
      geradoEm: agora,
      loja,
      vidasAtivas,
      vendasMes: {
        quantidade: vendasMes,
        premio: premioMes,
        ticketMedio: ticketMedio(premioMes, vendasMes),
      },
      comissoes: {
        saldoContaCorrente: arredondar2(saldo),
        creditadasTotal: arredondar2(Number(comissoes12m._sum.valorTotal ?? 0)),
      },
      inadimplencia: {
        parcelasVencidas: vencidos._count._all,
        valorVencido: arredondar2(Number(vencidos._sum.valor ?? 0)),
      },
      sinistralidade: {
        pct12m: pct,
        faixa: faixaSinistralidade(pct),
        meta: META_SINISTRALIDADE_PCT,
        premio12m: arredondar2(premio12m),
        indenizado12m: arredondar2(indenizado),
        // Transparência (M13): quanto de indenização ainda "cabe" na faixa verde.
        margemAteVerde: arredondar2(Math.max(0, premio12m * 0.2 - indenizado)),
      },
      sinistrosEmAndamento: sinistrosAndamento,
      vouchersPendentes: {
        quantidade: vouchersPendentes._count._all,
        valor: arredondar2(Number(vouchersPendentes._sum.valor ?? 0)),
      },
      serieMensal,
    };
  }

  // ---------------------------------------------------------------------------
  // Internos (agregações SQL)
  // ---------------------------------------------------------------------------

  private inicioJanela12m(referencia: Date): Date {
    return new Date(Date.UTC(referencia.getUTCFullYear(), referencia.getUTCMonth() - 11, 1));
  }

  /** Prêmio vendido (soma do premioTotal dos contratos emitidos) desde `inicio`. */
  private async premioVendidoDesde(inicio: Date, lojaId?: string): Promise<number> {
    const filtroLoja = lojaId ? Prisma.sql`AND c."lojaId" = ${lojaId}` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<{ total: number }[]>`
      SELECT COALESCE(SUM(ct."premioTotal"), 0)::float8 AS total
      FROM "certificados" c
      JOIN "contratos" ct ON ct."id" = c."contratoId"
      WHERE c."createdAt" >= ${inicio} ${filtroLoja}
    `;
    return arredondar2(Number(rows[0]?.total ?? 0));
  }

  /** MRR: prêmio anualizado da carteira ATIVA dividido por 12. */
  private async mrr(): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ total: number }[]>`
      SELECT COALESCE(SUM(ct."premioTotal" / 12), 0)::float8 AS total
      FROM "certificados" c
      JOIN "contratos" ct ON ct."id" = c."contratoId"
      WHERE c."status" = 'ATIVO'
    `;
    return arredondar2(Number(rows[0]?.total ?? 0));
  }

  /** Série de 12 meses: vendas, prêmio arrecadado e indenizações (M13 item 3). */
  private async serieMensal(lojaId?: string): Promise<PontoSerieMensal[]> {
    const meses = ultimosMeses(MESES_SERIE);
    const inicio = this.inicioJanela12m(new Date());
    const filtroCert = lojaId ? Prisma.sql`AND "lojaId" = ${lojaId}` : Prisma.empty;
    const filtroContrato = lojaId ? Prisma.sql`AND ct."lojaId" = ${lojaId}` : Prisma.empty;

    const [vendas, premios, indenizados] = await Promise.all([
      this.prisma.$queryRaw<LinhaMes[]>`
        SELECT to_char(date_trunc('month', "createdAt"), 'YYYY-MM') AS mes,
               COUNT(*)::float8 AS total
        FROM "certificados"
        WHERE "createdAt" >= ${inicio} ${filtroCert}
        GROUP BY 1
      `,
      this.prisma.$queryRaw<LinhaMes[]>`
        SELECT to_char(date_trunc('month', p."pagoEm"), 'YYYY-MM') AS mes,
               COALESCE(SUM(p."valor"), 0)::float8 AS total
        FROM "pagamentos" p
        JOIN "contratos" ct ON ct."id" = p."contratoId"
        WHERE p."status" = 'CONFIRMADO' AND p."pagoEm" >= ${inicio} ${filtroContrato}
        GROUP BY 1
      `,
      this.prisma.$queryRaw<LinhaMes[]>`
        SELECT to_char(date_trunc('month', "decididoEm"), 'YYYY-MM') AS mes,
               COALESCE(SUM("valorIndenizacao"), 0)::float8 AS total
        FROM "sinistros"
        WHERE "status" = 'APROVADO' AND "decididoEm" >= ${inicio} ${filtroCert}
        GROUP BY 1
      `,
    ]);

    const paraMapa = (linhas: LinhaMes[]) => new Map(linhas.map((l) => [l.mes, Number(l.total)]));
    return montarSerieMensal(meses, paraMapa(vendas), paraMapa(premios), paraMapa(indenizados));
  }

  /** Ranking de lojas por prêmio arrecadado (12m) com sinistralidade (M13 item 4). */
  private async ranking(inicio12m: Date, inicioMes: Date, top: number): Promise<RankingLoja[]> {
    const limite = Math.min(Math.max(1, top), 100);
    const rows = await this.prisma.$queryRaw<
      Array<{
        lojaId: string;
        nome: string;
        status: string;
        vidasAtivas: number;
        vendasMes: number;
        premio12m: number;
        indenizado12m: number;
        sinistros12m: number;
        parcelasVencidas: number;
      }>
    >`
      SELECT l."id" AS "lojaId", l."nome", l."status"::text AS status,
             COALESCE(v.vidas, 0)::int AS "vidasAtivas",
             COALESCE(vm.qtd, 0)::int AS "vendasMes",
             COALESCE(pm.premio, 0)::float8 AS "premio12m",
             COALESCE(sn.indenizado, 0)::float8 AS "indenizado12m",
             COALESCE(sn.qtd, 0)::int AS "sinistros12m",
             COALESCE(pv.qtd, 0)::int AS "parcelasVencidas"
      FROM "lojas" l
      LEFT JOIN (
        SELECT "lojaId", COUNT(*) AS vidas FROM "certificados"
        WHERE "status" = 'ATIVO' GROUP BY 1
      ) v ON v."lojaId" = l."id"
      LEFT JOIN (
        SELECT "lojaId", COUNT(*) AS qtd FROM "certificados"
        WHERE "createdAt" >= ${inicioMes} GROUP BY 1
      ) vm ON vm."lojaId" = l."id"
      LEFT JOIN (
        SELECT ct."lojaId", SUM(p."valor") AS premio
        FROM "pagamentos" p JOIN "contratos" ct ON ct."id" = p."contratoId"
        WHERE p."status" = 'CONFIRMADO' AND p."pagoEm" >= ${inicio12m} GROUP BY 1
      ) pm ON pm."lojaId" = l."id"
      LEFT JOIN (
        SELECT "lojaId", SUM("valorIndenizacao") AS indenizado, COUNT(*) AS qtd
        FROM "sinistros"
        WHERE "status" = 'APROVADO' AND "decididoEm" >= ${inicio12m} GROUP BY 1
      ) sn ON sn."lojaId" = l."id"
      LEFT JOIN (
        SELECT ct."lojaId", COUNT(*) AS qtd
        FROM "pagamentos" p JOIN "contratos" ct ON ct."id" = p."contratoId"
        WHERE p."status" = 'VENCIDO' GROUP BY 1
      ) pv ON pv."lojaId" = l."id"
      ORDER BY COALESCE(pm.premio, 0) DESC, l."nome" ASC
      LIMIT ${limite}
    `;

    return rows.map((r) => {
      const pct = sinistralidadePct(Number(r.premio12m), Number(r.indenizado12m));
      return {
        ...r,
        premio12m: arredondar2(Number(r.premio12m)),
        indenizado12m: arredondar2(Number(r.indenizado12m)),
        sinistralidadePct: pct,
        faixa: faixaSinistralidade(pct),
      };
    });
  }
}
