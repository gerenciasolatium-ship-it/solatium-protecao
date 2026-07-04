import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { isImeiValido } from './imei.util';
import { isCpfValido } from './cpf.util';

@ValidatorConstraint({ name: 'isImei', async: false })
export class IsImeiConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && isImeiValido(value);
  }
  defaultMessage(): string {
    return 'IMEI inválido: precisa ter 15 dígitos e passar no dígito verificador (Luhn).';
  }
}

export function IsImei(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      constraints: [],
      validator: IsImeiConstraint,
    });
  };
}

@ValidatorConstraint({ name: 'isCpf', async: false })
export class IsCpfConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && isCpfValido(value);
  }
  defaultMessage(): string {
    return 'CPF inválido.';
  }
}

export function IsCpf(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      constraints: [],
      validator: IsCpfConstraint,
    });
  };
}
