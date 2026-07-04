import { SetMetadata } from '@nestjs/common';
import type { Role } from '@solatium/shared';

export const ROLES_KEY = 'roles';

/** Restringe a rota aos papéis informados. Ex.: @Roles('ADMIN', 'OPERADOR'). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
