import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Paginacao } from '@solatium/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PaginacaoQueryDto } from '../common/dto/paginacao.dto';
import { UsuarioAutenticado } from '../common/decorators/current-user.decorator';
import {
  AtualizarDocumentacaoDto,
  CreateSinistroDto,
  MudarStatusSinistroDto,
} from './dto/create-sinistro.dto';
import {
  VOUCHER_VALIDADE_DIAS,
  avaliarAlertasFraude,
  calcularVoucher,
  gerarCodigoVoucher,
  transicaoValida,
} from './sinistro.util';

const INCLUDE_PADRAO = {
  cliente: { select: { id: true, nome: true, cpf: true, telefoneWhatsapp: true } },
  certificado: {
    select: {
      id: true,
      numero: true,
      status: true,
      vigenciaInicio: true,
      vigenciaFim: true,
      carenciaAte: true,
      aparelho: { select: { marca: true, modelo: true, imei: true, valorMercado: true } },
      plano: { select: { nome: true, franquiaPercentual: true } },
    },
  },
  loja: { select: { id: true, nome: true } },
  voucher: true,
} satisfies Prisma.SinistroInclude;

/**
 * Esteira de sinistros (M6): abertura com alertas antifraude automáticos,
 * transições controladas e voucher gerado na aprovação (franquia do PLANO).
 * Loja abre/anexa documentação; decisão (aprovar/negar) é do backoffice.
 */
@Injectable()
export class SinistrosService {
  private readonly logger = new Logger(SinistrosService.name);

  constructor(private readonly prisma: PrismaService) {}

  async abrir(dto: CreateSinistroDto, usuario: UsuarioAutenticado) {
    const certificado = await this.prisma.certificado.findUnique({
      where: { id: dto.certificadoId },
      include: { cliente: true, aparelho: true, plano: true },
    });
    if (!certificado) throw new NotFoundException('Certificado não encontrado.');
    this.autorizarLoja(certificado.lojaId, usuario);

    if (certificado.status === 'SUSPENSO') {
      throw new ConflictException(
        'Certificado SUSPENSO por inadimplência — sem cobertura no momento. Regularize o pagamento para reativar.',
      );
    }
    if (certificado.status !== 'ATIVO') {
      throw new ConflictException(`Certificado ${certificado.status} não tem cobertura.`);
    }
    const agora = new Date();
    if (certificado.vigenciaFim < agora) {
      throw new ConflictException('Certificado fora da vigência.');
    }

    const emAberto = await this.prisma.sinistro.findFirst({
      where: {
        certificadoId: certificado.id,
        status: { in: ['ABERTO', 'DOCUMENTACAO_PENDENTE', 'EM_ANALISE'] },
      },
    });
    if (emAberto) {
      throw new ConflictException(
        `Já existe um sinistro em andamento (${emAberto.status}) para este certificado.`,
      );
    }

    const [anteriores, sinistralidadeLojaPct] = await Promise.all([
      this.prisma.sinistro.count({ where: { clienteId: certificado.clienteId } }),
      this.sinistralidadeLojaPct(certificado.lojaId),
    ]);

    const alertas = avaliarAlertasFraude({
      aberturaEm: agora,
      vigenciaInicio: certificado.vigenciaInicio,
      carenciaAte: certificado.carenciaAte,
      boData: dto.boData,
      sinistrosAnterioresDoCpf: anteriores,
      sinistralidadeLojaPct,
    });

    const sinistro = await this.prisma.sinistro.create({
      data: {
        certificadoId: certificado.id,
        clienteId: certificado.clienteId,
        lojaId: certificado.lojaId,
        relato: dto.relato,
        boUrl: dto.boUrl,
        boData: dto.boData,
        status: dto.boUrl ? 'EM_ANALISE' : 'DOCUMENTACAO_PENDENTE',
        alertasFraude: alertas.length ? (alertas as unknown as Prisma.InputJsonValue) : undefined,
      },
      include: INCLUDE_PADRAO,
    });
    this.logger.log(
      `Sinistro ${sinistro.id} aberto (certificado ${certificado.numero}, ${alertas.length} alerta(s) de fraude).`,
    );
    return sinistro;
  }

  /** Loja/admin anexa B.O. e complementa o relato enquanto o caso está aberto. */
  async atualizarDocumentacao(
    id: string,
    dto: AtualizarDocumentacaoDto,
    usuario: UsuarioAutenticado,
  ) {
    const sinistro = await this.garantirExiste(id);
    this.autorizarLoja(sinistro.lojaId, usuario);
    if (sinistro.status === 'APROVADO' || sinistro.status === 'NEGADO') {
      throw new ConflictException('Sinistro já decidido — documentação não pode ser alterada.');
    }

    // BO chegou com data anterior à vigência? Reavalia os alertas.
    let alertasFraude = sinistro.alertasFraude as Prisma.InputJsonValue | undefined;
    const boData = dto.boData ?? sinistro.boData;
    if (dto.boData) {
      const certificado = await this.prisma.certificado.findUniqueOrThrow({
        where: { id: sinistro.certificadoId },
      });
      const anteriores = await this.prisma.sinistro.count({
        where: { clienteId: sinistro.clienteId, NOT: { id: sinistro.id } },
      });
      const alertas = avaliarAlertasFraude({
        aberturaEm: sinistro.createdAt,
        vigenciaInicio: certificado.vigenciaInicio,
        carenciaAte: certificado.carenciaAte,
        boData,
        sinistrosAnterioresDoCpf: anteriores,
        sinistralidadeLojaPct: await this.sinistralidadeLojaPct(sinistro.lojaId),
      });
      alertasFraude = alertas.length ? (alertas as unknown as Prisma.InputJsonValue) : undefined;
    }

    const boUrl = dto.boUrl ?? sinistro.boUrl;
    return this.prisma.sinistro.update({
      where: { id },
      data: {
        boUrl: dto.boUrl,
        boData: dto.boData,
        relato: dto.relato,
        alertasFraude,
        // Documentação completa → avança automaticamente para análise.
        status: sinistro.status === 'DOCUMENTACAO_PENDENTE' && boUrl ? 'EM_ANALISE' : undefined,
      },
      include: INCLUDE_PADRAO,
    });
  }

  /** Decisão do backoffice (ADMIN/OPERADOR): transições controladas da esteira. */
  async mudarStatus(id: string, dto: MudarStatusSinistroDto) {
    const sinistro = await this.prisma.sinistro.findUnique({
      where: { id },
      include: {
        certificado: { include: { aparelho: true, plano: true } },
        voucher: true,
      },
    });
    if (!sinistro) throw new NotFoundException('Sinistro não encontrado.');

    if (!transicaoValida(sinistro.status, dto.status)) {
      throw new ConflictException(
        `Transição ${sinistro.status} → ${dto.status} não é permitida na esteira.`,
      );
    }
    if (dto.status === 'NEGADO' && !dto.motivo) {
      throw new BadRequestException('Informe o motivo da negativa.');
    }
    if (dto.status === 'APROVADO') {
      if (!sinistro.boUrl) {
        throw new BadRequestException('B.O. digital é obrigatório para aprovar o sinistro.');
      }
      return this.aprovar(sinistro);
    }

    return this.prisma.sinistro.update({
      where: { id },
      data: {
        status: dto.status,
        motivoNegativa: dto.status === 'NEGADO' ? dto.motivo : undefined,
        decididoEm: dto.status === 'NEGADO' ? new Date() : undefined,
      },
      include: INCLUDE_PADRAO,
    });
  }

  /**
   * APROVADO → gera voucher: capital segurado × (1 − franquia%/100), lendo a
   * franquia do PLANO (regra 13). Validade de 90 dias, resgate na loja de origem.
   * Atômico: decisão + voucher na mesma transação (unique(sinistroId) garante 1).
   */
  private async aprovar(
    sinistro: Prisma.SinistroGetPayload<{
      include: { certificado: { include: { aparelho: true; plano: true } }; voucher: true };
    }>,
  ) {
    if (sinistro.voucher) return this.findOneInterno(sinistro.id);

    const capital = Number(sinistro.certificado.aparelho.valorMercado);
    const franquiaPct = Number(sinistro.certificado.plano.franquiaPercentual);
    const { voucher: valorVoucher } = calcularVoucher(capital, franquiaPct);
    const validade = new Date(Date.now() + VOUCHER_VALIDADE_DIAS * 86_400_000);

    await this.prisma.$transaction(async (tx) => {
      await tx.sinistro.update({
        where: { id: sinistro.id },
        data: { status: 'APROVADO', decididoEm: new Date(), valorIndenizacao: valorVoucher },
      });
      await tx.voucher.create({
        data: {
          codigo: gerarCodigoVoucher(),
          sinistroId: sinistro.id,
          valor: valorVoucher,
          validade,
        },
      });
    });
    this.logger.log(
      `Sinistro ${sinistro.id} APROVADO — voucher de R$ ${valorVoucher.toFixed(2)} emitido (franquia ${franquiaPct}%).`,
    );
    return this.findOneInterno(sinistro.id);
  }

  async findAll(
    query: PaginacaoQueryDto & { status?: string },
    usuario: UsuarioAutenticado,
  ): Promise<Paginacao<unknown>> {
    const { pagina, porPagina, busca } = query;
    const where: Prisma.SinistroWhereInput = {
      ...(usuario.lojaId ? { lojaId: usuario.lojaId } : {}),
      ...(query.status ? { status: query.status as Prisma.SinistroWhereInput['status'] } : {}),
      ...(busca
        ? {
            OR: [
              { cliente: { nome: { contains: busca, mode: 'insensitive' } } },
              { certificado: { numero: { contains: busca, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [itens, total] = await this.prisma.$transaction([
      this.prisma.sinistro.findMany({
        where,
        skip: (pagina - 1) * porPagina,
        take: porPagina,
        orderBy: { createdAt: 'desc' },
        include: INCLUDE_PADRAO,
      }),
      this.prisma.sinistro.count({ where }),
    ]);
    return { itens, total, pagina, porPagina };
  }

  async findOne(id: string, usuario: UsuarioAutenticado) {
    const sinistro = await this.findOneInterno(id);
    this.autorizarLoja(sinistro.lojaId, usuario);
    return sinistro;
  }

  // ---------------------------------------------------------------------------
  // Vouchers (resgate na loja)
  // ---------------------------------------------------------------------------

  async consultarVoucher(codigo: string, usuario: UsuarioAutenticado) {
    const voucher = await this.buscarVoucher(codigo);
    const lojaOrigemId = voucher.sinistro.lojaId;
    this.autorizarLoja(lojaOrigemId, usuario);
    return {
      ...voucher,
      resgatavel: this.motivoNaoResgatavel(voucher) === null,
      motivoNaoResgatavel: this.motivoNaoResgatavel(voucher),
    };
  }

  /** Resgate do voucher na loja de origem (M6): baixa definitiva + rastreio. */
  async resgatarVoucher(codigo: string, usuario: UsuarioAutenticado) {
    const voucher = await this.buscarVoucher(codigo);
    const lojaOrigemId = voucher.sinistro.lojaId;
    this.autorizarLoja(lojaOrigemId, usuario);

    const motivo = this.motivoNaoResgatavel(voucher);
    if (motivo) {
      if (motivo === 'Voucher vencido.') {
        await this.prisma.voucher.update({
          where: { id: voucher.id },
          data: { status: 'EXPIRADO' },
        });
      }
      throw new ConflictException(motivo);
    }

    // updateMany condicionado ao status evita resgate duplo em corrida.
    const { count } = await this.prisma.voucher.updateMany({
      where: { id: voucher.id, status: 'EMITIDO' },
      data: { status: 'RESGATADO', lojaResgateId: lojaOrigemId, resgatadoEm: new Date() },
    });
    if (count === 0) throw new ConflictException('Voucher já foi resgatado.');
    this.logger.log(`Voucher ${codigo} resgatado na loja ${lojaOrigemId}.`);
    return this.buscarVoucher(codigo);
  }

  // ---------------------------------------------------------------------------
  // Internos
  // ---------------------------------------------------------------------------

  private motivoNaoResgatavel(voucher: { status: string; validade: Date }): string | null {
    if (voucher.status === 'RESGATADO') return 'Voucher já resgatado.';
    if (voucher.status === 'EXPIRADO') return 'Voucher expirado.';
    if (voucher.validade < new Date()) return 'Voucher vencido.';
    return null;
  }

  private async buscarVoucher(codigo: string) {
    const voucher = await this.prisma.voucher.findUnique({
      where: { codigo },
      include: {
        sinistro: {
          select: {
            id: true,
            lojaId: true,
            cliente: { select: { nome: true, cpf: true } },
            certificado: {
              select: {
                numero: true,
                aparelho: { select: { marca: true, modelo: true } },
              },
            },
          },
        },
        lojaResgate: { select: { id: true, nome: true } },
      },
    });
    if (!voucher) throw new NotFoundException('Voucher não encontrado.');
    return voucher;
  }

  private async findOneInterno(id: string) {
    const sinistro = await this.prisma.sinistro.findUnique({
      where: { id },
      include: INCLUDE_PADRAO,
    });
    if (!sinistro) throw new NotFoundException('Sinistro não encontrado.');
    return sinistro;
  }

  private async garantirExiste(id: string) {
    const sinistro = await this.prisma.sinistro.findUnique({ where: { id } });
    if (!sinistro) throw new NotFoundException('Sinistro não encontrado.');
    return sinistro;
  }

  /** Sinistralidade da loja em % (indenizações aprovadas / prêmio confirmado). */
  private async sinistralidadeLojaPct(lojaId: string): Promise<number | null> {
    const [premio, indenizado] = await Promise.all([
      this.prisma.pagamento.aggregate({
        _sum: { valor: true },
        where: { status: 'CONFIRMADO', contrato: { lojaId } },
      }),
      this.prisma.sinistro.aggregate({
        _sum: { valorIndenizacao: true },
        where: { lojaId, status: 'APROVADO' },
      }),
    ]);
    const premioTotal = Number(premio._sum.valor ?? 0);
    if (premioTotal <= 0) return null;
    return (Number(indenizado._sum.valorIndenizacao ?? 0) / premioTotal) * 100;
  }

  private autorizarLoja(lojaId: string, usuario: UsuarioAutenticado) {
    if (usuario.lojaId && usuario.lojaId !== lojaId) {
      throw new ForbiddenException('Registro pertence a outra loja.');
    }
  }
}
