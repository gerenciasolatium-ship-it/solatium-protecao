import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, IsUUID, Length, MinLength } from 'class-validator';
import { IsCpf } from '../../common/validators/decorators';

export class CreateVendedorDto {
  @ApiProperty({ example: 'João Vendedor' })
  @IsString()
  @Length(2, 120)
  nome!: string;

  @ApiProperty({ example: '52998224725' })
  @IsCpf()
  cpf!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  telefone?: string;

  @ApiPropertyOptional({ description: 'E-mail de login. Se omitido, é gerado a partir do CPF.' })
  @IsOptional()
  @IsEmail({}, { message: 'E-mail inválido.' })
  email?: string;

  @ApiProperty({ description: 'Loja à qual o vendedor pertence.' })
  @IsUUID()
  lojaId!: string;

  @ApiProperty({ example: 'SenhaLoja@123', description: 'Senha inicial de acesso do vendedor.' })
  @IsString()
  @MinLength(6, { message: 'A senha deve ter ao menos 6 caracteres.' })
  senha!: string;
}
