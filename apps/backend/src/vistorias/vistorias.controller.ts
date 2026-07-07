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
  @ApiOperation({ summary: 'Inicia vistoria (gera código dinâmico de 6 dígitos, 10 min).' })
  create(@Body() dto: CreateVistoriaDto, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.vistorias.create(dto, usuario);
  }

  @Post(':id/aprovar')
  @Roles(Role.ADMIN, Role.OPERADOR, Role.LOJA_ADMIN, Role.LOJA_VENDEDOR)
  @ApiOperation({ summary: 'Aprova a vistoria (libera o checkout).' })
  aprovar(@Param('id') id: string, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.vistorias.aprovar(id, usuario);
  }

  @Post(':id/reprovar')
  @Roles(Role.ADMIN, Role.OPERADOR, Role.LOJA_ADMIN, Role.LOJA_VENDEDOR)
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
