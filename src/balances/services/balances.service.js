import { Dependencies, HttpStatus, Injectable } from '@nestjs/common';
import { BalancesRepository } from '../repositories/balances.repository';
import { HcmClientService } from '../../hcm/services/hcm-client.service';
import { AuditService } from '../../audit/services/audit.service';
import { HcmClientException } from '../../hcm/hcm-error.mapper';
import { HcmClientErrorCode } from '../../hcm/hcm.types';
import { apiError } from '../../common/errors/api-error';

@Injectable()
@Dependencies(BalancesRepository, HcmClientService, AuditService)
class BalancesService {
  constructor(balancesRepository, hcmClient, auditService) {
    this.repo = balancesRepository;
    this.hcm = hcmClient;
    this.audit = auditService;
  }

  displayAvailable(balance) {
    if (!balance) return 0;
    const raw = balance.hcmAvailableDays - balance.reservedDays;
    return raw < 0 ? 0 : raw;
  }

  /**
   * @param {string} employeeId
   * @param {string} locationId
   * @param {{ refresh?: boolean }} [query]
   */
  async getBalance(employeeId, locationId, query = {}) {
    const refresh = query.refresh === true || query.refresh === 'true';
    let local = this.repo.findByEmployeeLocation(employeeId, locationId);
    let isStale = false;

    if (refresh) {
      try {
        const hcm = await this.hcm.getBalance(employeeId, locationId);
        const now = new Date().toISOString();
        local = this.repo.upsertHcmOnly({
          employeeId,
          locationId,
          hcmAvailableDays: hcm.availableDays,
          lastSyncedAt: now,
          syncSource: 'REALTIME',
          now,
        });
        this.audit.log('BALANCE', `${employeeId}:${locationId}`, 'BALANCE_REFRESHED', {
          employeeId,
          locationId,
          source: 'REALTIME',
        });
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
            if (!local) {
              throw apiError(
                HttpStatus.SERVICE_UNAVAILABLE,
                'HCM_UNAVAILABLE',
                'HCM refresh failed and no cached balance exists.',
                { employeeId, locationId },
              );
            }
            isStale = true;
          } else {
            throw e;
          }
        } else {
          throw e;
        }
      }
    }

    if (!local) {
      throw apiError(
        HttpStatus.NOT_FOUND,
        'BALANCE_NOT_FOUND',
        'Balance not found for employee/location.',
        { employeeId, locationId },
      );
    }

    return {
      employeeId,
      locationId,
      hcmAvailableDays: local.hcmAvailableDays,
      reservedDays: local.reservedDays,
      displayAvailableDays: this.displayAvailable(local),
      isStale,
      lastSyncedAt: local.lastSyncedAt,
      syncSource: local.syncSource,
    };
  }
}
export { BalancesService };
