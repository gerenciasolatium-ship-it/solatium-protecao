import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Paginacao } from '@solatium/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PaginacaoQueryDto } from '../common/dto/paginacao.dto';
import { normalizarCpf } from '../common/validators/cpf.util';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';

@Injectable()
export class ClientesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateClienteDto) {
    const cpf = normalizarCpf(dto.cpf);
    const existente = await this.prisma.cliente.findUnique({ where: { cpf } });
    if (existente) throw new ConflictException('Já existe um cliente com este CPF.');

    return this.prisma.cliente.create({
      data: {
        ...dto,
        cpf,
        nascimento: dto.nascimento ? new Date(dto.nascimento) : null,
      },
    });
  }

  async findAll(query: PaginacaoQueryDto): Promise<Paginacao<unknown>> {
    const { pagina, porPagina, busca } = query;
    const where: Prisma.ClienteWhereInput = busca
      ? {
          OR: [
            { nome: { contains: busca, mode: 'insensitive' } },
            { cpf: { contains: normalizarCpf(busca) } },
            { telefoneWhatsapp: { contains: busca } },
          ],
        }
      : {};

    const [itens, total] = await this.prisma.$transaction([
      this.prisma.cliente.findMany({
        where,
        skip: (pagina - 1) * porPagina,
        take: porPagina,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.cliente.count({ where }),
    ]);
    return { itens, total, pagina, porPagina };
  }

  async findOne(id: string) {
    const cliente = await this.prisma.cliente.findUnique({
      where: { id },
      include: { aparelhos: true, certificados: true },
    });
    if (!cliente) throw new NotFoundException('Cliente não encontrado.');
    return cliente;
  }

  async update(id: string, dto: UpdateClienteDto) {
    await this.garantirExiste(id);
    return this.prisma.cliente.update({
      where: { id },
      data: {
        ...dto,
        nascimento: dto.nascimento ? new Date(dto.nascimento) : undefined,
      },
    });
  }

  async remove(id: string) {
    await this.garantirExiste(id);
    const aparelhos = await this.prisma.aparelho.count({ where: { clienteId: id } });
    if (aparelhos > 0) {
      throw new ConflictException(
        'Não é possível excluir: o cliente possui aparelhos/proteções vinculados.',
      );
    }
    return this.prisma.cliente.delete({ where: { id } });
  }

  private async garantirExiste(id: string) {
    const cliente = await this.prisma.cliente.findUnique({ where: { id } });
    if (!cliente) throw new NotFoundException('Cliente não encontrado.');
    return cliente;
  }
}
