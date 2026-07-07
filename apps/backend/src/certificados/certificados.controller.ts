import { Controller, ForbiddenException, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Prisma } from '@prisma/client';
import { Role, type Paginacao } from '@solatium/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, UsuarioAutenticado } from '../common/decorators/current-user.decorator';
import { PaginacaoQueryDto } from '../common/dto/paginacao.dto';
import { PrismaService } from '../prisma/prisma.service';
import { EmissaoService } from './emissao.service';

@ApiTags('certificados')
@ApiBearerAuth()
@Controller('certificados')
export class CertificadosController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emissao: EmissaoService,
  ) {}

  @Get()
  @Roles(Role.ADMIN, Role.OPERADOR, Role.LOJA_ADMIN, Role.LOJA_VENDEDOR)
  async findAll(
    @Query() query: PaginacaoQueryDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ): Promise<Paginacao<unknown>> {
    const { pagina, porPagina, busca } = query;
    const where: Prisma.CertificadoWhereInput = {
      ...(usuario.lojaId ? { lojaId: usuario.lojaId } : {}),
      ...(busca
        ? {
            OR: [
              { numero: { contains: busca, mode: 'insensitive' } },
              { cliente: { nome: { contains: busca, mode: 'insensitive' } } },
              { aparelho: { imei: { contains: busca.replace(/\D/g, '') || busca } } },
            ],
          }
        : {}),
    };
    const [itens, total] = await this.prisma.$transaction([
      this.prisma.certificado.findMany({
        where,
        skip: (pagina - 1) * porPagina,
        take: porPagina,
        orderBy: { createdAt: 'desc' },
        include: {
          cliente: { select: { id: true, nome: true, cpf: true } },
          aparelho: { select: { marca: true, modelo: true, armazenamentoGb: true, imei: true } },
          loja: { select: { id: true, nome: true } },
        },
      }),
      this.prisma.certificado.count({ where }),
    ]);
    return { itens, total, pagina, porPagina };
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.OPERADOR, Role.LOJA_ADMIN, Role.LOJA_VENDEDOR)
  async findOne(@Param('id') id: string, @CurrentUser() usuario: UsuarioAutenticado) {
    const certificado = await this.prisma.certificado.findUnique({
      where: { id },
      include: { cliente: true, aparelho: true, plano: true, loja: true, contrato: true },
    });
    if (!certificado) throw new NotFoundException('Certificado não encontrado.');
    if (usuario.lojaId && usuario.lojaId !== certificado.lojaId) {
      throw new ForbiddenException('Certificado pertence a outra loja.');
    }
    return certificado;
  }

  @Post(':id/reenviar')
  @Roles(Role.ADMIN, Role.OPERADOR)
  @ApiOperation({ summary: 'Reprocessa entrega (WhatsApp/email) do certificado já emitido.' })
  async reenviar(@Param('id') id: string) {
    const certificado = await this.prisma.certificado.findUnique({ where: { id } });
    if (!certificado?.contratoId) throw new NotFoundException('Certificado não encontrado ou sem contrato.');
    // Zera flags de envio e reexecuta o fluxo idempotente de entrega.
    await this.prisma.certificado.update({
      where: { id },
      data: { whatsappEnviadoEm: null, emailEnviadoEm: null },
    });
    return this.emissao.emitirParaContrato(certificado.contratoId);
  }
}
