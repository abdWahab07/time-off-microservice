import { Dependencies, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { trimConfig } from '../../common/auth/http-auth.helpers';
import { MockHcmService } from './mock-hcm.service';
import {
  HcmClientException,
} from '../hcm-error.mapper';
import { HcmClientErrorCode } from '../hcm.types';

@Injectable()
@Dependencies(ConfigService, MockHcmService)
class HcmClientService {
  /** @param {ConfigService} config */
  /** @param {MockHcmService} mockHcmService */
  constructor(config, mockHcmService) {
    this.config = config;
    this.mockHcm = mockHcmService;
  }

  _externalBase() {
    return trimConfig(this.config, 'HCM_BASE_URL');
  }

  /**
   * @param {string} method
   * @param {string} path
   * @param {object | undefined} body
   */
  async _httpJson(method, path, body) {
    const base = this._externalBase().replace(/\/+$/, '');
    const url = `${base}${path}`;
    const headers = {};
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    const key = trimConfig(this.config, 'HCM_API_KEY');
    if (key) {
      headers['X-Api-Key'] = key;
    }
    const timeoutMs = Number(this.config.get('HCM_TIMEOUT_MS') ?? 15000) || 15000;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
      const text = await res.text();
      let json = null;
      if (text) {
        try {
          json = JSON.parse(text);
        } catch {
          json = null;
        }
      }
      if (!res.ok) {
        const codeRaw = json?.error?.code;
        const code =
          typeof codeRaw === 'string' &&
          Object.values(HcmClientErrorCode).includes(codeRaw)
            ? codeRaw
            : HcmClientErrorCode.UNKNOWN;
        throw new HcmClientException(
          code,
          json?.error?.message || text || res.statusText || 'HCM request failed',
          json?.error?.details,
        );
      }
      return json;
    } catch (e) {
      if (e instanceof HcmClientException) {
        throw e;
      }
      if (e?.name === 'AbortError') {
        throw new HcmClientException(
          HcmClientErrorCode.HCM_UNAVAILABLE,
          'HCM request timed out',
        );
      }
      throw new HcmClientException(
        HcmClientErrorCode.HCM_UNAVAILABLE,
        `HCM HTTP error: ${e?.message || e}`,
      );
    } finally {
      clearTimeout(t);
    }
  }

  /**
   * @param {string} employeeId
   * @param {string} locationId
   */
  async getBalance(employeeId, locationId) {
    if (!this._externalBase()) {
      return this.mockHcm.getBalance(employeeId, locationId);
    }
    const path = `/mock-hcm/balances/${encodeURIComponent(employeeId)}/${encodeURIComponent(locationId)}`;
    return this._httpJson('GET', path, undefined);
  }

  /**
   * @param {{ employeeId: string; locationId: string; requestedDays: number; externalRequestId: string; idempotencyKey: string }} payload
   */
  async fileTimeOff(payload) {
    if (!this._externalBase()) {
      return this.mockHcm.fileTimeOff(payload);
    }
    return this._httpJson('POST', '/mock-hcm/time-off', payload);
  }

  /**
   * @param {string} transactionId
   */
  async cancelTimeOff(transactionId) {
    if (!this._externalBase()) {
      return this.mockHcm.cancelTimeOff(transactionId);
    }
    return this._httpJson(
      'POST',
      `/mock-hcm/time-off/${encodeURIComponent(transactionId)}/cancel`,
      undefined,
    );
  }
}
export { HcmClientService };
