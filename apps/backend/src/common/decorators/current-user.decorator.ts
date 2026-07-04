import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Role } from '@solatium/shared';

export interface UsuarioAutenticado {
  id: string;
  email: string;
  role: Role;
  lojaId: string | null;
}

/** Injeta o usuário autenticado (preenchido pela JwtStrategy) no handler. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UsuarioAutenticado => {
    const req = ctx.switchToHttp().getRequest();
    return req.user as UsuarioAutenticado;
  },
);
