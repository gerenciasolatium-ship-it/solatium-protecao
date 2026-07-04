import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@solatium/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { PaginacaoQueryDto } from '../common/dto/paginacao.dto';
import { AparelhosService } from './aparelhos.service';
import { CreateAparelhoDto } from './dto/create-aparelho.dto';
import { UpdateAparelhoDto } from './dto/update-aparelho.dto';

@ApiTags('aparelhos')
@ApiBearerAuth()
@Controller('aparelhos')
export class AparelhosController {
  constructor(private readonly aparelhos: AparelhosService) {}

  @Post()
  @Roles(Role.ADMIN, Role.OPERADOR, Role.LOJA_ADMIN, Role.LOJA_VENDEDOR)
  @ApiOperation({
    summary: 'Cadastra aparelho (IMEI validado por Luhn e checagem de duplicidade).',
  })
  create(@Body() dto: CreateAparelhoDto) {
    return this.aparelhos.create(dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.OPERADOR, Role.LOJA_ADMIN, Role.LOJA_VENDEDOR)
  findAll(@Query() query: PaginacaoQueryDto) {
    return this.aparelhos.findAll(query);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.OPERADOR, Role.LOJA_ADMIN, Role.LOJA_VENDEDOR)
  findOne(@Param('id') id: string) {
    return this.aparelhos.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.OPERADOR)
  update(@Param('id') id: string, @Body() dto: UpdateAparelhoDto) {
    return this.aparelhos.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@Param('id') id: string) {
    return this.aparelhos.remove(id);
  }
}
