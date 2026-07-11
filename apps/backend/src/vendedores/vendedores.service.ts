import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { Role, type Paginacao } from '@solatium/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PaginacaoQueryDto } from '../common/dto/paginacao.dto';
import { isCpfValido, normalizarCpf } from '../common/validators/cpf.util';
import { parseCsv, somenteDigitos } from '../common/utils/csv.util';
import { IMPORTACAO_MAX_LINHAS, type ResultadoImportacao } from '../lojas/lojas.service';
import { CreateVendedorDto } from './dto/create-vendedor.dto';
import { UpdateVendedorDto } from './dto/update-vendedor.dto';

@Injectable()
export class VendedoresService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateVendedorDto) {
    const cpf = normalizarCpf(dto.cpf);
    const loja = await this.prisma.loja.findUnique({ where: { id: dto.lojaId } });
    if (!loja) throw new NotFoundException('Loja informada não encontrada.');

    const cpfExiste = await this.prisma.vendedor.findUnique({ where: { cpf } });
    if (cpfExiste) throw new ConflictException('Já existe um vendedor com este CPF.');

    const loginEmail = (dto.email ?? `${cpf}@vendedor.solatium.local`).toLowerCase();
    const emailExiste = await this.prisma.usuario.findUnique({ where: { email: loginEmail } });
    if (emailExiste) throw new ConflictException('Já existe um usuário com este e-mail.');

    const senhaHash = await argon2.hash(dto.senha);

    // Cria o login (Usuario LOJA_VENDEDOR) e o vendedor atomicamente.
    return this.prisma.$transaction(async (tx) => {
      const usuario = await tx.usuario.create({
        data: {
          nome: dto.nome,
          email: loginEmail,
          senhaHash,
          role: Role.LOJA_VENDEDOR,
          lojaId: dto.lojaId,
        },
      });
      return tx.vendedor.create({
        data: {
          nome: dto.nome,
          cpf,
          telefone: dto.telefone,
          email: dto.email,
          lojaId: dto.lojaId,
          usuarioId: usuario.id,
        },
        include: { loja: { select: { id: true, nome: true } } },
      });
    });
  }

  async findAll(query: PaginacaoQueryDto): Promise<Paginacao<unknown>> {
    const { pagina, porPagina, busca } = query;
    const where: Prisma.VendedorWhereInput = busca
      ? {
          OR: [
            { nome: { contains: busca, mode: 'insensitive' } },
            { cpf: { contains: normalizarCpf(busca) } },
          ],
        }
      : {};

    const [itens, total] = await this.prisma.$transaction([
      this.prisma.vendedor.findMany({
        where,
        skip: (pagina - 1) * porPagina,
        take: porPagina,
        orderBy: { createdAt: 'desc' },
        include: { loja: { select: { id: true, nome: true } } },
      }),
      this.prisma.vendedor.count({ where }),
    ]);
    return { itens, total, pagina, porPagina };
  }

  async findOne(id: string) {
    const vendedor = await this.prisma.vendedor.findUnique({
      where: { id },
      include: { loja: { select: { id: true, nome: true } } },
    });
    if (!vendedor) throw new NotFoundException('Vendedor não encontrado.');
    return vendedor;
  }

  async update(id: string, dto: UpdateVendedorDto) {
    const vendedor = await this.findOne(id);
    return this.prisma.$transaction(async (tx) => {
      const atualizado = await tx.vendedor.update({
        where: { id },
        data: {
          nome: dto.nome,
          telefone: dto.telefone,
          email: dto.email,
          ativo: dto.ativo,
        },
        include: { loja: { select: { id: true, nome: true } } },
      });
      // Sincroniza o status do login com o do vendedor.
      if (dto.ativo !== undefined && vendedor.usuarioId) {
        await tx.usuario.update({
          where: { id: vendedor.usuarioId },
          data: { ativo: dto.ativo, refreshTokenHash: dto.ativo ? undefined : null },
        });
      }
      return atualizado;
    });
  }

  async remove(id: string) {
    const vendedor = await this.findOne(id);
    return this.prisma.$transaction(async (tx) => {
      if (vendedor.usuarioId) {
        await tx.usuario.update({
          where: { id: vendedor.usuarioId },
          data: { ativo: false, refreshTokenHash: null },
        });
      }
      return tx.vendedor.update({ where: { id }, data: { ativo: false } });
    });
  }

  /**
   * Importação em massa via CSV. Colunas: nome*, cpf*, loja_cnpj* (ou loja_id),
   * telefone, email, senha (opcional se `senhaPadrao` vier no request).
   * Reusa o create() (login + vendedor atômicos); linha com erro não derruba o lote.
   */
  async importar(csv: string, senhaPadrao?: string): Promise<ResultadoImportacao> {
    const { linhas } = parseCsv(csv);
    if (!linhas.length) throw new BadRequestException('CSV vazio ou sem linhas de dados.');
    if (linhas.length > IMPORTACAO_MAX_LINHAS) {
      throw new BadRequestException(
        `Máximo de ${IMPORTACAO_MAX_LINHAS} linhas por importação (recebi ${linhas.length}). Divida o arquivo.`,
      );
    }

    // Resolve os CNPJs de loja uma única vez (não uma query por linha).
    const cnpjs = [
      ...new Set(
        linhas.map((l) => somenteDigitos(l.loja_cnpj ?? l.cnpj_loja ?? '')).filter(Boolean),
      ),
    ];
    const lojas = await this.prisma.loja.findMany({
      where: { cnpj: { in: cnpjs } },
      select: { id: true, cnpj: true },
    });
    const lojaPorCnpj = new Map(lojas.map((l) => [l.cnpj, l.id]));

    const resultado: ResultadoImportacao = { criadas: 0, ignoradas: 0, erros: [] };
    for (let i = 0; i < linhas.length; i++) {
      const linha = linhas[i];
      const numeroLinha = i + 2;
      try {
        const nome = linha.nome?.trim();
        const cpf = somenteDigitos(linha.cpf ?? '');
        if (!nome || nome.length < 2) throw new Error('nome obrigatório (mínimo 2 caracteres)');
        if (!isCpfValido(cpf)) throw new Error('cpf inválido');

        const lojaCnpj = somenteDigitos(linha.loja_cnpj ?? linha.cnpj_loja ?? '');
        const lojaId = linha.loja_id?.trim() || (lojaCnpj ? lojaPorCnpj.get(lojaCnpj) : undefined);
        if (!lojaId)
          throw new Error('loja não encontrada (informe loja_cnpj cadastrado ou loja_id)');

        const senha = linha.senha?.trim() || senhaPadrao;
        if (!senha || senha.length < 6) {
          throw new Error('senha ausente (informe na linha ou senhaPadrao no envio, mínimo 6)');
        }

        const jaExiste = await this.prisma.vendedor.findUnique({ where: { cpf } });
        if (jaExiste) {
          resultado.ignoradas += 1;
          continue;
        }

        await this.create({
          nome,
          cpf,
          lojaId,
          telefone: linha.telefone?.trim() || undefined,
          email: linha.email?.trim().toLowerCase() || undefined,
          senha,
        });
        resultado.criadas += 1;
      } catch (erro) {
        resultado.erros.push({
          linha: numeroLinha,
          erro: erro instanceof Error ? erro.message : String(erro),
          dados: { nome: linha.nome ?? '', cpf: linha.cpf ?? '' },
        });
      }
    }
    return resultado;
  }
}
