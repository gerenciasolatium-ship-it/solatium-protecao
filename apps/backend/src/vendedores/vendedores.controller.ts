import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@solatium/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { PaginacaoQueryDto } from '../common/dto/paginacao.dto';
import { VendedoresService } from './vendedores.service';
import { CreateVendedorDto } from './dto/create-vendedor.dto';
import { UpdateVendedorDto } from './dto/update-vendedor.dto';

@ApiTags('vendedores')
@ApiBearerAuth()
@Controller('vendedores')
export class VendedoresController {
  constructor(private readonly vendedores: VendedoresService) {}

  @Post()
  @Roles(Role.ADMIN, Role.OPERADOR, Role.LOJA_ADMIN)
  @ApiOperation({ summary: 'Cadastra vendedor e cria seu login (LOJA_VENDEDOR).' })
  create(@Body() dto: CreateVendedorDto) {
    return this.vendedores.create(dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.OPERADOR, Role.LOJA_ADMIN)
  findAll(@Query() query: PaginacaoQueryDto) {
    return this.vendedores.findAll(query);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.OPERADOR, Role.LOJA_ADMIN)
  findOne(@Param('id') id: string) {
    return this.vendedores.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.OPERADOR, Role.LOJA_ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateVendedorDto) {
    return this.vendedores.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.OPERADOR)
  remove(@Param('id') id: string) {
    return this.vendedores.remove(id);
  }
}
