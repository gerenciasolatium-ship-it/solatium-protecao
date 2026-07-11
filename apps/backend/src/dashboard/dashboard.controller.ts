import { Controller, ForbiddenException, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@solatium/shared';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, UsuarioAutenticado } from '../common/decorators/current-user.decorator';
import { DashboardService } from './dashboard.service';

class ResumoAdminQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  top?: number;
}

class ResumoLojaQueryDto {
  @IsOptional()
  @IsUUID()
  lojaId?: string;
}

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('resumo')
  @Roles(Role.ADMIN, Role.OPERADOR)
  @ApiOperation({ summary: 'Dashboard executivo (M9/M13): carteira + ranking de lojas.' })
  resumoAdmin(@Query() query: ResumoAdminQueryDto) {
    return this.dashboard.resumoAdmin(query.top ?? 20);
  }

  @Get('loja')
  @Roles(Role.ADMIN, Role.OPERADOR, Role.LOJA_ADMIN, Role.LOJA_VENDEDOR)
  @ApiOperation({ summary: 'Dashboard da loja (vendas, comissões, sinistralidade própria).' })
  resumoLoja(@Query() query: ResumoLojaQueryDto, @CurrentUser() usuario: UsuarioAutenticado) {
    // Usuário de loja só enxerga a própria loja; admin escolhe via ?lojaId=.
    const lojaId = usuario.lojaId ?? query.lojaId;
    if (!lojaId) {
      throw new ForbiddenException('Informe lojaId (usuários do backoffice) para consultar.');
    }
    if (usuario.lojaId && query.lojaId && query.lojaId !== usuario.lojaId) {
      throw new ForbiddenException('Dashboard pertence a outra loja.');
    }
    return this.dashboard.resumoLoja(lojaId);
  }
}
