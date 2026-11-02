# Research & Architectural Decisions: Zizo LMS

**Feature Branch**: `001-zizo-lms`  
**Spec Reference**: `specs/001-zizo-lms/spec.md`  
**Constitution Reference**: `.specify/memory/constitution.md`

---

## 1. Core Technical Stack & Decisions

### 1.1 Architecture & Project Structure: Standalone Web Application (No Monorepo)
- **Decision**: Traditional two-tier multi-folder layout: `backend/` and `frontend/` without `pnpm-workspaces` or Lerna/Turborepo monorepo tooling.
- **Rationale**: Direct adherence to user instruction ("Do not add a monorepo"). Avoids package linking complexities, hoisted dependency issues, and build tool overhead while keeping frontend and backend decoupled and independently deployable.
- **Alternatives Considered**: pnpm workspaces / Turborepo (rejected per user constraint).

### 1.2 Frontend Framework: React 18 + TypeScript + Tailwind CSS
- **Decision**: React 18 (specifically React 18.3.x) initialized via Vite with TypeScript strict mode enabled (`"strict": true`, `noImplicitAny`, `strictNullChecks`, `noUncheckedIndexedAccess`).
- **Styling**: Tailwind CSS v3 with typography and forms plugins.
- **Routing & State**: React Router v6, TanStack Query (React Query) v5 for server state caching and optimistic updates, Axios with interceptors for token refresh.
- **Video Player**: Video.js or standard HTML5 `<video>` custom-styled player with signed URL ingestion and progress synchronization.
- **Icons & UI Utilities**: Lucide-react, clsx, tailwind-merge, react-hot-toast.

### 1.3 Backend Framework: Node.js + Express + TypeScript
- **Decision**: Express 4 with TypeScript executed via `tsx` in development and compiled to JavaScript via `tsc` for production.
- **API Routing**: Clean REST design strictly scoped under `/api/v1/`.
- **Layered Architecture**: 
  - `routes/`: Routing definition and middleware attachment.
  - `controllers/`: HTTP request validation (Zod) and response serialization.
  - `services/`: Core business logic and transaction boundaries.
  - `prisma/`: Database persistence and migrations.
- **Rationale**: Complies with Constitution Principle I (layered separation) and Principle III (server-side security).

### 1.4 Database & ORM: PostgreSQL + Prisma ORM
- **Decision**: PostgreSQL (v16) with Prisma ORM.
- **Migration Policy**: Strictly Prisma Migrate (`prisma migrate dev` / `prisma migrate deploy`). No `prisma db push` in production.
- **Transactions**: Multi-table atomic operations (e.g., payment approval + enrollment creation) executed inside `prisma.$transaction`.
- **Separation of Concerns**: `Payment` (immutable audit record of transaction attempt) is completely decoupled from `Enrollment` (access entitlement). Content authorization always checks `Enrollment`, never `Payment.status`.

### 1.5 Realtime Communication: Socket.IO
- **Decision**: Socket.IO v4 attached to Node.js HTTP server.
- **Authentication**: JWT verification during connection handshake (`io.use((socket, next) => ...)`).
- **Rooms**:
  - `user:<userId>` for personal notifications and payment status updates.
  - `conversation:<conversationId>` for student-admin direct messaging.
  - `admins` for instructor broadcast alerts (e.g., new InstaPay submission).
- **Immutability**: Messages cannot be edited or deleted by either party (preserving audit trail for payment/course disputes).

### 1.6 Private Media Storage: S3-Compatible Storage with Short-Lived Signed URLs
- **Decision**: AWS SDK v3 (`@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`) targeting AWS S3, Cloudflare R2, or local MinIO.
- **Access Pattern**:
  - All S3 buckets are 100% private with public access blocked.
  - Video stream access: Frontend requests `GET /api/v1/courses/:courseId/videos/:videoId/playback`. Backend validates caller's `Enrollment` record, then generates a pre-signed `GetObject` URL valid for ≤ 15 minutes.
  - Attachments: Backend verifies enrollment and returns signed download URL.
  - Payment screenshot upload: Frontend requests `POST /api/v1/payments/upload-url`, receives pre-signed `PutObject` URL, uploads binary directly from browser to S3. Backend never proxies heavy file bytes.
  - Screenshot deduplication: Frontend or backend computes SHA-256 of uploaded image (`screenshotHash`) to flag duplicate submissions across accounts.

### 1.7 Password Reset Email Delivery: Transactional Provider Behind an Interface
- **Decision**: Password reset emails are sent through a transactional email provider, accessed only through an `EmailSender` interface (`sendPasswordReset(...)`) owned by the backend. Services depend on the interface, never on a provider SDK, so the concrete provider can be swapped by replacing a single adapter. Tests inject a fake sender and assert on the captured message.
- **Deferred**: The specific provider (e.g. SES, Resend, Postmark, SendGrid) is NOT chosen in this version; the adapter and its credentials are configured via environment variables.
- **Rationale**: Delivery is a vendor concern with no bearing on the reset flow's correctness. Keeping it behind an interface avoids blocking Phase 2 on a procurement decision and keeps the provider out of the test path.

---

## 2. Security & Compliance Checklist (Constitution Alignment)

| Requirement | Implementation Detail | Constitution Gate |
|---|---|---|
| **Type Safety** | `"strict": true`, `noImplicitAny`, `noUncheckedIndexedAccess`, Zod parsing at boundary | Principle I |
| **Testing** | Vitest for unit & integration tests; Supertest for API routes | Principle II |
| **Server-Side Authorization** | `authenticate` (JWT) + `requireRole` + `requireEnrollment` middlewares | Principle III |
| **Password Security** | bcrypt with salt rounds ≥ 12 | Principle III |
| **Signed URL Expiry** | Max 15 minutes (900 seconds) | Principle III |
| **Rate Limiting** | `express-rate-limit` on `/api/v1/auth/login`, `/api/v1/auth/register`, `/api/v1/payments` | Principle III |
| **Schema Governance** | Prisma Migrate exclusively; atomic `$transaction` for enrollment | Principle IV |
| **UX Consistency** | Inline validation, loading spinners, actionable error alerts, 360px mobile baseline | Principle V |
