import { Dependencies, Injectable } from '@nestjs/common';
import { BalancesRepository } from '../balances/balances.repository';
import { TimeOffRequestsRepository } from '../time-off-requests/time-off-requests.repository';
import { AuditService } from '../audit/audit.service';
import { SyncRepository } from './sync.repository';
import { RequestStatus } from '../time-off-requests/time-off-state-machine';

@Injectable()
@Dependencies(BalancesRepository, TimeOffRequestsRepository, SyncRepository, AuditService)
class SyncService {
  constructor(balancesRepository, requestsRepository, syncRepository, auditService) {
    this.balancesRepo = balancesRepository;
    this.requestsRepo = requestsRepository;
    this.syncRepo = syncRepository;
    this.audit = auditService;
  }

  /**
   * @param {{ snapshotAt: string; balances: { employeeId: string; locationId: string; availableDays: number }[] }} body
   */
  runBatch(body) {
    const startedAt = new Date().toISOString();
    const snapshotAt = body.snapshotAt || startedAt;
    const records = Array.isArray(body.balances) ? body.balances : [];
    const syncRunId = this.syncRepo.insertRun({
      syncType: 'BATCH_BALANCES',
      snapshotAt,
      recordsReceived: records.length,
      startedAt,
    });

    let processed = 0;
    let failed = 0;
    const errors = [];
    let requestsMarkedNeedsReview = 0;

    for (const row of records) {
      try {
        const now = new Date().toISOString();
        this.balancesRepo.applyBatchHcm(
          row.employeeId,
          row.locationId,
          row.availableDays,
          snapshotAt,
          now,
        );
        const bal = this.balancesRepo.findByEmployeeLocation(
          row.employeeId,
          row.locationId,
        );
        if (
          bal &&
          bal.reservedDays > bal.hcmAvailableDays
        ) {
          const pending = this.requestsRepo.findPendingForEmployeeLocation(
            row.employeeId,
            row.locationId,
          );
          for (const req of pending) {
            this.requestsRepo.update(req.id, {
              status: RequestStatus.NEEDS_REVIEW,
              failureCode: 'BALANCE_CONFLICT',
              failureReason:
                'Reserved days exceed HCM balance after batch sync.',
            });
            this.audit.log('TIME_OFF_REQUEST', req.id, 'REQUEST_MARKED_NEEDS_REVIEW', {
              employeeId: row.employeeId,
              locationId: row.locationId,
              syncRunId,
            });
            requestsMarkedNeedsReview += 1;
          }
        }
        processed += 1;
      } catch (e) {
        failed += 1;
        errors.push(String(e?.message || e));
      }
    }

    this.syncRepo.complete(syncRunId, {
      status: failed === records.length && records.length > 0 ? 'FAILED' : 'SUCCESS',
      recordsProcessed: processed,
      recordsFailed: failed,
      errorSummary: errors.length ? errors.join('; ') : null,
    });

    this.audit.log('SYNC', syncRunId, 'BATCH_SYNC_COMPLETED', {
      recordsReceived: records.length,
      recordsProcessed: processed,
      recordsFailed: failed,
      requestsMarkedNeedsReview,
    });

    return {
      syncRunId,
      status: failed === records.length && records.length > 0 ? 'FAILED' : 'SUCCESS',
      recordsReceived: records.length,
      recordsProcessed: processed,
      recordsFailed: failed,
      requestsMarkedNeedsReview,
    };
  }
}
export { SyncService };
