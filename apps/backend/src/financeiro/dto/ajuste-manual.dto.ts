import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsPositive, IsString, Length } from 'class-validator';

export class AjusteManualDto {
  @ApiProperty({ enum: ['CREDITO', 'DEBITO'], description: 'Sentido do ajuste manual.' })
  @IsEnum(['CREDITO', 'DEBITO'] as unknown as object)
  sentido!: 'CREDITO' | 'DEBITO';

  @ApiProperty({ example: 50.0, description: 'Valor (positivo) do ajuste.' })
  @IsNumber()
  @IsPositive()
  valor!: number;

  @ApiProperty({ example: 'Estorno de bônus lançado em duplicidade.' })
  @IsString()
  @Length(3, 200)
  referencia!: string;
}
