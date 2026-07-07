import { PartialType } from '@nestjs/swagger';
import { CreateModeloAparelhoDto } from './create-modelo-aparelho.dto';

export class UpdateModeloAparelhoDto extends PartialType(CreateModeloAparelhoDto) {}
