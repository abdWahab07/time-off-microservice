import {
  CanActivate,
  Dependencies,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import {
  jwtAuthEnabled,
  rolesFromPayload,
} from '../auth/http-auth.helpers';
import { ROLES_KEY } from '../auth/roles.decorator';
import { SecurityEventsService } from '../services/security-events.service';

@Injectable()
@Dependencies(ConfigService, Reflector, SecurityEventsService)
class RolesGuard {
  /** @param {ConfigService} config */
  /** @param {Reflector} reflector */
  /** @param {SecurityEventsService} securityEvents */
  constructor(config, reflector, securityEvents) {
    this.config = config;
    this.reflector = reflector;
    this.securityEvents = securityEvents;
  }

  /**
   * @param {ExecutionContext} context
   */
  canActivate(context) {
    if (!jwtAuthEnabled(this.config)) {
      return true;
    }

    const required = this.reflector.getAllAndOverride(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!Array.isArray(required) || required.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest();
    const roles = rolesFromPayload(req.jwtPayload, this.config);
    if (required.some((role) => roles.includes(role))) {
      return true;
    }

    this.securityEvents.recordAuthFailure(req, 'RBAC_FORBIDDEN', {
      expectedRoles: required,
      actualRoles: roles,
    });
    throw new ForbiddenException({
      error: {
        code: 'FORBIDDEN',
        message: `Access denied. One of these roles is required: ${required.join(', ')}.`,
        details: null,
      },
    });
  }
}

export { RolesGuard };
