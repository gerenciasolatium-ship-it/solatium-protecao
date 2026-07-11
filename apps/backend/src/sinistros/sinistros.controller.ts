import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@solatium/shared';
import { IsIn, IsOptional } from 'class-validator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, UsuarioAutenticado } from '../common/decorators/current-user.decorator';
import { PaginacaoQueryDto } from '../common/dto/paginacao.dto';
import {
  AtualizarDocumentacaoDto,
  CreateSinistroDto,
  MudarStatusSinistroDto,
} from './dto/create-sinistro.dto';
import { SinistrosService } from './sinistros.service';

class ListarSinistrosQueryDto extends PaginacaoQueryDto {
  @IsOptional()
  @IsIn(['ABERTO', 'DOCUMENTACAO_PENDENTE', 'EM_ANALISE', 'APROVADO', 'NEGADO'])
  status?: string;
}

@ApiTags('sinistros')
@ApiBearerAuth()
@Controller('sinistros')
export class SinistrosController {
  constructor(private readonly sinistros: SinistrosService) {}

  @Post()
  @Roles(Role.ADMIN, Role.OPERADOR, Role.LOJA_ADMIN, Role.LOJA_VENDEDOR)
  @ApiOperation({ summary: 'Abre um sinistro (alertas antifraude automáticos).' })
  abrir(@Body() dto: CreateSinistroDto, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.sinistros.abrir(dto, usuario);
  }

  @Get()
  @Roles(Role.ADMIN, Role.OPERADOR, Role.LOJA_ADMIN, Role.LOJA_VENDEDOR)
  findAll(@Query() query: ListarSinistrosQueryDto, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.sinistros.findAll(query, usuario);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.OPERADOR, Role.LOJA_ADMIN, Role.LOJA_VENDEDOR)
  findOne(@Param('id') id: string, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.sinistros.findOne(id, usuario);
  }

  @Patch(':id/documentacao')
  @Roles(Role.ADMIN, Role.OPERADOR, Role.LOJA_ADMIN, Role.LOJA_VENDEDOR)
  @ApiOperation({ summary: 'Anexa B.O./relato enquanto o sinistro não foi decidido.' })
  atualizarDocumentacao(
    @Param('id') id: string,
    @Body() dto: AtualizarDocumentacaoDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.sinistros.atualizarDocumentacao(id, dto, usuario);
  }

  @Post(':id/status')
  @Roles(Role.ADMIN, Role.OPERADOR)
  @ApiOperation({
    summary: 'Decisão do backoffice: transições da esteira (APROVADO gera voucher).',
  })
  mudarStatus(@Param('id') id: string, @Body() dto: MudarStatusSinistroDto) {
    return this.sinistros.mudarStatus(id, dto);
  }
}

@ApiTags('vouchers')
@ApiBearerAuth()
@Controller('vouchers')
export class VouchersController {
  constructor(private readonly sinistros: SinistrosService) {}

  @Get(':codigo')
  @Roles(Role.ADMIN, Role.OPERADOR, Role.LOJA_ADMIN, Role.LOJA_VENDEDOR)
  @ApiOperation({ summary: 'Consulta voucher pelo código (tela de resgate da loja).' })
  consultar(@Param('codigo') codigo: string, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.sinistros.consultarVoucher(codigo.toUpperCase().trim(), usuario);
  }

  @Post(':codigo/resgatar')
  @Roles(Role.ADMIN, Role.OPERADOR, Role.LOJA_ADMIN, Role.LOJA_VENDEDOR)
  @ApiOperation({ summary: 'Resgata o voucher na loja de origem (baixa definitiva).' })
  resgatar(@Param('codigo') codigo: string, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.sinistros.resgatarVoucher(codigo.toUpperCase().trim(), usuario);
  }
}
