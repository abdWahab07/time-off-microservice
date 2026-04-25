# Security considerations

This document complements `TRD.md` for reviewers and operators. Optional controls are env-driven so local development stays frictionless.

## Threat model (abbreviated)

| Risk | Mitigation in this repo | Production follow-up |
|------|------------------------|----------------------|
| Anonymous callers hit privileged APIs | Optional **`API_KEY`** (+ `API_KEY_PREVIOUS` for rotation), optional **JWT**, role checks, and rate limiting | Network policies, WAF |
| Spoofed `employeeId` / `managerId` in JSON | Optional **JWT**: when `JWT_ISSUER` and `JWT_SECRET` or `JWT_JWKS_URI` are set, body/query/param identifiers must match the token **subject** (and list/get rules below) | Full OIDC with your IdP, directory-backed ACLs |
| HCM credential theft | **`HCM_API_KEY`** on outbound calls when **`HCM_BASE_URL`** is set; standalone mock may use **`MOCK_HCM_API_KEY`** | Secret manager, mTLS or signed requests to vendor |
| Data in transit | Optional **TLS** in Nest when `TLS_CERT_PATH` and `TLS_KEY_PATH` are set | Enforce TLS at ingress with HSTS |
| Over-disclosure in errors | Global filter returns generic message for unhandled errors | Log detail server-side only; redact PII |
| Brute force / abuse | IP-based rate limiting + auth-failure anomaly logging | SIEM alerts, bot mitigation |

## API key guard

- **Env:** `API_KEY`, optional `API_KEY_PREVIOUS` (rotation window).
- **When empty or unset:** guard is a no-op so local development and default tests need no header.
- **When set:** enforced on every route that declares `@UseGuards(ApiKeyGuard, …)` including **`GET /health`**, **`GET /balances/...`**, **`GET /time-off-requests`**, mutating time-off, **`/mock-hcm`**, and **`POST /sync/hcm/balances`**.
- **Credential header:** use **`X-Api-Key: <API_KEY>`**. When **JWT auth is disabled**, `Authorization: Bearer <API_KEY>` is still accepted for backward compatibility. When **JWT auth is enabled** (`JWT_ISSUER` plus verifier), **`Authorization` is reserved for the end-user JWT** and the service key must be sent only via **`X-Api-Key`**.
- **Rotation:** during key rotation, keep old key in `API_KEY_PREVIOUS` for a short window, then remove it.

## JWT access tokens (OIDC-shaped)

- **Env:** `JWT_ISSUER`, optional `JWT_AUDIENCE`, optional `JWT_SUB_CLAIM` (default `sub`), optional `JWT_ROLES_CLAIM` (default `roles`), and **one of** `JWT_SECRET` (HS256, for dev/tests) or `JWT_JWKS_URI` (production JWKS).
- **When disabled** (no issuer or no verifier): `JwtAuthGuard` is a no-op; only `API_KEY` applies where configured.
- **When enabled:** send **`Authorization: Bearer <access_token>`** on routes that use `JwtAuthGuard`. Bindings enforced:
  - **Create** `POST /time-off-requests`: `body.employeeId` must equal the JWT subject.
  - **Approve / reject**: `body.managerId` must equal the JWT subject.
  - **Cancel**: `body.cancelledBy` must equal the subject, and the subject must be the request’s **employee** or **assigned manager** (`manager_id` on the row).
  - **Balance read**: path `employeeId` must equal the subject.
  - **List** `GET /time-off-requests`: at least one of `employeeId` or `managerId` query must be present and each present filter must equal the subject (so callers cannot enumerate others’ data through open filters).
- **RBAC:** role checks now gate endpoints (`employee`, `manager`, `admin`, `system`) in addition to subject matching.

## TLS (in-process)

- **Env:** `TLS_CERT_PATH`, `TLS_KEY_PATH` (PEM files). When both are set, Nest listens with **HTTPS**. Clients must use `https://` against that port.
- **Ingress:** in production, terminate TLS at ingress/reverse-proxy, set `TRUST_PROXY=true`, and keep backend traffic private.

## HTTP hardening

- **Helmet** is enabled globally for baseline security headers.
- **CORS** is configurable with `CORS_ENABLED`, `CORS_ORIGIN`, `CORS_CREDENTIALS` (set explicit allowlist in production).
- **Rate limiting** is enabled with `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`.

## Security monitoring

- Auth failures are logged as structured `auth_failure` events (reason, path, ip, correlationId).
- Repeated auth failures from the same IP emit `security_anomaly` alert events.
- Use your log pipeline/SIEM to page on anomaly events and elevated failure rates.

## Configuration hygiene

- Do not commit real `.env` files or production keys.
- Prefer a secret store (Vault/KMS/ASM) and short-lived credentials for HCM in real deployments.
- Rotate `API_KEY` and JWT signing keys regularly; use JWKS for production key rollover.

## Reporting

For security issues related to this assessment codebase, follow the process given by Wizdaa / the repository owner.
