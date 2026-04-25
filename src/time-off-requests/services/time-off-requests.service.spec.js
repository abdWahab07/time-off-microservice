import 'reflect-metadata';
import { HttpException, HttpStatus } from '@nestjs/common';
import { TimeOffRequestsService } from './time-off-requests.service';
import { RequestStatus } from '../state/time-off-state-machine';
import { HcmClientException } from '../../hcm/hcm-error.mapper';
import { HcmClientErrorCode } from '../../hcm/hcm.types';

function trxDb() {
  return {
    transaction: jest.fn((fn) => () => fn()),
  };
}

function basePendingRequest(overrides = {}) {
  return {
    id: 'req_test_1',
    employeeId: 'emp_a',
    locationId: 'loc_a',
    requestedDays: 2,
    status: RequestStatus.PENDING,
    managerId: null,
    hcmTransactionId: null,
    ...overrides,
  };
}

function expectApiError(fn, status, code) {
  try {
    fn();
    throw new Error('expected throw');
  } catch (e) {
    expect(e).toBeInstanceOf(HttpException);
    expect(e.getStatus()).toBe(status);
    const body = e.getResponse();
    expect(body.error.code).toBe(code);
  }
}

function validCreate(overrides = {}) {
  return {
    employeeId: 'e_se',
    locationId: 'l_se',
    startDate: '2026-06-01',
    endDate: '2026-06-10',
    requestedDays: 2,
    idempotencyKey: 'idem-c-1',
    ...overrides,
  };
}

function serviceWithMocks(overrides = {}) {
  const db = trxDb();
  const requestsRepo = {
    findById: jest.fn(),
    findByIdempotency: jest.fn().mockReturnValue(null),
    findOverlappingActive: jest.fn().mockReturnValue([]),
    insert: jest.fn(),
    update: jest.fn(),
    ...overrides.requestsRepo,
  };
  const reservationsRepo = {
    insertActive: jest.fn(),
    findByRequestId: jest.fn(),
    updateStatus: jest.fn(),
    ...overrides.reservationsRepo,
  };
  const balancesRepo = {
    adjustReservedDays: jest.fn(),
    upsertHcmOnly: jest.fn(),
    findByEmployeeLocation: jest.fn(),
    ...overrides.balancesRepo,
  };
  const hcmOpsRepo = {
    findByIdempotencyKey: jest.fn(),
    insertStarted: jest.fn(() => 'op_1'),
    markSuccess: jest.fn(),
    markFailed: jest.fn(),
    ...overrides.hcmOpsRepo,
  };
  const hcm = {
    getBalance: jest.fn(),
    fileTimeOff: jest.fn(),
    cancelTimeOff: jest.fn(),
    ...overrides.hcm,
  };
  const audit = { log: jest.fn(), ...overrides.audit };
  const service = new TimeOffRequestsService(
    db,
    requestsRepo,
    reservationsRepo,
    balancesRepo,
    hcmOpsRepo,
    hcm,
    audit,
  );
  return {
    service,
    db,
    requestsRepo,
    reservationsRepo,
    balancesRepo,
    hcmOpsRepo,
    hcm,
    audit,
  };
}

describe('TimeOffRequestsService.approve', () => {
  let db;
  let requestsRepo;
  let reservationsRepo;
  let balancesRepo;
  let hcmOpsRepo;
  let hcm;
  let audit;
  let service;

  beforeEach(() => {
    db = trxDb();
    requestsRepo = {
      findById: jest.fn(),
      update: jest.fn(),
    };
    reservationsRepo = { updateStatus: jest.fn() };
    balancesRepo = {
      adjustReservedDays: jest.fn(),
      upsertHcmOnly: jest.fn(),
    };
    hcmOpsRepo = {
      findByIdempotencyKey: jest.fn(),
      insertStarted: jest.fn(() => 'op_1'),
      markSuccess: jest.fn(),
      markFailed: jest.fn(),
    };
    hcm = {
      getBalance: jest.fn(),
      fileTimeOff: jest.fn(),
    };
    audit = { log: jest.fn() };
    service = new TimeOffRequestsService(
      db,
      requestsRepo,
      reservationsRepo,
      balancesRepo,
      hcmOpsRepo,
      hcm,
      audit,
    );
  });

  it('throws NOT_FOUND when request missing', () => {
    requestsRepo.findById.mockReturnValue(null);
    expectApiError(
      () => service.approve('missing', { managerId: 'mgr' }),
      HttpStatus.NOT_FOUND,
      'REQUEST_NOT_FOUND',
    );
  });

  it('returns immediately when already APPROVED', () => {
    const row = basePendingRequest({
      status: RequestStatus.APPROVED,
      managerId: 'm0',
      hcmTransactionId: 'hcm_txn_old',
    });
    requestsRepo.findById.mockReturnValue(row);
    const out = service.approve('req_test_1', { managerId: 'mgr' });
    expect(out).toEqual({
      id: 'req_test_1',
      status: RequestStatus.APPROVED,
      managerId: 'm0',
      hcmTransactionId: 'hcm_txn_old',
    });
    expect(hcm.getBalance).not.toHaveBeenCalled();
  });

  it('throws INVALID_STATE_TRANSITION when not pending or needs-review', () => {
    requestsRepo.findById.mockReturnValue(
      basePendingRequest({ status: RequestStatus.REJECTED }),
    );
    expectApiError(
      () => service.approve('req_test_1', { managerId: 'mgr' }),
      HttpStatus.CONFLICT,
      'INVALID_STATE_TRANSITION',
    );
  });

  it('returns when prior HCM op already SUCCESS (idempotent)', () => {
    requestsRepo.findById
      .mockReturnValueOnce(
        basePendingRequest({ status: RequestStatus.NEEDS_REVIEW }),
      )
      .mockReturnValueOnce({
        id: 'req_test_1',
        status: RequestStatus.APPROVED,
        managerId: 'mgr_done',
        hcmTransactionId: 'hcm_done',
      });
    hcmOpsRepo.findByIdempotencyKey.mockReturnValue({
      status: 'SUCCESS',
      idempotencyKey: 'hcm-file-req_test_1',
    });
    const out = service.approve('req_test_1', { managerId: 'mgr' });
    expect(out.hcmTransactionId).toBe('hcm_done');
    expect(hcm.getBalance).not.toHaveBeenCalled();
  });

  it('throws HCM_UNAVAILABLE when getBalance throws HcmClientException', () => {
    requestsRepo.findById.mockReturnValue(basePendingRequest());
    hcmOpsRepo.findByIdempotencyKey.mockReturnValue(null);
    hcm.getBalance.mockImplementation(() => {
      throw new HcmClientException(
        HcmClientErrorCode.HCM_UNAVAILABLE,
        'down',
      );
    });
    expectApiError(
      () => service.approve('req_test_1', { managerId: 'mgr' }),
      HttpStatus.SERVICE_UNAVAILABLE,
      'HCM_UNAVAILABLE',
    );
  });

  it('rethrows non-HcmClientException from getBalance', () => {
    requestsRepo.findById.mockReturnValue(basePendingRequest());
    hcmOpsRepo.findByIdempotencyKey.mockReturnValue(null);
    hcm.getBalance.mockImplementation(() => {
      throw new Error('network');
    });
    expect(() =>
      service.approve('req_test_1', { managerId: 'mgr' }),
    ).toThrow('network');
  });

  it('throws INSUFFICIENT_BALANCE when HCM balance below requested before file', () => {
    requestsRepo.findById.mockReturnValue(basePendingRequest());
    hcmOpsRepo.findByIdempotencyKey.mockReturnValue(null);
    hcm.getBalance.mockReturnValue({ availableDays: 1 });
    expectApiError(
      () => service.approve('req_test_1', { managerId: 'mgr' }),
      HttpStatus.CONFLICT,
      'INSUFFICIENT_BALANCE',
    );
    expect(hcmOpsRepo.insertStarted).not.toHaveBeenCalled();
  });

  it('completes happy path', () => {
    requestsRepo.findById
      .mockReturnValueOnce(basePendingRequest())
      .mockReturnValueOnce({
        id: 'req_test_1',
        status: RequestStatus.APPROVED,
        managerId: 'mgr',
        hcmTransactionId: 'hcm_txn_new',
      });
    hcmOpsRepo.findByIdempotencyKey.mockReturnValue(null);
    hcm.getBalance
      .mockReturnValueOnce({ availableDays: 5 })
      .mockReturnValueOnce({ availableDays: 3 });
    hcm.fileTimeOff.mockReturnValue({ transactionId: 'hcm_txn_new' });

    const out = service.approve('req_test_1', { managerId: 'mgr' });

    expect(out.status).toBe(RequestStatus.APPROVED);
    expect(out.hcmTransactionId).toBe('hcm_txn_new');
    expect(hcmOpsRepo.markSuccess).toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalled();
  });

  it('on file INSUFFICIENT_BALANCE marks failed and sets HCM_REJECTED', () => {
    requestsRepo.findById.mockReturnValue(basePendingRequest());
    hcmOpsRepo.findByIdempotencyKey.mockReturnValue(null);
    hcm.getBalance.mockReturnValue({ availableDays: 10 });
    hcm.fileTimeOff.mockImplementation(() => {
      throw new HcmClientException(
        HcmClientErrorCode.INSUFFICIENT_BALANCE,
        'not enough',
        { x: 1 },
      );
    });

    expectApiError(
      () => service.approve('req_test_1', { managerId: 'mgr' }),
      HttpStatus.CONFLICT,
      'INSUFFICIENT_BALANCE',
    );
    expect(hcmOpsRepo.markFailed).toHaveBeenCalledWith(
      'op_1',
      expect.objectContaining({ status: 'FAILED' }),
    );
    expect(requestsRepo.update).toHaveBeenCalled();
  });

  it('on file INVALID_DIMENSIONS returns 422 and releases reservation', () => {
    requestsRepo.findById.mockReturnValue(basePendingRequest());
    hcmOpsRepo.findByIdempotencyKey.mockReturnValue(null);
    hcm.getBalance.mockReturnValue({ availableDays: 10 });
    hcm.fileTimeOff.mockImplementation(() => {
      throw new HcmClientException(
        HcmClientErrorCode.INVALID_DIMENSIONS,
        'bad dims',
      );
    });

    expectApiError(
      () => service.approve('req_test_1', { managerId: 'mgr' }),
      HttpStatus.UNPROCESSABLE_ENTITY,
      'INVALID_DIMENSIONS',
    );
    expect(hcmOpsRepo.markFailed).toHaveBeenCalledWith(
      'op_1',
      expect.objectContaining({ status: 'FAILED' }),
    );
  });

  it('on file other HcmClientException marks RETRYABLE_FAILED and 503', () => {
    requestsRepo.findById.mockReturnValue(basePendingRequest());
    hcmOpsRepo.findByIdempotencyKey.mockReturnValue(null);
    hcm.getBalance.mockReturnValue({ availableDays: 10 });
    hcm.fileTimeOff.mockImplementation(() => {
      throw new HcmClientException(
        HcmClientErrorCode.HCM_UNAVAILABLE,
        'timeout',
      );
    });

    expectApiError(
      () => service.approve('req_test_1', { managerId: 'mgr' }),
      HttpStatus.SERVICE_UNAVAILABLE,
      'HCM_UNAVAILABLE',
    );
    expect(hcmOpsRepo.markFailed).toHaveBeenCalledWith(
      'op_1',
      expect.objectContaining({ status: 'RETRYABLE_FAILED' }),
    );
  });

  it('on file non-Hcm error marks UNKNOWN and rethrows', () => {
    requestsRepo.findById.mockReturnValue(basePendingRequest());
    hcmOpsRepo.findByIdempotencyKey.mockReturnValue(null);
    hcm.getBalance.mockReturnValue({ availableDays: 10 });
    hcm.fileTimeOff.mockImplementation(() => {
      throw new Error('bug');
    });

    expect(() =>
      service.approve('req_test_1', { managerId: 'mgr' }),
    ).toThrow('bug');
    expect(hcmOpsRepo.markFailed).toHaveBeenCalledWith(
      'op_1',
      expect.objectContaining({
        status: 'FAILED',
        errorCode: 'UNKNOWN',
      }),
    );
  });
});

describe('TimeOffRequestsService.create', () => {
  it('idempotent replay uses requestedDays when no reservation row', () => {
    const { service, requestsRepo, reservationsRepo } = serviceWithMocks();
    requestsRepo.findByIdempotency.mockReturnValue({
      id: 'req_old',
      employeeId: 'e_se',
      locationId: 'l_se',
      startDate: '2026-06-01',
      endDate: '2026-06-02',
      requestedDays: 3,
      status: RequestStatus.PENDING,
    });
    reservationsRepo.findByRequestId.mockReturnValue(null);
    const out = service.create(validCreate({ idempotencyKey: 'idem-x' }));
    expect(out.idempotentReplay).toBe(true);
    expect(out.payload.reservedDays).toBe(3);
  });

  it('idempotent replay uses reservation reservedDays when present', () => {
    const { service, requestsRepo, reservationsRepo } = serviceWithMocks();
    requestsRepo.findByIdempotency.mockReturnValue({
      id: 'req_old',
      employeeId: 'e_se',
      locationId: 'l_se',
      startDate: '2026-06-01',
      endDate: '2026-06-02',
      requestedDays: 3,
      status: RequestStatus.PENDING,
    });
    reservationsRepo.findByRequestId.mockReturnValue({ reservedDays: 7 });
    const out = service.create(validCreate({ idempotencyKey: 'idem-x' }));
    expect(out.idempotentReplay).toBe(true);
    expect(out.payload.reservedDays).toBe(7);
  });

  it('throws DUPLICATE_ACTIVE_REQUEST on overlap', () => {
    const { service, requestsRepo } = serviceWithMocks();
    requestsRepo.findByIdempotency.mockReturnValue(null);
    requestsRepo.findOverlappingActive.mockReturnValue([{ id: 'other' }]);
    expectApiError(
      () => service.create(validCreate()),
      HttpStatus.CONFLICT,
      'DUPLICATE_ACTIVE_REQUEST',
    );
  });

  it('maps INVALID_DIMENSIONS from HCM on create', () => {
    const { service, requestsRepo, hcm } = serviceWithMocks();
    requestsRepo.findByIdempotency.mockReturnValue(null);
    requestsRepo.findOverlappingActive.mockReturnValue([]);
    hcm.getBalance.mockImplementation(() => {
      throw new HcmClientException(
        HcmClientErrorCode.INVALID_DIMENSIONS,
        'unknown',
        { employeeId: 'x' },
      );
    });
    expectApiError(
      () => service.create(validCreate()),
      HttpStatus.UNPROCESSABLE_ENTITY,
      'INVALID_DIMENSIONS',
    );
  });

  it('maps HCM_UNAVAILABLE from HCM on create', () => {
    const { service, requestsRepo, hcm } = serviceWithMocks();
    requestsRepo.findByIdempotency.mockReturnValue(null);
    requestsRepo.findOverlappingActive.mockReturnValue([]);
    hcm.getBalance.mockImplementation(() => {
      throw new HcmClientException(
        HcmClientErrorCode.HCM_UNAVAILABLE,
        'down',
      );
    });
    expectApiError(
      () => service.create(validCreate()),
      HttpStatus.SERVICE_UNAVAILABLE,
      'HCM_UNAVAILABLE',
    );
  });

  it('maps other HcmClientException on create to HCM_UNAVAILABLE', () => {
    const { service, requestsRepo, hcm } = serviceWithMocks();
    requestsRepo.findByIdempotency.mockReturnValue(null);
    requestsRepo.findOverlappingActive.mockReturnValue([]);
    hcm.getBalance.mockImplementation(() => {
      throw new HcmClientException(
        HcmClientErrorCode.INSUFFICIENT_BALANCE,
        'pre-check',
      );
    });
    expectApiError(
      () => service.create(validCreate()),
      HttpStatus.SERVICE_UNAVAILABLE,
      'HCM_UNAVAILABLE',
    );
  });

  it('rethrows non-HcmClientException from getBalance on create', () => {
    const { service, requestsRepo, hcm } = serviceWithMocks();
    requestsRepo.findByIdempotency.mockReturnValue(null);
    requestsRepo.findOverlappingActive.mockReturnValue([]);
    hcm.getBalance.mockImplementation(() => {
      throw new Error('tcp reset');
    });
    expect(() => service.create(validCreate())).toThrow('tcp reset');
  });

  it('throws INSUFFICIENT_BALANCE inside transaction when display available is 0', () => {
    const { service, requestsRepo, hcm, balancesRepo } = serviceWithMocks();
    requestsRepo.findByIdempotency.mockReturnValue(null);
    requestsRepo.findOverlappingActive.mockReturnValue([]);
    hcm.getBalance.mockReturnValue({ availableDays: 5 });
    balancesRepo.findByEmployeeLocation.mockReturnValue(null);
    expectApiError(
      () => service.create(validCreate({ requestedDays: 1 })),
      HttpStatus.CONFLICT,
      'INSUFFICIENT_BALANCE',
    );
  });

  it('creates request on happy path', () => {
    const { service, requestsRepo, hcm, balancesRepo, reservationsRepo, audit } =
      serviceWithMocks();
    requestsRepo.findByIdempotency.mockReturnValue(null);
    requestsRepo.findOverlappingActive.mockReturnValue([]);
    hcm.getBalance.mockReturnValue({ availableDays: 10 });
    balancesRepo.findByEmployeeLocation.mockReturnValue({
      hcmAvailableDays: 10,
      reservedDays: 0,
    });
    requestsRepo.insert.mockReturnValue({
      id: 'req_new',
      employeeId: 'e_se',
      locationId: 'l_se',
      startDate: '2026-06-01',
      endDate: '2026-06-10',
      requestedDays: 2,
      status: RequestStatus.PENDING,
    });
    const out = service.create(validCreate());
    expect(out.idempotentReplay).toBe(false);
    expect(out.payload.id).toBe('req_new');
    expect(reservationsRepo.insertActive).toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalled();
  });
});

describe('TimeOffRequestsService.getById', () => {
  it('throws when missing', () => {
    const { service, requestsRepo } = serviceWithMocks();
    requestsRepo.findById.mockReturnValue(null);
    expectApiError(
      () => service.getById('x'),
      HttpStatus.NOT_FOUND,
      'REQUEST_NOT_FOUND',
    );
  });

  it('returns row', () => {
    const { service, requestsRepo } = serviceWithMocks();
    const row = { id: '1', status: RequestStatus.PENDING };
    requestsRepo.findById.mockReturnValue(row);
    expect(service.getById('1')).toBe(row);
  });
});

describe('TimeOffRequestsService.cancel', () => {
  it('throws when request missing', () => {
    const { service, requestsRepo } = serviceWithMocks();
    requestsRepo.findById.mockReturnValue(null);
    expectApiError(
      () => service.cancel('id', { cancelledBy: 'u' }),
      HttpStatus.NOT_FOUND,
      'REQUEST_NOT_FOUND',
    );
  });

  it('returns idempotent payload when already cancelled', () => {
    const { service, requestsRepo } = serviceWithMocks();
    requestsRepo.findById.mockReturnValue({
      id: 'c1',
      status: RequestStatus.CANCELLED,
    });
    expect(service.cancel('c1', { cancelledBy: 'u' })).toEqual({
      id: 'c1',
      status: RequestStatus.CANCELLED,
    });
  });

  it('cancels PENDING and runs transaction', () => {
    const { service, requestsRepo, reservationsRepo, balancesRepo, audit } =
      serviceWithMocks();
    requestsRepo.findById.mockReturnValue(
      basePendingRequest({ id: 'pc1', employeeId: 'e', locationId: 'l' }),
    );
    const out = service.cancel('pc1', { cancelledBy: 'emp' });
    expect(out.status).toBe(RequestStatus.CANCELLED);
    expect(reservationsRepo.updateStatus).toHaveBeenCalledWith(
      'pc1',
      'RELEASED',
      expect.any(String),
    );
    expect(balancesRepo.adjustReservedDays).toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalled();
  });

  it('cancels NEEDS_REVIEW same as pending path', () => {
    const { service, requestsRepo, reservationsRepo } = serviceWithMocks();
    requestsRepo.findById.mockReturnValue(
      basePendingRequest({
        id: 'nr1',
        status: RequestStatus.NEEDS_REVIEW,
      }),
    );
    service.cancel('nr1', { cancelledBy: 'emp' });
    expect(reservationsRepo.updateStatus).toHaveBeenCalled();
  });

  it('throws when APPROVED but missing hcmTransactionId', () => {
    const { service, requestsRepo } = serviceWithMocks();
    requestsRepo.findById.mockReturnValue({
      id: 'a1',
      employeeId: 'e',
      locationId: 'l',
      requestedDays: 1,
      status: RequestStatus.APPROVED,
      hcmTransactionId: null,
    });
    expectApiError(
      () => service.cancel('a1', { cancelledBy: 'u' }),
      HttpStatus.CONFLICT,
      'INVALID_STATE_TRANSITION',
    );
  });

  it('cancels APPROVED after HCM cancel and refresh', () => {
    const { service, requestsRepo, hcm, balancesRepo, audit } =
      serviceWithMocks();
    requestsRepo.findById.mockReturnValue({
      id: 'a2',
      employeeId: 'e',
      locationId: 'l',
      requestedDays: 2,
      status: RequestStatus.APPROVED,
      hcmTransactionId: 'txn_1',
    });
    hcm.getBalance.mockReturnValue({ availableDays: 9 });
    const out = service.cancel('a2', { cancelledBy: 'u' });
    expect(out.status).toBe(RequestStatus.CANCELLED);
    expect(hcm.cancelTimeOff).toHaveBeenCalledWith('txn_1');
    expect(balancesRepo.upsertHcmOnly).toHaveBeenCalled();
    expect(requestsRepo.update).toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalled();
  });

  it('maps HcmClientException from cancelTimeOff to HCM_CANCEL_REJECTED', () => {
    const { service, requestsRepo, hcm } = serviceWithMocks();
    requestsRepo.findById.mockReturnValue({
      id: 'a3',
      employeeId: 'e',
      locationId: 'l',
      requestedDays: 1,
      status: RequestStatus.APPROVED,
      hcmTransactionId: 'txn_bad',
    });
    hcm.cancelTimeOff.mockImplementation(() => {
      throw new HcmClientException(
        HcmClientErrorCode.UNKNOWN,
        'already gone',
        { transactionId: 'txn_bad' },
      );
    });
    expectApiError(
      () => service.cancel('a3', { cancelledBy: 'u' }),
      HttpStatus.CONFLICT,
      'HCM_CANCEL_REJECTED',
    );
  });

  it('rethrows non-HcmClientException from cancelTimeOff', () => {
    const { service, requestsRepo, hcm } = serviceWithMocks();
    requestsRepo.findById.mockReturnValue({
      id: 'a4',
      employeeId: 'e',
      locationId: 'l',
      requestedDays: 1,
      status: RequestStatus.APPROVED,
      hcmTransactionId: 'txn_x',
    });
    hcm.cancelTimeOff.mockImplementation(() => {
      throw new Error('wire');
    });
    expect(() => service.cancel('a4', { cancelledBy: 'u' })).toThrow('wire');
  });

  it('throws when cancelling HCM_REJECTED', () => {
    const { service, requestsRepo } = serviceWithMocks();
    requestsRepo.findById.mockReturnValue({
      id: 'h1',
      employeeId: 'e',
      locationId: 'l',
      requestedDays: 1,
      status: RequestStatus.HCM_REJECTED,
    });
    expectApiError(
      () => service.cancel('h1', { cancelledBy: 'u' }),
      HttpStatus.CONFLICT,
      'INVALID_STATE_TRANSITION',
    );
  });
});
