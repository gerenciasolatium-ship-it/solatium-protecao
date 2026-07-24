import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { FormaPagamento, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AparelhosService } from '../aparelhos/aparelhos.service';
import { UsuarioAutenticado } from '../common/decorators/current-user.decorator';
import { FILA_COBRANCA, JOB_PIX_FALLBACK, PixFallbackJob } from '../cobranca/cobranca.const';
import {
  CobrancaResult,
  MESSAGING_PROVIDER,
  MessagingProvider,
  PAYMENT_PROVIDER,
  PaymentProvider,
  SplitInput,
} from '../integrations/interfaces';
import { CreateContratoDto, NovaCobrancaDto } from './dto/create-contrato.dto';
import {
  BOLETO_FALLBACK_VENCIMENTO_DIAS,
  PIX_FALLBACK_PADRAO_MINUTOS,
  podeAplicarFallbackPix,
} from './pix-fallback.util';

const TIPO_PAGAMENTO: Record<FormaPagamento, 'PIX' | 'CARTAO' | 'BOLETO'> = {
  PIX: 'PIX',
  CARTAO_RECORRENTE: 'CARTAO',
  CARTAO_ANUAL: 'CARTAO',
  BOLETO: 'BOLETO',
};

/**
 * Checkout no balcão (M4): vistoria APROVADA → contrato → cobrança Asaas
 * com split da loja → QR Pix / link na tela. A emissão (M3) é disparada
 * pelo webhook quando a 1ª cobrança confirmar.
 */
@Injectable()
export class ContratosService {
  private readonly logger = new Logger(ContratosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aparelhos: AparelhosService,
    private readonly config: ConfigService,
    @Inject(PAYMENT_PROVIDER) private readonly pagamento: PaymentProvider,
    @Inject(MESSAGING_PROVIDER) private readonly whatsapp: MessagingProvider,
    @InjectQueue(FILA_COBRANCA) private readonly filaCobranca: Queue<PixFallbackJob>,
  ) {}

  /** Prazo do Pix do balcão antes do fallback pra boleto (0 = desligado). */
  private get pixFallbackMinutos(): number {
    const env = Number(this.config.get<string>('PIX_FALLBACK_BOLETO_MINUTOS'));
    return Number.isFinite(env) && env >= 0 ? Math.floor(env) : PIX_FALLBACK_PADRAO_MINUTOS;
  }

  async create(dto: CreateContratoDto, usuario: UsuarioAutenticado) {
    const vistoria = await this.prisma.vistoria.findUnique({
      where: { id: dto.vistoriaId },
      include: { cliente: true, aparelho: true, contrato: true, loja: true, vendedor: true },
    });
    if (!vistoria) throw new NotFoundException('Vistoria não encontrada.');
    this.autorizarLoja(vistoria.lojaId, usuario);
    if (vistoria.status !== 'APROVADA') {
      throw new ConflictException('Só é possível contratar com vistoria APROVADA.');
    }
    // Vistoria já tem contrato? Se ele ainda não pagou/emitiu, RETOMA a venda
    // (cancela a cobrança antiga e gera outra) em vez de travar o balcão —
    // ex.: Asaas falhou na primeira tentativa (sem chave Pix, instabilidade).
    if (vistoria.contrato) {
      return this.retomarContrato(vistoria.contrato.id, dto, usuario);
    }

    // Re-checa o IMEI aqui (a trava da vistoria roda só na criação dela): duas
    // vistorias aprovadas do mesmo aparelho não podem virar duas emissões —
    // o unique parcial de certificado ATIVO mataria o job de emissão pós-pagamento.
    if (await this.aparelhos.imeiTemProtecaoAtiva(vistoria.aparelho.imei)) {
      throw new ConflictException('Este IMEI já possui uma proteção ativa no sistema.');
    }

    const plano = await this.prisma.plano.findUnique({ where: { id: dto.planoId } });
    if (!plano?.ativo) throw new NotFoundException('Plano não encontrado ou inativo.');

    const valorAparelho = Number(vistoria.aparelho.valorMercado);
    if (
      (plano.valorAparelhoMin && valorAparelho < Number(plano.valorAparelhoMin)) ||
      (plano.valorAparelhoMax && valorAparelho > Number(plano.valorAparelhoMax))
    ) {
      throw new BadRequestException('O valor do aparelho está fora da faixa deste plano.');
    }

    const { valorCobranca, premioTotal, parcelas } = this.precificar(
      plano,
      dto.formaPagamento,
      dto.parcelas,
    );

    const contrato = await this.prisma.contrato.create({
      data: {
        vistoriaId: vistoria.id,
        clienteId: vistoria.clienteId,
        aparelhoId: vistoria.aparelhoId,
        planoId: plano.id,
        lojaId: vistoria.lojaId,
        vendedorId: vistoria.vendedorId,
        formaPagamento: dto.formaPagamento,
        parcelas,
        premioTotal,
      },
    });

    // M11: venda originada no CRM do parceiro → fecha o ciclo da proposta.
    if (dto.propostaExterna) {
      await this.prisma.propostaExterna.updateMany({
        where: {
          codigo: dto.propostaExterna,
          lojaId: vistoria.lojaId,
          status: { in: ['ABERTA', 'UTILIZADA'] },
        },
        data: { status: 'CONCLUIDA', contratoId: contrato.id },
      });
    }

    try {
      await this.gerarCobranca(contrato.id, dto.formaPagamento, parcelas, valorCobranca);
    } catch (erro) {
      // Cobrança falhou → desfaz o contrato pra vistoria não ficar travada
      // ("Esta vistoria já tem um contrato") e o vendedor poder tentar de novo.
      if (dto.propostaExterna) {
        await this.prisma.propostaExterna
          .updateMany({
            where: { codigo: dto.propostaExterna, contratoId: contrato.id },
            data: { status: 'UTILIZADA', contratoId: null },
          })
          .catch(() => undefined);
      }
      await this.prisma.contrato
        .delete({ where: { id: contrato.id } })
        .catch((e) => this.logger.error(`Falha ao desfazer contrato ${contrato.id}: ${e}`));
      throw erro;
    }
    return this.findOne(contrato.id, usuario);
  }

  /** Contrato pendente (sem pagamento confirmado/certificado) → nova tentativa. */
  private async retomarContrato(
    contratoId: string,
    dto: CreateContratoDto,
    usuario: UsuarioAutenticado,
  ) {
    const contrato = await this.prisma.contrato.findUniqueOrThrow({
      where: { id: contratoId },
      include: {
        certificado: true,
        pagamentos: { where: { status: 'CONFIRMADO' } },
      },
    });
    if (contrato.certificado) {
      throw new ConflictException('Esta vistoria já tem um contrato pago e emitido.');
    }
    if (contrato.pagamentos.length > 0) {
      throw new ConflictException(
        'Este contrato já tem pagamento confirmado — o certificado será emitido em instantes.',
      );
    }

    const plano = await this.prisma.plano.findUnique({ where: { id: dto.planoId } });
    if (!plano?.ativo) throw new NotFoundException('Plano não encontrado ou inativo.');

    await this.cancelarCobrancaAnterior(contrato.id, contrato.checkout);

    const { valorCobranca, premioTotal, parcelas } = this.precificar(
      plano,
      dto.formaPagamento,
      dto.parcelas,
    );
    await this.prisma.contrato.update({
      where: { id: contrato.id },
      data: { planoId: plano.id, formaPagamento: dto.formaPagamento, parcelas, premioTotal },
    });
    await this.gerarCobranca(contrato.id, dto.formaPagamento, parcelas, valorCobranca);
    this.logger.log(`Contrato ${contrato.id} retomado (nova cobrança após falha anterior).`);
    return this.findOne(contrato.id, usuario);
  }

  /** Regra "não perder venda": gera nova cobrança (ex.: cartão recusado → Pix). */
  async novaCobranca(id: string, dto: NovaCobrancaDto, usuario: UsuarioAutenticado) {
    const contrato = await this.prisma.contrato.findUnique({
      where: { id },
      include: {
        plano: true,
        certificado: true,
        pagamentos: { where: { status: { in: ['PENDENTE', 'CONFIRMADO'] } } },
      },
    });
    if (!contrato) throw new NotFoundException('Contrato não encontrado.');
    this.autorizarLoja(contrato.lojaId, usuario);
    if (contrato.certificado) throw new ConflictException('Contrato já pago e emitido.');
    if (contrato.pagamentos.some((p) => p.status === 'CONFIRMADO')) {
      throw new ConflictException(
        'Este contrato já tem pagamento confirmado — o certificado será emitido em instantes.',
      );
    }

    // Cancela a cobrança/assinatura anterior no provedor ANTES de criar outra:
    // sem isso a assinatura antiga segue cobrando o cartão (órfã) e o cliente
    // pode pagar duas vezes ("cartão demorou → gerou Pix → ambos confirmam").
    await this.cancelarCobrancaAnterior(contrato.id, contrato.checkout);

    const { valorCobranca, premioTotal, parcelas } = this.precificar(
      contrato.plano,
      dto.formaPagamento,
      dto.parcelas,
    );
    await this.prisma.contrato.update({
      where: { id },
      data: { formaPagamento: dto.formaPagamento, parcelas, premioTotal },
    });
    await this.gerarCobranca(id, dto.formaPagamento, parcelas, valorCobranca);
    return this.findOne(id, usuario);
  }

  /** Polling do app-loja: status do contrato + certificado + últimas cobranças. */
  async findOne(id: string, usuario: UsuarioAutenticado) {
    const contrato = await this.prisma.contrato.findUnique({
      where: { id },
      include: {
        cliente: { select: { id: true, nome: true, cpf: true, telefoneWhatsapp: true } },
        aparelho: {
          select: {
            marca: true,
            modelo: true,
            armazenamentoGb: true,
            imei: true,
            valorMercado: true,
          },
        },
        plano: {
          select: {
            id: true,
            nome: true,
            premioMensal: true,
            premioAnual: true,
            franquiaPercentual: true,
          },
        },
        certificado: {
          select: { id: true, numero: true, status: true, pdfUrl: true, vigenciaFim: true },
        },
        pagamentos: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!contrato) throw new NotFoundException('Contrato não encontrado.');
    this.autorizarLoja(contrato.lojaId, usuario);
    return contrato;
  }

  private precificar(
    plano: { premioMensal: Prisma.Decimal | null; premioAnual: Prisma.Decimal | null },
    forma: FormaPagamento,
    parcelasDto?: number,
  ) {
    if (forma === 'CARTAO_RECORRENTE') {
      if (!plano.premioMensal)
        throw new BadRequestException('Plano não tem prêmio mensal definido.');
      const mensal = Number(plano.premioMensal);
      return {
        valorCobranca: mensal,
        premioTotal: Math.round(mensal * 12 * 100) / 100,
        parcelas: 12,
      };
    }
    if (!plano.premioAnual) throw new BadRequestException('Plano não tem prêmio anual definido.');
    const anual = Number(plano.premioAnual);
    const parcelas = forma === 'CARTAO_ANUAL' ? (parcelasDto ?? 1) : 1;
    return { valorCobranca: anual, premioTotal: anual, parcelas };
  }

  private async gerarCobranca(
    contratoId: string,
    forma: FormaPagamento,
    parcelas: number,
    valor: number,
    opts?: { vencimento?: string; fallbackDe?: 'PIX' },
  ): Promise<CobrancaResult> {
    const contrato = await this.prisma.contrato.findUniqueOrThrow({
      where: { id: contratoId },
      include: { cliente: true, loja: true, aparelho: true },
    });

    // Cliente Asaas (reusa asaasCustomerId entre contratos).
    let customerId = contrato.cliente.asaasCustomerId;
    if (!customerId) {
      const criado = await this.pagamento.criarCliente({
        nome: contrato.cliente.nome,
        cpf: contrato.cliente.cpf,
        email: contrato.cliente.email ?? undefined,
        telefone: contrato.cliente.telefoneWhatsapp,
        referenciaExterna: contrato.cliente.id,
      });
      customerId = criado.customerId;
      await this.prisma.cliente.update({
        where: { id: contrato.cliente.id },
        data: { asaasCustomerId: customerId },
      });
    }

    // Split de 30% (comissaoPct da loja) só no modo SPLIT_INSTANTANEO com wallet.
    let split: SplitInput[] | undefined;
    if (contrato.loja.modoPagamentoComissao === 'SPLIT_INSTANTANEO') {
      if (contrato.loja.asaasWalletId) {
        split = [
          {
            walletId: contrato.loja.asaasWalletId,
            percentual: Math.round(Number(contrato.loja.comissaoPct) * 10000) / 100,
          },
        ];
      } else {
        this.logger.warn(
          `Loja ${contrato.loja.id} em SPLIT_INSTANTANEO sem asaasWalletId — cobrança sem split (comissão fica pela conta-corrente M12).`,
        );
      }
    }

    const cobranca = await this.pagamento.criarCobranca({
      customerId,
      formaPagamento: forma,
      valor,
      parcelas,
      descricao: `Proteção Solatium — ${contrato.aparelho.marca} ${contrato.aparelho.modelo} (IMEI final ${contrato.aparelho.imei.slice(-4)})`,
      referenciaExterna: contrato.id,
      vencimento: opts?.vencimento,
      split,
    });

    await this.prisma.pagamento.create({
      data: {
        clienteId: contrato.clienteId,
        contratoId: contrato.id,
        asaasId: cobranca.provedorId,
        primeiraCobranca: true,
        tipo: TIPO_PAGAMENTO[forma],
        valor,
        split: split ? (split as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        vencimento: opts?.vencimento ? new Date(`${opts.vencimento}T12:00:00-03:00`) : new Date(),
      },
    });

    // Guarda o "como pagar" da cobrança corrente no contrato (tela do balcão).
    await this.prisma.contrato.update({
      where: { id: contrato.id },
      data: {
        checkout: {
          asaasId: cobranca.provedorId,
          assinaturaId: cobranca.assinaturaId,
          status: cobranca.status,
          linkPagamento: cobranca.linkPagamento,
          pixCopiaCola: cobranca.pixCopiaCola,
          pixQrCodeBase64: cobranca.pixQrCodeBase64,
          boletoUrl: cobranca.boletoUrl,
          fallbackDe: opts?.fallbackDe,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    // "Não perder venda": Pix ignorado no balcão → boleto automático no WhatsApp.
    if (forma === 'PIX' && this.pixFallbackMinutos > 0) {
      await this.filaCobranca
        .add(
          JOB_PIX_FALLBACK,
          { contratoId: contrato.id, asaasId: cobranca.provedorId },
          {
            delay: this.pixFallbackMinutos * 60_000,
            jobId: `pix-fallback-${cobranca.provedorId}`,
            removeOnComplete: true,
            removeOnFail: true,
          },
        )
        .catch((erro) => this.logger.warn(`Falha ao agendar fallback do Pix: ${erro}`));
    }

    return cobranca;
  }

  /**
   * Job atrasado do "não perder venda": o Pix do balcão não foi pago no prazo →
   * cancela a cobrança Pix, gera boleto (vence em 3 dias; a página do Asaas
   * também aceita Pix) e manda o link no WhatsApp do cliente. Não roda se a
   * cobrança do checkout mudou, se já confirmou pagamento ou se já emitiu.
   */
  async fallbackPixParaBoleto(job: PixFallbackJob) {
    const contrato = await this.prisma.contrato.findUnique({
      where: { id: job.contratoId },
      include: {
        cliente: true,
        aparelho: true,
        plano: true,
        certificado: true,
        pagamentos: { where: { status: 'CONFIRMADO' } },
      },
    });
    if (!contrato) return { aplicado: false, motivo: 'contrato não existe mais' };

    const checkout = (contrato.checkout ?? {}) as { asaasId?: string };
    const pagamentoPix = await this.prisma.pagamento.findUnique({
      where: { asaasId: job.asaasId },
    });
    const decisao = podeAplicarFallbackPix({
      jobAsaasId: job.asaasId,
      checkoutAsaasId: checkout.asaasId,
      temCertificado: Boolean(contrato.certificado),
      temPagamentoConfirmado: contrato.pagamentos.length > 0,
      statusPagamentoPix: pagamentoPix?.status ?? null,
    });
    if (!decisao.aplicar) {
      this.logger.log(`Fallback Pix→boleto pulado (${contrato.id}): ${decisao.motivo}`);
      return { aplicado: false, motivo: decisao.motivo };
    }

    await this.cancelarCobrancaAnterior(contrato.id, contrato.checkout);
    const { valorCobranca, premioTotal, parcelas } = this.precificar(contrato.plano, 'BOLETO');
    await this.prisma.contrato.update({
      where: { id: contrato.id },
      data: { formaPagamento: 'BOLETO', parcelas, premioTotal },
    });
    const vencimento = new Date(Date.now() + BOLETO_FALLBACK_VENCIMENTO_DIAS * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const cobranca = await this.gerarCobranca(contrato.id, 'BOLETO', parcelas, valorCobranca, {
      vencimento,
      fallbackDe: 'PIX',
    });

    const link = cobranca.boletoUrl ?? cobranca.linkPagamento;
    const primeiroNome = contrato.cliente.nome.trim().split(/\s+/)[0];
    const texto =
      `💳 ${primeiroNome}, ficou faltando só o pagamento para ativar a proteção do seu ` +
      `${contrato.aparelho.marca} ${contrato.aparelho.modelo}. Geramos um boleto que vence em ` +
      `${BOLETO_FALLBACK_VENCIMENTO_DIAS} dias — pela página você também pode pagar com Pix ou cartão:\n${link}`;
    let enviado = false;
    try {
      enviado = (
        await this.whatsapp.enviarWhatsapp({
          telefone: contrato.cliente.telefoneWhatsapp,
          texto,
        })
      ).enviado;
    } catch (erro) {
      this.logger.warn(`Falha no WhatsApp do fallback (${contrato.id}): ${erro}`);
    }
    await this.prisma.notificacaoLog
      .create({
        data: {
          canal: 'WHATSAPP',
          template: 'pix_fallback_boleto',
          status: enviado ? 'ENVIADO' : 'FALHA',
          payload: {
            contratoId: contrato.id,
            telefone: contrato.cliente.telefoneWhatsapp,
            boletoUrl: link ?? null,
          },
        },
      })
      .catch(() => undefined);
    this.logger.log(
      `Fallback Pix→boleto aplicado no contrato ${contrato.id} (WhatsApp ${enviado ? 'enviado' : 'falhou'}).`,
    );
    return { aplicado: true, enviado };
  }

  /**
   * Cancela no provedor a cobrança/assinatura corrente do contrato e marca os
   * pagamentos pendentes como CANCELADO. Best-effort: se a cobrança antiga já
   * tiver sido paga, o cancelamento falha silenciosamente e o webhook de
   * confirmação dela emite o certificado normalmente (idempotente).
   */
  private async cancelarCobrancaAnterior(contratoId: string, checkout: Prisma.JsonValue | null) {
    const dados = (checkout ?? {}) as { asaasId?: string; assinaturaId?: string };
    if (dados.assinaturaId) {
      await this.pagamento.cancelarAssinatura(dados.assinaturaId);
    } else if (dados.asaasId) {
      await this.pagamento.cancelarCobranca(dados.asaasId);
    }
    await this.prisma.pagamento.updateMany({
      where: { contratoId, status: 'PENDENTE' },
      data: { status: 'CANCELADO' },
    });
  }

  private autorizarLoja(lojaId: string, usuario: UsuarioAutenticado) {
    if (usuario.lojaId && usuario.lojaId !== lojaId) {
      throw new ForbiddenException('Contrato pertence a outra loja.');
    }
  }
}
