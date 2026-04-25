-- Time-Off Microservice initial schema (see TRD.md)

CREATE TABLE IF NOT EXISTS balances (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  hcm_available_days INTEGER NOT NULL,
  reserved_days INTEGER NOT NULL DEFAULT 0,
  last_synced_at TEXT,
  sync_source TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(employee_id, location_id),
  CHECK(hcm_available_days >= 0),
  CHECK(reserved_days >= 0)
);

CREATE TABLE IF NOT EXISTS time_off_requests (
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

CREATE INDEX IF NOT EXISTS idx_time_off_employee ON time_off_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_time_off_status ON time_off_requests(status);
CREATE INDEX IF NOT EXISTS idx_time_off_location ON time_off_requests(location_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_time_off_idempotency
  ON time_off_requests(employee_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS balance_reservations (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  reserved_days INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  released_at TEXT,
  UNIQUE(request_id),
  CHECK(reserved_days > 0),
  FOREIGN KEY(request_id) REFERENCES time_off_requests(id)
);

CREATE TABLE IF NOT EXISTS hcm_operations (
  id TEXT PRIMARY KEY,
  request_id TEXT,
  operation_type TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL,
  hcm_transaction_id TEXT,
  request_payload TEXT,
  response_payload TEXT,
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE(idempotency_key)
);

CREATE TABLE IF NOT EXISTS hcm_sync_runs (
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

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL
);
