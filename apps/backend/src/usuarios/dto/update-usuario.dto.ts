import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateUsuarioDto } from './create-usuario.dto';

// E-mail e senha não são alterados por este endpoint (senha terá fluxo próprio de reset).
export class UpdateUsuarioDto extends PartialType(
  OmitType(CreateUsuarioDto, ['email', 'senha'] as const),
) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
