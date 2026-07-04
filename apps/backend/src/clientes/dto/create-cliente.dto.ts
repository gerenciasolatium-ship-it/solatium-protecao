import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEmail, IsOptional, IsString, Length } from 'class-validator';
import { IsCpf } from '../../common/validators/decorators';

export class CreateClienteDto {
  @ApiProperty({ example: 'Maria Souza' })
  @IsString()
  @Length(2, 120)
  nome!: string;

  @ApiProperty({ example: '52998224725', description: 'CPF (validado pelos dígitos).' })
  @IsCpf()
  cpf!: string;

  @ApiProperty({ example: '11999998888' })
  @IsString()
  @Length(10, 15)
  telefoneWhatsapp!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail({}, { message: 'E-mail inválido.' })
  email?: string;

  @ApiPropertyOptional({ example: '1990-05-20', description: 'Data ISO (YYYY-MM-DD).' })
  @IsOptional()
  @IsDateString()
  nascimento?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() cep?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() logradouro?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() numero?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() complemento?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bairro?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() cidade?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 2) uf?: string;

  @ApiPropertyOptional({
    description: 'ID da loja de origem (preenchido automaticamente p/ vendedor).',
  })
  @IsOptional()
  @IsString()
  lojaOrigemId?: string;
}
