import { HttpException, HttpStatus } from '@nestjs/common';
import { HcmClientErrorCode } from './hcm.types';

export class HcmClientException extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {Record<string, unknown>} [details]
   */
  constructor(code, message, details = undefined) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = 'HcmClientException';
  }
}

/**
 * @param {HcmClientException} err
 */
export function mapHcmClientExceptionToHttp(err) {
  const statusByCode = {
    [HcmClientErrorCode.INSUFFICIENT_BALANCE]: HttpStatus.CONFLICT,
    [HcmClientErrorCode.INVALID_DIMENSIONS]: HttpStatus.UNPROCESSABLE_ENTITY,
    [HcmClientErrorCode.HCM_UNAVAILABLE]: HttpStatus.SERVICE_UNAVAILABLE,
    [HcmClientErrorCode.UNKNOWN]: HttpStatus.INTERNAL_SERVER_ERROR,
  };
  const status = statusByCode[err.code] || HttpStatus.BAD_GATEWAY;
  return new HttpException(
    {
      error: {
        code: err.code,
        message: err.message,
        details: err.details ?? null,
      },
    },
    status,
  );
}

/**
 * @param {HcmClientException} err
 * @returns {number}
 */
export function statusForHcmClientException(err) {
  const statusByCode = {
    [HcmClientErrorCode.INSUFFICIENT_BALANCE]: HttpStatus.CONFLICT,
    [HcmClientErrorCode.INVALID_DIMENSIONS]: HttpStatus.UNPROCESSABLE_ENTITY,
    [HcmClientErrorCode.HCM_UNAVAILABLE]: HttpStatus.SERVICE_UNAVAILABLE,
    [HcmClientErrorCode.UNKNOWN]: HttpStatus.INTERNAL_SERVER_ERROR,
  };
  return statusByCode[err.code] || HttpStatus.BAD_GATEWAY;
}
