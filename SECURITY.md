# Security considerations

This document complements `TRD.md` for reviewers and operators. The take-home scope intentionally omits full identity federation; the controls below describe what is implemented and what production would require.

## Threat model (abbreviated)

| Risk | Mitigation in this repo | Production follow-up |
|------|------------------------|----------------------|
| Anonymous callers mutate balances, sync, or mock HCM | Optional **`API_KEY`**: when set, `POST` to time-off mutations, all `/mock-hcm/*`, and `POST /sync/hcm/balances` require `Authorization: Bearer <key>` or `X-Api-Key: <key>` | OIDC/JWT from your IdP; per-role authorization; never expose mock HCM |
| Spoofed `employeeId` / `managerId` in JSON | Documented limitation: body fields are **not** proof of identity | Bind actions to authenticated subject + directory ACL |
| HCM credential theft | `HCM_API_KEY` reserved; mock is in-process | Secret manager, mTLS or signed requests to vendor |
| Data in transit | Not enforced by app | TLS at ingress/gateway |
| Over-disclosure in errors | Global filter returns generic message for unhandled errors | Log detail server-side only; redact PII |

## API key guard

- **Env:** `API_KEY` (see `.env.example` and `README.md`).
- **When empty or unset:** guard is a no-op so local development and default tests need no header.
- **When set:** enforced on:
  - All **`/mock-hcm`** routes (simulator must not be public in shared environments).
  - **`POST /sync/hcm/balances`** (batch ingest is a privileged integration).
  - **Mutating** time-off routes: `POST /time-off-requests`, `POST .../approve`, `reject`, `cancel`.
- **Not** enforced on: `GET /health`, `GET /balances/...`, `GET /time-off-requests` (reads remain open if an operator omits `API_KEY`; tighten with network policy or extend the guard if reads must be private).

## Configuration hygiene

- Do not commit real `.env` files or production keys.
- Prefer a secret store and short-lived credentials for HCM in real deployments.

## Reporting

For security issues related to this assessment codebase, follow the process given by Wizdaa / the repository owner.
