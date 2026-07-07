import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@solatium/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { PaginacaoQueryDto } from '../common/dto/paginacao.dto';
import { ModelosAparelhoService } from './modelos-aparelho.service';
import { CreateModeloAparelhoDto } from './dto/create-modelo-aparelho.dto';
import { UpdateModeloAparelhoDto } from './dto/update-modelo-aparelho.dto';

@ApiTags('modelos-aparelho')
@ApiBearerAuth()
@Controller('modelos-aparelho')
export class ModelosAparelhoController {
  constructor(private readonly modelos: ModelosAparelhoService) {}

  @Post()
  @Roles(Role.ADMIN, Role.OPERADOR)
  @ApiOperation({ summary: 'Cria modelo no catálogo de referência.' })
  create(@Body() dto: CreateModeloAparelhoDto) {
    return this.modelos.create(dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.OPERADOR, Role.LOJA_ADMIN, Role.LOJA_VENDEDOR)
  findAll(@Query() query: PaginacaoQueryDto) {
    return this.modelos.findAll(query);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.OPERADOR, Role.LOJA_ADMIN, Role.LOJA_VENDEDOR)
  findOne(@Param('id') id: string) {
    return this.modelos.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.OPERADOR)
  update(@Param('id') id: string, @Body() dto: UpdateModeloAparelhoDto) {
    return this.modelos.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@Param('id') id: string) {
    return this.modelos.remove(id);
  }
}
