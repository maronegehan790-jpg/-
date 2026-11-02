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

**⚠️ CRITICAL TESTS**: Authentication tests must be written first per constitution.

- [ ] T006 [P] Write integration tests for authentication (login, JWT, role guarding) in `backend/tests/integration/auth.test.ts`
- [ ] T006a [P] Write integration tests for the forgot-password / reset-password flow (token issued, single-use, expiry rejected, per-IP and per-account rate limit, password re-hashed on success, no account enumeration in the response) in `backend/tests/integration/passwordReset.test.ts`

**Implementation**:
- [ ] T007 Define complete Prisma schema (User, Course, Payment, Enrollment, etc.) in `backend/prisma/schema.prisma`
- [ ] T008 Generate initial Prisma migration and client
- [ ] T009 [P] Setup Express app, global error handling, and Zod validation middleware in `backend/src/app.ts` and `backend/src/middleware/error.ts`
- [ ] T010 [P] Implement authentication service (bcrypt, JWT) in `backend/src/services/authService.ts`
- [ ] T011 [P] Implement Auth controller and routes in `backend/src/controllers/authController.ts` and `backend/src/routes/v1/authRoutes.ts`
- [ ] T012 [P] Implement role-based authorization middleware (Admin vs Student) in `backend/src/middleware/auth.ts`
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