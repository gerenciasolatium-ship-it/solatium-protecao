import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, IsUUID, Length, Min } from 'class-validator';
import { IsImei } from '../../common/validators/decorators';

export class CreateAparelhoDto {
  @ApiProperty({ example: 'Apple' })
  @IsString()
  @Length(1, 60)
  marca!: string;

  @ApiProperty({ example: 'iPhone 13' })
  @IsString()
  @Length(1, 80)
  modelo!: string;

  @ApiProperty({ example: '490154203237518', description: 'IMEI (15 dígitos, validado por Luhn).' })
  @IsImei()
  imei!: string;

  @ApiProperty({ example: 3500.0 })
  @IsNumber()
  @Min(0)
  valorMercado!: number;

  @ApiPropertyOptional({ description: 'URL da nota fiscal (opcional).' })
  @IsOptional()
  @IsString()
  notaFiscalUrl?: string;

  @ApiProperty({ description: 'ID do cliente dono do aparelho.' })
  @IsUUID()
  clienteId!: string;
}
