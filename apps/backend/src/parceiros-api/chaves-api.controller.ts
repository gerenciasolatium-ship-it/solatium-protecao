import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@solatium/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateChaveApiDto } from './dto/create-chave-api.dto';
import { ParceirosApiService } from './parceiros-api.service';

/** Backoffice: gestão das chaves de API de parceiro por loja. */
@ApiTags('integracao-parceiros')
@ApiBearerAuth()
@Controller('lojas/:lojaId/chaves-api')
export class ChavesApiController {
  constructor(private readonly service: ParceirosApiService) {}

  @Post()
  @Roles(Role.ADMIN, Role.OPERADOR)
  @ApiOperation({ summary: 'Cria chave de API — a chave completa só aparece nesta resposta.' })
  criar(@Param('lojaId') lojaId: string, @Body() dto: CreateChaveApiDto) {
    return this.service.criarChave(lojaId, dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.OPERADOR)
  listar(@Param('lojaId') lojaId: string) {
    return this.service.listarChaves(lojaId);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.OPERADOR)
  @ApiOperation({ summary: 'Revoga a chave (o CRM do parceiro perde acesso na hora).' })
  revogar(@Param('lojaId') lojaId: string, @Param('id') id: string) {
    return this.service.revogarChave(lojaId, id);
  }
}
