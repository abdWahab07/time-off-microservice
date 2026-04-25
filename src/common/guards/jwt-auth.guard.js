import {
  CanActivate,
  Dependencies,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  extractBearer,
  jwtAuthEnabled,
} from '../auth/http-auth.helpers';
import { JwtVerificationService } from '../services/jwt-verification.service';
import { SecurityEventsService } from '../services/security-events.service';

@Injectable()
@Dependencies(ConfigService, JwtVerificationService, SecurityEventsService)
class JwtAuthGuard {
  /** @param {ConfigService} config */
  /** @param {JwtVerificationService} jwt */
  /** @param {SecurityEventsService} securityEvents */
  constructor(config, jwt, securityEvents) {
    this.config = config;
    this.jwt = jwt;
    this.securityEvents = securityEvents;
  }

  /**
   * @param {ExecutionContext} context
   */
  async canActivate(context) {
    if (!jwtAuthEnabled(this.config)) {
      return true;
    }
    const req = context.switchToHttp().getRequest();
    const bearer = extractBearer(req.headers?.authorization);
    if (!bearer) {
      this.securityEvents?.recordAuthFailure(req, 'JWT_MISSING_BEARER');
      throw new UnauthorizedException({
        error: {
          code: 'UNAUTHORIZED',
          message:
            'Missing bearer access token. Send Authorization: Bearer <JWT> when JWT_ISSUER and JWT_SECRET or JWT_JWKS_URI are set.',
          details: null,
        },
      });
    }
    try {
      const payload = await this.jwt.verifyAccessToken(bearer);
      req.jwtPayload = payload;
      return true;
    } catch {
      this.securityEvents?.recordAuthFailure(req, 'JWT_INVALID_OR_EXPIRED');
      throw new UnauthorizedException({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired access token.',
          details: null,
        },
      });
    }
  }
}
export { JwtAuthGuard };
