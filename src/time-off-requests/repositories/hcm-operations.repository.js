import { Dependencies, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DATABASE_CONNECTION } from '../../database/database.constants';

@Injectable()
@Dependencies(DATABASE_CONNECTION)
class HcmOperationsRepository {
  /** @param {import('better-sqlite3').Database} db */
  constructor(db) {
    this.db = db;
  }

  findByIdempotencyKey(key) {
    return this.db
      .prepare(`SELECT * FROM hcm_operations WHERE idempotency_key = ?`)
      .get(key);
  }

  insertStarted(row) {
    const id = `hop_${randomUUID()}`;
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO hcm_operations (
           id, request_id, operation_type, idempotency_key, status,
           request_payload, created_at
         ) VALUES (?, ?, ?, ?, 'STARTED', ?, ?)`,
      )
      .run(
        id,
        row.requestId,
        row.operationType,
        row.idempotencyKey,
        row.requestPayload ? JSON.stringify(row.requestPayload) : null,
        now,
      );
    return id;
  }

  markSuccess(id, { hcmTransactionId, responsePayload, completedAt }) {
    this.db
      .prepare(
        `UPDATE hcm_operations SET
           status = 'SUCCESS',
           hcm_transaction_id = ?,
           response_payload = ?,
           completed_at = ?
         WHERE id = ?`,
      )
      .run(
        hcmTransactionId,
        responsePayload ? JSON.stringify(responsePayload) : null,
        completedAt,
        id,
      );
  }

  markFailed(id, { errorCode, errorMessage, status, completedAt }) {
    this.db
      .prepare(
        `UPDATE hcm_operations SET
           status = ?,
           error_code = ?,
           error_message = ?,
           completed_at = ?
         WHERE id = ?`,
      )
      .run(status, errorCode, errorMessage, completedAt, id);
  }
}
export { HcmOperationsRepository };
