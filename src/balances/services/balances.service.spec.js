import 'reflect-metadata';
import { HttpException, HttpStatus } from '@nestjs/common';
import { BalancesService } from './balances.service';
import { HcmClientException } from '../../hcm/hcm-error.mapper';
import { HcmClientErrorCode } from '../../hcm/hcm.types';

/** @param {() => Promise<unknown> | unknown} fn */
async function expectApiError(fn, status, code) {
  await expect(fn()).rejects.toThrow(HttpException);
  try {
    await fn();
  } catch (e) {
    expect(e).toBeInstanceOf(HttpException);
    expect(e.getStatus()).toBe(status);
    const body = /** @type {{ error: { code: string } }} */ (e.getResponse());
    expect(body.error.code).toBe(code);
  }
}

describe('BalancesService', () => {
  it('displayAvailable returns 0 for missing balance', () => {
    const svc = new BalancesService(
      { findByEmployeeLocation: jest.fn() },
      { getBalance: jest.fn() },
      { log: jest.fn() },
    );
    expect(svc.displayAvailable(null)).toBe(0);
    expect(svc.displayAvailable(undefined)).toBe(0);
  });

  it('displayAvailable floors negative display to 0', () => {
    const svc = new BalancesService(
      { findByEmployeeLocation: jest.fn() },
      { getBalance: jest.fn() },
      { log: jest.fn() },
    );
    expect(
      svc.displayAvailable({
        hcmAvailableDays: 2,
        reservedDays: 5,
      }),
    ).toBe(0);
  });

  it('getBalance without refresh returns local row', async () => {
    const local = {
      hcmAvailableDays: 10,
      reservedDays: 2,
      lastSyncedAt: '2026-01-01T00:00:00.000Z',
      syncSource: 'BATCH',
    };
    const repo = {
      findByEmployeeLocation: jest.fn().mockReturnValue(local),
      upsertHcmOnly: jest.fn(),
    };
    const hcm = { getBalance: jest.fn() };
    const audit = { log: jest.fn() };
    const svc = new BalancesService(repo, hcm, audit);

    const out = await svc.getBalance('e1', 'l1', {});
    expect(out.displayAvailableDays).toBe(8);
    expect(out.isStale).toBe(false);
    expect(hcm.getBalance).not.toHaveBeenCalled();
  });

  it('getBalance with refresh updates from HCM and audits', async () => {
    const repo = {
      findByEmployeeLocation: jest.fn().mockReturnValueOnce(null),
      upsertHcmOnly: jest.fn().mockReturnValue({
        hcmAvailableDays: 12,
        reservedDays: 0,
        lastSyncedAt: 't',
        syncSource: 'REALTIME',
      }),
    };
    const hcm = {
      getBalance: jest.fn().mockResolvedValue({ availableDays: 12 }),
    };
    const audit = { log: jest.fn() };
    const svc = new BalancesService(repo, hcm, audit);

    const out = await svc.getBalance('e1', 'l1', { refresh: true });
    expect(out.hcmAvailableDays).toBe(12);
    expect(hcm.getBalance).toHaveBeenCalledWith('e1', 'l1');
    expect(audit.log).toHaveBeenCalledWith(
      'BALANCE',
      'e1:l1',
      'BALANCE_REFRESHED',
      expect.objectContaining({ employeeId: 'e1', locationId: 'l1' }),
    );
  });

  it('getBalance refresh accepts refresh as string "true"', async () => {
    const repo = {
      findByEmployeeLocation: jest.fn().mockReturnValue({
        hcmAvailableDays: 5,
        reservedDays: 0,
        lastSyncedAt: 'old',
        syncSource: 'BATCH',
      }),
      upsertHcmOnly: jest.fn().mockReturnValue({
        hcmAvailableDays: 9,
        reservedDays: 0,
        lastSyncedAt: 'new',
        syncSource: 'REALTIME',
      }),
    };
    const hcm = {
      getBalance: jest.fn().mockResolvedValue({ availableDays: 9 }),
    };
    const svc = new BalancesService(repo, hcm, { log: jest.fn() });
    await svc.getBalance('e1', 'l1', { refresh: 'true' });
    expect(hcm.getBalance).toHaveBeenCalled();
  });

  it('getBalance refresh throws INVALID_DIMENSIONS', async () => {
    const repo = { findByEmployeeLocation: jest.fn(), upsertHcmOnly: jest.fn() };
    const hcm = {
      getBalance: jest.fn().mockRejectedValue(
        new HcmClientException(
          HcmClientErrorCode.INVALID_DIMENSIONS,
          'bad',
          { x: 1 },
        ),
      ),
    };
    const svc = new BalancesService(repo, hcm, { log: jest.fn() });
    await expectApiError(
      () => svc.getBalance('e1', 'l1', { refresh: true }),
      HttpStatus.UNPROCESSABLE_ENTITY,
      'INVALID_DIMENSIONS',
    );
  });

  it('getBalance refresh HCM_UNAVAILABLE with no cache throws', async () => {
    const repo = {
      findByEmployeeLocation: jest.fn().mockReturnValue(null),
      upsertHcmOnly: jest.fn(),
    };
    const hcm = {
      getBalance: jest.fn().mockRejectedValue(
        new HcmClientException(
          HcmClientErrorCode.HCM_UNAVAILABLE,
          'down',
        ),
      ),
    };
    const svc = new BalancesService(repo, hcm, { log: jest.fn() });
    await expectApiError(
      () => svc.getBalance('e1', 'l1', { refresh: true }),
      HttpStatus.SERVICE_UNAVAILABLE,
      'HCM_UNAVAILABLE',
    );
  });

  it('getBalance refresh HCM_UNAVAILABLE with cache marks stale', async () => {
    const cached = {
      hcmAvailableDays: 4,
      reservedDays: 1,
      lastSyncedAt: 'old',
      syncSource: 'BATCH',
    };
    const repo = {
      findByEmployeeLocation: jest.fn().mockReturnValue(cached),
      upsertHcmOnly: jest.fn(),
    };
    const hcm = {
      getBalance: jest.fn().mockRejectedValue(
        new HcmClientException(
          HcmClientErrorCode.HCM_UNAVAILABLE,
          'down',
        ),
      ),
    };
    const svc = new BalancesService(repo, hcm, { log: jest.fn() });
    const out = await svc.getBalance('e1', 'l1', { refresh: true });
    expect(out.isStale).toBe(true);
    expect(out.displayAvailableDays).toBe(3);
  });

  it('getBalance refresh rethrows non-HcmClientException', async () => {
    const repo = {
      findByEmployeeLocation: jest.fn().mockReturnValue(null),
      upsertHcmOnly: jest.fn(),
    };
    const hcm = { getBalance: jest.fn().mockRejectedValue(new Error('boom')) };
    const svc = new BalancesService(repo, hcm, { log: jest.fn() });
    await expect(svc.getBalance('e1', 'l1', { refresh: true })).rejects.toThrow(
      'boom',
    );
  });

  it('getBalance refresh propagates unknown HcmClientException code', async () => {
    const repo = {
      findByEmployeeLocation: jest.fn().mockReturnValue({
        hcmAvailableDays: 1,
        reservedDays: 0,
        lastSyncedAt: 't',
        syncSource: 'BATCH',
      }),
      upsertHcmOnly: jest.fn(),
    };
    const hcm = {
      getBalance: jest.fn().mockRejectedValue(
        new HcmClientException(HcmClientErrorCode.UNKNOWN, 'weird'),
      ),
    };
    const svc = new BalancesService(repo, hcm, { log: jest.fn() });
    await expect(svc.getBalance('e1', 'l1', { refresh: true })).rejects.toThrow(
      HcmClientException,
    );
  });

  it('getBalance throws when no local row after non-refresh path', async () => {
    const repo = { findByEmployeeLocation: jest.fn().mockReturnValue(null) };
    const svc = new BalancesService(repo, { getBalance: jest.fn() }, { log: jest.fn() });
    await expectApiError(
      () => svc.getBalance('e1', 'l1', {}),
      HttpStatus.NOT_FOUND,
      'BALANCE_NOT_FOUND',
    );
  });
});
