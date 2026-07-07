import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Length, Min } from 'class-validator';

export class CreateModeloAparelhoDto {
  @ApiProperty({ example: 'Apple' })
  @IsString()
  @Length(2, 40)
  marca!: string;

  @ApiProperty({ example: 'iPhone 15 Pro' })
  @IsString()
  @Length(2, 80)
  modelo!: string;

  @ApiProperty({ example: 256, description: 'Armazenamento em GB.' })
  @IsInt()
  @Min(1)
  armazenamentoGb!: number;

  @ApiProperty({ example: 5600, description: 'Valor de mercado de referência (R$).' })
  @IsNumber()
  @Min(0)
  valorReferencia!: number;

  @ApiPropertyOptional({ example: 49.9, description: 'Preço da proteção mensal (R$).' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  protecaoMensal?: number;

  @ApiPropertyOptional({ example: 499, description: 'Preço da proteção anual (R$).' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  protecaoAnual?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
