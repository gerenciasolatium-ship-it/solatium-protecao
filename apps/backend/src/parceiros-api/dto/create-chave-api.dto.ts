import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class CreateChaveApiDto {
  @ApiProperty({ example: 'CRM interno da OnePurple', description: 'Nome de identificação.' })
  @IsString()
  @Length(2, 120)
  nome!: string;
}
