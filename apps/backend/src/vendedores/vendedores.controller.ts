import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Role } from '@solatium/shared';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { Roles } from '../common/decorators/roles.decorator';
import { PaginacaoQueryDto } from '../common/dto/paginacao.dto';
import { ImportarCsvDto } from '../lojas/lojas.controller';
import { VendedoresService } from './vendedores.service';
import { CreateVendedorDto } from './dto/create-vendedor.dto';
import { UpdateVendedorDto } from './dto/update-vendedor.dto';

class ImportarVendedoresDto extends ImportarCsvDto {
  @ApiPropertyOptional({ description: 'Senha inicial usada nas linhas sem coluna senha.' })
  @IsOptional()
  @IsString()
  @MinLength(6)
  senhaPadrao?: string;
}

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

  @Post('importar')
  @Roles(Role.ADMIN, Role.OPERADOR)
  @ApiOperation({
    summary:
      'Importação em massa via CSV (nome;cpf;loja_cnpj;telefone;email;senha). Relatório por linha.',
  })
  importar(@Body() dto: ImportarVendedoresDto) {
    return this.vendedores.importar(dto.csv, dto.senhaPadrao);
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
