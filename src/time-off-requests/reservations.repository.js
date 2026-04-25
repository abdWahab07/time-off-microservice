import { Dependencies, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DATABASE_CONNECTION } from '../database/database.constants';

function map(r) {
  if (!r) return null;
  return {
    id: r.id,
    requestId: r.request_id,
    employeeId: r.employee_id,
    locationId: r.location_id,
    reservedDays: r.reserved_days,
    status: r.status,
    createdAt: r.created_at,
    releasedAt: r.released_at,
  };
}

@Injectable()
@Dependencies(DATABASE_CONNECTION)
class ReservationsRepository {
  /** @param {import('better-sqlite3').Database} db */
  constructor(db) {
    this.db = db;
  }

  findByRequestId(requestId) {
    const r = this.db
      .prepare(`SELECT * FROM balance_reservations WHERE request_id = ?`)
      .get(requestId);
    return map(r);
  }

  insertActive({ requestId, employeeId, locationId, reservedDays, now }) {
    const id = `res_${randomUUID()}`;
    this.db
      .prepare(
        `INSERT INTO balance_reservations (
           id, request_id, employee_id, location_id, reserved_days, status, created_at
         ) VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?)`,
      )
      .run(id, requestId, employeeId, locationId, reservedDays, now);
    return this.findByRequestId(requestId);
  }

  updateStatus(requestId, status, now) {
    const releasedAt =
      status === 'RELEASED' || status === 'CONSUMED' ? now : null;
    this.db
      .prepare(
        `UPDATE balance_reservations SET status = ?, released_at = ? WHERE request_id = ?`,
      )
      .run(status, releasedAt, requestId);
    return this.findByRequestId(requestId);
  }
}
export { ReservationsRepository };
