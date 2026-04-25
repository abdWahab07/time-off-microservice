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
import { TimeOffRequestsRepository } from '../repositories/time-off-requests.repository';

@Injectable()
@Dependencies(ConfigService)
class TimeOffListQueryGuard {
  /** @param {ConfigService} config */
  constructor(config) {
    this.config = config;
  }

  /**
   * Caller may only constrain list filters to their own employee or manager id.
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
    const employeeId =
      typeof req.query?.employeeId === 'string'
        ? req.query.employeeId
        : undefined;
    const managerId =
      typeof req.query?.managerId === 'string'
        ? req.query.managerId
        : undefined;
    if (!employeeId && !managerId) {
      throw new ForbiddenException({
        error: {
          code: 'FORBIDDEN',
          message:
            'Provide employeeId or managerId query parameter scoped to the authenticated subject.',
          details: null,
        },
      });
    }
    if (employeeId && employeeId !== sub) {
      throw new ForbiddenException({
        error: {
          code: 'FORBIDDEN',
          message: 'employeeId query must match the authenticated subject.',
          details: null,
        },
      });
    }
    if (managerId && managerId !== sub) {
      throw new ForbiddenException({
        error: {
          code: 'FORBIDDEN',
          message: 'managerId query must match the authenticated subject.',
          details: null,
        },
      });
    }
    return true;
  }
}

@Injectable()
@Dependencies(ConfigService, TimeOffRequestsRepository)
class TimeOffByIdReadGuard {
  /** @param {ConfigService} config */
  /** @param {TimeOffRequestsRepository} requestsRepo */
  constructor(config, requestsRepo) {
    this.config = config;
    this.requestsRepo = requestsRepo;
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
    const id = req.params?.id;
    if (typeof id !== 'string') {
      return false;
    }
    const row = this.requestsRepo.findById(id);
    if (!row) {
      return true;
    }
    const isEmployee = row.employeeId === sub;
    const isManager = row.managerId != null && row.managerId === sub;
    if (!isEmployee && !isManager) {
      throw new ForbiddenException({
        error: {
          code: 'FORBIDDEN',
          message: 'You may only read requests for your own employee or manager scope.',
          details: null,
        },
      });
    }
    return true;
  }
}

@Injectable()
@Dependencies(ConfigService, TimeOffRequestsRepository)
class CancelActorGuard {
  /** @param {ConfigService} config */
  /** @param {TimeOffRequestsRepository} requestsRepo */
  constructor(config, requestsRepo) {
    this.config = config;
    this.requestsRepo = requestsRepo;
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
    const cancelledBy = req.body?.cancelledBy;
    if (typeof cancelledBy !== 'string' || cancelledBy !== sub) {
      throw new ForbiddenException({
        error: {
          code: 'FORBIDDEN',
          message:
            'cancelledBy in the body must match the authenticated subject.',
          details: null,
        },
      });
    }
    const id = req.params?.id;
    if (typeof id !== 'string') {
      return false;
    }
    const row = this.requestsRepo.findById(id);
    if (!row) {
      return true;
    }
    const allowed =
      row.employeeId === sub ||
      (row.managerId != null && row.managerId === sub);
    if (!allowed) {
      throw new ForbiddenException({
        error: {
          code: 'FORBIDDEN',
          message:
            'Only the employee on the request or its assigned manager may cancel.',
          details: null,
        },
      });
    }
    return true;
  }
}

export { CancelActorGuard, TimeOffByIdReadGuard, TimeOffListQueryGuard };
