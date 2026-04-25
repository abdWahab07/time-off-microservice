import {
  CanActivate,
  Dependencies,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  jwtAuthEnabled,
  rolesFromPayload,
  subjectFromPayload,
} from '../auth/http-auth.helpers';

@Injectable()
@Dependencies(ConfigService)
class ManagerSelfBodyGuard {
  /** @param {ConfigService} config */
  constructor(config) {
    this.config = config;
  }

  /**
   * @param {ExecutionContext} context
   */
  canActivate(context) {
    if (!jwtAuthEnabled(this.config)) {
      return true;
    }
    const req = context.switchToHttp().getRequest();
    const roles = rolesFromPayload(req.jwtPayload, this.config);
    if (roles.includes('admin') || roles.includes('system')) {
      return true;
    }
    const sub = subjectFromPayload(req.jwtPayload, this.config);
    if (!sub) {
      throw new ForbiddenException({
        error: {
          code: 'FORBIDDEN',
          message: 'Access token is missing a subject identifier claim.',
          details: null,
        },
      });
    }
    const managerId = req.body?.managerId;
    if (typeof managerId !== 'string' || managerId !== sub) {
      throw new ForbiddenException({
        error: {
          code: 'FORBIDDEN',
          message:
            'managerId in the request body must match the authenticated subject.',
          details: null,
        },
      });
    }
    return true;
  }
}
export { ManagerSelfBodyGuard };
