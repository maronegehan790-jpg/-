# Zizo LMS — Product Requirements Document

---

## 1. Project Identity

| Field | Value |
|---|---|
| Project Name | Zizo LMS |
| Project ID | PRD-001 |
| Version | v1.0 |
| Status | Draft |
| Priority | High |
| Created Date | 2026-10-26 |
| Last Updated | 2026-10-26 |
| Owner | Zizo |
| Team Members | Frontend Dev [TBD], Backend Dev [TBD], Designer [TBD], QA [TBD] |
| Tech Stack | React 18 + TypeScript + Tailwind CSS; Node.js + Express + TypeScript + Prisma; PostgreSQL + Redis; S3-compatible object storage; Vercel + Railway; GitHub Actions |
| Repository | [TBD] |
| Git Branch Prefix | NNN-feature-name |
| PRD File Path | docs/PRD.md |

---

## 2. Problem & Purpose

### Problem Statement
The instructor has courses ready to sell but no dedicated platform. Students have no single place to browse the courses, pay for them, watch the videos, and communicate with the instructor. Payment, content delivery, and support currently depend on scattered tools.

### Project Purpose
Build a self-owned Learning Management System (LMS), similar in learning experience to Udemy, for the instructor's own courses only. The platform is not a SaaS product and not a multi-instructor marketplace. It has two roles: Admin (the instructor) and Student.

### Business Value
- Full ownership of course content, pricing, branding, and student relationships.
- No marketplace fees or commissions.
- A manual InstaPay payment flow that matches how the target students already pay.
- Direct communication between the instructor and each student through in-platform chat and video comments.

### Opportunity
A single platform replaces fragmented tools for hosting, payment collection, and student support. This reduces the instructor's administrative overhead and creates one consistent learning experience for every student.

---

## 3. Goals & Objectives

### Primary Goal
Launch a fully working LMS by 2026-12-21 where students can browse courses, pay manually via InstaPay, watch videos after payment approval, and chat with the admin.

### Objectives
1. Deliver role-based access with two dashboards (Admin and Student) by the end of Phase 1 (2026-11-08).
2. Enable the Admin to create courses and upload videos with descriptions and attachments by the end of Phase 1.
3. Enable manual InstaPay payment with screenshot upload and Admin accept/decline by the end of Phase 2 (2026-11-22).
4. Enable video comments and Admin–Student chat by the end of Phase 2.
5. Reach a median payment review time of 12 hours or less and an error rate below 0.1% within 30 days after launch.

### Success Definition
The project is successful when a new Student can register, submit an InstaPay payment proof, receive Admin approval, watch the course videos, comment on a video, and message the Admin, all without any manual intervention outside the platform (except the Admin's review action). All P0 acceptance criteria pass in QA, and the KPI targets in Section 12 are met within 30 days of public launch.

### Non-Goals
- Automated payment gateway integration.
- Multi-instructor or marketplace functionality.
- Native mobile application.
- Certificates, affiliate system, and live streaming.

---

## 4. Scope

### In Scope
- Two roles: Admin and Student, each with a dedicated dashboard.
- Course management: create, edit, publish, unpublish, delete courses and sections.
- Video upload with a description and downloadable attachments per video.
- Public course catalog and course detail pages.
- Manual payment via InstaPay: payment instructions, screenshot upload, Admin accept/decline with reason.
- Video playback restricted to students with an approved enrollment.
- Video comments with Admin replies.
- One-to-one chat between each Student and the Admin.

### Out of Scope
- Automatic payment gateway.
- Mobile application.
- Certificates.
- Affiliate system.
- Live streaming.
- Multi-instructor support, reviews and ratings, coupons, and subscriptions.

### Assumptions
- A single Admin account (the instructor) exists. It is created by a seed script at deployment, and no public Admin registration exists.
- All prices are set in EGP and displayed as a single fixed price per course.
- Payments are made by transfer to one InstaPay account configured by the Admin in settings.
- Students access the platform through a modern desktop or mobile browser.
- Transactional email (password reset, notifications) is sent through a third-party email provider [TBD].
- Video files are uploaded by the Admin in MP4 (H.264) format.

### Constraints
- Delivery deadline: 8 weeks from 2026-10-26 (launch on 2026-12-21).
- No payment gateway means every payment requires manual Admin review.
- Video storage and bandwidth costs are borne by the Owner.
- Maximum upload sizes: video 2 GB, attachment 50 MB, payment screenshot 5 MB.

### Dependencies
- Object storage provider (S3-compatible) for videos, attachments, and payment screenshots.
- Email delivery provider for password reset and notification emails.
- Design assets and UI design from the Designer, ready before Phase 1 ends.
- Admin availability to review payments and answer chat messages.
- Hosting accounts on Vercel and Railway.

---

## 5. Users & Personas

### Primary Users
Students who purchase and consume the instructor's courses.

### Secondary Users
The Admin (the instructor), who manages courses, reviews payments, and supports students.

### Persona 1 — Student

| Attribute | Detail |
|---|---|
| Name | Omar (Student) |
| Role | Student |
| Goal | Access all purchased courses in one place and watch the videos easily |
| Pain Point | No quick way to pay and ask the instructor directly; communication is scattered across tools |
| Tech Level | Low to Medium |
| Frequency | Daily to weekly |
| Success Definition | Omar pays, is approved, watches the course videos, and receives an answer from the Admin within one working day |

### Persona 2 — Admin

| Attribute | Detail |
|---|---|
| Name | Zizo (Admin) |
| Role | Admin / Instructor / Product Owner |
| Goal | Manage courses, review payments, and answer students from one dashboard |
| Pain Point | Manual tracking of payments and student questions across multiple apps |
| Tech Level | Medium |
| Frequency | Daily |
| Success Definition | Zizo reviews every payment proof and answers every student message from the dashboard in under 12 hours on average |

---

## 6. MoSCoW Feature Prioritization

### Must Have — P0

| ID | Feature | Status | Description | Assigned To | Sprint |
|---|---|---|---|---|---|
| P0-F001 | Authentication and Role-Based Access | TODO | Email/password login and registration, Admin and Student roles, protected routes and endpoints | Backend Dev / Frontend Dev | Sprint 1 |
| P0-F002 | Course Management and Catalog | TODO | Admin creates, edits, publishes, and deletes courses and sections; Students browse a public catalog | Backend Dev / Frontend Dev | Sprint 1 |
| P0-F003 | Video Management | TODO | Admin uploads videos, writes a description, and attaches downloadable files | Backend Dev / Frontend Dev | Sprint 1 |
| P0-F004 | Manual InstaPay Payment Submission | TODO | Student views payment instructions and uploads a payment screenshot for a course | Frontend Dev / Backend Dev | Sprint 2 |
| P0-F005 | Admin Payment Review | TODO | Admin views payment proofs and accepts or declines them with a reason | Frontend Dev / Backend Dev | Sprint 2 |
| P0-F006 | Video Playback and Access Control | TODO | Approved Students watch course videos; unapproved users are blocked | Backend Dev / Frontend Dev | Sprint 2 |
| P0-F007 | Video Comments | TODO | Students and Admin post comments and replies under each video | Frontend Dev / Backend Dev | Sprint 2 |
| P0-F008 | Admin–Student Chat | TODO | One-to-one real-time chat between each Student and the Admin in both dashboards | Backend Dev / Frontend Dev | Sprint 2 |

> **Note on P0-F001 status (2026-11-26):** P0-F001 stays `TODO`. The authentication backend foundation is implemented (register, login, refresh rotation, logout, role-based authorization, forgot/reset password, Redis rate limiting), along with the frontend API client, auth store, and Forgot/Reset Password screens. The user-facing feature is not complete: the Login and Register pages, frontend route guards, and role-based redirects are tracked as T074 in `specs/001-zizo-lms/tasks.md`, a mandatory prerequisite before Phase 3. The "account locks for 15 minutes after 5 failed logins" criterion is also unresolved: the implementation rate-limits login attempts rather than locking the account, recorded as T075 pending a decision.

### Should Have — P1

| ID | Feature | Status | Description | Assigned To | Sprint |
|---|---|---|---|---|---|
| P1-F001 | Course Search | TODO | Students search published courses by title and description | Backend Dev / Frontend Dev | Sprint 3 |
| P1-F002 | Student Progress Tracking | TODO | Videos are marked complete and course progress is shown as a percentage | Backend Dev / Frontend Dev | Sprint 3 |
| P1-F003 | Notifications | TODO | In-app notifications for payment status changes and new chat messages | Backend Dev / Frontend Dev | Sprint 3 |
| P1-F004 | Profile Page | TODO | Users update name, avatar, and password | Frontend Dev / Backend Dev | Sprint 3 |
| P1-F005 | Admin Statistics Dashboard | TODO | Admin views total students, approved payments, pending payments, and revenue | Backend Dev / Frontend Dev | Sprint 3 |

### Could Have — P2

| ID | Feature | Status | Description | Assigned To | Sprint |
|---|---|---|---|---|---|
| P2-F001 | Dark Mode | TODO | Theme toggle for both dashboards | Frontend Dev | Sprint 4 (if capacity allows) |
| P2-F002 | Keyboard Shortcuts | TODO | Player shortcuts (space, arrows, F) and navigation shortcuts | Frontend Dev | Sprint 4 (if capacity allows) |
| P2-F003 | Bulk Actions | TODO | Admin approves or declines multiple payments at once | Frontend Dev / Backend Dev | Sprint 4 (if capacity allows) |

### Won't Have — P3

| ID | Feature | Status | Description | Assigned To | Sprint |
|---|---|---|---|---|---|
| P3-F001 | Automatic Payment Gateway | SKIPPED | Card or wallet gateway integration; deferred to v2 | N/A | N/A |
| P3-F002 | Mobile Application | SKIPPED | Native iOS and Android apps; deferred to v2 | N/A | N/A |
| P3-F003 | Certificates | SKIPPED | Completion certificates; deferred to v2 | N/A | N/A |
| P3-F004 | Affiliate System | SKIPPED | Referral links and commissions; deferred to v2 | N/A | N/A |
| P3-F005 | Live Streaming | SKIPPED | Live classes; deferred to v2 | N/A | N/A |

---

## 7. Functional Requirements

### 7.1 User Flows

**Flow A — Student: from landing to watching a paid video**
1. Omar opens the public course catalog at /courses.
2. Omar opens the "Course X" detail page and reads the title, price, sections, and video list (video playback is locked).
3. Omar clicks "Enroll"; the system redirects unauthenticated users to /register.
4. Omar registers with name, email, and password, and the system logs him in.
5. The system opens the checkout page showing the course price, the Admin's InstaPay account, and transfer instructions.
6. Omar transfers the exact price through InstaPay in his bank app.
7. Omar returns to the checkout page, uploads the transfer screenshot, optionally enters the transaction reference, and clicks "Submit Payment".
8. The system saves the payment with status PENDING and displays "Payment submitted. Waiting for Admin review."
9. The Admin approves the payment; the system creates an Enrollment and sends Omar a notification.
10. Omar opens "My Courses", selects Course X, and plays a video.
11. Omar reads the video description, downloads an attachment, and posts a comment.
12. Omar opens "Chat" and sends a question to the Admin.

**Flow B — Admin: payment review**
1. Zizo logs in and lands on the Admin dashboard showing the count of pending payments.
2. Zizo opens "Payments" filtered by PENDING.
3. Zizo opens a payment and sees the Student name, course, amount, screenshot, reference, and submission time.
4. Zizo clicks "Approve" (the system creates the enrollment) or "Decline" and enters a mandatory reason.
5. The system updates the status, notifies the Student, and shows "Payment approved" or "Payment declined".

**Flow C — Admin: course and video publishing**
1. Zizo opens "Courses" and clicks "Create Course".
2. Zizo enters title, description, price, and thumbnail, and saves the course as DRAFT.
3. Zizo adds sections and uploads videos into each section with a title and description.
4. Zizo attaches files to each video.
5. Zizo clicks "Publish"; the course appears in the public catalog.

**Flow D — Chat**
1. Omar opens "Chat" and sends a message; the Admin sees the conversation in the inbox with an unread badge.
2. Zizo opens the conversation and replies; Omar receives the message in real time.

### 7.2 Feature Specifications

#### P0-F001 — Authentication and Role-Based Access

- **Description:** Email/password authentication with two roles, ADMIN and STUDENT. Students self-register. The Admin account is created by a seed script. JWT access tokens (15 minutes) and refresh tokens (7 days) with rotation are used.
- **User Story:** As Omar (Student), I want to create an account and log in so that I can access my courses.
- **Trigger:** A user opens /login or /register.
- **Pre-conditions:** For login, the account exists. For registration, the email is not already registered.
- **Post-conditions:** The user has a valid session and is redirected to the dashboard of their role.
- **Main Flow:**
  1. The user enters email and password on /login.
  2. The client validates the format inline.
  3. The client calls POST /api/v1/auth/login.
  4. The server verifies credentials and issues access and refresh tokens.
  5. The client stores the session and redirects ADMIN to /admin and STUDENT to /dashboard.
- **Alternate Flows:**
  - A1 — Invalid credentials: the server returns 401; the client shows "Invalid email or password".
  - A2 — Five failed attempts within 15 minutes: the account is locked for 15 minutes; the client shows "Too many attempts. Try again in 15 minutes."
  - A3 — Forgot password: the user submits an email; the server sends a reset link valid for 60 minutes; the user sets a new password.
- **Acceptance Criteria:**
  - [ ] A Student can register with name, email, and a password of at least 8 characters.
  - [ ] Registration with an existing email returns 409 and an inline error.
  - [ ] Passwords are stored hashed with bcrypt (cost 12 or higher).
  - [ ] ADMIN is redirected to /admin and STUDENT to /dashboard after login.
  - [ ] A Student requesting any /admin route or Admin-only endpoint receives 403.
  - [ ] An unauthenticated request to a protected endpoint returns 401.
  - [ ] Refresh tokens rotate on every refresh and the old token is invalidated.
  - [ ] The account locks for 15 minutes after 5 failed logins.
  - [ ] The password reset link expires after 60 minutes and works only once.

#### P0-F002 — Course Management and Catalog

- **Description:** The Admin manages courses and sections. Published courses appear in a public catalog for Students and visitors.
- **User Story:** As Zizo (Admin), I want to create and publish courses so that students can find and buy them.
- **Trigger:** The Admin opens "Courses" in the Admin dashboard, or a visitor opens /courses.
- **Pre-conditions:** The Admin is authenticated.
- **Post-conditions:** The course is stored; if published, it is visible in the catalog.
- **Main Flow:**
  1. The Admin clicks "Create Course".
  2. The Admin enters title, description, price (EGP), and thumbnail.
  3. The client validates required fields inline.
  4. The client calls POST /api/v1/courses.
  5. The server saves the course as DRAFT and returns it.
  6. The Admin adds sections with titles and reorders them.
  7. The Admin clicks "Publish"; the server sets status to PUBLISHED.
- **Alternate Flows:**
  - A1 — Publishing a course with no videos: the server returns 422 and the client shows "Add at least one video before publishing".
  - A2 — Deleting a course with active enrollments: the server returns 409 and the client offers "Unpublish" instead.
- **Acceptance Criteria:**
  - [ ] The Admin can create, edit, publish, unpublish, and delete a course.
  - [ ] Title (3 to 120 characters), description, and price (0 or greater) are required.
  - [ ] Only PUBLISHED courses appear in GET /api/v1/courses.
  - [ ] Draft courses return 404 for Students and visitors.
  - [ ] The course detail page lists sections and video titles, with playback locked for non-enrolled users.
  - [ ] A course with active enrollments cannot be deleted.
  - [ ] Sections can be created, renamed, reordered, and deleted.

#### P0-F003 — Video Management

- **Description:** The Admin uploads videos into course sections, writes a description for each, and attaches downloadable files.
- **User Story:** As Zizo (Admin), I want to upload a video with a description and attachments so that students get everything they need in one place.
- **Trigger:** The Admin clicks "Add Video" inside a section.
- **Pre-conditions:** The Admin is authenticated and the course and section exist.
- **Post-conditions:** The video, its description, and its attachments are stored and linked to the section.
- **Main Flow:**
  1. The Admin clicks "Add Video" and selects an MP4 file.
  2. The client requests a signed upload URL through POST /api/v1/videos/upload-url.
  3. The client uploads the file directly to object storage and shows a progress bar.
  4. The Admin enters the video title and description.
  5. The client calls POST /api/v1/sections/:sectionId/videos.
  6. The Admin adds attachments through POST /api/v1/videos/:id/attachments.
  7. The server saves the metadata and the video appears in the section.
- **Alternate Flows:**
  - A1 — Unsupported or oversized file: the client blocks it with "Only MP4 files up to 2 GB are allowed".
  - A2 — Upload interrupted: the client shows "Upload failed" with a Retry button; no video record is created.
  - A3 — Deleting an attachment: the Admin confirms and the file is removed from the video.
- **Acceptance Criteria:**
  - [ ] The Admin can upload an MP4 file up to 2 GB.
  - [ ] The upload shows a progress percentage and supports cancel.
  - [ ] Each video has a title (required) and a description (optional, up to 5,000 characters).
  - [ ] The Admin can attach multiple files (PDF, DOCX, PPTX, ZIP, up to 50 MB each) to a video.
  - [ ] The Admin can edit the title and description, reorder videos within a section, and delete a video.
  - [ ] File types are validated on the client and on the server.
  - [ ] Deleting a video removes its comments, attachments, and storage objects.

#### P0-F004 — Manual InstaPay Payment Submission

- **Description:** The Student pays outside the platform through InstaPay and submits the screenshot as proof. Each submission creates a PENDING payment.
- **User Story:** As Omar (Student), I want to send my InstaPay transfer proof so that I get access to the course.
- **Trigger:** The Student clicks "Enroll" on a course.
- **Pre-conditions:** The Student is authenticated, the course is PUBLISHED, and the Student has no active enrollment or PENDING payment for the course.
- **Post-conditions:** A payment with status PENDING exists; the Admin is notified.
- **Main Flow:**
  1. The system opens the checkout page showing the course price, the Admin's InstaPay account, and instructions.
  2. The Student transfers the price through InstaPay.
  3. The Student uploads a screenshot (JPG, PNG, or WebP, up to 5 MB) and optionally enters the transaction reference.
  4. The client validates the file and calls POST /api/v1/payments.
  5. The server stores the screenshot privately and creates the payment with status PENDING.
  6. The client shows "Payment submitted. Waiting for Admin review."
- **Alternate Flows:**
  - A1 — Payment declined: the Student sees the Admin's reason and a "Resubmit" button that creates a new payment.
  - A2 — A PENDING payment already exists: the server returns 409 and the client shows the existing payment status.
  - A3 — Student already enrolled: the Enroll button is replaced with "Go to Course".
- **Acceptance Criteria:**
  - [ ] The checkout page displays the course price and the InstaPay account configured by the Admin.
  - [ ] Only JPG, PNG, and WebP files up to 5 MB are accepted.
  - [ ] A payment without a screenshot cannot be submitted.
  - [ ] A Student cannot have more than one PENDING payment per course.
  - [ ] The Student can view all of their payments and statuses (PENDING, APPROVED, DECLINED) under "My Payments".
  - [ ] Screenshots are not publicly accessible and are served only to the owner and the Admin.
  - [ ] The server records a hash of each screenshot and flags the payment as "Possible duplicate" when the same hash exists on another payment.

#### P0-F005 — Admin Payment Review

- **Description:** The Admin reviews payment proofs and approves or declines them. Approval grants course access.
- **User Story:** As Zizo (Admin), I want to review each payment screenshot and accept or decline it so that only paying students get access.
- **Trigger:** The Admin opens "Payments" in the Admin dashboard.
- **Pre-conditions:** The Admin is authenticated and at least one payment exists.
- **Post-conditions:** The payment has status APPROVED or DECLINED; on approval an Enrollment exists.
- **Main Flow:**
  1. The Admin opens "Payments" and filters by PENDING (default).
  2. The Admin opens a payment detail view showing the Student, course, expected amount, screenshot, reference, and submission time.
  3. The Admin compares the screenshot with the InstaPay account balance or history.
  4. The Admin clicks "Approve"; the server sets APPROVED, creates the Enrollment, and notifies the Student.
- **Alternate Flows:**
  - A1 — Decline: the Admin clicks "Decline", enters a mandatory reason (up to 500 characters), and confirms; the server sets DECLINED and notifies the Student.
  - A2 — Revoke access: the Admin revokes an APPROVED enrollment; the Student loses access to the course videos.
  - A3 — Payment already reviewed (concurrent action): the server returns 409 and the client refreshes the status.
- **Acceptance Criteria:**
  - [ ] The Admin sees a paginated list of payments with filters for status and course.
  - [ ] The detail view shows the full-size screenshot.
  - [ ] Approving a payment creates exactly one Enrollment for that Student and course.
  - [ ] Declining requires a reason of at least 5 characters.
  - [ ] An already reviewed payment cannot be approved or declined again (409).
  - [ ] The Admin can revoke an enrollment, and the Student immediately loses video access.
  - [ ] The Student receives a notification (in-app, after P1-F003) and sees the updated status in "My Payments".
  - [ ] The review action is recorded with the reviewer ID and timestamp.

#### P0-F006 — Video Playback and Access Control

- **Description:** Students with an approved enrollment watch the course videos. Streaming URLs are short-lived signed URLs.
- **User Story:** As Omar (Student), I want to watch my purchased course videos so that I can learn at my own pace.
- **Trigger:** The Student opens a video in an enrolled course.
- **Pre-conditions:** The Student is authenticated and has an active Enrollment for the course.
- **Post-conditions:** The video plays; the description and attachments are displayed.
- **Main Flow:**
  1. The Student opens "My Courses" and selects a course.
  2. The Student selects a video from the section list.
  3. The client calls GET /api/v1/videos/:id.
  4. The server verifies the enrollment and returns the metadata plus a signed stream URL valid for 15 minutes.
  5. The player starts playback and displays the description, attachments, and comments.
- **Alternate Flows:**
  - A1 — No enrollment: the server returns 403 and the client shows "Enroll to watch this video".
  - A2 — Signed URL expired: the player requests a new URL automatically and resumes.
  - A3 — Video unavailable (storage error): the client shows "Video unavailable. Try again later" with a Retry button.
- **Acceptance Criteria:**
  - [ ] Only Students with an active Enrollment and the Admin can request a signed stream URL.
  - [ ] Signed URLs expire after 15 minutes and cannot be reused after expiry.
  - [ ] The player supports play/pause, seek, volume, playback speed (0.5x to 2x), and fullscreen.
  - [ ] Playback starts in under 3 seconds on a 10 Mbps connection.
  - [ ] Attachments are downloadable only by enrolled Students and the Admin.
  - [ ] A revoked enrollment blocks new stream URLs immediately.
  - [ ] The video description is displayed below the player.

#### P0-F007 — Video Comments

- **Description:** Enrolled Students and the Admin post comments and single-level replies under each video.
- **User Story:** As Omar (Student), I want to comment on a video so that I can ask questions about that lesson.
- **Trigger:** The user types in the comment box below a video.
- **Pre-conditions:** The user is the Admin or a Student with an active Enrollment for the course.
- **Post-conditions:** The comment is stored and visible to enrolled Students and the Admin.
- **Main Flow:**
  1. The Student types a comment (1 to 1,000 characters).
  2. The client validates the length and calls POST /api/v1/videos/:id/comments.
  3. The server stores the comment and returns it.
  4. The comment appears at the top of the list immediately.
- **Alternate Flows:**
  - A1 — Reply: the Admin or a Student clicks "Reply" and posts a reply linked to a parent comment (one level only).
  - A2 — Edit or delete own comment: the author edits or deletes it; the Admin can delete any comment.
  - A3 — Empty or over-length comment: the client blocks submission with an inline error.
- **Acceptance Criteria:**
  - [ ] Only enrolled Students and the Admin can read or post comments on a video.
  - [ ] Comments are limited to 1,000 characters and cannot be empty.
  - [ ] Comments show author name, role badge (Admin highlighted), and relative timestamp.
  - [ ] Replies are supported at one level only.
  - [ ] Authors can edit and delete their own comments; the Admin can delete any comment.
  - [ ] Comments load in pages of 20, newest first.

#### P0-F008 — Admin–Student Chat

- **Description:** Each Student has one conversation thread with the Admin. Both dashboards include a chat interface. Messages are delivered in real time over WebSocket.
- **User Story:** As Omar (Student), I want to message the Admin directly so that I can ask anything I need.
- **Trigger:** The user opens "Chat" in their dashboard.
- **Pre-conditions:** The user is authenticated. A Student does not need an enrollment to message the Admin.
- **Post-conditions:** The message is stored and delivered to the recipient.
- **Main Flow:**
  1. Omar opens "Chat"; the system loads his conversation (created on first message).
  2. Omar types a message (1 to 2,000 characters) and presses Send.
  3. The client emits the message through the socket and shows it with a "Sending" state.
  4. The server stores the message and delivers it to the Admin in real time.
  5. The Admin sees the conversation at the top of the inbox with an unread badge.
  6. The Admin replies; the reply reaches Omar in real time.
- **Alternate Flows:**
  - A1 — Recipient offline: the message is stored and shown as unread on next login.
  - A2 — Connection lost: the client shows "Reconnecting..." and retries; unsent messages show a Retry button.
  - A3 — Message over limit: the client blocks submission with an inline error.
- **Acceptance Criteria:**
  - [ ] Each Student has exactly one conversation with the Admin.
  - [ ] The Admin inbox lists all conversations sorted by latest message with unread counts.
  - [ ] Messages are delivered in under 2 seconds when both parties are online.
  - [ ] Messages persist and load in pages of 30, newest at the bottom.
  - [ ] A Student can only read their own conversation (403 otherwise).
  - [ ] Opening a conversation marks the other party's messages as read.
  - [ ] The client reconnects automatically after a connection loss.

#### P1-F001 — Course Search

- **Description:** Students and visitors search published courses by title and description.
- **User Story:** As Omar (Student), I want to search courses so that I can find the one I need quickly.
- **Trigger:** The user types in the catalog search box.
- **Pre-conditions:** At least one course is published.
- **Post-conditions:** The catalog shows matching courses.
- **Main Flow:**
  1. The user types a keyword (minimum 2 characters).
  2. The client waits 300 ms and calls GET /api/v1/courses?q=keyword.
  3. The server returns matching published courses.
  4. The client renders the results.
- **Alternate Flows:**
  - A1 — No results: the client shows "No courses match your search".
  - A2 — Keyword shorter than 2 characters: the full catalog is shown.
- **Acceptance Criteria:**
  - [ ] Search matches title and description, case-insensitive.
  - [ ] Results appear within 500 ms for catalogs up to 500 courses.
  - [ ] Draft courses never appear in results.
  - [ ] The empty state message is displayed when no course matches.

#### P1-F002 — Student Progress Tracking

- **Description:** The system records completed videos and shows course progress as a percentage.
- **User Story:** As Omar (Student), I want to see my progress so that I know what to watch next.
- **Trigger:** The Student watches a video to at least 90% of its duration or clicks "Mark as complete".
- **Pre-conditions:** The Student has an active Enrollment.
- **Post-conditions:** The video is marked complete and the course progress is updated.
- **Main Flow:**
  1. The player reports playback position every 15 seconds through POST /api/v1/videos/:id/progress.
  2. The server marks the video complete when the position reaches 90% of the duration.
  3. The client updates the checkmark and the course progress bar.
- **Alternate Flows:**
  - A1 — The Student reopens a video: playback resumes from the last saved position.
  - A2 — Progress save fails: the client retries silently up to 3 times.
- **Acceptance Criteria:**
  - [ ] Completed videos display a checkmark in the section list.
  - [ ] Course progress equals completed videos divided by total videos, rounded to a whole percent.
  - [ ] Playback resumes from the last saved position.
  - [ ] Progress is visible in "My Courses".

#### P1-F003 — Notifications

- **Description:** In-app notifications for payment status changes and new chat messages.
- **User Story:** As Omar (Student), I want to be notified when my payment is reviewed so that I know when I can start learning.
- **Trigger:** A payment is approved or declined, or a chat message is received while the user is not in that conversation.
- **Pre-conditions:** The user is authenticated.
- **Post-conditions:** A notification is stored and shown with an unread indicator.
- **Main Flow:**
  1. The server creates a notification for the recipient on the triggering event.
  2. The client receives it in real time or on next load.
  3. The bell icon shows the unread count.
  4. The user opens the list and clicks a notification, which marks it as read and navigates to the related page.
- **Alternate Flows:**
  - A1 — "Mark all as read": all notifications are marked read.
  - A2 — The Admin receives a notification when a new payment is submitted.
- **Acceptance Criteria:**
  - [ ] A Student is notified when a payment is approved or declined, with the decline reason.
  - [ ] The Admin is notified when a new payment is submitted.
  - [ ] Both roles are notified of new chat messages when not viewing the conversation.
  - [ ] The unread count is accurate and updates within 2 seconds.
  - [ ] Clicking a notification navigates to the related payment, course, or conversation.

#### P1-F004 — Profile Page

- **Description:** Users update their name, avatar, and password.
- **User Story:** As Omar (Student), I want to update my profile so that my information is correct.
- **Trigger:** The user opens "Profile".
- **Pre-conditions:** The user is authenticated.
- **Post-conditions:** The profile changes are saved.
- **Main Flow:**
  1. The user edits name or uploads an avatar (JPG, PNG, WebP, up to 2 MB).
  2. The client validates and calls PUT /api/v1/users/me.
  3. The server saves the changes and the client shows "Profile updated".
- **Alternate Flows:**
  - A1 — Password change: the user enters the current and new password; a wrong current password returns an inline error.
  - A2 — Invalid avatar file: the client rejects it with a message.
- **Acceptance Criteria:**
  - [ ] Name is required (2 to 80 characters).
  - [ ] Email is displayed and cannot be edited in v1.0.
  - [ ] Password change requires the correct current password and a new password of at least 8 characters.
  - [ ] All other sessions are invalidated after a password change.

#### P1-F005 — Admin Statistics Dashboard

- **Description:** The Admin dashboard shows key numbers about students, payments, and revenue.
- **User Story:** As Zizo (Admin), I want to see my platform numbers so that I can track business performance.
- **Trigger:** The Admin opens the dashboard home.
- **Pre-conditions:** The Admin is authenticated.
- **Post-conditions:** Statistics are displayed.
- **Main Flow:**
  1. The client calls GET /api/v1/admin/stats.
  2. The server returns total students, total enrollments, pending payments, approved payments, and total revenue (sum of approved payments).
  3. The client renders the values as cards and a per-course enrollment table.
- **Alternate Flows:**
  - A1 — No data: the cards display 0 and the table shows "No enrollments yet".
  - A2 — Request failure: the client shows an error with a Retry button.
- **Acceptance Criteria:**
  - [ ] The dashboard shows total students, pending payments, approved payments, and total revenue.
  - [ ] Revenue includes only APPROVED payments and excludes revoked enrollments.
  - [ ] The stats endpoint returns in under 500 ms.
  - [ ] Only the Admin can call the stats endpoint.

### 7.3 Edge Cases (Condition → System Behavior → User Feedback)

| Category | Condition | System Behavior | User Feedback |
|---|---|---|---|
| Validation | Invalid email format at registration | Request blocked client-side; server returns 422 if bypassed | Inline error: "Enter a valid email address" |
| Validation | Password shorter than 8 characters | Request rejected with 422 | Inline error: "Password must be at least 8 characters" |
| Validation | Screenshot with unsupported type or over 5 MB | Upload blocked; server rejects with 415 or 413 | "Only JPG, PNG, or WebP up to 5 MB" |
| Validation | Declining a payment without a reason | Request rejected with 422 | Inline error: "A reason is required" |
| Empty state | Student has no enrollments | "My Courses" renders the empty state | "You have no courses yet" with a Browse Courses button |
| Empty state | No published courses | Catalog renders the empty state | "No courses available yet" |
| Empty state | Video has no comments | Comment list renders the empty state | "No comments yet. Be the first to ask." |
| Empty state | Chat has no messages | Chat renders the empty state | "Send a message to start the conversation" |
| Empty state | No pending payments | Payments list renders the empty state | "No pending payments" |
| System failure | Network failure during screenshot upload | Upload aborted; no payment created | "Upload failed. Check your connection and retry." with a Retry button |
| System failure | Network failure during video upload | Upload aborted; no video record created | "Upload failed" with a Retry button |
| System failure | API returns 5xx on any request | Request is logged; the client retries idempotent GET requests once | "Something went wrong. Try again." with a Retry button |
| System failure | WebSocket disconnects | Client reconnects with exponential backoff; unsent messages kept locally | "Reconnecting..." banner; failed messages show Retry |
| System failure | Signed video URL expires during playback | Player requests a new URL and resumes at the same position | No visible interruption; "Reconnecting" only if it fails |
| Permission | Student opens an /admin route | Server returns 403; client redirects to /dashboard | "You do not have access to this page" |
| Permission | Non-enrolled user requests a video stream | Server returns 403 and no signed URL is issued | "Enroll to watch this video" |
| Permission | Student requests another Student's conversation or payment | Server returns 403 | "You do not have access" |
| Permission | Expired or invalid access token | Client attempts a refresh; on failure redirects to /login | "Session expired. Please log in again." |
| Duplicate / Conflict | Registration with an existing email | Server returns 409 | "This email is already registered" |
| Duplicate / Conflict | Second payment submission while one is PENDING | Server returns 409 | "You already have a pending payment for this course" |
| Duplicate / Conflict | Same screenshot hash used on another payment | Payment is created and flagged for the Admin | Student: normal submission message; Admin: "Possible duplicate" badge |
| Duplicate / Conflict | Two Admin actions on the same payment | Second request returns 409 | "This payment was already reviewed" and the view refreshes |
| Duplicate / Conflict | Enrolling in a course already owned | Server returns 409 | "You are already enrolled" with a Go to Course button |

### 7.4 UX Rules

**Global rules**
- All forms validate on blur and on submit; errors are displayed inline under the field.
- Every action that calls the server shows a loading state and disables its trigger button until the response returns.
- Every failure shows a clear error message with a retry option where applicable.
- Every successful write action shows a success toast within 300 ms of the response.
- Destructive actions (delete, revoke, decline) require a confirmation dialog.
- All pages are responsive from 360 px width upward.

**Per-feature rules**

| Feature | Validation | Loading State | Error State | Success Feedback |
|---|---|---|---|---|
| P0-F001 Auth | Email format, password length, inline | Button spinner, fields disabled | Inline message under form | Redirect to dashboard |
| P0-F002 Courses | Required fields, title length, price ≥ 0 | Button spinner; skeleton cards in catalog | Toast with error and retry | Toast "Course saved" / "Course published" |
| P0-F003 Videos | File type and size, title required | Progress bar with percentage | "Upload failed" with Retry | Toast "Video uploaded" |
| P0-F004 Payment | File type, size, required screenshot | Button spinner; upload progress | Inline error; Retry | Status card "Payment submitted. Waiting for review" |
| P0-F005 Review | Reason required for decline | Button spinner; skeleton rows | Toast with error and retry | Toast "Payment approved" / "Payment declined" |
| P0-F006 Playback | Enrollment check before render | Player skeleton and buffering spinner | "Video unavailable" with Retry | Video starts playing |
| P0-F007 Comments | 1 to 1,000 characters, counter shown | Posting spinner on the button | Inline error; comment text preserved | Comment appears immediately |
| P0-F008 Chat | 1 to 2,000 characters | "Sending" state on message | "Failed" label with Retry | Message shows "Sent" then "Read" |
| P1-F001 Search | Minimum 2 characters | Skeleton cards | "Search failed" with Retry | Results rendered |
| P1-F002 Progress | None | Silent background save | Silent retry up to 3 times | Checkmark and progress bar update |
| P1-F003 Notifications | None | Skeleton list | "Could not load notifications" | Unread count updates |
| P1-F004 Profile | Name length, avatar type and size, password rules | Button spinner | Inline error | Toast "Profile updated" |
| P1-F005 Stats | None | Skeleton cards | Error card with Retry | Cards render values |

---

## 8. Non-Functional Requirements

### Performance
- Largest Contentful Paint below 2 seconds on a 4G connection for catalog and dashboard pages.
- API response time at p95 below 500 ms for all non-upload endpoints.
- Video playback start below 3 seconds on a 10 Mbps connection.
- Chat message delivery below 2 seconds when both parties are online.

### Security
- Authentication required on all endpoints except catalog reads, registration, login, and password reset.
- Passwords hashed with bcrypt (cost 12 or higher).
- All inputs validated and sanitized on the server; output encoded to prevent XSS.
- CSRF protection and secure, HTTP-only cookies for refresh tokens.
- Rate limiting: 5 login attempts per 15 minutes per account; 100 requests per minute per IP.
- Payment screenshots and attachments stored in private buckets and served only through authorized signed URLs.
- File types validated by MIME type and file signature on the server.
- Encryption: TLS 1.3 in transit and AES-256 at rest.

### Availability
- Uptime target of 99.9% monthly.
- Daily automated database backups with 30-day retention.
- Recovery Time Objective of 4 hours and Recovery Point Objective of 24 hours.

### Scalability
- Supports 500 concurrent students and 5,000 registered students in v1.0 without architecture changes.
- Video delivery runs from object storage so application servers do not carry video traffic.
- Stateless API servers behind a load balancer allow horizontal scaling.

### Accessibility
- WCAG 2.1 AA conformance.
- Full keyboard navigation and visible focus states.
- Text alternatives for images; captions field reserved for the player in v2.
- Color contrast ratio of at least 4.5:1.

### Compatibility
- Chrome 100+, Safari 15+, Firefox 100+, Edge 100+.
- Responsive layout from 360 px to 1920 px width.

### Data and Compliance
- Personal data stored: name, email, avatar, payment screenshots, chat messages.
- Users can request account and data deletion; the Admin processes it within 30 days.
- GDPR practices apply if EU users register; otherwise standard security practices apply.
- Payment screenshots are retained for 24 months for accounting, then deleted.

### Observability
- Structured JSON logging for all API requests and errors.
- Alert when the error rate exceeds 1% over 5 minutes.
- Alert on failed uploads, failed logins spikes, and storage errors.
- Health check endpoint at GET /api/v1/health.

---

## 9. Technical Architecture

### Frontend
- React 18 with TypeScript, Tailwind CSS, React Router, and TanStack Query for server state.
- Two route trees: /admin/* (Admin dashboard) and /dashboard/* (Student dashboard), plus public /courses routes.
- Video player: HTML5 video with a custom control layer.
- Real-time: Socket.IO client for chat and notifications.
- Hosted on Vercel.

### Backend
- Node.js with Express and TypeScript, REST API versioned under /api/v1/.
- Prisma ORM with Prisma Migrate for migrations.
- Socket.IO server for chat and notifications.
- Validation with Zod on all request bodies.
- Testing with Vitest and Jest.
- Hosted on Railway.

### Database Architecture
- PostgreSQL for all relational data.
- Redis for rate limiting, socket session state, and caching the public catalog.
- S3-compatible object storage for videos, attachments, thumbnails, avatars, and payment screenshots.

### Data Model

| Entity | Key Fields | Relationships |
|---|---|---|
| User | id, name, email (unique), passwordHash, role (ADMIN / STUDENT), avatarUrl, createdAt | Has many Enrollments, Payments, Comments, Messages, Notifications |
| RefreshToken | id, userId, tokenHash, expiresAt, revokedAt | Belongs to User |
| Course | id, title, description, price, thumbnailUrl, status (DRAFT / PUBLISHED), createdAt | Has many Sections, Enrollments, Payments |
| Section | id, courseId, title, position | Belongs to Course; has many Videos |
| Video | id, sectionId, title, description, storageKey, durationSeconds, position | Belongs to Section; has many Attachments, Comments, VideoProgress |
| VideoAttachment | id, videoId, fileName, storageKey, sizeBytes, mimeType | Belongs to Video |
| Payment | id, userId, courseId, amount, screenshotKey, screenshotHash, reference, status (PENDING / APPROVED / DECLINED), declineReason, reviewedBy, reviewedAt, createdAt | Belongs to User and Course; has one Enrollment when approved |
| Enrollment | id, userId, courseId, paymentId, status (ACTIVE / REVOKED), createdAt | Belongs to User, Course, and Payment; unique on (userId, courseId) |
| Comment | id, videoId, userId, parentId (nullable), body, createdAt, editedAt | Belongs to Video and User; self-reference for replies |
| Conversation | id, studentId (unique), lastMessageAt | Belongs to User (Student); has many Messages |
| Message | id, conversationId, senderId, body, readAt, createdAt | Belongs to Conversation and User |
| Notification | id, userId, type, referenceId, readAt, createdAt | Belongs to User |
| VideoProgress | id, userId, videoId, positionSeconds, completed, updatedAt | Belongs to User and Video; unique on (userId, videoId) |
| Setting | key, value | Stores the InstaPay account details and payment instructions text |

### API Design

All endpoints are prefixed with /api/v1.

| Method | Endpoint | Purpose | Access | Feature |
|---|---|---|---|---|
| POST | /auth/register | Register a Student | Public | P0-F001 |
| POST | /auth/login | Log in | Public | P0-F001 |
| POST | /auth/refresh | Rotate tokens | Authenticated | P0-F001 |
| POST | /auth/logout | Revoke refresh token | Authenticated | P0-F001 |
| POST | /auth/forgot-password | Send reset email | Public | P0-F001 |
| POST | /auth/reset-password | Set new password | Public (token) | P0-F001 |
| GET | /users/me | Current user | Authenticated | P0-F001 |
| GET | /courses | List published courses (supports ?q= in P1) | Public | P0-F002, P1-F001 |
| GET | /courses/:id | Course detail with sections | Public | P0-F002 |
| POST | /courses | Create course | Admin | P0-F002 |
| PUT | /courses/:id | Update course | Admin | P0-F002 |
| PATCH | /courses/:id/publish | Publish or unpublish | Admin | P0-F002 |
| DELETE | /courses/:id | Delete course | Admin | P0-F002 |
| POST | /courses/:courseId/sections | Create section | Admin | P0-F002 |
| PUT | /sections/:id | Update or reorder section | Admin | P0-F002 |
| DELETE | /sections/:id | Delete section | Admin | P0-F002 |
| POST | /videos/upload-url | Get signed upload URL | Admin | P0-F003 |
| POST | /sections/:sectionId/videos | Create video record | Admin | P0-F003 |
| PUT | /videos/:id | Update title, description, position | Admin | P0-F003 |
| DELETE | /videos/:id | Delete video | Admin | P0-F003 |
| POST | /videos/:id/attachments | Add attachment | Admin | P0-F003 |
| DELETE | /attachments/:id | Delete attachment | Admin | P0-F003 |
| GET | /videos/:id | Video detail with signed stream URL | Enrolled Student, Admin | P0-F006 |
| GET | /attachments/:id/download | Signed attachment download | Enrolled Student, Admin | P0-F006 |
| GET | /settings/payment-instructions | InstaPay account and instructions | Authenticated | P0-F004 |
| PUT | /settings/payment-instructions | Update InstaPay details | Admin | P0-F004 |
| POST | /payments | Submit payment with screenshot | Student | P0-F004 |
| GET | /payments/me | Student's own payments | Student | P0-F004 |
| GET | /payments | List all payments (filter by status, course) | Admin | P0-F005 |
| GET | /payments/:id | Payment detail with screenshot URL | Owner, Admin | P0-F005 |
| PATCH | /payments/:id/approve | Approve payment | Admin | P0-F005 |
| PATCH | /payments/:id/decline | Decline payment with reason | Admin | P0-F005 |
| GET | /enrollments/me | Student's enrolled courses | Student | P0-F006 |
| DELETE | /enrollments/:id | Revoke enrollment | Admin | P0-F005 |
| GET | /videos/:id/comments | List comments | Enrolled Student, Admin | P0-F007 |
| POST | /videos/:id/comments | Post comment or reply (parentId) | Enrolled Student, Admin | P0-F007 |
| PUT | /comments/:id | Edit own comment | Author | P0-F007 |
| DELETE | /comments/:id | Delete comment | Author, Admin | P0-F007 |
| GET | /conversations | List conversations (Admin) or own (Student) | Authenticated | P0-F008 |
| GET | /conversations/:id/messages | List messages | Participant | P0-F008 |
| POST | /conversations/:id/messages | Send message | Participant | P0-F008 |
| PATCH | /conversations/:id/read | Mark messages read | Participant | P0-F008 |
| POST | /videos/:id/progress | Save playback position | Enrolled Student | P1-F002 |
| GET | /progress/me | Course progress summary | Student | P1-F002 |
| GET | /notifications | List notifications | Authenticated | P1-F003 |
| PATCH | /notifications/:id/read | Mark notification read | Authenticated | P1-F003 |
| PUT | /users/me | Update profile | Authenticated | P1-F004 |
| PUT | /users/me/password | Change password | Authenticated | P1-F004 |
| GET | /admin/stats | Dashboard statistics | Admin | P1-F005 |

Real-time events (Socket.IO): message:new, message:read, notification:new.

### Authentication and Authorization Design
- JWT access token (15 minutes) and refresh token (7 days) with rotation on every refresh.
- Role-based middleware checks ADMIN or STUDENT on every protected route.
- Resource-level checks: enrollment check for videos, comments, and attachments; ownership check for payments and conversations.

### Infrastructure and Deployment
- Frontend on Vercel; backend, PostgreSQL, and Redis on Railway.
- Object storage bucket with private access and signed URLs.
- Environments: local, staging, production.
- CI/CD through GitHub Actions: lint, type-check, test, and deploy on merge to main.
- Prisma Migrate runs automatically on deploy to staging and manually approved on production.

### External Integrations
- Object storage provider (S3-compatible) [TBD].
- Email provider for password reset and notification emails [TBD].
- PostHog or Mixpanel for product analytics.
- InstaPay: no API integration; the account is displayed as text and payment is verified manually.

---

## 10. Implementation Phases

### Phase 1 — Foundation, Authentication, and Core Content (Sprint 1)
**Goal:** Working authentication and the core content feature: courses, sections, and videos managed by the Admin.
**Duration:** 2 weeks (2026-10-26 to 2026-11-08)

- [ ] Initialize repository, branch strategy, and CI/CD pipeline
- [ ] Set up frontend, backend, PostgreSQL, Redis, and object storage
- [ ] Implement Prisma schema for User, RefreshToken, Course, Section, Video, VideoAttachment, Setting
- [ ] Implement P0-F001 authentication, roles, and protected routes
- [ ] Seed the Admin account
- [ ] Build the Admin and Student dashboard shells
- [ ] Implement P0-F002 course and section management and the public catalog
- [ ] Implement P0-F003 video upload, description, and attachments
- [ ] Apply global UX rules (validation, loading, error, success components)

**Validation:** An Admin can log in, create a course with sections, upload a video with a description and an attachment, and publish the course. A visitor sees the course in the catalog. A Student is blocked from /admin. All P0-F001 to P0-F003 acceptance criteria pass.

### Phase 2 — Payments, Access, Comments, and Chat (Sprint 2)
**Goal:** Complete the money-to-learning loop and the communication features.
**Duration:** 2 weeks (2026-11-09 to 2026-11-22)

- [ ] Implement Payment, Enrollment, Comment, Conversation, and Message models
- [ ] Implement P0-F004 checkout page and screenshot submission
- [ ] Implement P0-F005 Admin payment review, approve, decline, and revoke
- [ ] Implement P0-F006 signed video streaming and enrollment-based access control
- [ ] Implement P0-F007 video comments and replies
- [ ] Implement P0-F008 real-time chat with Socket.IO in both dashboards
- [ ] Write integration tests for payment, access control, and chat permissions

**Validation:** A new Student completes the full journey: register, submit payment, Admin approves, Student watches a video, posts a comment, and exchanges a chat message with the Admin. All P0-F004 to P0-F008 acceptance criteria pass.

### Phase 3 — Polish and P1 Features (Sprint 3)
**Goal:** Improve the learning and administration experience.
**Duration:** 2 weeks (2026-11-23 to 2026-12-06)

- [ ] Implement P1-F001 course search
- [ ] Implement P1-F002 progress tracking and resume playback
- [ ] Implement P1-F003 in-app notifications and email notifications for payment decisions
- [ ] Implement P1-F004 profile page
- [ ] Implement P1-F005 Admin statistics dashboard
- [ ] Responsive and accessibility pass (WCAG 2.1 AA)
- [ ] Begin beta onboarding materials for the first Students

**Validation:** All P1 acceptance criteria pass. Accessibility audit reports no critical issues. QA signs off on all P0 and P1 features on staging.

### Phase 4 — Launch Hardening (Sprint 4)
**Goal:** Make the platform secure, stable, and ready for public launch.
**Duration:** 2 weeks (2026-12-07 to 2026-12-20)

- [ ] Security review (authorization, file upload validation, rate limiting, signed URL expiry)
- [ ] Load test for 500 concurrent students
- [ ] Configure monitoring, alerts, and daily backups; test a restore
- [ ] Configure analytics events for the KPIs in Section 12
- [ ] Fix all open P0 and P1 defects
- [ ] Beta launch with a small group of Students (2026-12-13)
- [ ] Production deployment and smoke tests
- [ ] Implement P2 features only if capacity remains

**Validation:** Zero open P0 defects, load test passes, backup restore verified, beta feedback addressed, and the Owner approves the launch gate.

---

## 11. Success Metrics and KPIs

### Business Metrics

| Metric | Target | Measurement Method |
|---|---|---|
| Activation rate | 60% or more of registered Students submit a payment proof or watch a video within 7 days of registration | PostHog funnel: register → payment_submitted or video_played |
| Payment approval rate | 90% or more of submitted payments are reviewed (approved or declined) within 24 hours | Payment createdAt vs reviewedAt in the database |
| Payment-to-access time | Median of 12 hours or less from submission to approval | Database query on payment timestamps |

### Product Metrics

| Metric | Target | Measurement Method |
|---|---|---|
| Checkout completion | 80% or more of Students who open checkout submit a screenshot | PostHog funnel: checkout_opened → payment_submitted |
| Task completion (watch) | 80% or more of approved Students play a video within 3 days of approval | PostHog event video_played after enrollment |
| Course progress | Median progress of 50% or more within 30 days of enrollment | VideoProgress data |

### Technical Metrics

| Metric | Target | Measurement Method |
|---|---|---|
| API error rate | Below 0.1% of requests return 5xx | Structured logs and monitoring dashboard |
| API latency | p95 below 500 ms | Application monitoring |
| Page load (LCP) | Below 2 seconds | Web vitals reporting |
| Uptime | 99.9% monthly | Uptime monitor |
| Video start time | Below 3 seconds | Player timing event |

### User Satisfaction Metrics

| Metric | Target | Measurement Method |
|---|---|---|
| Chat first response time | Median of 12 hours or less | Message timestamps (first Student message to first Admin reply) |
| Student satisfaction | Average of 4.0 out of 5 or higher | In-app 1-question survey after the first completed video |

**Tracking Tool:** PostHog or Mixpanel (final choice [TBD]) plus database queries.
**Review Frequency:** 1 week, 2 weeks, and 30 days after public launch.
**Owner:** Zizo.

---

## 12. Timeline and Milestones

- **Start Date:** 2026-10-26
- **Target Launch:** 2026-12-21
- **Total Duration:** 8 weeks

| Milestone | Description | Due Date | Status | Owner |
|---|---|---|---|---|
| Kickoff | Project starts; team and tools ready | 2026-10-26 | TODO | Zizo |
| PRD Approved | Product Owner and Engineering Lead approve this PRD | 2026-10-28 | TODO | Zizo |
| Phase 1 Done | Auth, courses, videos, attachments complete | 2026-11-08 | TODO | Engineering Lead [TBD] |
| Phase 2 Done | Payments, playback, comments, chat complete | 2026-11-22 | TODO | Engineering Lead [TBD] |
| Phase 3 Done | P1 features and polish complete | 2026-12-06 | TODO | Engineering Lead [TBD] |
| Beta Launch | Small group of Students uses staging or production | 2026-12-13 | TODO | Zizo |
| Phase 4 Done | Hardening, load test, and monitoring complete | 2026-12-20 | TODO | Engineering Lead [TBD] |
| Public Launch | Platform opens to all Students | 2026-12-21 | TODO | Zizo |

---

## 13. Risk Register

Score = Likelihood × Impact (High = 3, Medium = 2, Low = 1).

| ID | Description | Likelihood | Impact | Score | Mitigation | Owner |
|---|---|---|---|---|---|---|
| R-001 | Scope creep delays launch | Medium | High | 6 | Enforce MoSCoW strictly; any new feature enters P2 or v2 unless the Owner trades it against a P0 | Zizo |
| R-002 | Video storage and bandwidth costs exceed budget | Medium | High | 6 | Estimate cost per student before launch; set billing alerts; compress videos to 720p/1080p H.264 | Zizo |
| R-003 | Students share accounts or leak videos | High | Medium | 6 | Short-lived signed URLs; session limits per account; revoke access on abuse | Backend Dev |
| R-004 | Fake or edited payment screenshots | Medium | High | 6 | Admin verifies against InstaPay history; duplicate-hash flag; require transaction reference | Zizo |
| R-005 | Large video uploads fail or time out | Medium | Medium | 4 | Direct-to-storage signed uploads with retry; spike in Phase 1 | Backend Dev |
| R-006 | Real-time chat instability under load | Medium | Medium | 4 | Socket.IO with reconnect and message persistence; load test in Phase 4 | Backend Dev |
| R-007 | Payment review backlog delays access | Medium | Medium | 4 | Notification to the Admin on each submission; daily review routine; bulk actions (P2) | Zizo |
| R-008 | Key person dependency | Medium | High | 6 | Document architecture and runbooks in the repository; require code review on every merge | Engineering Lead [TBD] |
| R-009 | Design assets not ready on time | Low | Medium | 2 | Use a Tailwind-based component set; Designer delivers key screens before Phase 1 ends | Designer [TBD] |
| R-010 | Security breach exposes student data or payment screenshots | Low | High | 3 | Private storage, authorization checks, security review in Phase 4, daily backups | Backend Dev |

---

## 14. Stakeholders and Approvals

### Stakeholders

| Name | Role | Involvement | Contact |
|---|---|---|---|
| Zizo | Owner / Admin / Product Owner | Defines requirements, approves scope, reviews payments, final launch decision | [TBD] |
| Engineering Lead [TBD] | Technical approver | Architecture decisions, code quality, technical sign-off | [TBD] |
| Frontend Dev [TBD] | Developer | Builds the Admin and Student interfaces | [TBD] |
| Backend Dev [TBD] | Developer | Builds API, database, storage, and real-time features | [TBD] |
| Designer [TBD] | Designer | Delivers UI design and assets | [TBD] |
| QA [TBD] | Quality assurance | Writes and runs test cases from acceptance criteria | [TBD] |
| Beta Students | Early users | Test the platform and give feedback before public launch | [TBD] |

### Approval Gates

| Gate | Approver | Required By | Status |
|---|---|---|---|
| PRD Approval | Product Owner + Engineering Lead | 2026-10-28 | Pending |
| Phase 1 Acceptance | Product Owner | 2026-11-08 | Pending |
| Phase 2 Acceptance | Product Owner | 2026-11-22 | Pending |
| Phase 3 Acceptance | Product Owner + QA | 2026-12-06 | Pending |
| Beta Launch Approval | Product Owner | 2026-12-13 | Pending |
| Public Launch Approval | Product Owner + Engineering Lead | 2026-12-21 | Pending |

---

## 15. References and Links

| Item | Link |
|---|---|
| Design Files | [TBD] |
| Repository | [TBD] |
| API Documentation | [TBD] |
| Architecture Diagrams | [TBD] |
| Staging Environment | [TBD] |
| Production Environment | [TBD] |
| CI/CD Pipeline | [TBD] |
| Monitoring Dashboard | [TBD] |
| Related PRDs | [TBD] |
| Slack Channel | [TBD] |
| Meeting Notes | [TBD] |

---

## 16. Revision History

| Version | Date | Author | Changes |
|---|---|---|---|
| v1.0 | 2026-10-26 | Zizo | Initial PRD created |