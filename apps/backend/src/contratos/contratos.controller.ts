import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@solatium/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, UsuarioAutenticado } from '../common/decorators/current-user.decorator';
import { ContratosService } from './contratos.service';
import { CreateContratoDto, NovaCobrancaDto } from './dto/create-contrato.dto';

@ApiTags('contratos')
@ApiBearerAuth()
@Controller('contratos')
export class ContratosController {
  constructor(private readonly contratos: ContratosService) {}

  @Post()
  @Roles(Role.ADMIN, Role.OPERADOR, Role.LOJA_ADMIN, Role.LOJA_VENDEDOR)
  @ApiOperation({
    summary: 'Checkout: vistoria APROVADA + plano + forma de pagamento → cobrança Asaas (QR Pix/link).',
  })
  create(@Body() dto: CreateContratoDto, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.contratos.create(dto, usuario);
  }

  @Post(':id/nova-cobranca')
  @Roles(Role.ADMIN, Role.OPERADOR, Role.LOJA_ADMIN, Role.LOJA_VENDEDOR)
  @ApiOperation({ summary: 'Não perder venda: cartão recusado → nova cobrança (ex.: Pix).' })
  novaCobranca(
    @Param('id') id: string,
    @Body() dto: NovaCobrancaDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.contratos.novaCobranca(id, dto, usuario);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.OPERADOR, Role.LOJA_ADMIN, Role.LOJA_VENDEDOR)
  @ApiOperation({ summary: 'Polling do balcão: status do contrato, cobranças e certificado.' })
  findOne(@Param('id') id: string, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.contratos.findOne(id, usuario);
  }
}
