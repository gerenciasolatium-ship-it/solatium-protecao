import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Paginacao } from '@solatium/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PaginacaoQueryDto } from '../common/dto/paginacao.dto';
import { normalizarImei } from '../common/validators/imei.util';
import { CreateAparelhoDto } from './dto/create-aparelho.dto';
import { UpdateAparelhoDto } from './dto/update-aparelho.dto';

/** Status de certificado que representam proteção vigente (bloqueia novo cadastro do IMEI). */
const STATUS_PROTECAO_ATIVA: Prisma.CertificadoWhereInput['status'] = {
  in: ['ATIVO', 'SUSPENSO'],
};

@Injectable()
export class AparelhosService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateAparelhoDto) {
    const imei = normalizarImei(dto.imei);

    const cliente = await this.prisma.cliente.findUnique({ where: { id: dto.clienteId } });
    if (!cliente) throw new NotFoundException('Cliente não encontrado.');

    // Regra crítica (CLAUDE.md M2/5): IMEI não pode ter proteção ativa duplicada.
    const existente = await this.prisma.aparelho.findUnique({
      where: { imei },
      include: { certificados: { where: { status: STATUS_PROTECAO_ATIVA }, take: 1 } },
    });
    if (existente) {
      if (existente.certificados.length > 0) {
        throw new ConflictException('Este IMEI já possui uma proteção ativa no sistema.');
      }
      throw new ConflictException('Este IMEI já está cadastrado.');
    }

    return this.prisma.aparelho.create({
      data: {
        marca: dto.marca,
        modelo: dto.modelo,
        armazenamentoGb: dto.armazenamentoGb,
        cor: dto.cor,
        imei,
        valorMercado: dto.valorMercado,
        notaFiscalUrl: dto.notaFiscalUrl,
        clienteId: dto.clienteId,
      },
    });
  }

  /**
   * TAC (8 primeiros dígitos do IMEI) identifica o modelo do aparelho.
   * v1 usa a base própria (cresce a cada venda); um provedor GSMA externo
   * pode ser plugado aqui depois sem mudar o contrato da rota.
   */
  async identificarPorTac(tac: string) {
    const digitos = normalizarImei(tac).slice(0, 8);
    if (digitos.length !== 8) {
      throw new BadRequestException('TAC deve ter 8 dígitos (início do IMEI).');
    }
    const grupos = await this.prisma.aparelho.groupBy({
      by: ['marca', 'modelo', 'armazenamentoGb'],
      where: { imei: { startsWith: digitos } },
      _count: { marca: true },
      orderBy: { _count: { marca: 'desc' } },
      take: 1,
    });
    if (grupos.length === 0) return { encontrado: false };
    const g = grupos[0];
    return {
      encontrado: true,
      marca: g.marca,
      modelo: g.modelo,
      armazenamentoGb: g.armazenamentoGb,
      ocorrencias: g._count.marca,
    };
  }

  async findAll(query: PaginacaoQueryDto): Promise<Paginacao<unknown>> {
    const { pagina, porPagina, busca } = query;
    const where: Prisma.AparelhoWhereInput = busca
      ? {
          OR: [
            { imei: { contains: normalizarImei(busca) } },
            { marca: { contains: busca, mode: 'insensitive' } },
            { modelo: { contains: busca, mode: 'insensitive' } },
          ],
        }
      : {};

    const [itens, total] = await this.prisma.$transaction([
      this.prisma.aparelho.findMany({
        where,
        skip: (pagina - 1) * porPagina,
        take: porPagina,
        orderBy: { createdAt: 'desc' },
        include: { cliente: { select: { id: true, nome: true, cpf: true } } },
      }),
      this.prisma.aparelho.count({ where }),
    ]);
    return { itens, total, pagina, porPagina };
  }

  async findOne(id: string) {
    const aparelho = await this.prisma.aparelho.findUnique({
      where: { id },
      include: { cliente: true, certificados: true },
    });
    if (!aparelho) throw new NotFoundException('Aparelho não encontrado.');
    return aparelho;
  }

  async update(id: string, dto: UpdateAparelhoDto) {
    await this.garantirExiste(id);
    return this.prisma.aparelho.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.garantirExiste(id);
    return this.prisma.aparelho.delete({ where: { id } });
  }

  /** Usado na emissão do certificado (S3) para bloquear IMEI já protegido. */
  async imeiTemProtecaoAtiva(imei: string): Promise<boolean> {
    const aparelho = await this.prisma.aparelho.findUnique({
      where: { imei: normalizarImei(imei) },
      include: { certificados: { where: { status: STATUS_PROTECAO_ATIVA }, take: 1 } },
    });
    return !!aparelho && aparelho.certificados.length > 0;
  }

  private async garantirExiste(id: string) {
    const aparelho = await this.prisma.aparelho.findUnique({ where: { id } });
    if (!aparelho) throw new NotFoundException('Aparelho não encontrado.');
    return aparelho;
  }
}
