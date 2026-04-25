# Time-Off Microservice

NestJS (JavaScript) + SQLite service that coordinates employee time-off requests against an **authoritative HCM** (Human Capital Management) boundary. This repository implements the ReadyOn take-home specification: local balance cache, reservations for pending requests, synchronous HCM validation on create/approve, batch sync with conflict detection, idempotency, audit logging, and a **configurable mock HCM** for realistic integration testing.

## Architecture

- **HCM** is the source of truth for balances and for accepting filed time off. ReadyOn stores an operational cache (`balances`), pending **reservations** (`balance_reservations`), request lifecycle (`time_off_requests`), outbound **HCM operations** (`hcm_operations`), batch sync runs (`hcm_sync_runs`), and **audit** entries (`audit_logs`).
- Critical writes use SQLite **transactions** with `BEGIN IMMEDIATE` where concurrent reservation safety matters.
- **Mock HCM** (`MockHcmService` + `/mock-hcm/*`) simulates balance lookup, filing, cancellation, seeding, and failure modes (`DOWN`, `TIMEOUT`, `INVALID_DIMENSIONS`, `INSUFFICIENT_BALANCE`, `RANDOM_FAILURE`). The production-shaped **`HcmClientService`** calls the mock in-process (swap for HTTP + auth later).

## Prerequisites

- Node.js 18+ recommended
- npm

Runtime transpilation uses **`@swc-node/register`** (see `index.js`) plus root **`tsconfig.json`** (`allowJs`, `experimentalDecorators`) so Nest decorators and parameter decorators work in plain `.js` sources without a separate build step.

## Environment

Copy `.env.example` to `.env` and adjust as needed:

| Variable        | Description                          | Default              |
|----------------|--------------------------------------|----------------------|
| `PORT`         | HTTP port                            | `3000`               |
| `NODE_ENV`     | `test` skips loading `.env` file     | `development`        |
| `DATABASE_URL` | SQLite file path or `:memory:`       | `./data/timeoff.db`  |
| `HCM_BASE_URL` | Reserved for future HTTP HCM client | _(empty)_            |
| `HCM_API_KEY`  | Reserved for future HCM auth         | _(empty)_            |
| `API_KEY`      | When set, protects mutating time-off `POST`s, all `/mock-hcm/*`, and `POST /sync/hcm/balances` (`Authorization: Bearer …` or `X-Api-Key`) | _(empty)_ |

## Security

Optional shared secret: set **`API_KEY`** in `.env` so privileged routes are not anonymously callable in shared or staging environments. When unset, behavior matches open local development. See **`SECURITY.md`** for threat notes and production follow-ups (TLS, OIDC, disabling mock HCM).

## Setup

```bash
npm install
npm run db:migrate
```

## Run the API

```bash
npm run start:dev
# or
npm start
```

- Health: `GET http://localhost:3000/health`
- Main APIs are under `/balances`, `/time-off-requests`, `/sync/hcm`, and `/mock-hcm`.

## Tests

```bash
npm test                 # unit tests (src/**/*.spec.js), incl. repos + exception filter
npm run test:e2e         # e2e only (in-memory DB)
npm run test:cov         # unit + e2e with coverage (jest.full.config.json)
```

### Coverage

See `coverage-summary.txt` for the latest combined numbers. Example from a recent run:

- **Lines ~80%**, **Functions ~89%**, **Statements ~74%** when unit and e2e suites run together (`npm run test:cov`).
- Branch coverage is lower on defensive / failure paths; add focused tests if you need higher branch %.

## API examples

**Seed mock HCM balance**

```http
POST /mock-hcm/balances
Content-Type: application/json

{ "employeeId": "emp_123", "locationId": "loc_pk", "availableDays": 10 }
```

**Create time-off request (idempotent)**

```http
POST /time-off-requests
Content-Type: application/json

{
  "employeeId": "emp_123",
  "locationId": "loc_pk",
  "startDate": "2026-05-01",
  "endDate": "2026-05-02",
  "requestedDays": 2,
  "reason": "Family event",
  "idempotencyKey": "emp_123-loc_pk-2026-05-01-2026-05-02"
}
```

Returns `201` on first create and `200` with the same body when the idempotency key repeats.

**Approve (requires HCM acceptance)**

```http
POST /time-off-requests/{id}/approve
Content-Type: application/json

{ "managerId": "manager_001" }
```

**Batch balance sync**

```http
POST /sync/hcm/balances
Content-Type: application/json

{
  "snapshotAt": "2026-04-24T10:00:00.000Z",
  "balances": [
    { "employeeId": "emp_123", "locationId": "loc_pk", "availableDays": 15 }
  ]
}
```

## Error format

```json
{
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "…",
    "details": { }
  }
}
```

## Known limitations (take-home scope)

- No real Workday/SAP integration; mock HCM is in-process.
- No JWT/OIDC; manager/employee identity is passed as fields. Use **`API_KEY`** (see above) as a minimal gate for writes, sync, and mock HCM until a real IdP is integrated.
- SQLite instead of Postgres; no distributed outbox worker (schema supports `hcm_operations` evolution).
- No holiday calendars, half-days, or multiple leave types.
- HTTP status codes for successful `POST` actions default to Nest’s `201` where not overridden.

## Future improvements

- Postgres + row-level locking, durable outbox + retry workers for HCM.
- Real HCM HTTP client with mTLS / API keys (`HCM_BASE_URL`, `HCM_API_KEY`).
- Rich policies (leave types, calendars, locales) and observability (metrics/tracing).

## Documentation

- **`TRD.md`** — technical requirements summary aligned with this codebase.
- **`SECURITY.md`** — security considerations and `API_KEY` guard behavior.
- **`migrations/001_initial.sql`** — canonical schema.

## License

Private / assessment use (see `package.json`).
