import { Body, Controller, ForbiddenException, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@solatium/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, UsuarioAutenticado } from '../common/decorators/current-user.decorator';
import { PaginacaoQueryDto } from '../common/dto/paginacao.dto';
import { FinanceiroService } from './financeiro.service';
import { AjusteManualDto } from './dto/ajuste-manual.dto';

@ApiTags('financeiro')
@ApiBearerAuth()
@Controller('financeiro/lojas/:lojaId')
export class FinanceiroController {
  constructor(private readonly financeiro: FinanceiroService) {}

  @Get('conta-corrente')
  @Roles(Role.ADMIN, Role.OPERADOR, Role.LOJA_ADMIN)
  @ApiOperation({ summary: 'Extrato da conta-corrente de comissões da loja + saldo atual.' })
  extrato(
    @Param('lojaId') lojaId: string,
    @Query() query: PaginacaoQueryDto,
    @CurrentUser() user: UsuarioAutenticado,
  ) {
    this.autorizarLoja(user, lojaId);
    return this.financeiro.extrato(lojaId, query);
  }

  @Get('comissoes')
  @Roles(Role.ADMIN, Role.OPERADOR, Role.LOJA_ADMIN)
  @ApiOperation({ summary: 'Comissões da loja.' })
  comissoes(
    @Param('lojaId') lojaId: string,
    @Query() query: PaginacaoQueryDto,
    @CurrentUser() user: UsuarioAutenticado,
  ) {
    this.autorizarLoja(user, lojaId);
    return this.financeiro.comissoesLoja(lojaId, query);
  }

  @Post('ajuste')
  @Roles(Role.ADMIN, Role.OPERADOR)
  @ApiOperation({ summary: 'Lança um ajuste manual (crédito/débito) na conta-corrente.' })
  ajuste(@Param('lojaId') lojaId: string, @Body() dto: AjusteManualDto) {
    return this.financeiro.ajusteManual(lojaId, dto);
  }

  /** LOJA_ADMIN só enxerga a própria loja; backoffice enxerga qualquer uma. */
  private autorizarLoja(user: UsuarioAutenticado, lojaId: string) {
    if (user.role === Role.LOJA_ADMIN && user.lojaId !== lojaId) {
      throw new ForbiddenException('Você só pode acessar o financeiro da sua loja.');
    }
  }
}
