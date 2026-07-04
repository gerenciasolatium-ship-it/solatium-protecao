import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Paginacao } from '@solatium/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PaginacaoQueryDto } from '../common/dto/paginacao.dto';
import { CreatePlanoDto } from './dto/create-plano.dto';
import { UpdatePlanoDto } from './dto/update-plano.dto';

@Injectable()
export class PlanosService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreatePlanoDto) {
    return this.prisma.plano.create({ data: dto });
  }

  async findAll(query: PaginacaoQueryDto): Promise<Paginacao<unknown>> {
    const { pagina, porPagina, busca } = query;
    const where: Prisma.PlanoWhereInput = busca
      ? { nome: { contains: busca, mode: 'insensitive' } }
      : {};

    const [itens, total] = await this.prisma.$transaction([
      this.prisma.plano.findMany({
        where,
        skip: (pagina - 1) * porPagina,
        take: porPagina,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.plano.count({ where }),
    ]);
    return { itens, total, pagina, porPagina };
  }

  async findOne(id: string) {
    const plano = await this.prisma.plano.findUnique({ where: { id } });
    if (!plano) throw new NotFoundException('Plano não encontrado.');
    return plano;
  }

  async update(id: string, dto: UpdatePlanoDto) {
    await this.findOne(id);
    return this.prisma.plano.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    // Soft-delete: desativa para não quebrar certificados históricos.
    return this.prisma.plano.update({ where: { id }, data: { ativo: false } });
  }
}
