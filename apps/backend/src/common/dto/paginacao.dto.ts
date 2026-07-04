import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class PaginacaoQueryDto {
  @ApiPropertyOptional({ default: 1, description: 'Página (1-based)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pagina = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  porPagina = 20;

  @ApiPropertyOptional({ description: 'Termo de busca livre' })
  @IsOptional()
  @IsString()
  busca?: string;
}
