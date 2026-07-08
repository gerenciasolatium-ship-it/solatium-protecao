import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsCpf } from '../../common/validators/decorators';

export class PropostaClienteDto {
  @ApiProperty({ example: 'Maria Souza' })
  @IsString()
  @Length(2, 120)
  nome!: string;

  @ApiProperty({ example: '52998224725', description: 'CPF (validado pelos dígitos).' })
  @IsCpf()
  cpf!: string;

  @ApiProperty({ example: '11999998888', description: 'WhatsApp — recebe o certificado.' })
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
}

export class PropostaAparelhoDto {
  @ApiPropertyOptional({ example: 'Apple' })
  @IsOptional()
  @IsString()
  @Length(1, 60)
  marca?: string;

  @ApiPropertyOptional({ example: 'iPhone 15' })
  @IsOptional()
  @IsString()
  @Length(1, 80)
  modelo?: string;

  @ApiPropertyOptional({ example: 128 })
  @IsOptional()
  @IsInt()
  @Min(1)
  armazenamentoGb?: number;

  @ApiPropertyOptional({ example: 'Azul' })
  @IsOptional()
  @IsString()
  @Length(1, 40)
  cor?: string;

  @ApiPropertyOptional({ example: '354328661234567', description: 'IMEI, se o CRM já tiver.' })
  @IsOptional()
  @IsString()
  @Length(15, 17)
  imei?: string;

  @ApiPropertyOptional({ example: 3500.0, description: 'Valor de referência (R$).' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  valorMercado?: number;
}

export class CreatePropostaExternaDto {
  @ApiProperty({ type: PropostaClienteDto })
  @ValidateNested()
  @Type(() => PropostaClienteDto)
  cliente!: PropostaClienteDto;

  @ApiPropertyOptional({ type: PropostaAparelhoDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PropostaAparelhoDto)
  aparelho?: PropostaAparelhoDto;

  @ApiPropertyOptional({
    example: 'deal-8123',
    description: 'Identificador do negócio/cliente no CRM do parceiro (volta nas consultas).',
  })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  referenciaExterna?: string;
}
