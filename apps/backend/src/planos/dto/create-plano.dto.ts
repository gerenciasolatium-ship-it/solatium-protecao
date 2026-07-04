import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, Length, Min } from 'class-validator';
import { PlanoPeriodicidade } from '@solatium/shared';

export class CreatePlanoDto {
  @ApiProperty({ example: 'Completo' })
  @IsString()
  @Length(2, 80)
  nome!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  descricao?: string;

  @ApiProperty({ enum: PlanoPeriodicidade, default: PlanoPeriodicidade.MENSAL })
  @IsEnum(PlanoPeriodicidade)
  periodicidade!: PlanoPeriodicidade;

  @ApiPropertyOptional({ example: 29.9 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  premioMensal?: number;

  @ApiPropertyOptional({ example: 299 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  premioAnual?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  franquia?: number;

  @ApiProperty({ example: 3500, description: 'Capital segurado (valor máximo indenizável).' })
  @IsNumber()
  @Min(0)
  capitalSegurado!: number;

  @ApiPropertyOptional({ description: 'Faixa de valor do aparelho — mínimo.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  valorAparelhoMin?: number;

  @ApiPropertyOptional({ description: 'Faixa de valor do aparelho — máximo.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  valorAparelhoMax?: number;
}
