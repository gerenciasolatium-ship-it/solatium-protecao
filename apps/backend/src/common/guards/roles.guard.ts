import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@solatium/shared';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { UsuarioAutenticado } from '../decorators/current-user.decorator';

/**
 * Aplica a restrição de papéis definida por @Roles(). Sem @Roles a rota
 * fica liberada para qualquer usuário autenticado.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const rolesExigidos = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!rolesExigidos || rolesExigidos.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    const usuario = req.user as UsuarioAutenticado | undefined;
    if (!usuario || !rolesExigidos.includes(usuario.role)) {
      throw new ForbiddenException('Você não tem permissão para acessar este recurso.');
    }
    return true;
  }
}
