import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';
import { FormaPagamento } from '@prisma/client';

export class CreateContratoDto {
  @ApiProperty({ description: 'Vistoria APROVADA que libera a venda.' })
  @IsUUID()
  vistoriaId!: string;

  @ApiProperty({ description: 'Plano contratado.' })
  @IsUUID()
  planoId!: string;

  @ApiProperty({ enum: FormaPagamento, example: FormaPagamento.PIX })
  @IsEnum(FormaPagamento)
  formaPagamento!: FormaPagamento;

  @ApiPropertyOptional({ description: 'Parcelas do cartão anual (1 = à vista).', default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  parcelas?: number;

  @ApiPropertyOptional({
    description: 'Código da proposta externa (M11) que originou esta venda.',
  })
  @IsOptional()
  @IsString()
  @Length(8, 64)
  propostaExterna?: string;
}

export class NovaCobrancaDto {
  @ApiProperty({
    enum: FormaPagamento,
    description: 'Nova forma de pagamento ("não perder venda": cartão recusou → Pix).',
  })
  @IsEnum(FormaPagamento)
  formaPagamento!: FormaPagamento;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  parcelas?: number;
}
