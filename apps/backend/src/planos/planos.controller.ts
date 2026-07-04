import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@solatium/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { PaginacaoQueryDto } from '../common/dto/paginacao.dto';
import { PlanosService } from './planos.service';
import { CreatePlanoDto } from './dto/create-plano.dto';
import { UpdatePlanoDto } from './dto/update-plano.dto';

@ApiTags('planos')
@ApiBearerAuth()
@Controller('planos')
export class PlanosController {
  constructor(private readonly planos: PlanosService) {}

  @Post()
  @Roles(Role.ADMIN, Role.OPERADOR)
  @ApiOperation({ summary: 'Cria plano/produto de proteção.' })
  create(@Body() dto: CreatePlanoDto) {
    return this.planos.create(dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.OPERADOR, Role.LOJA_ADMIN, Role.LOJA_VENDEDOR)
  findAll(@Query() query: PaginacaoQueryDto) {
    return this.planos.findAll(query);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.OPERADOR, Role.LOJA_ADMIN, Role.LOJA_VENDEDOR)
  findOne(@Param('id') id: string) {
    return this.planos.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.OPERADOR)
  update(@Param('id') id: string, @Body() dto: UpdatePlanoDto) {
    return this.planos.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@Param('id') id: string) {
    return this.planos.remove(id);
  }
}
