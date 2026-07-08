import { Controller, Get, Ip, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@solatium/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, type UsuarioAutenticado } from '../common/decorators/current-user.decorator';
import { KycService } from './kyc.service';

@ApiTags('kyc')
@ApiBearerAuth()
@Controller('kyc')
export class KycController {
  constructor(private readonly kyc: KycService) {}

  @Get('cpf/:cpf')
  @Roles(Role.ADMIN, Role.OPERADOR, Role.LOJA_ADMIN, Role.LOJA_VENDEDOR)
  @ApiOperation({
    summary:
      'Consulta CPF no provedor externo (Serpro) p/ autopreencher nome/nascimento. Toda consulta é auditada (LGPD). 501 se não configurado.',
  })
  consultarCpf(
    @Param('cpf') cpf: string,
    @CurrentUser() usuario: UsuarioAutenticado,
    @Ip() ip: string,
  ) {
    return this.kyc.consultarCpf(cpf, usuario?.id ?? null, ip);
  }
}
