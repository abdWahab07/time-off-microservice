import Database from 'better-sqlite3';
import { TimeOffRequestsRepository } from './time-off-requests.repository';

const DDL = `
CREATE TABLE time_off_requests (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  requested_days INTEGER NOT NULL,
  reason TEXT,
  status TEXT NOT NULL,
  manager_id TEXT,
  hcm_transaction_id TEXT,
  idempotency_key TEXT,
  failure_code TEXT,
  failure_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(requested_days > 0)
);
`;

function insertRow(db, row) {
  const now = row.now ?? '2026-01-01T00:00:00.000Z';
  db.prepare(
    `INSERT INTO time_off_requests (
      id, employee_id, location_id, start_date, end_date, requested_days,
      reason, status, manager_id, hcm_transaction_id, idempotency_key,
      failure_code, failure_reason, created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    row.id,
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
}

describe('TimeOffRequestsRepository', () => {
  let db;
  let repo;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(DDL);
    repo = new TimeOffRequestsRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('findById returns null for unknown id', () => {
    expect(repo.findById('nope')).toBeNull();
  });

  it('findByIdempotency returns null when key missing', () => {
    expect(repo.findByIdempotency('e', null)).toBeNull();
    expect(repo.findByIdempotency('e', undefined)).toBeNull();
  });

  it('findByIdempotency returns mapped row', () => {
    insertRow(db, {
      id: 'r1',
      employeeId: 'e',
      locationId: 'l',
      startDate: '2026-06-01',
      endDate: '2026-06-02',
      requestedDays: 1,
      status: 'PENDING',
      idempotencyKey: 'k1',
    });
    const r = repo.findByIdempotency('e', 'k1');
    expect(r.id).toBe('r1');
    expect(r.employeeId).toBe('e');
    expect(r.idempotencyKey).toBe('k1');
  });

  it('list applies optional filters', () => {
    insertRow(db, {
      id: 'a',
      employeeId: 'e1',
      locationId: 'l1',
      startDate: '2026-06-01',
      endDate: '2026-06-02',
      requestedDays: 1,
      status: 'PENDING',
    });
    insertRow(db, {
      id: 'b',
      employeeId: 'e2',
      locationId: 'l1',
      startDate: '2026-07-01',
      endDate: '2026-07-02',
      requestedDays: 1,
      status: 'APPROVED',
      managerId: 'm1',
    });

    expect(repo.list({})).toHaveLength(2);
    expect(repo.list({ employeeId: 'e1' })).toHaveLength(1);
    expect(repo.list({ locationId: 'l1' })).toHaveLength(2);
    expect(repo.list({ status: 'APPROVED' })).toHaveLength(1);
    expect(repo.list({ managerId: 'm1' })).toHaveLength(1);
    expect(repo.list({ employeeId: 'e2', status: 'APPROVED' })).toHaveLength(
      1,
    );
  });

  it('findOverlappingActive respects date overlap and excludeId', () => {
    insertRow(db, {
      id: 'o1',
      employeeId: 'e',
      locationId: 'l',
      startDate: '2026-06-10',
      endDate: '2026-06-20',
      requestedDays: 2,
      status: 'PENDING',
    });
    insertRow(db, {
      id: 'o2',
      employeeId: 'e',
      locationId: 'l',
      startDate: '2026-06-15',
      endDate: '2026-06-25',
      requestedDays: 1,
      status: 'NEEDS_REVIEW',
    });
    insertRow(db, {
      id: 'o3',
      employeeId: 'e',
      locationId: 'l',
      startDate: '2026-08-01',
      endDate: '2026-08-05',
      requestedDays: 1,
      status: 'PENDING',
    });

    const all = repo.findOverlappingActive('e', 'l', '2026-06-18', '2026-06-19', null);
    expect(all.map((x) => x.id).sort()).toEqual(['o1', 'o2']);

    const ex = repo.findOverlappingActive(
      'e',
      'l',
      '2026-06-18',
      '2026-06-19',
      'o1',
    );
    expect(ex.map((x) => x.id)).toEqual(['o2']);
  });

  it('findPendingForEmployeeLocation returns only PENDING', () => {
    insertRow(db, {
      id: 'p1',
      employeeId: 'e',
      locationId: 'l',
      startDate: '2026-06-01',
      endDate: '2026-06-02',
      requestedDays: 1,
      status: 'PENDING',
    });
    insertRow(db, {
      id: 'p2',
      employeeId: 'e',
      locationId: 'l',
      startDate: '2026-06-03',
      endDate: '2026-06-04',
      requestedDays: 1,
      status: 'APPROVED',
      managerId: 'm',
    });
    const rows = repo.findPendingForEmployeeLocation('e', 'l');
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('p1');
  });

  it('insert generates id when missing and returns mapped row', () => {
    const created = repo.insert({
      employeeId: 'e',
      locationId: 'l',
      startDate: '2026-06-01',
      endDate: '2026-06-02',
      requestedDays: 1,
      status: 'PENDING',
      now: '2026-01-02T00:00:00.000Z',
    });
    expect(created.id).toMatch(/^req_/);
    expect(created.status).toBe('PENDING');
  });

  it('update returns null when id missing', () => {
    expect(repo.update('missing', { status: 'CANCELLED' })).toBeNull();
  });

  it('update merges patch and persists', () => {
    insertRow(db, {
      id: 'u1',
      employeeId: 'e',
      locationId: 'l',
      startDate: '2026-06-01',
      endDate: '2026-06-02',
      requestedDays: 1,
      status: 'PENDING',
    });
    const out = repo.update('u1', {
      status: 'APPROVED',
      managerId: 'mgr',
      hcmTransactionId: 'txn',
    });
    expect(out.status).toBe('APPROVED');
    expect(out.managerId).toBe('mgr');
    expect(out.hcmTransactionId).toBe('txn');
  });
});
