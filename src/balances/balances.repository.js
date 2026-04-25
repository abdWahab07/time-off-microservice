import { Dependencies, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DATABASE_CONNECTION } from '../database/database.constants';

function mapRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    employeeId: r.employee_id,
    locationId: r.location_id,
    hcmAvailableDays: r.hcm_available_days,
    reservedDays: r.reserved_days,
    lastSyncedAt: r.last_synced_at,
    syncSource: r.sync_source,
    version: r.version,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

@Injectable()
@Dependencies(DATABASE_CONNECTION)
class BalancesRepository {
  /** @param {import('better-sqlite3').Database} db */
  constructor(db) {
    this.db = db;
  }

  findByEmployeeLocation(employeeId, locationId) {
    const r = this.db
      .prepare(
        `SELECT * FROM balances WHERE employee_id = ? AND location_id = ?`,
      )
      .get(employeeId, locationId);
    return mapRow(r);
  }

  /**
   * Upsert HCM snapshot without changing reserved_days on conflict.
   */
  upsertHcmOnly({
    employeeId,
    locationId,
    hcmAvailableDays,
    lastSyncedAt,
    syncSource,
    now,
  }) {
    const existing = this.findByEmployeeLocation(employeeId, locationId);
    const id = existing?.id || `bal_${randomUUID()}`;
    this.db
      .prepare(
        `INSERT INTO balances (
           id, employee_id, location_id, hcm_available_days, reserved_days,
           last_synced_at, sync_source, version, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
         ON CONFLICT(employee_id, location_id) DO UPDATE SET
           hcm_available_days = excluded.hcm_available_days,
           last_synced_at = excluded.last_synced_at,
           sync_source = excluded.sync_source,
           version = balances.version + 1,
           updated_at = excluded.updated_at`,
      )
      .run(
        id,
        employeeId,
        locationId,
        hcmAvailableDays,
        existing?.reservedDays ?? 0,
        lastSyncedAt,
        syncSource,
        existing?.createdAt ?? now,
        now,
      );
    return this.findByEmployeeLocation(employeeId, locationId);
  }

  adjustReservedDays(employeeId, locationId, delta, now) {
    this.db
      .prepare(
        `UPDATE balances SET
           reserved_days = MAX(0, reserved_days + ?),
           version = version + 1,
           updated_at = ?
         WHERE employee_id = ? AND location_id = ?`,
      )
      .run(delta, now, employeeId, locationId);
    return this.findByEmployeeLocation(employeeId, locationId);
  }

  /**
   * Batch sync: set hcm_available_days from snapshot, keep reserved_days.
   */
  applyBatchHcm(employeeId, locationId, hcmAvailableDays, snapshotAt, now) {
    return this.upsertHcmOnly({
      employeeId,
      locationId,
      hcmAvailableDays,
      lastSyncedAt: snapshotAt,
      syncSource: 'BATCH',
      now,
    });
  }
}
export { BalancesRepository };
