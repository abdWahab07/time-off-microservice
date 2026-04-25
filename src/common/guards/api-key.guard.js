import {
  CanActivate,
  Dependencies,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * When `API_KEY` is unset or empty, all requests pass (local dev / default tests).
 * When set, protected routes require the same value as either:
 * - `Authorization: Bearer <API_KEY>`
 * - `X-Api-Key: <API_KEY>`
 */
@Injectable()
@Dependencies(ConfigService)
class ApiKeyGuard {
  /** @param {ConfigService} config */
  constructor(config) {
    this.config = config;
  }

  /**
   * @param {ExecutionContext} context
   * @returns {boolean}
   */
  canActivate(context) {
    const configured = this.config.get('API_KEY');
    const key =
      configured === undefined || configured === null
        ? ''
        : String(configured).trim();
    if (!key) {
      return true;
    }

    const req = context.switchToHttp().getRequest();
    const bearer = this.extractBearer(req.headers?.authorization);
    const headerKey = req.headers?.['x-api-key'];
    const presented =
      typeof headerKey === 'string' && headerKey.trim() !== ''
        ? headerKey.trim()
        : bearer;

    if (presented === key) {
      return true;
    }

    throw new UnauthorizedException({
      error: {
        code: 'UNAUTHORIZED',
        message:
          'Missing or invalid API key. Send Authorization: Bearer <key> or X-Api-Key when API_KEY is set.',
        details: null,
      },
    });
  }

  /**
   * @param {string | undefined} authorization
   * @returns {string | null}
   */
  extractBearer(authorization) {
    if (!authorization || typeof authorization !== 'string') {
      return null;
    }
    const m = authorization.match(/^\s*Bearer\s+(\S+)\s*$/i);
    return m ? m[1] : null;
  }
}
export { ApiKeyGuard };
