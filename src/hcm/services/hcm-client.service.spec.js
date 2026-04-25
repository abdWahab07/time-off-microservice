import 'reflect-metadata';
import { HcmClientService } from './hcm-client.service';
import { HcmClientException } from '../hcm-error.mapper';
import { HcmClientErrorCode } from '../hcm.types';

function configMap(map) {
  return { get: (k) => map[k] };
}

describe('HcmClientService', () => {
  const mockHcm = {
    getBalance: jest.fn().mockResolvedValue({ availableDays: 7 }),
    fileTimeOff: jest.fn().mockResolvedValue({ transactionId: 't1' }),
    cancelTimeOff: jest.fn().mockResolvedValue({ ok: true }),
  };

  let originalFetch;

  beforeEach(() => {
    jest.clearAllMocks();
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('getBalance delegates to MockHcmService when HCM_BASE_URL unset', async () => {
    const config = configMap({});
    const svc = new HcmClientService(config, mockHcm);
    const out = await svc.getBalance('e', 'l');
    expect(mockHcm.getBalance).toHaveBeenCalledWith('e', 'l');
    expect(out).toEqual({ availableDays: 7 });
  });

  it('getBalance uses fetch when HCM_BASE_URL is set', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify({ availableDays: 3 }),
    });
    const config = configMap({
      HCM_BASE_URL: 'http://hcm.test',
      HCM_TIMEOUT_MS: '5000',
    });
    const svc = new HcmClientService(config, mockHcm);
    const out = await svc.getBalance('e%2F1', 'l');
    expect(mockHcm.getBalance).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalled();
    const call = /** @type {any} */ (global.fetch).mock.calls[0];
    expect(call[0]).toContain('/mock-hcm/balances/e%252F1/');
    expect(out.availableDays).toBe(3);
  });

  it('maps non-OK JSON body with known error code', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 409,
      statusText: 'Conflict',
      text: async () =>
        JSON.stringify({
          error: {
            code: HcmClientErrorCode.INSUFFICIENT_BALANCE,
            message: 'not enough',
            details: { a: 1 },
          },
        }),
    });
    const svc = new HcmClientService(
      configMap({ HCM_BASE_URL: 'http://hcm' }),
      mockHcm,
    );
    await expect(svc.getBalance('e', 'l')).rejects.toMatchObject({
      code: HcmClientErrorCode.INSUFFICIENT_BALANCE,
      message: 'not enough',
    });
  });

  it('uses UNKNOWN when error code is not a known HcmClientErrorCode', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      text: async () =>
        JSON.stringify({
          error: { code: 'WEIRD', message: 'msg' },
        }),
    });
    const svc = new HcmClientService(
      configMap({ HCM_BASE_URL: 'http://hcm' }),
      mockHcm,
    );
    try {
      await svc.getBalance('e', 'l');
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(HcmClientException);
      expect(e.code).toBe(HcmClientErrorCode.UNKNOWN);
    }
  });

  it('non-OK with non-JSON text still throws HcmClientException', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      text: async () => 'not json',
    });
    const svc = new HcmClientService(
      configMap({ HCM_BASE_URL: 'http://hcm' }),
      mockHcm,
    );
    try {
      await svc.getBalance('e', 'l');
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(HcmClientException);
      expect(e.code).toBe(HcmClientErrorCode.UNKNOWN);
      expect(String(e.message)).toContain('not json');
    }
  });

  it('maps AbortError to HCM_UNAVAILABLE timeout', async () => {
    const abortErr = new Error('aborted');
    abortErr.name = 'AbortError';
    global.fetch = jest.fn().mockRejectedValue(abortErr);
    const svc = new HcmClientService(
      configMap({ HCM_BASE_URL: 'http://hcm' }),
      mockHcm,
    );
    try {
      await svc.getBalance('e', 'l');
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(HcmClientException);
      expect(e.code).toBe(HcmClientErrorCode.HCM_UNAVAILABLE);
      expect(e.message).toMatch(/timed out/i);
    }
  });

  it('maps generic fetch failure to HCM_UNAVAILABLE', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const svc = new HcmClientService(
      configMap({ HCM_BASE_URL: 'http://hcm' }),
      mockHcm,
    );
    try {
      await svc.getBalance('e', 'l');
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(HcmClientException);
      expect(e.code).toBe(HcmClientErrorCode.HCM_UNAVAILABLE);
      expect(e.message).toMatch(/ECONNREFUSED/);
    }
  });

  it('sends X-Api-Key when HCM_API_KEY is set', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => '{}',
    });
    const svc = new HcmClientService(
      configMap({
        HCM_BASE_URL: 'http://hcm/',
        HCM_API_KEY: 'secret-key',
      }),
      mockHcm,
    );
    await svc.getBalance('e', 'l');
    const headers = /** @type {any} */ (global.fetch).mock.calls[0][1].headers;
    expect(headers['X-Api-Key']).toBe('secret-key');
  });

  it('fileTimeOff uses HTTP when base URL set', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ transactionId: 'hcm_txn_x' }),
    });
    const svc = new HcmClientService(
      configMap({ HCM_BASE_URL: 'http://hcm' }),
      mockHcm,
    );
    const payload = {
      employeeId: 'e',
      locationId: 'l',
      requestedDays: 1,
      externalRequestId: 'r1',
      idempotencyKey: 'k1',
    };
    const out = await svc.fileTimeOff(payload);
    expect(out.transactionId).toBe('hcm_txn_x');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://hcm/mock-hcm/time-off',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('cancelTimeOff uses HTTP when base URL set', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{"ok":true}',
    });
    const svc = new HcmClientService(
      configMap({ HCM_BASE_URL: 'http://hcm' }),
      mockHcm,
    );
    await svc.cancelTimeOff('txn%2F1');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://hcm/mock-hcm/time-off/txn%252F1/cancel',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('parses OK response with empty body as null', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 204,
      statusText: 'No Content',
      text: async () => '',
    });
    const svc = new HcmClientService(
      configMap({ HCM_BASE_URL: 'http://hcm' }),
      mockHcm,
    );
    const out = await svc.getBalance('e', 'l');
    expect(out).toBeNull();
  });

  it('OK response with invalid JSON text yields null json', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{',
    });
    const svc = new HcmClientService(
      configMap({ HCM_BASE_URL: 'http://hcm' }),
      mockHcm,
    );
    const out = await svc.getBalance('e', 'l');
    expect(out).toBeNull();
  });
});
