import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceiroService } from '../financeiro/financeiro.service';
import {
  MESSAGING_PROVIDER,
  MessagingProvider,
  PAYMENT_PROVIDER,
  PaymentProvider,
} from '../integrations/interfaces';

/** Régua de inadimplência (M5): D+15 suspende, D+30 cancela (CLAUDE.md regra 3). */
export const SUSPENDER_APOS_DIAS = 15;
export const CANCELAR_APOS_DIAS = 30;
/** Reativação pós-pagamento ganha nova carência de 72h (regra 2). */
export const CARENCIA_REATIVACAO_HORAS = 72;

/**
 * Inadimplência (M5-lite): job diário que suspende/cancela certificados com
 * parcela vencida, aplica clawback proporcional no cancelamento e reativa
 * (com nova carência) quando o pagamento entra. Cada passo é idempotente —
 * o job pode rodar quantas vezes for preciso.
 */
@Injectable()
export class InadimplenciaService {
  private readonly logger = new Logger(InadimplenciaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly financeiro: FinanceiroService,
    @Inject(PAYMENT_PROVIDER) private readonly pagamento: PaymentProvider,
    @Inject(MESSAGING_PROVIDER) private readonly whatsapp: MessagingProvider,
  ) {}

  /** Varredura diária: suspensões D+15 e cancelamentos D+30. */
  async executar(): Promise<{ suspensos: number; cancelados: number }> {
    const agora = Date.now();
    const limiteSuspensao = new Date(agora - SUSPENDER_APOS_DIAS * 86_400_000);
    const limiteCancelamento = new Date(agora - CANCELAR_APOS_DIAS * 86_400_000);

    const cancelados = await this.processarFaixa(limiteCancelamento, 'CANCELAR');
    const suspensos = await this.processarFaixa(limiteSuspensao, 'SUSPENDER');
    this.logger.log(
      `Inadimplência: ${suspensos} certificado(s) suspenso(s), ${cancelados} cancelado(s).`,
    );
    return { suspensos, cancelados };
  }

  /** Pagamento confirmado com certificado SUSPENSO → reativa com nova carência. */
  async reativarSeSuspenso(contratoId: string): Promise<boolean> {
    const certificado = await this.prisma.certificado.findUnique({
      where: { contratoId },
      include: { cliente: true },
    });
    if (!certificado || certificado.status !== 'SUSPENSO') return false;

    await this.prisma.certificado.update({
      where: { id: certificado.id },
      data: {
        status: 'ATIVO',
        carenciaAte: new Date(Date.now() + CARENCIA_REATIVACAO_HORAS * 3_600_000),
      },
    });
    await this.audit('UPDATE', certificado.id, { status: 'ATIVO', motivo: 'reativacao_pagamento' });
    await this.notificar(
      certificado.cliente.telefoneWhatsapp,
      `✅ Pagamento confirmado! Sua proteção ${certificado.numero} foi REATIVADA. ` +
        `Atenção: nova carência de ${CARENCIA_REATIVACAO_HORAS}h para roubo/furto a partir de agora.`,
      'cobertura_reativada',
      certificado.id,
    );
    this.logger.log(`Certificado ${certificado.numero} reativado após pagamento.`);
    return true;
  }

  /**
   * Estorno da 1ª cobrança (PAYMENT_REFUNDED) com certificado já emitido →
   * cancela a cobertura e lança o clawback integral da comissão.
   */
  async processarEstorno(contratoId: string): Promise<void> {
    const certificado = await this.prisma.certificado.findUnique({
      where: { contratoId },
      include: { cliente: true, contrato: true },
    });
    if (!certificado || certificado.status === 'CANCELADO') return;
    await this.cancelarCertificado(certificado.id, 'estorno_pagamento');
  }

  // ---------------------------------------------------------------------------
  // Internos
  // ---------------------------------------------------------------------------

  /** Certificados ATIVO/SUSPENSO com parcela VENCIDO há mais tempo que `limite`. */
  private async processarFaixa(limite: Date, acao: 'SUSPENDER' | 'CANCELAR'): Promise<number> {
    const statusAlvo: Prisma.CertificadoWhereInput['status'] =
      acao === 'CANCELAR' ? { in: ['ATIVO', 'SUSPENSO'] } : 'ATIVO';

    const certificados = await this.prisma.certificado.findMany({
      where: {
        status: statusAlvo,
        contrato: {
          pagamentos: { some: { status: 'VENCIDO', vencimento: { lte: limite } } },
        },
      },
      include: { cliente: true, contrato: true },
      take: 500, // lote diário; o job amanhã pega o resto (proteção de memória)
    });

    let afetados = 0;
    for (const certificado of certificados) {
      try {
        if (acao === 'CANCELAR') {
          await this.cancelarCertificado(certificado.id, 'inadimplencia_d30');
        } else {
          await this.suspenderCertificado(certificado);
        }
        afetados += 1;
      } catch (erro) {
        // Um certificado com problema não pode travar a régua dos demais.
        this.logger.error(`Falha ao ${acao} certificado ${certificado.id}: ${erro}`);
      }
    }
    return afetados;
  }

  private async suspenderCertificado(
    certificado: Prisma.CertificadoGetPayload<{ include: { cliente: true; contrato: true } }>,
  ) {
    await this.prisma.certificado.update({
      where: { id: certificado.id },
      data: { status: 'SUSPENSO' },
    });
    await this.audit('UPDATE', certificado.id, {
      status: 'SUSPENSO',
      motivo: `inadimplencia_d${SUSPENDER_APOS_DIAS}`,
    });
    await this.notificar(
      certificado.cliente.telefoneWhatsapp,
      `⚠️ Sua proteção ${certificado.numero} foi SUSPENSA por parcela em atraso — ` +
        `sem cobertura até a regularização. Pague a parcela pendente para reativar na hora.`,
      'cobertura_suspensa',
      certificado.id,
    );
    this.logger.warn(`Certificado ${certificado.numero} SUSPENSO por inadimplência.`);
  }

  /** Cancela a cobertura + assinatura no provedor + clawback proporcional (M12). */
  private async cancelarCertificado(certificadoId: string, motivo: string) {
    const certificado = await this.prisma.certificado.findUniqueOrThrow({
      where: { id: certificadoId },
      include: { cliente: true, contrato: true },
    });
    if (certificado.status === 'CANCELADO') return;

    await this.prisma.$transaction([
      this.prisma.certificado.update({
        where: { id: certificado.id },
        data: { status: 'CANCELADO' },
      }),
      ...(certificado.contrato
        ? [
            this.prisma.contrato.update({
              where: { id: certificado.contrato.id },
              data: { status: 'CANCELADO' },
            }),
          ]
        : []),
    ]);
    await this.audit('UPDATE', certificado.id, { status: 'CANCELADO', motivo });

    // Assinatura recorrente não pode continuar cobrando um contrato cancelado.
    const checkout = (certificado.contrato?.checkout ?? {}) as { assinaturaId?: string };
    if (checkout.assinaturaId) {
      await this.pagamento.cancelarAssinatura(checkout.assinaturaId);
    }

    // Clawback proporcional às parcelas NÃO pagas (regra central do M12).
    const comissao = await this.prisma.comissao.findFirst({
      where: { certificadoId: certificado.id },
    });
    if (comissao && comissao.status !== 'ESTORNADA') {
      const parcelasPagas = certificado.contrato
        ? await this.prisma.pagamento.count({
            where: { contratoId: certificado.contrato.id, status: 'CONFIRMADO' },
          })
        : 0;
      await this.financeiro.registrarClawbackCancelamento({
        comissaoId: comissao.id,
        parcelasPagas: Math.min(parcelasPagas, comissao.parcelasTotais),
        motivo,
      });
    }

    await this.notificar(
      certificado.cliente.telefoneWhatsapp,
      `❌ Sua proteção ${certificado.numero} foi CANCELADA (${motivo === 'estorno_pagamento' ? 'pagamento estornado' : 'parcela em atraso há mais de 30 dias'}). ` +
        `Para proteger o aparelho novamente, procure a loja parceira.`,
      'cobertura_cancelada',
      certificado.id,
    );
    this.logger.warn(`Certificado ${certificado.numero} CANCELADO (${motivo}).`);
  }

  /** Envio best-effort com log em notificacoes_log (auditoria M5). */
  private async notificar(
    telefone: string,
    texto: string,
    template: string,
    certificadoId: string,
  ) {
    let enviado = false;
    try {
      enviado = (await this.whatsapp.enviarWhatsapp({ telefone, texto })).enviado;
    } catch (erro) {
      this.logger.warn(`Falha ao notificar ${template}: ${erro}`);
    }
    await this.prisma.notificacaoLog
      .create({
        data: {
          canal: 'WHATSAPP',
          template,
          status: enviado ? 'ENVIADO' : 'FALHA',
          payload: { certificadoId, telefone },
        },
      })
      .catch(() => undefined);
  }

  private async audit(acao: string, certificadoId: string, depois: Record<string, unknown>) {
    await this.prisma.auditLog
      .create({
        data: {
          acao,
          entidade: 'certificados',
          entidadeId: certificadoId,
          depois: depois as Prisma.InputJsonValue,
        },
      })
      .catch((erro) => this.logger.error(`Falha ao auditar inadimplência: ${erro}`));
  }
}
