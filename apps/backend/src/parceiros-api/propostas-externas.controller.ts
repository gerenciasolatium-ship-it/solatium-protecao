import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type UsuarioAutenticado } from '../common/decorators/current-user.decorator';
import { ParceirosApiService } from './parceiros-api.service';

/** Consumo interno (app-loja): o wizard troca o código do link pelos dados. */
@ApiTags('integracao-parceiros')
@ApiBearerAuth()
@Controller('propostas-externas')
export class PropostasExternasController {
  constructor(private readonly service: ParceirosApiService) {}

  @Get(':codigo')
  @ApiOperation({ summary: 'Abre a proposta pré-preenchida (marca como UTILIZADA).' })
  abrir(@Param('codigo') codigo: string, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.service.abrirPropostaPorCodigo(codigo, usuario);
  }
}
