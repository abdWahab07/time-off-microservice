import { Dependencies, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { trimConfig } from '../auth/http-auth.helpers';

function toInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function requestIp(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

@Injectable()
@Dependencies(ConfigService)
class SecurityEventsService {
  /** @param {ConfigService} config */
  constructor(config) {
    this.config = config;
    this.failuresByIp = new Map();
    this.windowMs = toInt(
      trimConfig(config, 'SECURITY_AUTH_FAILURE_WINDOW_MS'),
      60000,
    );
    this.alertThreshold = toInt(
      trimConfig(config, 'SECURITY_AUTH_FAILURE_THRESHOLD'),
      10,
    );
  }

  /**
   * @param {import('express').Request} req
   * @param {string} reason
   * @param {object} details
   */
  recordAuthFailure(req, reason, details = {}) {
    const ip = requestIp(req);
    const now = Date.now();
    const cutoff = now - this.windowMs;
    const current = (this.failuresByIp.get(ip) || []).filter(
      (ts) => ts >= cutoff,
    );
    current.push(now);
    this.failuresByIp.set(ip, current);

    // eslint-disable-next-line no-console
    console.warn(
      JSON.stringify({
        event: 'auth_failure',
        reason,
        ip,
        method: req.method,
        path: req.originalUrl || req.url,
        correlationId: req.correlationId || null,
        failureCountInWindow: current.length,
        windowMs: this.windowMs,
        ...details,
      }),
    );

    if (current.length >= this.alertThreshold) {
      // eslint-disable-next-line no-console
      console.error(
        JSON.stringify({
          event: 'security_anomaly',
          type: 'repeated_auth_failures',
          ip,
          failureCountInWindow: current.length,
          threshold: this.alertThreshold,
          windowMs: this.windowMs,
          correlationId: req.correlationId || null,
          path: req.originalUrl || req.url,
          alert: true,
        }),
      );
    }
  }
}

export { SecurityEventsService };
