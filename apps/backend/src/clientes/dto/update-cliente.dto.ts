import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateClienteDto } from './create-cliente.dto';

// CPF não é editável após o cadastro.
export class UpdateClienteDto extends PartialType(OmitType(CreateClienteDto, ['cpf'] as const)) {}
