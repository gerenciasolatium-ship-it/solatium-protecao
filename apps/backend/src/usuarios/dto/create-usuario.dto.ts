import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString, IsUUID, Length, MinLength } from 'class-validator';
import { Role } from '@solatium/shared';

export class CreateUsuarioDto {
  @ApiProperty({ example: 'Operadora Solatium' })
  @IsString()
  @Length(2, 120)
  nome!: string;

  @ApiProperty({ example: 'operador@solatium.com.br' })
  @IsEmail({}, { message: 'E-mail inválido.' })
  email!: string;

  @ApiProperty({ example: 'SenhaForte@123' })
  @IsString()
  @MinLength(6, { message: 'A senha deve ter ao menos 6 caracteres.' })
  senha!: string;

  @ApiProperty({ enum: Role })
  @IsEnum(Role)
  role!: Role;

  @ApiPropertyOptional({
    description: 'Obrigatório para papéis de loja (LOJA_ADMIN/LOJA_VENDEDOR).',
  })
  @IsOptional()
  @IsUUID()
  lojaId?: string;
}
