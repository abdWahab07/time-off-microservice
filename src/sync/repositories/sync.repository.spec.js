import Database from 'better-sqlite3';
import { SyncRepository } from './sync.repository';

const DDL = `
CREATE TABLE hcm_sync_runs (
  id TEXT PRIMARY KEY,
  sync_type TEXT NOT NULL,
  status TEXT NOT NULL,
  snapshot_at TEXT,
  records_received INTEGER NOT NULL DEFAULT 0,
  records_processed INTEGER NOT NULL DEFAULT 0,
  records_failed INTEGER NOT NULL DEFAULT 0,
  error_summary TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT
);
`;

describe('SyncRepository', () => {
  let db;
  let repo;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(DDL);
    repo = new SyncRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('insertRun creates RUNNING row and returns id', () => {
    const id = repo.insertRun({
      syncType: 'BATCH_BALANCES',
      snapshotAt: '2026-04-01T00:00:00.000Z',
      recordsReceived: 3,
      startedAt: '2026-04-01T01:00:00.000Z',
    });
    expect(id).toMatch(/^sync_/);
    const row = repo.findById(id);
    expect(row.status).toBe('RUNNING');
    expect(row.recordsReceived).toBe(3);
  });

  it('complete updates counters and error summary', () => {
    const id = repo.insertRun({
      syncType: 'BATCH_BALANCES',
      snapshotAt: '2026-04-01T00:00:00.000Z',
      recordsReceived: 2,
      startedAt: '2026-04-01T01:00:00.000Z',
    });
    repo.complete(id, {
      status: 'SUCCESS',
      recordsProcessed: 2,
      recordsFailed: 0,
      errorSummary: null,
    });
    const row = repo.findById(id);
    expect(row.status).toBe('SUCCESS');
    expect(row.recordsProcessed).toBe(2);
    expect(row.completedAt).toBeTruthy();
  });

  it('findById returns null when missing', () => {
    expect(repo.findById('sync_none')).toBeNull();
  });
});
