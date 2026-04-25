import { Dependencies, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DATABASE_CONNECTION } from '../database/database.constants';

@Injectable()
@Dependencies(DATABASE_CONNECTION)
class SyncRepository {
  /** @param {import('better-sqlite3').Database} db */
  constructor(db) {
    this.db = db;
  }

  insertRun(row) {
    const id = `sync_${randomUUID()}`;
    this.db
      .prepare(
        `INSERT INTO hcm_sync_runs (
           id, sync_type, status, snapshot_at, records_received,
           records_processed, records_failed, error_summary, started_at
         ) VALUES (?, ?, 'RUNNING', ?, ?, 0, 0, NULL, ?)`,
      )
      .run(
        id,
        row.syncType,
        row.snapshotAt,
        row.recordsReceived,
        row.startedAt,
      );
    return id;
  }

  complete(id, patch) {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE hcm_sync_runs SET
           status = ?,
           records_processed = ?,
           records_failed = ?,
           error_summary = ?,
           completed_at = ?
         WHERE id = ?`,
      )
      .run(
        patch.status,
        patch.recordsProcessed,
        patch.recordsFailed,
        patch.errorSummary ?? null,
        now,
        id,
      );
  }

  findById(id) {
    const r = this.db
      .prepare(`SELECT * FROM hcm_sync_runs WHERE id = ?`)
      .get(id);
    if (!r) return null;
    return {
      id: r.id,
      syncType: r.sync_type,
      status: r.status,
      snapshotAt: r.snapshot_at,
      recordsReceived: r.records_received,
      recordsProcessed: r.records_processed,
      recordsFailed: r.records_failed,
      errorSummary: r.error_summary,
      startedAt: r.started_at,
      completedAt: r.completed_at,
    };
  }
}
export { SyncRepository };
