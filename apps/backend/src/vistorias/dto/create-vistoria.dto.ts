import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CreateVistoriaDto {
  @ApiProperty({ description: 'Aparelho a ser vistoriado.' })
  @IsUUID()
  aparelhoId!: string;
}
