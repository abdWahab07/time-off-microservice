# Time-Off Microservice

NestJS (JavaScript) + SQLite service that coordinates employee time-off requests against an **authoritative HCM** (Human Capital Management) boundary. This repository implements the ReadyOn take-home specification: local balance cache, reservations for pending requests, synchronous HCM validation on create/approve, batch sync with conflict detection, idempotency, audit logging, and a **configurable mock HCM** for realistic integration testing.

## Architecture

- **HCM** is the source of truth for balances and for accepting filed time off. ReadyOn stores an operational cache (`balances`), pending **reservations** (`balance_reservations`), request lifecycle (`time_off_requests`), outbound **HCM operations** (`hcm_operations`), batch sync runs (`hcm_sync_runs`), and **audit** entries (`audit_logs`).
- Critical writes use SQLite **transactions** with `BEGIN IMMEDIATE` where concurrent reservation safety matters.
- **Mock HCM** (`MockHcmService`) simulates balance lookup, filing, cancellation, seeding, and failure modes (`DOWN`, `TIMEOUT`, `INVALID_DIMENSIONS`, `INSUFFICIENT_BALANCE`, `RANDOM_FAILURE`). By default Nest exposes **`/mock-hcm/*`** and **`HcmClientService`** uses the mock **in-process**. Set **`HCM_BASE_URL`** to an HTTP origin (for example the standalone **`mock-hcm-server`**) to exercise the **same API over the network**; optional **`HCM_API_KEY`** is sent as `X-Api-Key` on outbound calls.

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
| `HCM_BASE_URL` | When set, `HcmClientService` calls this origin over HTTP (`/mock-hcm/...` paths). Internal Nest `/mock-hcm` routes are omitted. | _(empty)_ |
| `HCM_API_KEY`  | Outbound `X-Api-Key` for HCM HTTP calls (e.g. standalone mock) | _(empty)_ |
| `HCM_TIMEOUT_MS` | Outbound HCM HTTP timeout (ms) | `15000` |
| `API_KEY`      | Primary service key for protected routes | _(empty)_ |
| `API_KEY_PREVIOUS` | Optional previous key during key rotation | _(empty)_ |
| `TLS_CERT_PATH` / `TLS_KEY_PATH` | PEM paths to enable **HTTPS** in Nest | _(empty)_ |
| `JWT_ISSUER`, `JWT_AUDIENCE`, `JWT_JWKS_URI` or `JWT_SECRET`, `JWT_SUB_CLAIM`, `JWT_ROLES_CLAIM` | Optional **JWT** verification, subject binding, and RBAC roles (see **`SECURITY.md`**) | _(empty)_ |
| `CORS_ENABLED`, `CORS_ORIGIN`, `CORS_CREDENTIALS` | Browser CORS controls (allowlist origins in prod) | see `.env.example` |
| `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX` | Global IP rate limit | `60000`, `120` |
| `SECURITY_AUTH_FAILURE_WINDOW_MS`, `SECURITY_AUTH_FAILURE_THRESHOLD` | Auth-failure anomaly detection window/threshold | `60000`, `10` |
| `TRUST_PROXY` | Trust ingress proxy headers (`x-forwarded-for`) | `true` in prod |

## Security

Set **`API_KEY`** for protected routes (and use `API_KEY_PREVIOUS` briefly during rotation). Optionally set **JWT** env vars so `employeeId` / `managerId` / `cancelledBy` and read scopes are tied to the token **subject**, and roles are enforced (`employee` / `manager` / `admin` / `system`). Helmet, CORS controls, and rate limiting are enabled/configurable. Use TLS at ingress in production (optionally Nest TLS for local/staging). Details: **`SECURITY.md`**.

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
- Main APIs are under `/balances`, `/time-off-requests`, `/sync/hcm`, and (when `HCM_BASE_URL` is unset) `/mock-hcm`.

### Standalone mock HCM (optional)

In a second terminal (repo root):

```bash
npm run mock-hcm:serve
```

Then point the main app at it, for example `HCM_BASE_URL=http://127.0.0.1:4010` and matching `HCM_API_KEY` / `MOCK_HCM_API_KEY` if you enable auth on the mock. See **`TRD.md` §15.3–15.4** and **`.env.example`**.

## Tests

```bash
npm test                 # unit tests (src/**/*.spec.js), incl. repos + exception filter
npm run test:e2e         # e2e (in-memory DB), incl. remote HCM mock smoke (`hcm-remote-mock.e2e-spec.js`)
npm run test:cov         # unit + e2e with coverage (jest.full.config.json)
```

### Coverage

See `coverage-summary.txt` for the canonical combined numbers (copy the **All files** row after each `npm run test:cov`). As of the last verification run, totals were roughly **Statements ~82%**, **Branches ~48%**, **Functions ~93%**, **Lines ~88%** for unit + e2e together (`jest.full.config.json`).

- Branch coverage is lower on Nest modules, DTO decorators, and glue code; see `coverage-summary.txt` notes and the HTML report under `coverage/`.

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
- JWT + role checks are optional and env-driven; without JWT env vars, identity enforcement falls back to API key only (see **`SECURITY.md`**).
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
