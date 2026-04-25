import { Dependencies, HttpStatus, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DATABASE_CONNECTION } from '../../database/database.constants';
import { TimeOffRequestsRepository } from '../repositories/time-off-requests.repository';
import { ReservationsRepository } from '../repositories/reservations.repository';
import { HcmOperationsRepository } from '../repositories/hcm-operations.repository';
import { HcmClientService } from '../../hcm/services/hcm-client.service';
import { HcmClientException } from '../../hcm/hcm-error.mapper';
import { HcmClientErrorCode, HcmOperationType } from '../../hcm/hcm.types';
import { apiError } from '../../common/errors/api-error';
import { assertDateOrder } from '../../common/utils/dates';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateTimeOffRequestDto } from '../dto/create-time-off-request.dto';
import { ApproveRequestDto } from '../dto/approve-request.dto';
import { RejectRequestDto } from '../dto/reject-request.dto';
import { CancelRequestDto } from '../dto/cancel-request.dto';
import { BalancesRepository } from '../../balances/repositories/balances.repository';
import { AuditService } from '../../audit/services/audit.service';
import { canTransition, RequestStatus } from '../state/time-off-state-machine';

function displayAvailable(b) {
  if (!b) return 0;
  const raw = b.hcmAvailableDays - b.reservedDays;
  return raw < 0 ? 0 : raw;
}

function validatePlain(Class, plain) {
  const inst = plainToInstance(Class, plain ?? {}, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(inst, {
    whitelist: true,
    forbidUnknownValues: false,
  });
  if (errors.length) {
    const msg = errors
      .flatMap((e) => (e.constraints ? Object.values(e.constraints) : []))
      .join('; ');
    throw apiError(
      HttpStatus.BAD_REQUEST,
      'VALIDATION_ERROR',
      msg || 'Validation failed',
    );
  }
  return inst;
}

@Injectable()
@Dependencies(
  DATABASE_CONNECTION,
  TimeOffRequestsRepository,
  ReservationsRepository,
  BalancesRepository,
  HcmOperationsRepository,
  HcmClientService,
  AuditService,
)
class TimeOffRequestsService {
  constructor(
    db,
    requestsRepo,
    reservationsRepo,
    balancesRepo,
    hcmOpsRepo,
    hcm,
    audit,
  ) {
    this.db = db;
    this.requestsRepo = requestsRepo;
    this.reservationsRepo = reservationsRepo;
    this.balancesRepo = balancesRepo;
    this.hcmOpsRepo = hcmOpsRepo;
    this.hcm = hcm;
    this.audit = audit;
  }

  /**
   * @returns {Promise<{ idempotentReplay: boolean; payload: object }>}
   */
  async create(dto) {
    const p = validatePlain(CreateTimeOffRequestDto, dto);
    assertDateOrder(p.startDate, p.endDate);

    const existing = this.requestsRepo.findByIdempotency(
      p.employeeId,
      p.idempotencyKey,
    );
    if (existing) {
      const resv = this.reservationsRepo.findByRequestId(existing.id);
      return {
        idempotentReplay: true,
        payload: {
          id: existing.id,
          employeeId: existing.employeeId,
          locationId: existing.locationId,
          startDate: existing.startDate,
          endDate: existing.endDate,
          requestedDays: existing.requestedDays,
          status: existing.status,
          reservedDays: resv?.reservedDays ?? existing.requestedDays,
        },
      };
    }

    const overlaps = this.requestsRepo.findOverlappingActive(
      p.employeeId,
      p.locationId,
      p.startDate,
      p.endDate,
      null,
    );
    if (overlaps.length) {
      throw apiError(
        HttpStatus.CONFLICT,
        'DUPLICATE_ACTIVE_REQUEST',
        'An active request already overlaps this date range.',
        { conflictingRequestId: overlaps[0].id },
      );
    }

    let hcmBalance;
    try {
      hcmBalance = await this.hcm.getBalance(p.employeeId, p.locationId);
    } catch (e) {
      if (e instanceof HcmClientException) {
        if (e.code === HcmClientErrorCode.INVALID_DIMENSIONS) {
          throw apiError(
            HttpStatus.UNPROCESSABLE_ENTITY,
            'INVALID_DIMENSIONS',
            e.message,
            e.details ?? null,
          );
        }
        if (e.code === HcmClientErrorCode.HCM_UNAVAILABLE) {
          throw apiError(
            HttpStatus.SERVICE_UNAVAILABLE,
            'HCM_UNAVAILABLE',
            'Cannot safely verify balance with HCM.',
            { employeeId: p.employeeId, locationId: p.locationId },
          );
        }
        throw apiError(
          HttpStatus.SERVICE_UNAVAILABLE,
          'HCM_UNAVAILABLE',
          e.message,
          null,
        );
      }
      throw e;
    }

    const now = new Date().toISOString();
    const requestId = `req_${randomUUID()}`;

    const trx = this.db.transaction(
      () => {
        this.balancesRepo.upsertHcmOnly({
          employeeId: p.employeeId,
          locationId: p.locationId,
          hcmAvailableDays: hcmBalance.availableDays,
          lastSyncedAt: now,
          syncSource: 'REALTIME',
          now,
        });
        const bal = this.balancesRepo.findByEmployeeLocation(
          p.employeeId,
          p.locationId,
        );
        const avail = displayAvailable(bal);
        if (p.requestedDays > avail) {
          throw apiError(
            HttpStatus.CONFLICT,
            'INSUFFICIENT_BALANCE',
            'Employee does not have enough available balance for this request.',
            {
              employeeId: p.employeeId,
              locationId: p.locationId,
              requestedDays: p.requestedDays,
              availableDays: avail,
            },
          );
        }

        const created = this.requestsRepo.insert({
          id: requestId,
          employeeId: p.employeeId,
          locationId: p.locationId,
          startDate: p.startDate,
          endDate: p.endDate,
          requestedDays: p.requestedDays,
          reason: p.reason,
          status: RequestStatus.PENDING,
          idempotencyKey: p.idempotencyKey ?? null,
          now,
        });

        this.reservationsRepo.insertActive({
          requestId: created.id,
          employeeId: p.employeeId,
          locationId: p.locationId,
          reservedDays: p.requestedDays,
          now,
        });

        this.balancesRepo.adjustReservedDays(
          p.employeeId,
          p.locationId,
          p.requestedDays,
          now,
        );

        this.audit.log('TIME_OFF_REQUEST', created.id, 'REQUEST_CREATED', {
          employeeId: p.employeeId,
          locationId: p.locationId,
          requestedDays: p.requestedDays,
        });
        this.audit.log('TIME_OFF_REQUEST', created.id, 'BALANCE_RESERVED', {
          reservedDays: p.requestedDays,
        });

        return created;
      },
      { begin: 'IMMEDIATE' },
    );

    const created = trx();
    return {
      idempotentReplay: false,
      payload: {
        id: created.id,
        employeeId: created.employeeId,
        locationId: created.locationId,
        startDate: created.startDate,
        endDate: created.endDate,
        requestedDays: created.requestedDays,
        status: created.status,
        reservedDays: p.requestedDays,
      },
    };
  }

  getById(id) {
    const r = this.requestsRepo.findById(id);
    if (!r) {
      throw apiError(
        HttpStatus.NOT_FOUND,
        'REQUEST_NOT_FOUND',
        'Request does not exist.',
        { id },
      );
    }
    return r;
  }

  list(q) {
    return this.requestsRepo.list({
      employeeId: q.employeeId,
      locationId: q.locationId,
      status: q.status,
      managerId: q.managerId,
    });
  }

  async approve(id, body) {
    const b = validatePlain(ApproveRequestDto, body);
    const req = this.requestsRepo.findById(id);
    if (!req) {
      throw apiError(
        HttpStatus.NOT_FOUND,
        'REQUEST_NOT_FOUND',
        'Request does not exist.',
        { id },
      );
    }
    if (req.status === RequestStatus.APPROVED) {
      return {
        id: req.id,
        status: req.status,
        managerId: req.managerId,
        hcmTransactionId: req.hcmTransactionId,
      };
    }
    if (
      req.status !== RequestStatus.PENDING &&
      req.status !== RequestStatus.NEEDS_REVIEW
    ) {
      throw apiError(
        HttpStatus.CONFLICT,
        'INVALID_STATE_TRANSITION',
        'Request cannot be approved in its current state.',
        { status: req.status },
      );
    }

    const idempotencyKey = `hcm-file-${id}`;
    const prior = this.hcmOpsRepo.findByIdempotencyKey(idempotencyKey);
    if (prior && prior.status === 'SUCCESS') {
      const refreshed = this.requestsRepo.findById(id);
      return {
        id: refreshed.id,
        status: refreshed.status,
        managerId: refreshed.managerId,
        hcmTransactionId: refreshed.hcmTransactionId,
      };
    }

    let hcmBal;
    try {
      hcmBal = await this.hcm.getBalance(req.employeeId, req.locationId);
    } catch (e) {
      if (e instanceof HcmClientException) {
        throw apiError(
          HttpStatus.SERVICE_UNAVAILABLE,
          'HCM_UNAVAILABLE',
          'HCM cannot confirm approval.',
          { requestId: id },
        );
      }
      throw e;
    }
    if (hcmBal.availableDays < req.requestedDays) {
      throw apiError(
        HttpStatus.CONFLICT,
        'INSUFFICIENT_BALANCE',
        'HCM balance is insufficient for approval.',
        {
          employeeId: req.employeeId,
          locationId: req.locationId,
          requestedDays: req.requestedDays,
          availableDays: hcmBal.availableDays,
        },
      );
    }

    const opId = this.hcmOpsRepo.insertStarted({
      requestId: id,
      operationType: HcmOperationType.FILE_TIME_OFF,
      idempotencyKey,
      requestPayload: {
        employeeId: req.employeeId,
        locationId: req.locationId,
        requestedDays: req.requestedDays,
        externalRequestId: id,
      },
    });

    const now = new Date().toISOString();
    try {
      const filed = await this.hcm.fileTimeOff({
        employeeId: req.employeeId,
        locationId: req.locationId,
        requestedDays: req.requestedDays,
        externalRequestId: id,
        idempotencyKey,
      });

      const trx = this.db.transaction(
        () => {
          this.requestsRepo.update(id, {
            status: RequestStatus.APPROVED,
            managerId: b.managerId,
            hcmTransactionId: filed.transactionId,
            failureCode: null,
            failureReason: null,
          });
          this.reservationsRepo.updateStatus(id, 'CONSUMED', now);
          this.balancesRepo.adjustReservedDays(
            req.employeeId,
            req.locationId,
            -req.requestedDays,
            now,
          );
        },
        { begin: 'IMMEDIATE' },
      );
      trx();

      const latest = await this.hcm.getBalance(req.employeeId, req.locationId);
      const refreshedAt = new Date().toISOString();
      this.balancesRepo.upsertHcmOnly({
        employeeId: req.employeeId,
        locationId: req.locationId,
        hcmAvailableDays: latest.availableDays,
        lastSyncedAt: refreshedAt,
        syncSource: 'REALTIME',
        now: refreshedAt,
      });

      this.hcmOpsRepo.markSuccess(opId, {
        hcmTransactionId: filed.transactionId,
        responsePayload: filed,
        completedAt: now,
      });

      this.audit.log('TIME_OFF_REQUEST', id, 'REQUEST_APPROVED', {
        managerId: b.managerId,
        hcmTransactionId: filed.transactionId,
      });
      this.audit.log('TIME_OFF_REQUEST', id, 'RESERVATION_CONSUMED', {
        reservedDays: req.requestedDays,
      });

      const updated = this.requestsRepo.findById(id);
      return {
        id: updated.id,
        status: updated.status,
        managerId: updated.managerId,
        hcmTransactionId: updated.hcmTransactionId,
      };
    } catch (e) {
      const completedAt = new Date().toISOString();
      if (e instanceof HcmClientException) {
        if (e.code === HcmClientErrorCode.INSUFFICIENT_BALANCE) {
          this.hcmOpsRepo.markFailed(opId, {
            status: 'FAILED',
            errorCode: e.code,
            errorMessage: e.message,
            completedAt,
          });
          const trx2 = this.db.transaction(
            () => {
              this.requestsRepo.update(id, {
                status: RequestStatus.HCM_REJECTED,
                managerId: b.managerId,
                failureCode: e.code,
                failureReason: e.message,
              });
              this.reservationsRepo.updateStatus(id, 'RELEASED', completedAt);
              this.balancesRepo.adjustReservedDays(
                req.employeeId,
                req.locationId,
                -req.requestedDays,
                completedAt,
              );
            },
            { begin: 'IMMEDIATE' },
          );
          trx2();
          this.audit.log('TIME_OFF_REQUEST', id, 'HCM_REJECTED_REQUEST', {
            code: e.code,
          });
          throw apiError(
            HttpStatus.CONFLICT,
            'INSUFFICIENT_BALANCE',
            e.message,
            e.details ?? null,
          );
        }
        if (e.code === HcmClientErrorCode.INVALID_DIMENSIONS) {
          this.hcmOpsRepo.markFailed(opId, {
            status: 'FAILED',
            errorCode: e.code,
            errorMessage: e.message,
            completedAt,
          });
          const trx3 = this.db.transaction(
            () => {
              this.requestsRepo.update(id, {
                status: RequestStatus.HCM_REJECTED,
                managerId: b.managerId,
                failureCode: e.code,
                failureReason: e.message,
              });
              this.reservationsRepo.updateStatus(id, 'RELEASED', completedAt);
              this.balancesRepo.adjustReservedDays(
                req.employeeId,
                req.locationId,
                -req.requestedDays,
                completedAt,
              );
            },
            { begin: 'IMMEDIATE' },
          );
          trx3();
          this.audit.log('TIME_OFF_REQUEST', id, 'HCM_REJECTED_REQUEST', {
            code: e.code,
          });
          throw apiError(
            HttpStatus.UNPROCESSABLE_ENTITY,
            'INVALID_DIMENSIONS',
            e.message,
            e.details ?? null,
          );
        }
        this.hcmOpsRepo.markFailed(opId, {
          status: 'RETRYABLE_FAILED',
          errorCode: e.code,
          errorMessage: e.message,
          completedAt,
        });
        throw apiError(
          HttpStatus.SERVICE_UNAVAILABLE,
          'HCM_UNAVAILABLE',
          'HCM cannot confirm approval.',
          { requestId: id },
        );
      }
      this.hcmOpsRepo.markFailed(opId, {
        status: 'FAILED',
        errorCode: 'UNKNOWN',
        errorMessage: String(e?.message || e),
        completedAt,
      });
      throw e;
    }
  }

  reject(id, body) {
    const b = validatePlain(RejectRequestDto, body);
    const req = this.requestsRepo.findById(id);
    if (!req) {
      throw apiError(
        HttpStatus.NOT_FOUND,
        'REQUEST_NOT_FOUND',
        'Request does not exist.',
        { id },
      );
    }
    if (
      req.status !== RequestStatus.PENDING &&
      req.status !== RequestStatus.NEEDS_REVIEW
    ) {
      throw apiError(
        HttpStatus.CONFLICT,
        'INVALID_STATE_TRANSITION',
        'Request cannot be rejected in its current state.',
        { status: req.status },
      );
    }
    if (!canTransition(req.status, RequestStatus.REJECTED)) {
      throw apiError(
        HttpStatus.CONFLICT,
        'INVALID_STATE_TRANSITION',
        'Invalid transition.',
        { status: req.status },
      );
    }

    const now = new Date().toISOString();
    const trx = this.db.transaction(
      () => {
        this.requestsRepo.update(id, {
          status: RequestStatus.REJECTED,
          managerId: b.managerId,
          failureReason: b.reason ?? null,
        });
        this.reservationsRepo.updateStatus(id, 'RELEASED', now);
        this.balancesRepo.adjustReservedDays(
          req.employeeId,
          req.locationId,
          -req.requestedDays,
          now,
        );
      },
      { begin: 'IMMEDIATE' },
    );
    trx();

    this.audit.log('TIME_OFF_REQUEST', id, 'REQUEST_REJECTED', {
      managerId: b.managerId,
      reason: b.reason ?? null,
    });
    this.audit.log('TIME_OFF_REQUEST', id, 'RESERVATION_RELEASED', {
      reservedDays: req.requestedDays,
    });

    const updated = this.requestsRepo.findById(id);
    return { id: updated.id, status: updated.status };
  }

  async cancel(id, body) {
    const b = validatePlain(CancelRequestDto, body);
    const req = this.requestsRepo.findById(id);
    if (!req) {
      throw apiError(
        HttpStatus.NOT_FOUND,
        'REQUEST_NOT_FOUND',
        'Request does not exist.',
        { id },
      );
    }

    if (req.status === RequestStatus.CANCELLED) {
      return { id: req.id, status: req.status };
    }

    if (
      req.status === RequestStatus.PENDING ||
      req.status === RequestStatus.NEEDS_REVIEW
    ) {
      if (!canTransition(req.status, RequestStatus.CANCELLED)) {
        throw apiError(
          HttpStatus.CONFLICT,
          'INVALID_STATE_TRANSITION',
          'Cannot cancel request.',
          { status: req.status },
        );
      }
      const now = new Date().toISOString();
      const trx = this.db.transaction(
        () => {
          this.requestsRepo.update(id, {
            status: RequestStatus.CANCELLED,
            failureReason: b.reason ?? null,
          });
          this.reservationsRepo.updateStatus(id, 'RELEASED', now);
          this.balancesRepo.adjustReservedDays(
            req.employeeId,
            req.locationId,
            -req.requestedDays,
            now,
          );
        },
        { begin: 'IMMEDIATE' },
      );
      trx();
      this.audit.log('TIME_OFF_REQUEST', id, 'REQUEST_CANCELLED', {
        cancelledBy: b.cancelledBy,
        reason: b.reason ?? null,
      });
      this.audit.log('TIME_OFF_REQUEST', id, 'RESERVATION_RELEASED', {
        reservedDays: req.requestedDays,
      });
      return { id, status: RequestStatus.CANCELLED };
    }

    if (req.status === RequestStatus.APPROVED) {
      if (!req.hcmTransactionId) {
        throw apiError(
          HttpStatus.CONFLICT,
          'INVALID_STATE_TRANSITION',
          'Approved request is missing HCM transaction id.',
        );
      }
      try {
        await this.hcm.cancelTimeOff(req.hcmTransactionId);
      } catch (e) {
        if (e instanceof HcmClientException) {
          throw apiError(
            HttpStatus.CONFLICT,
            'HCM_CANCEL_REJECTED',
            e.message,
            e.details ?? null,
          );
        }
        throw e;
      }
      const now = new Date().toISOString();
      const latest = await this.hcm.getBalance(req.employeeId, req.locationId);
      this.balancesRepo.upsertHcmOnly({
        employeeId: req.employeeId,
        locationId: req.locationId,
        hcmAvailableDays: latest.availableDays,
        lastSyncedAt: now,
        syncSource: 'REALTIME',
        now,
      });
      this.requestsRepo.update(id, {
        status: RequestStatus.CANCELLED,
        failureReason: b.reason ?? null,
      });
      this.audit.log('TIME_OFF_REQUEST', id, 'REQUEST_CANCELLED', {
        cancelledBy: b.cancelledBy,
        reason: b.reason ?? null,
        approved: true,
      });
      return { id, status: RequestStatus.CANCELLED };
    }

    throw apiError(
      HttpStatus.CONFLICT,
      'INVALID_STATE_TRANSITION',
      'Request cannot be cancelled in its current state.',
      { status: req.status },
    );
  }
}
export { TimeOffRequestsService };
