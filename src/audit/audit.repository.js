import { Dependencies, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DATABASE_CONNECTION } from '../database/database.constants';

@Injectable()
@Dependencies(DATABASE_CONNECTION)
class AuditRepository {
  /** @param {import('better-sqlite3').Database} db */
  constructor(db) {
    this.db = db;
  }

  /**
   * @param {{ entityType: string; entityId: string; action: string; metadata?: object }} row
   */
  insert(row) {
    const id = `aud_${randomUUID()}`;
    const now = new Date().toISOString();
    const metadata =
      row.metadata === undefined ? null : JSON.stringify(row.metadata);
    this.db
      .prepare(
        `INSERT INTO audit_logs (id, entity_type, entity_id, action, metadata, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, row.entityType, row.entityId, row.action, metadata, now);
    return { id, createdAt: now };
  }

  /**
   * @param {{ entityId?: string; action?: string }} [filters]
   */
  list(filters = {}) {
    let q = `SELECT id, entity_type as entityType, entity_id as entityId, action, metadata, created_at as createdAt
             FROM audit_logs WHERE 1=1`;
    const params = [];
    if (filters.entityId) {
      q += ` AND entity_id = ?`;
      params.push(filters.entityId);
    }
    if (filters.action) {
      q += ` AND action = ?`;
      params.push(filters.action);
    }
    q += ` ORDER BY created_at ASC`;
    const rows = this.db.prepare(q).all(...params);
    return rows.map((r) => ({
      ...r,
      metadata: r.metadata ? JSON.parse(r.metadata) : null,
    }));
  }
}
export { AuditRepository };
