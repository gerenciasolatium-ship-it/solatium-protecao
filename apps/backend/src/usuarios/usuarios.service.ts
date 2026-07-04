import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, Usuario } from '@prisma/client';
import * as argon2 from 'argon2';
import { ROLES_LOJA, type Paginacao, type Role, type UsuarioPublico } from '@solatium/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PaginacaoQueryDto } from '../common/dto/paginacao.dto';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';

@Injectable()
export class UsuariosService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUsuarioDto): Promise<UsuarioPublico> {
    this.validarLoja(dto.role, dto.lojaId);
    const email = dto.email.toLowerCase().trim();
    const existente = await this.prisma.usuario.findUnique({ where: { email } });
    if (existente) throw new ConflictException('Já existe um usuário com este e-mail.');

    if (dto.lojaId) {
      const loja = await this.prisma.loja.findUnique({ where: { id: dto.lojaId } });
      if (!loja) throw new NotFoundException('Loja informada não encontrada.');
    }

    const senhaHash = await argon2.hash(dto.senha);
    const usuario = await this.prisma.usuario.create({
      data: {
        nome: dto.nome,
        email,
        senhaHash,
        role: dto.role,
        lojaId: dto.lojaId ?? null,
      },
    });
    return this.toPublico(usuario);
  }

  async findAll(query: PaginacaoQueryDto): Promise<Paginacao<UsuarioPublico>> {
    const { pagina, porPagina, busca } = query;
    const where: Prisma.UsuarioWhereInput = busca
      ? {
          OR: [
            { nome: { contains: busca, mode: 'insensitive' } },
            { email: { contains: busca, mode: 'insensitive' } },
          ],
        }
      : {};

    const [itens, total] = await this.prisma.$transaction([
      this.prisma.usuario.findMany({
        where,
        skip: (pagina - 1) * porPagina,
        take: porPagina,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.usuario.count({ where }),
    ]);
    return { itens: itens.map((u) => this.toPublico(u)), total, pagina, porPagina };
  }

  async findOne(id: string): Promise<UsuarioPublico> {
    const usuario = await this.prisma.usuario.findUnique({ where: { id } });
    if (!usuario) throw new NotFoundException('Usuário não encontrado.');
    return this.toPublico(usuario);
  }

  async update(id: string, dto: UpdateUsuarioDto): Promise<UsuarioPublico> {
    const atual = await this.prisma.usuario.findUnique({ where: { id } });
    if (!atual) throw new NotFoundException('Usuário não encontrado.');
    const role = dto.role ?? (atual.role as Role);
    const lojaId = dto.lojaId ?? atual.lojaId ?? undefined;
    if (dto.role || dto.lojaId) this.validarLoja(role, lojaId);

    const usuario = await this.prisma.usuario.update({
      where: { id },
      data: { nome: dto.nome, role: dto.role, lojaId: dto.lojaId, ativo: dto.ativo },
    });
    return this.toPublico(usuario);
  }

  async remove(id: string): Promise<UsuarioPublico> {
    const atual = await this.prisma.usuario.findUnique({ where: { id } });
    if (!atual) throw new NotFoundException('Usuário não encontrado.');
    const usuario = await this.prisma.usuario.update({
      where: { id },
      data: { ativo: false, refreshTokenHash: null },
    });
    return this.toPublico(usuario);
  }

  private validarLoja(role: Role, lojaId?: string | null): void {
    const ehLoja = ROLES_LOJA.includes(role);
    if (ehLoja && !lojaId) {
      throw new BadRequestException('Papéis de loja exigem um lojaId.');
    }
    if (!ehLoja && lojaId) {
      throw new BadRequestException('Papéis de backoffice não devem ter lojaId.');
    }
  }

  private toPublico(u: Usuario): UsuarioPublico {
    return {
      id: u.id,
      nome: u.nome,
      email: u.email,
      role: u.role as Role,
      lojaId: u.lojaId,
    };
  }
}
