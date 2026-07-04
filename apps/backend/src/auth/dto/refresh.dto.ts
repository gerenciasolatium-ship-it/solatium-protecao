import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class RefreshDto {
  @ApiProperty({ description: 'Refresh token emitido no login.' })
  @IsString()
  refreshToken!: string;
}
