import { PartialType } from '@nestjs/swagger';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { LojaStatus } from '@solatium/shared';
import { CreateLojaDto } from './create-loja.dto';

export class UpdateLojaDto extends PartialType(CreateLojaDto) {
  @ApiPropertyOptional({ enum: LojaStatus })
  @IsOptional()
  @IsEnum(LojaStatus)
  status?: LojaStatus;
}
