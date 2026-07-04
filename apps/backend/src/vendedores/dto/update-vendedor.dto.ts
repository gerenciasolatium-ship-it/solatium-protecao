import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateVendedorDto } from './create-vendedor.dto';

// CPF, loja e senha não são alterados por este endpoint.
export class UpdateVendedorDto extends PartialType(
  OmitType(CreateVendedorDto, ['cpf', 'lojaId', 'senha'] as const),
) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
