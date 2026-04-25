import { HttpException } from '@nestjs/common';

/**
 * @param {number} status
 * @param {string} code
 * @param {string} message
 * @param {Record<string, unknown> | null} [details]
 */
export function apiError(status, code, message, details = null) {
  return new HttpException({ error: { code, message, details } }, status);
}
