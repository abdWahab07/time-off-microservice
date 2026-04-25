import { SetMetadata } from '@nestjs/common';

const ROLES_KEY = 'auth_roles';
const Roles = (...roles) => SetMetadata(ROLES_KEY, roles);

export { ROLES_KEY, Roles };
