import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomInt } from 'crypto';
import type { Prisma } from '@prisma/client';
import type { Paginacao } from '@solatium/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PaginacaoQueryDto } from '../common/dto/paginacao.dto';
import { UsuarioAutenticado } from '../common/decorators/current-user.decorator';
import { AparelhosService } from '../aparelhos/aparelhos.service';
import { CreateVistoriaDto } from './dto/create-vistoria.dto';

const CODIGO_VALIDADE_MINUTOS = 10;

/**
 * Vistoria mínima (gate obrigatório da emissão — CLAUDE.md regra 1).
 * O M2 completo (fotos, OCR do IMEI, geolocalização, aprovação automática)
 * tem sprint própria; aqui existe o essencial: código dinâmico, trava de IMEI
 * protegido e transição de status auditada.
 */
@Injectable()
export class VistoriasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aparelhos: AparelhosService,
  ) {}

  async create(dto: CreateVistoriaDto, usuario: UsuarioAutenticado) {
    const aparelho = await this.prisma.aparelho.findUnique({
      where: { id: dto.aparelhoId },
      include: { cliente: true },
    });
    if (!aparelho) throw new NotFoundException('Aparelho não encontrado.');

    if (await this.aparelhos.imeiTemProtecaoAtiva(aparelho.imei)) {
      throw new ConflictException('Este IMEI já possui uma proteção ativa no sistema.');
    }

    const vendedor = await this.resolverVendedor(usuario);

    return this.prisma.vistoria.create({
      data: {
        aparelhoId: aparelho.id,
        clienteId: aparelho.clienteId,
        vendedorId: vendedor.id,
        lojaId: vendedor.lojaId,
        codigoDinamico: String(randomInt(0, 1_000_000)).padStart(6, '0'),
        codigoExpiraEm: new Date(Date.now() + CODIGO_VALIDADE_MINUTOS * 60_000),
      },
      include: { aparelho: true, cliente: true },
    });
  }

  async aprovar(id: string, usuario: UsuarioAutenticado) {
    const vistoria = await this.garantirExiste(id);
    this.autorizarLoja(vistoria.lojaId, usuario);
    if (vistoria.status === 'APROVADA') return vistoria;
    if (vistoria.status === 'REPROVADA') {
      throw new ConflictException('Vistoria reprovada não pode ser aprovada; inicie uma nova.');
    }
    return this.prisma.vistoria.update({
      where: { id },
      data: { status: 'APROVADA' },
      include: { aparelho: true, cliente: true },
    });
  }

  async reprovar(id: string, motivo: string, usuario: UsuarioAutenticado) {
    const vistoria = await this.garantirExiste(id);
    this.autorizarLoja(vistoria.lojaId, usuario);
    return this.prisma.vistoria.update({
      where: { id },
      data: { status: 'REPROVADA', motivoReprova: motivo },
    });
  }

  async findAll(query: PaginacaoQueryDto, usuario: UsuarioAutenticado): Promise<Paginacao<unknown>> {
    const { pagina, porPagina, busca } = query;
    const where: Prisma.VistoriaWhereInput = {
      ...(usuario.lojaId ? { lojaId: usuario.lojaId } : {}),
      ...(busca
        ? {
            OR: [
              { cliente: { nome: { contains: busca, mode: 'insensitive' } } },
              { aparelho: { imei: { contains: busca } } },
            ],
          }
        : {}),
    };

    const [itens, total] = await this.prisma.$transaction([
      this.prisma.vistoria.findMany({
        where,
        skip: (pagina - 1) * porPagina,
        take: porPagina,
        orderBy: { createdAt: 'desc' },
        include: {
          aparelho: true,
          cliente: { select: { id: true, nome: true, cpf: true } },
          contrato: { select: { id: true, status: true } },
        },
      }),
      this.prisma.vistoria.count({ where }),
    ]);
    return { itens, total, pagina, porPagina };
  }

  async findOne(id: string, usuario: UsuarioAutenticado) {
    const vistoria = await this.prisma.vistoria.findUnique({
      where: { id },
      include: { aparelho: true, cliente: true, contrato: true },
    });
    if (!vistoria) throw new NotFoundException('Vistoria não encontrada.');
    this.autorizarLoja(vistoria.lojaId, usuario);
    return vistoria;
  }

  private async resolverVendedor(usuario: UsuarioAutenticado) {
    const vendedor = await this.prisma.vendedor.findFirst({ where: { usuarioId: usuario.id } });
    if (vendedor) return vendedor;
    // LOJA_ADMIN sem cadastro de vendedor: usa o primeiro vendedor ativo da loja.
    if (usuario.lojaId) {
      const daLoja = await this.prisma.vendedor.findFirst({
        where: { lojaId: usuario.lojaId, ativo: true },
      });
      if (daLoja) return daLoja;
    }
    throw new BadRequestException(
      'Usuário não está vinculado a um vendedor; cadastre um vendedor para a loja antes da vistoria.',
    );
  }

  private autorizarLoja(lojaId: string, usuario: UsuarioAutenticado) {
    if (usuario.lojaId && usuario.lojaId !== lojaId) {
      throw new ForbiddenException('Vistoria pertence a outra loja.');
    }
  }

  private async garantirExiste(id: string) {
    const vistoria = await this.prisma.vistoria.findUnique({ where: { id } });
    if (!vistoria) throw new NotFoundException('Vistoria não encontrada.');
    return vistoria;
  }
}
