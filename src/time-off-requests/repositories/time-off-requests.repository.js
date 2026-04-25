import { Dependencies, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DATABASE_CONNECTION } from '../../database/database.constants';

function mapRequest(r) {
  if (!r) return null;
  return {
    id: r.id,
    employeeId: r.employee_id,
    locationId: r.location_id,
    startDate: r.start_date,
    endDate: r.end_date,
    requestedDays: r.requested_days,
    reason: r.reason,
    status: r.status,
    managerId: r.manager_id,
    hcmTransactionId: r.hcm_transaction_id,
    idempotencyKey: r.idempotency_key,
    failureCode: r.failure_code,
    failureReason: r.failure_reason,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

@Injectable()
@Dependencies(DATABASE_CONNECTION)
class TimeOffRequestsRepository {
  /** @param {import('better-sqlite3').Database} db */
  constructor(db) {
    this.db = db;
  }

  findById(id) {
    return mapRequest(
      this.db.prepare(`SELECT * FROM time_off_requests WHERE id = ?`).get(id),
    );
  }

  findByIdempotency(employeeId, idempotencyKey) {
    if (!idempotencyKey) return null;
    return mapRequest(
      this.db
        .prepare(
          `SELECT * FROM time_off_requests WHERE employee_id = ? AND idempotency_key = ?`,
        )
        .get(employeeId, idempotencyKey),
    );
  }

  /**
   * @param {{ employeeId?: string; locationId?: string; status?: string; managerId?: string }} filters
   */
  list(filters) {
    let q = `SELECT * FROM time_off_requests WHERE 1=1`;
    const params = [];
    if (filters.employeeId) {
      q += ` AND employee_id = ?`;
      params.push(filters.employeeId);
    }
    if (filters.locationId) {
      q += ` AND location_id = ?`;
      params.push(filters.locationId);
    }
    if (filters.status) {
      q += ` AND status = ?`;
      params.push(filters.status);
    }
    if (filters.managerId) {
      q += ` AND manager_id = ?`;
      params.push(filters.managerId);
    }
    q += ` ORDER BY created_at DESC`;
    return this.db.prepare(q).all(...params).map(mapRequest);
  }

  /**
   * Overlapping PENDING or NEEDS_REVIEW with ACTIVE reservation implied by status.
   */
  findOverlappingActive(employeeId, locationId, startDate, endDate, excludeId) {
    let q = `
      SELECT r.* FROM time_off_requests r
      WHERE r.employee_id = ? AND r.location_id = ?
        AND r.status IN ('PENDING', 'NEEDS_REVIEW')
        AND NOT (r.end_date < ? OR r.start_date > ?)`;
    const params = [employeeId, locationId, startDate, endDate];
    if (excludeId) {
      q += ` AND r.id != ?`;
      params.push(excludeId);
    }
    return this.db.prepare(q).all(...params).map(mapRequest);
  }

  findPendingForEmployeeLocation(employeeId, locationId) {
    return this.db
      .prepare(
        `SELECT * FROM time_off_requests
         WHERE employee_id = ? AND location_id = ? AND status = 'PENDING'`,
      )
      .all(employeeId, locationId)
      .map(mapRequest);
  }

  insert(row) {
    const id = row.id || `req_${randomUUID()}`;
    const now = row.now || new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO time_off_requests (
           id, employee_id, location_id, start_date, end_date, requested_days,
           reason, status, manager_id, hcm_transaction_id, idempotency_key,
           failure_code, failure_reason, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        row.employeeId,
        row.locationId,
        row.startDate,
        row.endDate,
        row.requestedDays,
        row.reason ?? null,
        row.status,
        row.managerId ?? null,
        row.hcmTransactionId ?? null,
        row.idempotencyKey ?? null,
        row.failureCode ?? null,
        row.failureReason ?? null,
        now,
        now,
      );
    return this.findById(id);
  }

  update(id, patch) {
    const existing = this.findById(id);
    if (!existing) return null;
    const now = new Date().toISOString();
    const merged = { ...existing, ...patch, updatedAt: now };
    this.db
      .prepare(
        `UPDATE time_off_requests SET
           status = ?,
           manager_id = ?,
           hcm_transaction_id = ?,
           failure_code = ?,
           failure_reason = ?,
           updated_at = ?
         WHERE id = ?`,
      )
      .run(
        merged.status,
        merged.managerId ?? null,
        merged.hcmTransactionId ?? null,
        merged.failureCode ?? null,
        merged.failureReason ?? null,
        now,
        id,
      );
    return this.findById(id);
  }
}
export { TimeOffRequestsRepository };
