import { randomUUID } from 'crypto';

export function correlationIdMiddleware(req, res, next) {
  const id =
    (req.headers['x-correlation-id'] &&
      String(req.headers['x-correlation-id']).slice(0, 128)) ||
    randomUUID();
  req.correlationId = id;
  res.setHeader('X-Correlation-Id', id);
  next();
}
