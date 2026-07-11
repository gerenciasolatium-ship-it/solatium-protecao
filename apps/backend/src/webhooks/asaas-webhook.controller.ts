import { InjectQueue } from '@nestjs/bullmq';
import { Body, Controller, Headers, Logger, Post, UnauthorizedException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { timingSafeEqual } from 'crypto';
import { Prisma } from '@prisma/client';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { FILA_EMISSAO, EmitirCertificadoJob } from '../certificados/emissao.processor';
import { InadimplenciaService } from '../cobranca/inadimplencia.service';

interface AsaasWebhookPayload {
  id?: string;
  event?: string;
  payment?: {
    id: string;
    status?: string;
    externalReference?: string;
    subscription?: string;
    value?: number;
    billingType?: string;
    dueDate?: string;
    paymentDate?: string;
    clientPaymentDate?: string;
  };
}

/** Eventos que confirmam dinheiro em conta / cartão aprovado. */
const EVENTOS_CONFIRMACAO = new Set(['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED']);

/**
 * Webhook Asaas (M4): valida token, atualiza o pagamento e — na 1ª cobrança
 * confirmada do contrato — enfileira o job emitir-certificado (M3).
 * Pagamento durante suspensão reativa a cobertura (M5); estorno da 1ª cobrança
 * cancela o certificado com clawback (M12).
 * Sempre responde 200 pra eventos processados/ignorados; token errado → 401.
 */
@ApiTags('webhooks')
@Controller('webhooks/asaas')
export class AsaasWebhookController {
  private readonly logger = new Logger(AsaasWebhookController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @InjectQueue(FILA_EMISSAO) private readonly filaEmissao: Queue<EmitirCertificadoJob>,
    private readonly inadimplencia: InadimplenciaService,
  ) {}

  @Public()
  @Post()
  @ApiOperation({ summary: 'Webhook Asaas (validado por asaas-access-token).' })
  async receber(
    @Body() payload: AsaasWebhookPayload,
    @Headers('asaas-access-token') token?: string,
  ) {
    const esperado = this.config.get<string>('ASAAS_WEBHOOK_TOKEN');
    if (!esperado || !token || !this.tokenValido(token, esperado)) {
      throw new UnauthorizedException('Token do webhook inválido.');
    }

    const evento = payload.event ?? '';
    const pagamentoAsaas = payload.payment;
    if (!pagamentoAsaas?.id) return { recebido: true, ignorado: 'sem payment.id' };

    const pagamento = await this.prisma.pagamento.findUnique({
      where: { asaasId: pagamentoAsaas.id },
    });

    if (EVENTOS_CONFIRMACAO.has(evento)) {
      const pagoEm = this.dataPagamento(pagamentoAsaas) ?? new Date();

      if (pagamento) {
        if (pagamento.status !== 'CONFIRMADO') {
          if (pagamento.status === 'CANCELADO') {
            // Cobrança substituída no balcão que confirmou mesmo assim (corrida
            // pagamento × cancelamento). Dinheiro entrou: registra e alerta.
            this.logger.warn(
              `Cobrança CANCELADA ${pagamentoAsaas.id} confirmou pagamento — possível cobrança dupla do contrato ${pagamento.contratoId}; verificar estorno.`,
            );
          }
          await this.prisma.pagamento.update({
            where: { id: pagamento.id },
            data: { status: 'CONFIRMADO', pagoEm },
          });
        }
        if (pagamento.contratoId) {
          await this.inadimplencia.reativarSeSuspenso(pagamento.contratoId);
          await this.enfileirarEmissao(pagamento.contratoId);
        }
        return { recebido: true };
      }

      // Cobrança que não nasceu aqui (ex.: parcela 2+ da assinatura): registra
      // pelo externalReference = contratoId, sem disparar nova emissão além da 1ª.
      const contrato = await this.contratoDaReferencia(pagamentoAsaas.externalReference);
      if (contrato) {
        await this.registrarPagamentoExterno(contrato, pagamentoAsaas, 'CONFIRMADO', pagoEm);
        await this.inadimplencia.reativarSeSuspenso(contrato.id);
        await this.enfileirarEmissao(contrato.id);
        return { recebido: true };
      }

      this.logger.warn(`Webhook ${evento} para cobrança desconhecida ${pagamentoAsaas.id}`);
      return { recebido: true, ignorado: 'cobrança desconhecida' };
    }

    if (evento === 'PAYMENT_OVERDUE') {
      if (pagamento) {
        await this.prisma.pagamento.update({
          where: { id: pagamento.id },
          data: { status: 'VENCIDO' },
        });
      } else {
        // Parcela 2+ da assinatura que venceu sem nunca ter confirmado: registra
        // como VENCIDO para a régua de inadimplência (M5) enxergar a dívida.
        const contrato = await this.contratoDaReferencia(pagamentoAsaas.externalReference);
        if (contrato) {
          await this.registrarPagamentoExterno(contrato, pagamentoAsaas, 'VENCIDO', null);
        }
      }
    } else if (evento === 'PAYMENT_REFUNDED' && pagamento) {
      await this.prisma.pagamento.update({
        where: { id: pagamento.id },
        data: { status: 'ESTORNADO' },
      });
      // Estorno da cobrança que emitiu o certificado → cancela cobertura + clawback.
      if (pagamento.primeiraCobranca && pagamento.contratoId) {
        await this.inadimplencia.processarEstorno(pagamento.contratoId);
      }
    }
    return { recebido: true };
  }

  /** Comparação em tempo constante (evita timing attack no token do webhook). */
  private tokenValido(token: string, esperado: string): boolean {
    const a = Buffer.from(token);
    const b = Buffer.from(esperado);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  private async contratoDaReferencia(externalReference?: string) {
    if (!externalReference) return null;
    return this.prisma.contrato.findUnique({ where: { id: externalReference } });
  }

  /** Cria o registro de uma cobrança nascida no provedor (parcelas 2+ da assinatura). */
  private async registrarPagamentoExterno(
    contrato: { id: string; clienteId: string },
    pagamentoAsaas: NonNullable<AsaasWebhookPayload['payment']>,
    status: 'CONFIRMADO' | 'VENCIDO',
    pagoEm: Date | null,
  ) {
    try {
      await this.prisma.pagamento.create({
        data: {
          clienteId: contrato.clienteId,
          contratoId: contrato.id,
          asaasId: pagamentoAsaas.id,
          tipo:
            pagamentoAsaas.billingType === 'PIX'
              ? 'PIX'
              : pagamentoAsaas.billingType === 'BOLETO'
                ? 'BOLETO'
                : 'CARTAO',
          status,
          valor: pagamentoAsaas.value ?? 0,
          vencimento: pagamentoAsaas.dueDate
            ? new Date(`${pagamentoAsaas.dueDate}T12:00:00-03:00`)
            : null,
          pagoEm,
        },
      });
    } catch (erro) {
      // Corrida entre entregas duplicadas do mesmo webhook: unique(asaasId)
      // garante 1 registro; a segunda entrega é apenas ignorada.
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
        this.logger.log(`Pagamento ${pagamentoAsaas.id} já registrado (webhook duplicado).`);
        return;
      }
      throw erro;
    }
  }

  /** Idempotência camada 1: jobId = contratoId (BullMQ ignora job duplicado). */
  private async enfileirarEmissao(contratoId: string) {
    const jaEmitido = await this.prisma.certificado.findUnique({ where: { contratoId } });
    if (jaEmitido) return;
    await this.filaEmissao.add(
      'emitir-certificado',
      { contratoId },
      { jobId: `emitir-${contratoId}` },
    );
    this.logger.log(`Job emitir-certificado enfileirado para contrato ${contratoId}`);
  }

  private dataPagamento(payment: NonNullable<AsaasWebhookPayload['payment']>): Date | null {
    const bruto = payment.clientPaymentDate ?? payment.paymentDate;
    if (!bruto) return null;
    const data = new Date(`${bruto}T12:00:00-03:00`);
    return Number.isNaN(data.getTime()) ? null : data;
  }
}
