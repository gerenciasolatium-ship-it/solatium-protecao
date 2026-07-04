import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@solatium/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { PaginacaoQueryDto } from '../common/dto/paginacao.dto';
import { LojasService } from './lojas.service';
import { CreateLojaDto } from './dto/create-loja.dto';
import { UpdateLojaDto } from './dto/update-loja.dto';

@ApiTags('lojas')
@ApiBearerAuth()
@Controller('lojas')
export class LojasController {
  constructor(private readonly lojas: LojasService) {}

  @Post()
  @Roles(Role.ADMIN, Role.OPERADOR)
  @ApiOperation({ summary: 'Cadastra uma nova loja parceira.' })
  create(@Body() dto: CreateLojaDto) {
    return this.lojas.create(dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.OPERADOR)
  @ApiOperation({ summary: 'Lista lojas (paginado, com busca).' })
  findAll(@Query() query: PaginacaoQueryDto) {
    return this.lojas.findAll(query);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.OPERADOR)
  findOne(@Param('id') id: string) {
    return this.lojas.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.OPERADOR)
  update(@Param('id') id: string, @Body() dto: UpdateLojaDto) {
    return this.lojas.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Inativa a loja (soft-delete).' })
  remove(@Param('id') id: string) {
    return this.lojas.remove(id);
  }
}
