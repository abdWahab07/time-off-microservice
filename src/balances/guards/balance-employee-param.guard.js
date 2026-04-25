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
} from '../../common/auth/http-auth.helpers';

@Injectable()
@Dependencies(ConfigService)
class BalanceEmployeeParamGuard {
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
    if (
      roles.includes('manager') ||
      roles.includes('admin') ||
      roles.includes('system')
    ) {
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
    const employeeId = req.params?.employeeId;
    if (typeof employeeId !== 'string' || employeeId !== sub) {
      throw new ForbiddenException({
        error: {
          code: 'FORBIDDEN',
          message:
            'You may only read balances for the employee id that matches your access token subject.',
          details: null,
        },
      });
    }
    return true;
  }
}
export { BalanceEmployeeParamGuard };
