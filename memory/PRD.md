# PRD — PropDesk (Property Consultant CRM + Super Admin)

## Original problem statement
Build a complete, production-ready, exportable full-stack Property Consultant CRM platform: separate PC web app (phone OTP only, mobile-first) and separate Super Admin web app (email/password, RBAC, enterprise SaaS), one shared secure REST backend (/api/v1), one PostgreSQL DB, Prisma schema/migrations/seeds, multi-requirement clients with immutable server-generated REQ-000001 IDs and strict isolation, property wizard (Residential/Commercial/Land, Sale/Rent/Lease, dimensions, persisted photos), matching engine, client-property-requirement linking with conflict rules, deal pipeline + commission, follow-ups with reschedule-aware notifications, WhatsApp deep-link sharing + PC-to-PC view-only sharing with green SHARED badge, global search, bin/restore, activity/audit logs, analytics, locations/amenities, system settings, provider abstractions, CSV export, tests, deployment config, docs.

## User choices
- Stack: Node + TS + Express + Prisma + PostgreSQL (as specified)
- Two source folders /pc-app and /admin-app; preview serves PC at /, Admin at /admin
- Scope: everything in one pass
- Dev OTP: mock provider, fixed code 123456 shown in dev

## Architecture
- /backend: Express 5 + Prisma (src/routes/pc.ts, src/routes/admin.ts, src/services/*, src/providers/*), prisma/schema.prisma + migrations (audit-log immutability trigger) + seed.ts, vitest tests, Dockerfile
- /pc-app, /admin-app: Vite React TS Tailwind
- Preview-only shims: backend/server.py (FastAPI reverse proxy → Node :4000, boots scripts/preview-start.sh), embedded PostgreSQL on :5433 (scripts/preview-db.sh, data in /app/.preview), frontend/package.json start → scripts/preview-frontends.sh

## Implemented (2026-10-06)
- All modules listed above: PC auth/onboarding/dashboard/properties/clients/requirements/matches/links/deals/follow-ups/notifications (scheduler + browser notifications)/sharing/search/bin/activity/analytics/profile
- Admin: auth with lockout + login attempt log, RBAC (4 roles), dashboard, analytics with date/PC/location/type filters, PCs (create/edit/suspend/activate/deactivate + tabs), clients/properties/requirements/deals/follow-ups/notifications, activity+audit+logins, bin restore/purge (DELETE PERMANENTLY, bulk), locations, amenities, settings w/ confirmation + masked provider secrets, admin users, CSV export, global search
- Tests: 14 vitest (backend/tests/api.test.ts) + 33 pytest added by the testing agent — all passing

## Backlog
- P1: real MSG91/WhatsApp Cloud credentials; S3 storage install; TOTP 2FA enrolment UI; web-push provider
- P2: saved searches UI, bulk actions in admin tables, drag-and-drop kanban, PWA/offline
