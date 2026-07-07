import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Paginacao } from '@solatium/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PaginacaoQueryDto } from '../common/dto/paginacao.dto';
import { CreateModeloAparelhoDto } from './dto/create-modelo-aparelho.dto';
import { UpdateModeloAparelhoDto } from './dto/update-modelo-aparelho.dto';

@Injectable()
export class ModelosAparelhoService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateModeloAparelhoDto) {
    return this.prisma.modeloAparelho.create({ data: dto });
  }

  async findAll(query: PaginacaoQueryDto): Promise<Paginacao<unknown>> {
    const { pagina, porPagina, busca } = query;
    const where: Prisma.ModeloAparelhoWhereInput = busca
      ? {
          OR: [
            { modelo: { contains: busca, mode: 'insensitive' } },
            { marca: { contains: busca, mode: 'insensitive' } },
          ],
        }
      : {};

    const [itens, total] = await this.prisma.$transaction([
      this.prisma.modeloAparelho.findMany({
        where,
        skip: (pagina - 1) * porPagina,
        take: porPagina,
        // Catálogo em ordem estável de consulta, não de cadastro.
        orderBy: [{ marca: 'asc' }, { valorReferencia: 'asc' }, { armazenamentoGb: 'asc' }],
      }),
      this.prisma.modeloAparelho.count({ where }),
    ]);
    return { itens, total, pagina, porPagina };
  }

  async findOne(id: string) {
    const modelo = await this.prisma.modeloAparelho.findUnique({ where: { id } });
    if (!modelo) throw new NotFoundException('Modelo de aparelho não encontrado.');
    return modelo;
  }

  async update(id: string, dto: UpdateModeloAparelhoDto) {
    await this.findOne(id);
    return this.prisma.modeloAparelho.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    // Soft-delete: desativa para preservar o histórico de precificação.
    return this.prisma.modeloAparelho.update({ where: { id }, data: { ativo: false } });
  }
}
