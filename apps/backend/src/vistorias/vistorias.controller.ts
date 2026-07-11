import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@solatium/shared';
import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, UsuarioAutenticado } from '../common/decorators/current-user.decorator';
import { PaginacaoQueryDto } from '../common/dto/paginacao.dto';
import { CreateVistoriaDto } from './dto/create-vistoria.dto';
import { VistoriasService } from './vistorias.service';

class ReprovarVistoriaDto {
  @ApiProperty({ example: 'Tela trincada na foto frontal.' })
  @IsString()
  @Length(3, 500)
  motivo!: string;
}

@ApiTags('vistorias')
@ApiBearerAuth()
@Controller('vistorias')
export class VistoriasController {
  constructor(private readonly vistorias: VistoriasService) {}

  @Post()
  @Roles(Role.ADMIN, Role.OPERADOR, Role.LOJA_ADMIN, Role.LOJA_VENDEDOR)
  @ApiOperation({
    summary: 'Inicia vistoria remota: gera link único (30 min) e envia ao WhatsApp do cliente.',
  })
  create(@Body() dto: CreateVistoriaDto, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.vistorias.create(dto, usuario);
  }

  @Post(':id/reenviar-link')
  @Roles(Role.ADMIN, Role.OPERADOR, Role.LOJA_ADMIN, Role.LOJA_VENDEDOR)
  @ApiOperation({ summary: 'Gera novo token (30 min) e reenvia o link ao cliente.' })
  reenviarLink(@Param('id') id: string, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.vistorias.reenviarLink(id, usuario);
  }

  // Aprovação manual é EXCEÇÃO do backoffice — o vendedor da loja NÃO pode
  // liberar o checkout sem o cliente concluir a vistoria (antifraude M2).
  @Post(':id/aprovar')
  @Roles(Role.ADMIN, Role.OPERADOR)
  @ApiOperation({ summary: 'Aprovação manual (exceção — só backoffice; fica auditada).' })
  aprovar(@Param('id') id: string, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.vistorias.aprovar(id, usuario);
  }

  @Post(':id/reprovar')
  @Roles(Role.ADMIN, Role.OPERADOR)
  reprovar(
    @Param('id') id: string,
    @Body() dto: ReprovarVistoriaDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.vistorias.reprovar(id, dto.motivo, usuario);
  }

  @Get()
  @Roles(Role.ADMIN, Role.OPERADOR, Role.LOJA_ADMIN, Role.LOJA_VENDEDOR)
  findAll(@Query() query: PaginacaoQueryDto, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.vistorias.findAll(query, usuario);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.OPERADOR, Role.LOJA_ADMIN, Role.LOJA_VENDEDOR)
  findOne(@Param('id') id: string, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.vistorias.findOne(id, usuario);
  }
}
