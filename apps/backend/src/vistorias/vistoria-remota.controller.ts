import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { ConcluirVistoriaRemotaDto } from './dto/concluir-vistoria-remota.dto';
import { VistoriasService } from './vistorias.service';

/**
 * Rotas PÚBLICAS da vistoria remota (M2): o cliente acessa pelo link enviado
 * ao WhatsApp dele — sem login. Autenticação = token único de 48 hex com
 * expiração curta; a página nunca recebe o IMEI esperado (só compara no back).
 */
@ApiTags('vistoria-remota')
@Controller('vistoria-remota')
export class VistoriaRemotaController {
  constructor(private readonly vistorias: VistoriasService) {}

  @Public()
  @Get(':token')
  @ApiOperation({ summary: 'Dados mínimos da vistoria para a página pública do cliente.' })
  consultar(@Param('token') token: string) {
    return this.vistorias.consultarPorToken(token);
  }

  @Public()
  @Post(':token/novo-link')
  @ApiOperation({
    summary:
      'Link expirou → o próprio cliente gera um novo token (vistoria PENDENTE, criada há <24h).',
  })
  novoLink(@Param('token') token: string) {
    return this.vistorias.novoLinkPorToken(token);
  }

  @Public()
  @Post(':token/concluir')
  @ApiOperation({
    summary: 'Cliente conclui a vistoria: IMEI + 3 fotos + geolocalização + metadados.',
  })
  concluir(@Param('token') token: string, @Body() dto: ConcluirVistoriaRemotaDto) {
    return this.vistorias.concluirPorToken(token, dto);
  }
}
