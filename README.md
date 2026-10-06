# PropDesk — Property Consultant CRM + Super Admin

| Folder | What | Stack | Dev port |
|---|---|---|---|
| `backend/` | Shared REST API `/api/v1` | Node 20, TypeScript, Express 5, Prisma, PostgreSQL, Zod | 4000 |
| `pc-app/` | Property Consultant CRM (mobile-first) | React 18 + TS + Vite + Tailwind | 5173 |
| `admin-app/` | Super Admin console (desktop-first) | React 18 + TS + Vite + Tailwind | 5174 |

```
PC APP ──> BACKEND /api/v1 <── ADMIN APP
                │ Prisma
                v
           POSTGRESQL
```
Frontends never touch the DB. PC auth (phone OTP) and admin auth (email/password) use separate secrets, JWT audiences, sessions and middleware.

> `backend/server.py`, `frontend/` and `scripts/preview-*.sh` exist **only** for the Emergent live preview (proxy shim + embedded PostgreSQL). Delete them for your own deployment.

## Local setup
```bash
docker compose up -d db                        # or any PostgreSQL 14+
cd backend && cp .env.example .env && yarn install
yarn db:migrate && yarn db:seed && yarn dev    # http://localhost:4000/api/v1/health
cd ../pc-app && cp .env.example .env && yarn install && yarn dev                 # :5173
cd ../admin-app && cp .env.example .env && yarn install && VITE_BASE=/ yarn dev  # :5174
```
Demo: PC phones `9876543210`, `9123456780` (mock OTP = `MOCK_OTP_CODE`, default `123456`, shown on screen in dev). Admin: `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` (SUPER_ADMIN) plus `ops.admin@propcrm.local` (ADMIN), `support@propcrm.local` (SUPPORT_ADMIN), `viewer@propcrm.local` (READ_ONLY_ADMIN) with the same password.

## Backend layout
- `prisma/schema.prisma` + `prisma/migrations/` (incl. trigger making `AdminAuditLog` append-only), `prisma/seed.ts` (Bengaluru locations, amenities, roles/permissions, settings, providers, 19 properties, 16 clients, requirements, links, deals, follow-ups, shares).
- `src/routes/pc.ts` (PC API), `src/routes/admin.ts` (`/api/v1/admin/*`).
- `src/services/` validation rules, matching engine, deals/commission, notifications + scheduler, bin/restore, analytics, search, records (clients/requirements/properties/follow-ups/sharing).
- `src/providers/` OTP (mock/MSG91), WhatsApp (deep-link/Cloud API), SMS, Email (mock/SMTP), Push, Storage (local/S3-compatible).
- `src/lib/rbac.ts` role→permission map enforced by `requirePerm()`.

## Business rules (server-enforced)
- Human IDs (`REQ-000001`, `PROP-`, `CLI-`, `DEAL-`, `FU-`, `PC-`) come from atomic never-decreasing counters: generated server-side, immutable, never reused (even after permanent delete). Restore keeps the original id/code.
- Each requirement is its own record; edit/delete always target that requirement's id. Matches, links, follow-ups, deals, activity reference `requirementId`.
- Irrelevant fields for category/transaction type are nulled; dimensions required for properties and residential requirements; one property supports SALE + RENT + LEASE.
- Conflict: a client can't be LOOKING and OFFERING (buy/sell, rent, lease) for the same property → 409.
- Tenant isolation: `loadOwned()` → 403 for other PCs' data; shared properties are VIEW_ONLY for the receiver.
- Follow-up reschedule re-creates pending reminder/due notifications at the new time; scheduler delivers them and marks overdue ones MISSED.
- Suspending/deactivating a PC revokes sessions and blocks OTP login; data is kept; status changes are logged.

API responses: `{success:true,data,meta?}` / `{success:false,error:{code,message,details?}}`; lists support `page,pageSize,sort,order` + filters.
Security: helmet, CORS allow-list, rate limits (global/OTP/admin login), bcrypt, admin lockout, login-attempt log, DB sessions with expiry, file sniffing + size limits, Zod, Prisma, no stack traces.

## Providers / env
See `backend/.env.example`. OTP: `OTP_PROVIDER=msg91` + `MSG91_*`. WhatsApp: `WHATSAPP_PROVIDER=cloud_api` + `WHATSAPP_BUSINESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` (default deep-link `wa.me`). Storage: `STORAGE_PROVIDER=s3` + `S3_*` (`yarn add @aws-sdk/client-s3`). Frontends only need `VITE_API_URL` (admin also `VITE_BASE`).

## Tests
`cd backend && yarn test` (uses and resets `TEST_DATABASE_URL`). Covers OTP auth, the mandatory REQ-000001..3 edit/delete/restore/new-ID scenario, ID non-reuse, validation, properties, photo persistence, matching, requirement-specific linking + conflicts, deal pipeline + commission, reschedule→notification timing, sharing, tenant isolation, admin RBAC, suspend/activate, audit immutability, purge confirmation, CSV export.

## Production
```bash
cd backend && yarn build && yarn db:migrate && yarn start
cd pc-app && yarn build                  # dist -> app.yourdomain.com
cd admin-app && VITE_BASE=/ yarn build   # dist -> admin.yourdomain.com
```
Host `dist/` on any static host with SPA fallback; run the API on any Node host or `docker compose up --build`. Set `CORS_ORIGINS`, `PUBLIC_API_URL`, `PC_APP_URL` to your domains.
