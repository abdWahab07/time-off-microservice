import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { SecurityEventsService } from './common/services/security-events.service';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { correlationIdMiddleware } from './common/middleware/correlation-id.middleware';

function parseBoolean(raw, fallback) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).toLowerCase());
}

function parseInteger(raw, fallback) {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function resolveCorsOrigin() {
  const configured = (process.env.CORS_ORIGIN || '').trim();
  if (!configured) {
    return process.env.NODE_ENV === 'production' ? false : true;
  }
  if (configured === '*') {
    return true;
  }
  const values = configured
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  return values.length === 1 ? values[0] : values;
}

/**
 * @param {import('@nestjs/common').INestApplication} app
 */
export function configureHttpApp(app) {
  const securityEvents = app.get(SecurityEventsService, { strict: false });
  const corsEnabled = parseBoolean(process.env.CORS_ENABLED, true);
  const corsOrigin = resolveCorsOrigin();
  const trustProxy = parseBoolean(
    process.env.TRUST_PROXY,
    process.env.NODE_ENV === 'production',
  );

  if (trustProxy && typeof app.set === 'function') {
    app.set('trust proxy', 1);
  }
  app.use(correlationIdMiddleware);
  app.use(helmet());
  if (corsEnabled) {
    app.enableCors({
      origin: corsOrigin,
      credentials: parseBoolean(process.env.CORS_CREDENTIALS, false),
      methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
      allowedHeaders: [
        'Authorization',
        'Content-Type',
        'X-Api-Key',
        'X-Correlation-Id',
      ],
    });
  }
  app.use(
    rateLimit({
      windowMs: parseInteger(process.env.RATE_LIMIT_WINDOW_MS, 60000),
      limit: parseInteger(process.env.RATE_LIMIT_MAX, 120),
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      handler(req, res) {
        securityEvents?.recordAuthFailure(req, 'RATE_LIMIT_EXCEEDED');
        res.status(429).json({
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests. Retry later.',
            details: null,
          },
        });
      },
    }),
  );
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
}
