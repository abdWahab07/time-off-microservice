import { Dependencies, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jose from 'jose';
import { jwtAuthEnabled, trimConfig } from '../auth/http-auth.helpers';

@Injectable()
@Dependencies(ConfigService)
class JwtVerificationService {
  /** @param {ConfigService} config */
  constructor(config) {
    this.config = config;
    this._jwks = null;
    this._jwksUri = '';
  }

  _getJwks() {
    const uri = trimConfig(this.config, 'JWT_JWKS_URI');
    if (!uri) return null;
    if (this._jwksUri !== uri) {
      this._jwksUri = uri;
      this._jwks = jose.createRemoteJWKSet(new URL(uri));
    }
    return this._jwks;
  }

  /**
   * @param {string} token
   * @returns {Promise<import('jose').JWTPayload>}
   */
  async verifyAccessToken(token) {
    if (!jwtAuthEnabled(this.config)) {
      throw new Error('JWT verification invoked while JWT auth is disabled');
    }
    const issuer = trimConfig(this.config, 'JWT_ISSUER');
    const audienceRaw = trimConfig(this.config, 'JWT_AUDIENCE');
    const audience = audienceRaw || undefined;
    const secret = trimConfig(this.config, 'JWT_SECRET');

    if (secret) {
      const key = new TextEncoder().encode(secret);
      const { payload } = await jose.jwtVerify(token, key, {
        issuer,
        audience,
        algorithms: ['HS256'],
      });
      return payload;
    }

    const JWKS = this._getJwks();
    if (!JWKS) {
      throw new Error('JWT_JWKS_URI or JWT_SECRET must be set with JWT_ISSUER');
    }
    const { payload } = await jose.jwtVerify(token, JWKS, {
      issuer,
      audience,
    });
    return payload;
  }
}
export { JwtVerificationService };
