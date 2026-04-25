import { MockHcmService } from './mock-hcm.service';
import { HcmFailureMode } from '../hcm.types';
import { HcmClientException } from '../hcm-error.mapper';

describe('MockHcmService', () => {
  let svc;

  beforeEach(() => {
    svc = new MockHcmService();
    svc.seedBalance({
      employeeId: 'e',
      locationId: 'l',
      availableDays: 10,
    });
  });

  it('deducts balance on file and supports idempotent replay', () => {
    const r1 = svc.fileTimeOff({
      employeeId: 'e',
      locationId: 'l',
      requestedDays: 3,
      externalRequestId: 'req1',
      idempotencyKey: 'idem-1',
    });
    const r2 = svc.fileTimeOff({
      employeeId: 'e',
      locationId: 'l',
      requestedDays: 3,
      externalRequestId: 'req1',
      idempotencyKey: 'idem-1',
    });
    expect(r1.transactionId).toBe(r2.transactionId);
    expect(svc.getBalance('e', 'l').availableDays).toBe(7);
  });

  it('throws when balance insufficient', () => {
    expect(() =>
      svc.fileTimeOff({
        employeeId: 'e',
        locationId: 'l',
        requestedDays: 20,
        externalRequestId: 'req2',
        idempotencyKey: 'idem-2',
      }),
    ).toThrow(HcmClientException);
  });

  it('honors DOWN failure mode', () => {
    svc.setFailureMode({ enabled: true, mode: HcmFailureMode.DOWN });
    expect(() => svc.getBalance('e', 'l')).toThrow(HcmClientException);
  });

  it('cancelTimeOff restores HCM balance', () => {
    const { transactionId } = svc.fileTimeOff({
      employeeId: 'e',
      locationId: 'l',
      requestedDays: 4,
      externalRequestId: 'req-x',
      idempotencyKey: 'idem-cancel-1',
    });
    expect(svc.getBalance('e', 'l').availableDays).toBe(6);
    expect(svc.cancelTimeOff(transactionId)).toEqual({ ok: true });
    expect(svc.getBalance('e', 'l').availableDays).toBe(10);
  });

  it('cancelTimeOff throws when transaction is unknown', () => {
    expect(() => svc.cancelTimeOff('hcm_txn_missing')).toThrow(
      HcmClientException,
    );
  });

  it('cancelTimeOff throws when already cancelled', () => {
    const { transactionId } = svc.fileTimeOff({
      employeeId: 'e',
      locationId: 'l',
      requestedDays: 1,
      externalRequestId: 'req-y',
      idempotencyKey: 'idem-cancel-2',
    });
    svc.cancelTimeOff(transactionId);
    expect(() => svc.cancelTimeOff(transactionId)).toThrow(HcmClientException);
  });

  it('cancelTimeOff honors failure mode', () => {
    const { transactionId } = svc.fileTimeOff({
      employeeId: 'e',
      locationId: 'l',
      requestedDays: 1,
      externalRequestId: 'req-z',
      idempotencyKey: 'idem-cancel-3',
    });
    svc.setFailureMode({ enabled: true, mode: HcmFailureMode.DOWN });
    expect(() => svc.cancelTimeOff(transactionId)).toThrow(HcmClientException);
  });
});
