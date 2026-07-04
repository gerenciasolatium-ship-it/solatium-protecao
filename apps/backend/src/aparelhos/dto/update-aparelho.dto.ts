import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateAparelhoDto } from './create-aparelho.dto';

// IMEI e cliente não podem ser alterados após o cadastro (troca de aparelho = endosso, S3/S5).
export class UpdateAparelhoDto extends PartialType(
  OmitType(CreateAparelhoDto, ['imei', 'clienteId'] as const),
) {}
