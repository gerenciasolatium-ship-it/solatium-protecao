import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { mascararImei, mascararNome } from './bilhete.util';

/**
 * Validação pública do certificado (QR do PDF). Sem login e fora do prefixo
 * /api (exclude no main.ts). Só dados mascarados — suficiente pra loja ou
 * autoridade validarem sem expor dados pessoais.
 */
@ApiTags('validar')
@Controller('validar')
export class ValidarController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get(':codigo')
  @ApiOperation({ summary: 'Valida certificado pelo código público (dados mascarados).' })
  async validar(@Param('codigo') codigo: string) {
    const certificado = await this.prisma.certificado.findUnique({
      where: { codigoValidacao: codigo },
      include: {
        cliente: { select: { nome: true } },
        aparelho: { select: { marca: true, modelo: true, armazenamentoGb: true, imei: true } },
        loja: { select: { nome: true } },
      },
    });
    if (!certificado) throw new NotFoundException('Certificado não encontrado.');

    const expirado = certificado.status === 'ATIVO' && certificado.vigenciaFim < new Date();
    return {
      numero: certificado.numero,
      status: expirado ? 'EXPIRADO' : certificado.status,
      vigenciaInicio: certificado.vigenciaInicio,
      vigenciaFim: certificado.vigenciaFim,
      titular: mascararNome(certificado.cliente.nome),
      aparelho: `${certificado.aparelho.marca} ${certificado.aparelho.modelo} ${certificado.aparelho.armazenamentoGb} GB`,
      imei: mascararImei(certificado.aparelho.imei),
      lojaParceira: certificado.loja.nome,
    };
  }
}
