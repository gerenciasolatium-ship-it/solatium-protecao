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
import { parseCsv, somenteDigitos } from '../common/utils/csv.util';
import { CreateLojaDto } from './dto/create-loja.dto';
import { UpdateLojaDto } from './dto/update-loja.dto';

/** Limite por requisição de importação (lotes maiores: dividir o arquivo). */
export const IMPORTACAO_MAX_LINHAS = 1000;

export interface LinhaImportacaoErro {
  linha: number;
  erro: string;
  dados?: Record<string, string>;
}

export interface ResultadoImportacao {
  criadas: number;
  ignoradas: number;
  erros: LinhaImportacaoErro[];
}

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

  /**
   * Importação em massa via CSV (onboarding de milhares de lojas).
   * Colunas: nome*, cnpj*, email, telefone, responsavel, cep, cidade, uf,
   * comissao_pct (0–1 ou 0–100), modo_comissao (SPLIT_INSTANTANEO|REPASSE_PROGRAMADO).
   * CNPJ já cadastrado → linha ignorada (relatada); erro numa linha não derruba o lote.
   */
  async importar(csv: string): Promise<ResultadoImportacao> {
    const { linhas } = parseCsv(csv);
    if (!linhas.length) throw new BadRequestException('CSV vazio ou sem linhas de dados.');
    if (linhas.length > IMPORTACAO_MAX_LINHAS) {
      throw new BadRequestException(
        `Máximo de ${IMPORTACAO_MAX_LINHAS} linhas por importação (recebi ${linhas.length}). Divida o arquivo.`,
      );
    }

    const resultado: ResultadoImportacao = { criadas: 0, ignoradas: 0, erros: [] };
    for (let i = 0; i < linhas.length; i++) {
      const linha = linhas[i];
      const numeroLinha = i + 2; // 1-based + cabeçalho
      try {
        const nome = linha.nome?.trim();
        const cnpj = somenteDigitos(linha.cnpj ?? '');
        if (!nome || nome.length < 2) throw new Error('nome obrigatório (mínimo 2 caracteres)');
        if (cnpj.length !== 14) throw new Error('cnpj deve ter 14 dígitos');

        const existente = await this.prisma.loja.findUnique({ where: { cnpj } });
        if (existente) {
          resultado.ignoradas += 1;
          continue;
        }

        const comissaoPct = this.parseComissao(linha.comissao_pct ?? linha.comissao ?? '');
        const modo = (linha.modo_comissao ?? '').trim().toUpperCase();
        if (modo && modo !== 'SPLIT_INSTANTANEO' && modo !== 'REPASSE_PROGRAMADO') {
          throw new Error('modo_comissao deve ser SPLIT_INSTANTANEO ou REPASSE_PROGRAMADO');
        }

        await this.prisma.loja.create({
          data: {
            nome,
            cnpj,
            email: linha.email?.trim() || undefined,
            telefone: linha.telefone?.trim() || undefined,
            responsavelNome: (linha.responsavel ?? linha.responsavel_nome)?.trim() || undefined,
            cep: linha.cep ? somenteDigitos(linha.cep) : undefined,
            cidade: linha.cidade?.trim() || undefined,
            uf: linha.uf?.trim().toUpperCase() || undefined,
            ...(comissaoPct !== undefined ? { comissaoPct } : {}),
            ...(modo ? { modoPagamentoComissao: modo as 'SPLIT_INSTANTANEO' } : {}),
          },
        });
        resultado.criadas += 1;
      } catch (erro) {
        resultado.erros.push({
          linha: numeroLinha,
          erro: erro instanceof Error ? erro.message : String(erro),
          dados: { nome: linha.nome ?? '', cnpj: linha.cnpj ?? '' },
        });
      }
    }
    return resultado;
  }

  /** Aceita fração (0.3) ou percentual (30 / "30%") e devolve fração 0–1. */
  private parseComissao(bruto: string): number | undefined {
    const texto = bruto.replace('%', '').replace(',', '.').trim();
    if (!texto) return undefined;
    const valor = Number(texto);
    if (Number.isNaN(valor) || valor < 0 || valor > 100) {
      throw new Error('comissao_pct inválida (use 0.30 ou 30)');
    }
    return valor > 1 ? valor / 100 : valor;
  }

  private async garantirExiste(id: string) {
    const loja = await this.prisma.loja.findUnique({ where: { id } });
    if (!loja) throw new NotFoundException('Loja não encontrada.');
    return loja;
  }
}
