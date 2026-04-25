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
  trimConfig,
} from '../auth/http-auth.helpers';
import { SecurityEventsService } from '../services/security-events.service';

/**
 * When `API_KEY` is unset or empty, all requests pass (local dev / default tests).
 * When set, protected routes require the key via:
 * - `X-Api-Key: <API_KEY>` (always), and
 * - `Authorization: Bearer <API_KEY>` only when JWT auth is **not** enabled
 *   (so `Authorization` can carry end-user JWTs when `JWT_ISSUER` + verifier are set).
 */
@Injectable()
@Dependencies(ConfigService, SecurityEventsService)
class ApiKeyGuard {
  /** @param {ConfigService} config */
  /** @param {SecurityEventsService} securityEvents */
  constructor(config, securityEvents) {
    this.config = config;
    this.securityEvents = securityEvents;
  }

  /**
   * @param {ExecutionContext} context
   * @returns {boolean}
   */
  canActivate(context) {
    const key = trimConfig(this.config, 'API_KEY');
    if (!key) {
      return true;
    }
    const previousKey = trimConfig(this.config, 'API_KEY_PREVIOUS');

    const req = context.switchToHttp().getRequest();
    const headerKey = req.headers?.['x-api-key'];
    const trimmedHeader =
      typeof headerKey === 'string' ? headerKey.trim() : '';
    if (trimmedHeader === key || (previousKey && trimmedHeader === previousKey)) {
      return true;
    }
    if (!jwtAuthEnabled(this.config)) {
      const bearer = extractBearer(req.headers?.authorization);
      if (bearer === key || (previousKey && bearer === previousKey)) {
        return true;
      }
    }

    this.securityEvents?.recordAuthFailure(req, 'API_KEY_INVALID', {
      hasHeaderKey: Boolean(trimmedHeader),
      hasBearer: Boolean(extractBearer(req.headers?.authorization)),
    });

    throw new UnauthorizedException({
      error: {
        code: 'UNAUTHORIZED',
        message: jwtAuthEnabled(this.config)
          ? 'Missing or invalid API key. Send X-Api-Key when API_KEY is set (Authorization is reserved for the user JWT).'
          : 'Missing or invalid API key. Send Authorization: Bearer <key> or X-Api-Key when API_KEY is set.',
        details: null,
      },
    });
  }
}
export { ApiKeyGuard };
