import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreateLojaDto {
  @ApiProperty({ example: 'BRT Celulares — Centro' })
  @IsString()
  @Length(2, 120)
  nome!: string;

  @ApiProperty({ example: '12345678000199', description: 'CNPJ com 14 dígitos (só números).' })
  @Matches(/^\d{14}$/, { message: 'CNPJ deve conter exatamente 14 dígitos.' })
  cnpj!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail({}, { message: 'E-mail inválido.' })
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  telefone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  responsavelNome?: string;

  // Endereço
  @ApiPropertyOptional() @IsOptional() @IsString() cep?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() logradouro?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() numero?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() complemento?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bairro?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() cidade?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 2) uf?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() latitude?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() longitude?: number;

  // Conta bancária p/ split Asaas (usado na S3)
  @ApiPropertyOptional() @IsOptional() @IsString() bancoNome?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bancoAgencia?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bancoConta?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bancoTipoConta?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() pixChave?: string;

  @ApiPropertyOptional({ default: 0.3, description: 'Percentual de comissão da loja (0 a 1).' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  comissaoPct?: number;
}
