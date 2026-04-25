import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { HcmClientErrorCode, HcmFailureMode } from './hcm.types';
import { HcmClientException } from './hcm-error.mapper';

function balanceKey(employeeId, locationId) {
  return `${employeeId}\0${locationId}`;
}

@Injectable()
class MockHcmService {
  /** @type {Map<string, { availableDays: number }>} */
  balances = new Map();
  /** @type {Map<string, { transactionId: string; employeeId: string; locationId: string; requestedDays: number; externalRequestId: string }>} */
  fileByIdempotency = new Map();
  /** @type {Map<string, { cancelled: boolean }>} */
  transactions = new Map();
  failureMode = { enabled: false, mode: HcmFailureMode.DOWN };

  _maybeFail() {
    if (!this.failureMode.enabled) return;
    const { mode } = this.failureMode;
    if (mode === HcmFailureMode.DOWN) {
      throw new HcmClientException(
        HcmClientErrorCode.HCM_UNAVAILABLE,
        'Mock HCM is unavailable',
      );
    }
    if (mode === HcmFailureMode.TIMEOUT) {
      throw new HcmClientException(
        HcmClientErrorCode.HCM_UNAVAILABLE,
        'Mock HCM timed out',
      );
    }
    if (mode === HcmFailureMode.INVALID_DIMENSIONS) {
      throw new HcmClientException(
        HcmClientErrorCode.INVALID_DIMENSIONS,
        'HCM does not recognize employee/location',
      );
    }
    if (mode === HcmFailureMode.INSUFFICIENT_BALANCE) {
      throw new HcmClientException(
        HcmClientErrorCode.INSUFFICIENT_BALANCE,
        'Insufficient balance in HCM',
      );
    }
    if (mode === HcmFailureMode.RANDOM_FAILURE && Math.random() < 0.5) {
      throw new HcmClientException(
        HcmClientErrorCode.HCM_UNAVAILABLE,
        'Random HCM failure',
      );
    }
  }

  getBalance(employeeId, locationId) {
    this._maybeFail();
    const key = balanceKey(employeeId, locationId);
    if (!this.balances.has(key)) {
      throw new HcmClientException(
        HcmClientErrorCode.INVALID_DIMENSIONS,
        'Unknown employee/location in HCM',
        { employeeId, locationId },
      );
    }
    const row = this.balances.get(key);
    return {
      employeeId,
      locationId,
      availableDays: row.availableDays,
    };
  }

  /**
   * @param {{ employeeId: string; locationId: string; availableDays: number }} payload
   */
  seedBalance(payload) {
    const key = balanceKey(payload.employeeId, payload.locationId);
    this.balances.set(key, { availableDays: payload.availableDays });
    return { ok: true };
  }

  /**
   * @param {{ employeeId: string; locationId: string; requestedDays: number; externalRequestId: string; idempotencyKey: string }} body
   */
  fileTimeOff(body) {
    this._maybeFail();
    const existing = this.fileByIdempotency.get(body.idempotencyKey);
    if (existing) {
      return {
        transactionId: existing.transactionId,
        idempotentReplay: true,
      };
    }
    const key = balanceKey(body.employeeId, body.locationId);
    if (!this.balances.has(key)) {
      throw new HcmClientException(
        HcmClientErrorCode.INVALID_DIMENSIONS,
        'Unknown employee/location in HCM',
        { employeeId: body.employeeId, locationId: body.locationId },
      );
    }
    const row = this.balances.get(key);
    if (row.availableDays < body.requestedDays) {
      throw new HcmClientException(
        HcmClientErrorCode.INSUFFICIENT_BALANCE,
        'Insufficient balance to file time off',
        {
          employeeId: body.employeeId,
          locationId: body.locationId,
          requestedDays: body.requestedDays,
          availableDays: row.availableDays,
        },
      );
    }
    row.availableDays -= body.requestedDays;
    const transactionId = `hcm_txn_${randomUUID()}`;
    this.transactions.set(transactionId, {
      cancelled: false,
      employeeId: body.employeeId,
      locationId: body.locationId,
      days: body.requestedDays,
    });
    this.fileByIdempotency.set(body.idempotencyKey, {
      transactionId,
      employeeId: body.employeeId,
      locationId: body.locationId,
      requestedDays: body.requestedDays,
      externalRequestId: body.externalRequestId,
    });
    return { transactionId, idempotentReplay: false };
  }

  /**
   * @param {string} transactionId
   */
  cancelTimeOff(transactionId) {
    this._maybeFail();
    const txn = this.transactions.get(transactionId);
    if (!txn || txn.cancelled) {
      throw new HcmClientException(
        HcmClientErrorCode.UNKNOWN,
        'Transaction not found or already cancelled',
        { transactionId },
      );
    }
    txn.cancelled = true;
    const key = balanceKey(txn.employeeId, txn.locationId);
    if (this.balances.has(key)) {
      this.balances.get(key).availableDays += txn.days;
    }
    return { ok: true };
  }

  /**
   * @param {{ enabled: boolean; mode: string }} body
   */
  setFailureMode(body) {
    this.failureMode = { enabled: body.enabled, mode: body.mode };
    return this.failureMode;
  }

  resetForTests() {
    this.balances.clear();
    this.fileByIdempotency.clear();
    this.transactions.clear();
    this.failureMode = { enabled: false, mode: HcmFailureMode.DOWN };
  }
}
export { MockHcmService };
