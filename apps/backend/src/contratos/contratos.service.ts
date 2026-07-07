import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { FormaPagamento, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsuarioAutenticado } from '../common/decorators/current-user.decorator';
import {
  CobrancaResult,
  PAYMENT_PROVIDER,
  PaymentProvider,
  SplitInput,
} from '../integrations/interfaces';
import { CreateContratoDto, NovaCobrancaDto } from './dto/create-contrato.dto';

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
    @Inject(PAYMENT_PROVIDER) private readonly pagamento: PaymentProvider,
  ) {}

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
    if (vistoria.contrato) {
      throw new ConflictException('Esta vistoria já tem um contrato. Consulte-o em vez de criar outro.');
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

    const { valorCobranca, premioTotal, parcelas } = this.precificar(plano, dto.formaPagamento, dto.parcelas);

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

    await this.gerarCobranca(contrato.id, dto.formaPagamento, parcelas, valorCobranca);
    return this.findOne(contrato.id, usuario);
  }

  /** Regra "não perder venda": gera nova cobrança (ex.: cartão recusado → Pix). */
  async novaCobranca(id: string, dto: NovaCobrancaDto, usuario: UsuarioAutenticado) {
    const contrato = await this.prisma.contrato.findUnique({
      where: { id },
      include: { plano: true, certificado: true },
    });
    if (!contrato) throw new NotFoundException('Contrato não encontrado.');
    this.autorizarLoja(contrato.lojaId, usuario);
    if (contrato.certificado) throw new ConflictException('Contrato já pago e emitido.');

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
        aparelho: { select: { marca: true, modelo: true, armazenamentoGb: true, imei: true, valorMercado: true } },
        plano: { select: { id: true, nome: true, premioMensal: true, premioAnual: true, franquiaPercentual: true } },
        certificado: { select: { id: true, numero: true, status: true, pdfUrl: true, vigenciaFim: true } },
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
      if (!plano.premioMensal) throw new BadRequestException('Plano não tem prêmio mensal definido.');
      const mensal = Number(plano.premioMensal);
      return { valorCobranca: mensal, premioTotal: Math.round(mensal * 12 * 100) / 100, parcelas: 12 };
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
          { walletId: contrato.loja.asaasWalletId, percentual: Math.round(Number(contrato.loja.comissaoPct) * 10000) / 100 },
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
        vencimento: new Date(),
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
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return cobranca;
  }

  private autorizarLoja(lojaId: string, usuario: UsuarioAutenticado) {
    if (usuario.lojaId && usuario.lojaId !== lojaId) {
      throw new ForbiddenException('Contrato pertence a outra loja.');
    }
  }
}
