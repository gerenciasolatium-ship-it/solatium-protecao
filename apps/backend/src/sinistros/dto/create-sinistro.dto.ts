import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsIn, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';

export class CreateSinistroDto {
  @ApiProperty({ description: 'Certificado sinistrado (deve estar ATIVO).' })
  @IsUUID()
  certificadoId!: string;

  @ApiPropertyOptional({ description: 'Relato do ocorrido pelo cliente.' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  relato?: string;

  @ApiPropertyOptional({ description: 'URL do B.O. digital (obrigatório antes da aprovação).' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  boUrl?: string;

  @ApiPropertyOptional({ description: 'Data de registro do B.O.' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  boData?: Date;
}

export class AtualizarDocumentacaoDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  boUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  boData?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  relato?: string;
}

export class MudarStatusSinistroDto {
  @ApiProperty({ enum: ['DOCUMENTACAO_PENDENTE', 'EM_ANALISE', 'APROVADO', 'NEGADO'] })
  @IsIn(['DOCUMENTACAO_PENDENTE', 'EM_ANALISE', 'APROVADO', 'NEGADO'])
  status!: 'DOCUMENTACAO_PENDENTE' | 'EM_ANALISE' | 'APROVADO' | 'NEGADO';

  @ApiPropertyOptional({ description: 'Obrigatório ao NEGAR o sinistro.' })
  @IsOptional()
  @IsString()
  @Length(3, 1000)
  motivo?: string;
}
