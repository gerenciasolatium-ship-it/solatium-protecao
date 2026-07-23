import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { DISPOSITIVO_MAX, FOTO_BASE64_MAX, TIPOS_FOTO_OBRIGATORIOS } from '../vistoria-remota.util';

export class FotoVistoriaDto {
  @ApiProperty({ enum: TIPOS_FOTO_OBRIGATORIOS })
  @IsIn(TIPOS_FOTO_OBRIGATORIOS as unknown as string[])
  tipo!: string;

  @ApiProperty({ description: 'JPEG em base64 (sem prefixo data:), já comprimido.' })
  @IsString()
  @MaxLength(FOTO_BASE64_MAX)
  base64!: string;
}

export class GeolocalizacaoDto {
  @ApiProperty()
  @IsNumber()
  lat!: number;

  @ApiProperty()
  @IsNumber()
  lng!: number;

  @ApiPropertyOptional({ description: 'Precisão em metros.' })
  @IsOptional()
  @IsNumber()
  precisao?: number;
}

export class ConcluirVistoriaRemotaDto {
  @ApiProperty({ description: 'IMEI digitado pelo cliente (disque *#06#).' })
  @IsString()
  @Length(14, 20)
  imei!: string;

  @ApiProperty({ type: [FotoVistoriaDto], description: 'frente, verso e tela do IMEI.' })
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => FotoVistoriaDto)
  fotos!: FotoVistoriaDto[];

  @ApiPropertyOptional({ type: GeolocalizacaoDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => GeolocalizacaoDto)
  geolocalizacao?: GeolocalizacaoDto;

  @ApiPropertyOptional({
    description: 'Metadados do navegador/dispositivo (JSON: ua, modelo, gpu, tela, toque).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(DISPOSITIVO_MAX)
  dispositivo?: string;
}
