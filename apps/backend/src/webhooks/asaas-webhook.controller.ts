import { InjectQueue } from '@nestjs/bullmq';
import { Body, Controller, Headers, Logger, Post, UnauthorizedException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { FILA_EMISSAO, EmitirCertificadoJob } from '../certificados/emissao.processor';

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
    paymentDate?: string;
    clientPaymentDate?: string;
  };
}

/** Eventos que confirmam dinheiro em conta / cartão aprovado. */
const EVENTOS_CONFIRMACAO = new Set(['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED']);

/**
 * Webhook Asaas (M4): valida token, atualiza o pagamento e — na 1ª cobrança
 * confirmada do contrato — enfileira o job emitir-certificado (M3).
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
  ) {}

  @Public()
  @Post()
  @ApiOperation({ summary: 'Webhook Asaas (validado por asaas-access-token).' })
  async receber(
    @Body() payload: AsaasWebhookPayload,
    @Headers('asaas-access-token') token?: string,
  ) {
    const esperado = this.config.get<string>('ASAAS_WEBHOOK_TOKEN');
    if (!esperado || token !== esperado) {
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
          await this.prisma.pagamento.update({
            where: { id: pagamento.id },
            data: { status: 'CONFIRMADO', pagoEm },
          });
        }
        if (pagamento.contratoId) await this.enfileirarEmissao(pagamento.contratoId);
        return { recebido: true };
      }

      // Cobrança que não nasceu aqui (ex.: parcela 2+ da assinatura): registra
      // pelo externalReference = contratoId, sem disparar nova emissão além da 1ª.
      const contratoId = pagamentoAsaas.externalReference;
      const contrato = contratoId
        ? await this.prisma.contrato.findUnique({ where: { id: contratoId } })
        : null;
      if (contrato) {
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
            status: 'CONFIRMADO',
            valor: pagamentoAsaas.value ?? 0,
            pagoEm,
          },
        });
        await this.enfileirarEmissao(contrato.id);
        return { recebido: true };
      }

      this.logger.warn(`Webhook ${evento} para cobrança desconhecida ${pagamentoAsaas.id}`);
      return { recebido: true, ignorado: 'cobrança desconhecida' };
    }

    if (evento === 'PAYMENT_OVERDUE' && pagamento) {
      await this.prisma.pagamento.update({
        where: { id: pagamento.id },
        data: { status: 'VENCIDO' },
      });
    } else if (evento === 'PAYMENT_REFUNDED' && pagamento) {
      await this.prisma.pagamento.update({
        where: { id: pagamento.id },
        data: { status: 'ESTORNADO' },
      });
    }
    return { recebido: true };
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
