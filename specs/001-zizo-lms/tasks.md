---
description: "Task list for feature implementation of Zizo LMS"
---

# Tasks: Zizo LMS (001-zizo-lms)

**Input**: Design documents from `specs/001-zizo-lms/`

**Prerequisites**: `plan.md`, `spec.md`, `data-model.md`, `tasks-template.md`

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 Initialize backend Node.js project and dependencies in `backend/package.json`
- [X] T002 Initialize frontend React/Vite/Tailwind project in `frontend/package.json`
- [X] T003 [P] Configure backend TypeScript, ESLint, and Prettier in `backend/tsconfig.json` & `backend/eslint.config.js` (ESLint 9 flat config; `.eslintrc.js` is no longer supported)
- [X] T004 [P] Configure frontend TypeScript, ESLint, and Prettier in `frontend/tsconfig.json` & `frontend/eslint.config.js` (ESLint 9 flat config; `.eslintrc.js` is no longer supported)
- [X] T005 [P] Setup Vitest/Jest configuration in `backend/vitest.config.ts` and `frontend/vitest.config.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure, database schema, and base authentication

**Infrastructure** (blocks the integration tests below — they need real PostgreSQL and Redis):
- [X] T070 Create `docker-compose.yml` at the repo root defining a `postgres` service (postgres:16-alpine, named volume, port 5432) and a `redis` service (redis:7-alpine, named volume, port 6379), with healthchecks on both so dependent steps can wait for readiness
- [X] T071 Provision separate test datastores and an integration-test harness so integration tests run against real PostgreSQL and Redis and never read or write development data:
  - Add `TEST_DATABASE_URL` (pointing at `zizo_lms_test`, a different database from development) and `TEST_REDIS_URL` (`redis://localhost:6379/1`, a different Redis database from `REDIS_URL`) to `backend/.env.example`
  - Add a Vitest `globalSetup` module in `backend/tests/globalSetup.ts` that loads `TEST_DATABASE_URL` and runs `prisma migrate deploy` against it **once per test run** (so the harness picks up whatever migrations exist, including the initial one created in T008)
  - Add a Vitest `setupFiles` module in `backend/tests/setup.ts` that uses `beforeEach` to truncate all tables in the test database and flush the test Redis database, giving every test a clean slate
  - Both modules must refuse to run (throw and abort the run) if `TEST_DATABASE_URL` equals `DATABASE_URL`, or if `TEST_REDIS_URL` equals `REDIS_URL` — a misconfigured env must fail loudly instead of truncating development data
  - Disable file parallelism for the integration test project only (e.g. a single fork/thread for integration), since those files share one database and truncate between tests; unit tests keep running in parallel

**⚠️ CRITICAL TESTS**: Authentication tests must be written first per constitution.

- [X] T006 [P] Write integration tests for authentication (login, JWT, role guarding) in `backend/tests/integration/auth.test.ts`
- [X] T006a [P] Write integration tests for the forgot-password / reset-password flow (token issued, single-use, expiry rejected, per-IP and per-account rate limit, password re-hashed on success, no account enumeration in the response) in `backend/tests/integration/passwordReset.test.ts`

**Implementation**:
- [X] T007 Define complete Prisma schema (User, Course, Payment, Enrollment, etc.) in `backend/prisma/schema.prisma`
- [X] T008 Generate initial Prisma migration and client
- [X] T072 Add `postgres` (postgres:16-alpine) and `redis` (redis:7-alpine) service containers with health options to the `backend` job in `.github/workflows/ci.yml`, set `TEST_DATABASE_URL` and `REDIS_URL` in the job env, and run `prisma migrate deploy` before `npm test` so CI executes the integration tests against real services
      - Migrations are applied by the T071 `globalSetup`, which creates the test database and runs `prisma migrate deploy` against `TEST_DATABASE_URL` once per run. No separate CI step: a standalone `prisma migrate deploy` would target `DATABASE_URL` (the development database) and leave the test database unmigrated.
- [X] T009 [P] Setup Express app, global error handling, and Zod validation middleware in `backend/src/app.ts` and `backend/src/middleware/error.ts`
      - Also added `backend/src/config/env.ts` (Zod-validated process env) and `backend/src/middleware/validate.ts` (the Zod request-validation middleware Principle I requires at the controller boundary). `src/app.ts` exports the configured app as default so supertest can drive it in-process; `apiV1` is the mount point for the feature routers that later tasks own.
      - Added the `TRUST_PROXY_HOPS` env key (default 0). `express-rate-limit` reads `req.ip`, which ignores `X-Forwarded-For` unless Express is told to trust it; trusting it unconditionally would let any caller spoof the header and defeat the per-IP limiters.
- [X] T073 Implement the shared Redis client (`REDIS_URL`, ioredis) and a Redis-backed rate limiter using `express-rate-limit` with `rate-limit-redis` — counters stored in Redis, not process memory, per constitution Principle VI — exposing per-IP and per-account limiters for the auth routes (login, register, forgot-password, reset-password) in `backend/src/lib/redis.ts` and `backend/src/middleware/rateLimit.ts`; consumed by T011 and T059
      - Under `NODE_ENV=test` the client resolves `TEST_REDIS_URL`, not `REDIS_URL`. The T071 harness flushes only the database named by `TEST_REDIS_URL`, so sharing it is what keeps rate-limit counters from leaking between tests.
      - T011/T059 MUST mount these limiters before the Zod validation middleware on each route. `passwordReset.test.ts` floods reset-password with an invalid password and still expects 429, so a limiter placed after validation would never be reached.
      - Redis keys are truncated SHA-256 digests of the email or reset token, never the raw value: a rate-limit counter should not accumulate user emails, and a raw reset token in a key would be a second copy of a credential the database stores only as a hash.
- [X] T010 [P] Implement authentication service (bcrypt, JWT) in `backend/src/services/authService.ts`
      - Also added `backend/src/lib/prisma.ts` (shared client; no task owned it and T010 is the first consumer needing database access) and `backend/src/config/jwt.ts` (Zod-validated auth secrets, kept out of `config/env.ts` so importing the app without auth does not require them).
      - Refresh tokens are signed JWTs **and** persisted rows. A stateless token cannot be revoked, which the contract requires at logout (section 4) and on password reset (section 7), so the database is the revocation authority. The `token` column stores the exact emitted string because `auth.test.ts` looks a token up by the raw cookie value.
      - The signed payload carries a random `jti`. Without it the only varying claims are `iat`/`exp` at one-second resolution, so two logins in the same second sign an identical token and collide with the `@unique` constraint — an ordinary repeat login would 500. Caught by a probe before any suite ran.
      - `verifyCredentials` always runs one bcrypt comparison, against a dummy hash when no user matches, so "no such account" is not measurably faster than "wrong password" (no enumeration, contract section 6).
      - The `role` claim in the access token is a hint for cheap UI decisions, never an authority. T012 MUST re-read the role from the database; `auth.test.ts:467` asserts a token claiming ADMIN for a STUDENT account is still refused.
- [X] T011 [P] Implement Auth controller and routes in `backend/src/controllers/authController.ts` and `backend/src/routes/v1/authRoutes.ts`
      - Scope is contract sections 1-5 only (register, login, me, refresh, logout). Sections 6-7 stay with T058/T059; `authRoutes.ts` notes where they mount.
      - Route order on every endpoint is limiters → Zod → controller, per T073. Registration is `z.object` (not `.strict()`), so Zod strips an injected `role` key and the controller hard-codes `role: 'STUDENT'` — two independent reasons FR-001 holds (`auth.test.ts:203`).
      - Login validates the password for presence only, never strength. Applying the registration rules would answer a wrong password with 400 and make the shape of a submitted password observable; a weak-but-correct legacy password must still fail as an ordinary 401.
      - Registration pre-checks the email for the contract's 409 **and** catches Prisma `P2002`: two concurrent registrations both pass the pre-check, and the unique index is what actually decides, so the loser must still get 409 rather than a 500.
      - The refresh cookie's `Max-Age` is derived from the token's own `exp` claim rather than recomputed from config, so cookie and token cannot disagree — a cookie outliving its token leaves the browser presenting a credential that can only 401. It is pathed at `/api/v1/auth` (only refresh and logout read it) and `secure` unconditionally, so the attribute under test is the attribute that ships; local dev therefore needs HTTPS or a localhost-exempting browser.
      - Logout resolves the presented token to its owner and revokes only if that owner is the caller. Revoking purely by value would let any authenticated user kill another user's session with a token they had obtained. It is otherwise idempotent and always 200: a logout that fails is a logout that leaves someone signed in.
      - Password policy is 8+ chars with lower, upper, and digit, capped at 72 bytes. The cap is a bcrypt property, not a product choice — bcrypt ignores input past 72 bytes, so without it two different long passwords would authenticate the same account. Length alone would also admit `'password'`, which `auth.test.ts:185` rejects.
      - `/me` lists ACTIVE enrollments only: a REVOKED row confers no access, and returning it invites a frontend to treat it as if it did.
      - Not run: the integration suites. Instructed to hold off, so this is typecheck- and lint-verified only. `npx tsc --noEmit` is clean apart from three pre-existing errors in `passwordReset.test.ts`, which imports the T057 `emailSender` module that does not exist yet.
- [X] T012 [P] Implement role-based authorization middleware (Admin vs Student) in `backend/src/middleware/auth.ts`
      - `requireAuth` re-reads the user from the database on every request and ignores the token's `role` claim entirely. Verified by probe: a token signed with our own secret claiming ADMIN for a STUDENT row still gets 403, and a token issued while the user was ADMIN gets 403 after demotion. Deliberately not cached in Redis — a cache would reintroduce exactly the staleness the database read exists to remove.
      - `req.user` is the sanitised `PublicUser`, not the Prisma `User`, so a controller that spreads it into a response body cannot leak `passwordHash`. This module establishes the `Express.Request.user` augmentation.
      - `requireRole` returns 401 (not a crash or a pass) when reached without an authenticated user, so a misordered route fails closed. `requireAdmin`/`requireStudent` bundle `requireAuth` to make that misordering hard.
      - `requireAuth` is a plain `async` handler with no try/catch: Express 5 forwards a rejected handler promise to the error handler (`router/index.js` checks `isPromise`), so a database outage becomes the generic 500. A `void (async () => ...)()` wrapper would hand the router `undefined` and turn an unexpected throw into an unhandled rejection.
- [ ] T013 [P] Setup frontend Axios instance with auth interceptors in `frontend/src/services/api.ts`
- [ ] T014 [P] Create frontend Auth context/store in `frontend/src/store/authStore.ts`
- [ ] T056 [P] Implement password reset service (crypto-random token hashed at rest, single-use consumption, expiry window, bcrypt re-hash of the new password, refresh-token revocation) in `backend/src/services/passwordResetService.ts`
- [ ] T057 [P] Define the `EmailSender` interface and its transactional-provider adapter plus password-reset template in `backend/src/services/email/emailSender.ts`
- [ ] T058 Implement forgot-password and reset-password controllers with Zod schemas and an identical response whether or not the email exists in `backend/src/controllers/authController.ts`
- [ ] T059 Wire `POST /api/v1/auth/forgot-password` and `POST /api/v1/auth/reset-password` routes with per-IP and per-account rate limiters in `backend/src/routes/v1/authRoutes.ts`
- [ ] T060 [P] Build frontend ForgotPassword screen (email form, inline validation, loading/error/success states, same confirmation for unknown emails) in `frontend/src/pages/auth/ForgotPassword.tsx`
- [ ] T061 [P] Build frontend ResetPassword screen (token read from URL, new password + confirm fields, expired/already-used token error state) in `frontend/src/pages/auth/ResetPassword.tsx`

**Checkpoint**: Foundation ready - user story implementation can now begin.

---

## Phase 3: User Story 1 - Admin Builds and Publishes a Course Catalog (Priority: P1)

**Goal**: Admin creates courses, sections, uploads videos/attachments, and publishes them to the catalog.

### Tests for User Story 1
- [ ] T015 [P] [US1] Integration tests for Course/Section/Video CRUD in `backend/tests/integration/courseAdmin.test.ts`

### Implementation for User Story 1
- [ ] T016 [P] [US1] Implement Course, Section, and Video services in `backend/src/services/courseService.ts`
- [ ] T017 [P] [US1] Implement S3 upload utility for thumbnails, videos, and attachments in `backend/src/utils/s3.ts`
- [ ] T018 [US1] Implement Course controllers and Zod schemas in `backend/src/controllers/courseController.ts`
- [ ] T019 [US1] Wire API routes for courses, sections, and videos in `backend/src/routes/v1/courseRoutes.ts`
- [ ] T020 [P] [US1] Build frontend Admin Course List page in `frontend/src/pages/admin/CourseList.tsx`
- [ ] T021 [P] [US1] Build frontend Course Editor (Create/Edit form) in `frontend/src/pages/admin/CourseEditor.tsx`
- [ ] T022 [P] [US1] Build frontend Section/Video/Attachment manager component in `frontend/src/components/admin/CurriculumBuilder.tsx`

---

## Phase 4: User Story 2 - Student Buys and Watches a Course (Priority: P1)

**Goal**: Student registers, views catalog, submits manual payment proof, and watches gated videos.

### Tests for User Story 2 (Constitution Requirement) ⚠️
- [ ] T023 [P] [US2] Write tests for Payment submission (one pending limit) in `backend/tests/integration/paymentSubmit.test.ts`
- [ ] T024 [P] [US2] Write tests for Enrollment access (video signed URLs gated by enrollment) in `backend/tests/integration/videoAccess.test.ts`
- [ ] T067 [P] [US2] Write integration tests for `GET /api/v1/enrollments/me` and `GET /api/v1/payments/me` ownership (caller sees only their own rows, a second student's enrollments and payments are never returned, no `userId` parameter can widen the scope, Admin and unauthenticated callers rejected, `declineReason` present only on the caller's own declined payments) in `backend/tests/integration/studentSelfService.test.ts`

### Implementation for User Story 2
- [ ] T025 [P] [US2] Implement payment submission service (screenshot upload, EGP snapshot, pending check) in `backend/src/services/paymentService.ts`
- [ ] T026 [P] [US2] Implement video access service (S3 signed URL generation) in `backend/src/services/videoAccessService.ts`
- [ ] T027 [US2] Implement controllers and routes for Payments and Watch endpoints in `backend/src/controllers/studentController.ts` and `backend/src/routes/v1/studentRoutes.ts`
- [ ] T028 [P] [US2] Build frontend Public Catalog page in `frontend/src/pages/public/Catalog.tsx`
- [ ] T029 [P] [US2] Build frontend Course Detail/Checkout page (displays InstaPay, locked player) in `frontend/src/pages/public/CourseDetail.tsx`
- [ ] T030 [P] [US2] Build frontend Payment Proof Upload modal in `frontend/src/components/student/PaymentModal.tsx`
- [ ] T031 [P] [US2] Build frontend Course Player page in `frontend/src/pages/student/CoursePlayer.tsx`
- [ ] T032 [US2] Integrate custom Video Player component supporting signed URLs in `frontend/src/components/student/VideoPlayer.tsx`
- [ ] T068 [US2] Implement `GET /api/v1/enrollments/me` service, controller, and Student-only route returning the caller's enrolled courses with status and `progressPercent` placeholder, scoped to `req.user.id` in `backend/src/services/enrollmentService.ts` and `backend/src/routes/v1/enrollmentRoutes.ts`
- [ ] T069 [US2] Implement `GET /api/v1/payments/me` service, controller, and Student-only route returning the caller's own payments with status, `declaredAmount`, and `declineReason`, scoped to `req.user.id` and excluding admin review fields in `backend/src/services/paymentService.ts` and `backend/src/routes/v1/studentRoutes.ts`
- [ ] T062 [P] [US2] Build frontend Student My Courses page listing the caller's enrolled courses with progress and empty state in `frontend/src/pages/student/MyCourses.tsx`
- [ ] T063 [P] [US2] Build frontend Student My Payments page listing the caller's own payments with status and decline reason, plus empty state in `frontend/src/pages/student/MyPayments.tsx`

---

## Phase 5: User Story 3 - Admin Reviews Payments (Priority: P1)

**Goal**: Admin reviews submitted screenshots, handles duplicate/mismatch flags, and approves (granting atomic enrollment) or declines.

### Tests for User Story 3 (Constitution Requirement) ⚠️
- [ ] T033 [P] [US3] Write tests for Payment Approval (Prisma `$transaction` atomicity) and Decline in `backend/tests/integration/paymentReview.test.ts`
- [ ] T034 [P] [US3] Write tests for Revoke Access in `backend/tests/integration/enrollmentRevoke.test.ts`

### Implementation for User Story 3
- [ ] T035 [P] [US3] Implement duplicate screenshot hash check and amount mismatch flag logic in `backend/src/services/paymentService.ts`
- [ ] T036 [US3] Implement payment approval `$transaction` and decline logic in `backend/src/services/adminPaymentService.ts`
- [ ] T037 [US3] Implement controllers/routes for admin payment review in `backend/src/controllers/adminPaymentController.ts` and `backend/src/routes/v1/adminPaymentRoutes.ts`
- [ ] T038 [P] [US3] Build frontend Admin Payments Review dashboard in `frontend/src/pages/admin/PaymentReview.tsx`
- [ ] T039 [P] [US3] Build frontend full-resolution screenshot lightbox in `frontend/src/components/admin/ScreenshotLightbox.tsx`
- [ ] T064 [US3] Implement revoke enrollment service setting `Enrollment.status` to `REVOKED` and leaving the `Payment` record unchanged in `backend/src/services/enrollmentService.ts`
- [ ] T065 [US3] Implement `POST /api/v1/enrollments/:enrollmentId/revoke` controller with Zod param schema and Admin-only route in `backend/src/controllers/enrollmentController.ts` and `backend/src/routes/v1/enrollmentRoutes.ts`
- [ ] T066 [US3] Add a Revoke Access button with a confirmation step naming the student and course to the admin payment review page in `frontend/src/pages/admin/PaymentReview.tsx`

---

## Phase 6: User Story 4 - Enrolled Student Asks Questions on a Video (Priority: P2)

**Goal**: One-level comments thread under videos for enrolled students and admins.

### Tests for User Story 4
- [ ] T040 [P] [US4] Write tests for comment CRUD, enrollment guarding, and cascade deletion in `backend/tests/integration/comments.test.ts`

### Implementation for User Story 4
- [ ] T041 [P] [US4] Implement Comment service in `backend/src/services/commentService.ts`
- [ ] T042 [US4] Implement Comment controllers and routes in `backend/src/controllers/commentController.ts` and `backend/src/routes/v1/commentRoutes.ts`
- [ ] T043 [P] [US4] Build frontend Comment Thread component in `frontend/src/components/shared/CommentThread.tsx`
- [ ] T044 [US4] Integrate Comment Thread into the Course Player page

---

## Phase 7: User Story 5 - Private Admin ↔ Student Chat (Priority: P2)

**Goal**: Real-time WebSocket chat between Admin and Students with immutable messages and unread counts.

### Tests for User Story 5 (Constitution Requirement) ⚠️
- [ ] T045 [P] [US5] Write tests for Socket.IO authentication and room membership permission guarding in `backend/tests/integration/chatPermissions.test.ts`

### Implementation for User Story 5
- [ ] T046 [P] [US5] Implement Message and Conversation DB services in `backend/src/services/chatService.ts`
- [ ] T047 [US5] Setup Socket.IO server, authentication handshake, and room emit logic in `backend/src/websockets/chatHandler.ts`
- [ ] T048 [US5] Implement REST fallback endpoints for chat history in `backend/src/controllers/chatController.ts`
- [ ] T049 [P] [US5] Create frontend WebSocket context and hooks in `frontend/src/hooks/useChatSocket.ts`
- [ ] T050 [P] [US5] Build frontend Admin Unified Inbox page in `frontend/src/pages/admin/UnifiedInbox.tsx`
- [ ] T051 [P] [US5] Build frontend Student Messages page in `frontend/src/pages/student/Messages.tsx`

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T052 [P] Implement responsive empty states across frontend (Dashboards, Comments, Chat) in `frontend/src/components/ui/EmptyState.tsx`
- [ ] T053 [P] Ensure 360px viewport responsiveness across all primary pages
- [ ] T054 [P] Code cleanup, remove console logs, and run static analysis on both repositories
- [ ] T055 Document `.env.example` configurations and populate `docs/quickstart.md`