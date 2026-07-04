import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Paginacao } from '@solatium/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PaginacaoQueryDto } from '../common/dto/paginacao.dto';
import { CreateLojaDto } from './dto/create-loja.dto';
import { UpdateLojaDto } from './dto/update-loja.dto';

@Injectable()
export class LojasService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateLojaDto) {
    const existente = await this.prisma.loja.findUnique({ where: { cnpj: dto.cnpj } });
    if (existente) throw new ConflictException('Já existe uma loja com este CNPJ.');
    return this.prisma.loja.create({ data: dto });
  }

  async findAll(query: PaginacaoQueryDto): Promise<Paginacao<unknown>> {
    const { pagina, porPagina, busca } = query;
    const where: Prisma.LojaWhereInput = busca
      ? {
          OR: [
            { nome: { contains: busca, mode: 'insensitive' } },
            { cnpj: { contains: busca } },
            { cidade: { contains: busca, mode: 'insensitive' } },
          ],
        }
      : {};

    const [itens, total] = await this.prisma.$transaction([
      this.prisma.loja.findMany({
        where,
        skip: (pagina - 1) * porPagina,
        take: porPagina,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.loja.count({ where }),
    ]);

    return { itens, total, pagina, porPagina };
  }

  async findOne(id: string) {
    const loja = await this.prisma.loja.findUnique({
      where: { id },
      include: { vendedores: true },
    });
    if (!loja) throw new NotFoundException('Loja não encontrada.');
    return loja;
  }

  async update(id: string, dto: UpdateLojaDto) {
    await this.garantirExiste(id);
    if (dto.cnpj) {
      const outra = await this.prisma.loja.findFirst({
        where: { cnpj: dto.cnpj, NOT: { id } },
      });
      if (outra) throw new ConflictException('Já existe outra loja com este CNPJ.');
    }
    return this.prisma.loja.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.garantirExiste(id);
    // Soft-delete: inativa em vez de apagar (preserva histórico e integridade).
    return this.prisma.loja.update({ where: { id }, data: { status: 'INATIVA' } });
  }

  private async garantirExiste(id: string) {
    const loja = await this.prisma.loja.findUnique({ where: { id } });
    if (!loja) throw new NotFoundException('Loja não encontrada.');
    return loja;
  }
}
