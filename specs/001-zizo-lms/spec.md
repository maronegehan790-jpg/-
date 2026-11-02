# Feature Specification: Zizo LMS

**Feature Branch**: `001-zizo-lms`

**Created**: 2026-10-28

**Status**: Draft

**Input**: User description: "Build Zizo LMS, a self-owned course platform where a single instructor (the Admin) sells and delivers video courses to Students, similar to Udemy in learning experience but not a marketplace and not a SaaS."

## Clarifications

### Session 2026-10-28

- Q: How should the system capture and verify the amount of money that was actually transferred for a manual payment? → A: The Student enters the amount they transferred; the Payment stores both the declared amount and the course price snapshot taken at submission time; mismatches between the declared amount and the snapshotted price are flagged on the Admin review queue (same mechanism as the duplicate-screenshot flag).

### Session 2026-10-29

- Q: When the Admin revokes a Student's enrollment, should the system forcibly disconnect the Student's active WebSocket connections for that course? → A: No. Revoking access only blocks new content requests (video signed URLs, attachment downloads, comment posts). Existing WebSocket connections and in-progress video playback are not forcibly terminated.
- Q: Can chat messages be deleted or edited after they are sent, and if so, who has the permission? → A: Messages cannot be edited or deleted by either side. Chat is an immutable log, preserving conversation integrity for dispute resolution.
- Q: Should the Admin be able to view payment screenshots at full resolution and download them? → A: Yes. The Admin sees an inline preview in the review panel and can click to open a full-resolution lightbox with zoom and download capability.
- Q: When the declared amount differs from the course price, should the Admin see both numbers side-by-side or only a generic flag? → A: Both the Student-declared amount and the course price snapshot are displayed side-by-side with a visual mismatch warning when they differ.
- Q: When a top-level comment is deleted, should its replies be permanently removed or remain visible with a placeholder? → A: Cascade delete — the parent comment and all its replies are permanently removed together.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin Builds and Publishes a Course Catalog (Priority: P1)

As the Admin, I open my dashboard, create a course with a title, description, price, and
thumbnail, organize it into sections, upload videos with per-video descriptions and
attachments, and publish the course so visitors and Students can discover it. I can also
unpublish or delete a course when it has no enrolled Students.

**Why this priority**: Without a published course, no Student can purchase or watch
anything. This is the first slice of value and a prerequisite for every other flow.

**Independent Test**: Starting from an empty catalog, the Admin creates a course,
adds a section, uploads one video with a description and a PDF attachment, publishes
the course, and a visitor on the public catalog page sees the course and its section
and video titles with the video player locked.

**Acceptance Scenarios**:

1. **Given** the Admin is on the Courses page, **When** they submit a valid new course
   form (title, description, price, thumbnail), **Then** the course is created in Draft
   state and appears in the Admin's course list.
2. **Given** a Draft course has at least one section with at least one uploaded video,
   **When** the Admin clicks Publish, **Then** the course moves to Published state and
   appears in the public catalog.
3. **Given** a Draft course with zero videos, **When** the Admin clicks Publish, **Then**
   the system blocks the action and shows an explanatory message.
4. **Given** a Published course with no enrolled Students, **When** the Admin clicks
   Delete and confirms, **Then** the course and its sections, videos, and attachments
   are removed.
5. **Given** a Published course with at least one enrolled Student, **When** the Admin
   clicks Delete, **Then** the system refuses deletion and offers Unpublish instead.
6. **Given** a Draft course, **When** a visitor or a Student loads the public catalog,
   **Then** the Draft course is not visible to them in any list or detail page.
7. **Given** the Admin opens a video in a section, **When** they attach a PDF, DOCX,
   PPTX, or ZIP file and save, **Then** the attachment is stored and listed on that
   video.

---

### User Story 2 - Student Buys and Watches a Course (Priority: P1)

As a Student, I register with my email, browse the public catalog, open a course page,
see the Admin's InstaPay account and the price, transfer the money outside the platform,
upload a screenshot of the transfer (with an optional transaction reference), wait for
the Admin to approve my payment, and then watch every video and download every attachment
of that course.

**Why this priority**: This is the end-to-end money-making path. If it does not work,
the platform has no reason to exist. It must be independently testable from Story 1.

**Independent Test**: A new Student registers, submits valid payment proof for a
published course, is approved by the Admin, loads the course page, plays a video from
the first section, and downloads one attachment.

**Acceptance Scenarios**:

1. **Given** a visitor on the registration page, **When** they submit a valid email,
   password, and name, **Then** an account is created with the Student role and they
   are logged in.
2. **Given** an email that already belongs to a Student, **When** someone tries to
   register with it, **Then** the system refuses and shows a clear error on the email
   field.
3. **Given** a Student is on a published course page they have not paid for, **When**
   they open it, **Then** they see the price, the Admin's InstaPay account, the course
   outline (section and video titles), and the video player is locked.
4. **Given** a Student submits a payment screenshot, a declared amount, and an
   optional reference, **When** the submission is valid, **Then** a Payment record is
   created with status Pending (storing both the declared amount and the course
   price at that moment) and the Student sees a "waiting for review" state on that
   course.
5. **Given** a Student already has a Pending payment for a course, **When** they try
   to submit another payment for the same course, **Then** the system refuses and
   shows the existing Pending payment.
6. **Given** the Admin approves a Pending payment, **When** the Student next loads the
   course, **Then** the videos play, the attachments are downloadable, and the comments
   are readable and writable for that course.
7. **Given** the Admin declines a Pending payment with a reason, **When** the Student
   loads the course or the "My payments" page, **Then** they see the decline reason and
   can submit a new payment for the same course.
8. **Given** a Student watches a video, **When** the video player loads, **Then** the
   bytes come directly from private storage via a short-lived signed URL and the URL
   stops working after it expires.

---

### User Story 3 - Admin Reviews Payments (Priority: P1)

As the Admin, I open the Payments page, see every submitted payment with the Student,
the course, the amount, the uploaded screenshot, and the submission time, and I either
approve the payment (which grants course access) or decline it with a reason. I can
also revoke access later if I discover the payment was invalid.

**Why this priority**: Approvals are the gate for Story 2. The Admin's ability to act
on payments quickly and correctly is what turns a submission into revenue and access.

**Independent Test**: With one Pending payment in the queue, the Admin approves it,
the paying Student gains course access, the payment moves to Approved, and a second
Admin action on the same payment is prevented.

**Acceptance Scenarios**:

1. **Given** the Admin is on the Payments page, **When** they filter by Pending,
   **Then** they see all unreviewed payments with screenshot, Student, course, amount,
   and submission time.
2. **Given** the Admin clicks Approve on a Pending payment, **When** the action
   completes, **Then** the payment status becomes Approved, the Student is enrolled in
   that course, and both changes land together or not at all.
3. **Given** the Admin clicks Decline on a Pending payment, **When** they are asked
   for a reason and submit a non-empty reason, **Then** the payment status becomes
   Declined, the reason is stored, and the Student is not enrolled.
4. **Given** the Admin clicks Decline, **When** they submit an empty reason, **Then**
   the system refuses and shows an inline error on the reason field.
5. **Given** two Admin sessions open the same Pending payment, **When** both click
   Approve at the same time, **Then** only the first action is applied and the second
   receives a clear "already reviewed" response — the Student is enrolled exactly once.
6. **Given** a Student uploads a payment screenshot whose file content exactly matches
   a screenshot already used on another payment, **When** the submission is created,
   **Then** the new payment is flagged for the Admin on the Payments page.
7. **Given** an Approved payment, **When** the Admin clicks Revoke Access and confirms,
   **Then** the Student's enrollment status for that course is changed to Revoked and they lose access
   immediately; this does not change the Payment status.
8. **Given** a Student's payment screenshot, **When** anyone other than that Student
   or the Admin tries to view it, **Then** access is refused.

---

### User Story 4 - Enrolled Student Asks Questions on a Video (Priority: P2)

As an enrolled Student, I open a video and leave a comment with my question. The Admin
replies in a one-level thread, I can edit or delete my own comment, and the Admin can
delete any comment that violates the rules.

**Why this priority**: Comments turn passive viewing into learning and reduce chat
load, but Stories 1 to 3 can ship without this.

**Independent Test**: An enrolled Student posts a comment under a video, the Admin
replies to that comment, the Student edits their original text, and the Admin deletes
a different comment they consider off-topic.

**Acceptance Scenarios**:

1. **Given** an enrolled Student on a video page, **When** they submit a non-empty
   comment, **Then** the comment appears in the thread with their name and time.
2. **Given** a non-enrolled Student on a locked video page, **When** they try to post
   or read comments, **Then** the system refuses.
3. **Given** a comment the Admin or the Student authored, **When** they open the edit
   action, change the text, and save, **Then** the comment updates and is marked as
   edited.
4. **Given** a reply (a one-level child of a top-level comment), **When** anyone tries
   to reply to that reply, **Then** the system does not expose a deeper reply control.
5. **Given** the Admin opens any comment, **When** they click Delete and confirm,
   **Then** the comment is removed from the thread.
6. **Given** a Student opens another Student's comment, **When** they look at it,
   **Then** they see no edit or delete action for it.
7. **Given** a video has no comments yet, **When** an enrolled Student opens it,
   **Then** they see an explicit empty-state message inviting them to ask a question.

---

### User Story 5 - Private Admin ↔ Student Chat (Priority: P2)

As a Student, I open the Messages page and have one private conversation with the
Admin, delivered in real time, with unread counts on both sides. I can send messages
even before I have bought any course, and the Admin can reply from a single unified
inbox showing every Student conversation.

**Why this priority**: Chat is a strong retention lever and a lightweight pre-sales
tool, but the catalog, purchase, and viewing flows can launch without it.

**Independent Test**: A freshly registered Student with zero enrollments opens
Messages, sends "hello" to the Admin, the Admin receives it in real time in the Admin
inbox, replies, and the Student sees the reply arrive without reloading.

**Acceptance Scenarios**:

1. **Given** a newly registered Student opens their Messages page, **When** the page
   loads, **Then** they see exactly one conversation thread with the Admin, even
   before they have bought any course.
2. **Given** the Admin opens their Messages page, **When** the page loads, **Then**
   they see a list of every Student who has at least one message, with the latest
   message preview and an unread count for conversations with unread messages.
3. **Given** a Student sends a message, **When** the Admin's Messages page is open,
   **Then** the message appears in the Admin inbox within 2 seconds without a page
   reload.
4. **Given** the Admin sends a message, **When** the Student's Messages page is open,
   **Then** the message appears for the Student within 2 seconds without a page
   reload.
5. **Given** a Student receives a message while on another page, **When** they
   navigate to Messages, **Then** the unread count reflects the number of unread
   messages and resets after they open the conversation.
6. **Given** a logged-out visitor, **When** they try to open the Messages page,
   **Then** they are redirected to login.
7. **Given** a Student tries to open another Student's conversation, **When** the
   request is made, **Then** access is refused.

---

### Edge Cases

- **Invalid input**: Every form (registration, login, course create/edit, section,
  video, attachment, payment, comment, chat) rejects empty or malformed input with
  an inline, field-level error and never submits partial data.
- **Empty states**: Public catalog with no published courses, a Student with no
  enrollments, a video with no comments, a conversation with no messages, and the
  Admin's Payments page with zero Pending items each display an explicit, friendly
  empty-state message rather than a blank screen.
- **Network failure during upload**: If a video, thumbnail, attachment, or payment
  screenshot upload is interrupted, the system surfaces a retriable error and does
  not create a half-written record. Partial uploads are discarded.
- **Unauthorized access attempts**: Any Student visiting an Admin page, any logged-out
  visitor requesting a locked video or a protected API, and any Student requesting
  another Student's payment screenshot or chat all receive a clear access-refused
  response.
- **Duplicate registration**: Two registration attempts with the same email result in
  exactly one account; the second attempt gets a clear "email already in use" error.
- **Duplicate Pending payment**: A Student cannot have two Pending payments for the
  same course at the same time; the second attempt is refused and the existing Pending
  payment is shown.
- **Reused screenshot**: If a Student submits a payment screenshot whose contents are
  identical to a screenshot used on any prior payment (same or different Student), the
  new payment is flagged on the Admin review queue so the Admin can inspect for
  fraud.
- **Concurrent Admin actions on one payment**: If two Admin sessions review the same
  Pending payment at the same time, only one action takes effect. The Student is
  enrolled exactly once and never partially.
- **Access revocation**: When the Admin revokes access, in-flight video playback must
  stop working on the next request for a new signed URL; already-loaded bytes do not
  need to be invalidated. Existing WebSocket connections (chat, notifications) are not
  forcibly terminated; the Student is only blocked on the next content request.
- **Deleted comment thread**: When a top-level comment is deleted, all its replies are
  permanently removed with it (cascade delete). No orphaned replies or placeholder
  text remains.

## Requirements *(mandatory)*

### Functional Requirements

#### Accounts and roles

- **FR-001**: The system MUST support exactly two roles: Admin and Student. New
  registrations MUST always create a Student. No self-service path MUST exist to
  acquire the Admin role.
- **FR-002**: The system MUST ship with exactly one pre-created Admin account.
- **FR-003**: Students MUST register with email and password; email MUST be unique
  across all accounts.
- **FR-004**: The system MUST let Students and the Admin log in with email and
  password and log out.
- **FR-005**: Every Admin-only page, action, and API endpoint MUST reject Student
  and anonymous callers on the server, independently of what the frontend hides.
- **FR-006**: Each role MUST have its own dashboard: a Student dashboard (my courses,
  my payments, messages) and an Admin dashboard (courses, payments, messages).

#### Course and video management

- **FR-010**: The Admin MUST be able to create a course with a title, description,
  price, and thumbnail.
- **FR-011**: The Admin MUST be able to edit any field of any course they own and
  save changes.
- **FR-012**: Each course MUST be organized into ordered sections, each with a title.
- **FR-013**: The Admin MUST be able to upload a video into a section, provide a
  per-video description, and change its position within the section.
- **FR-014**: The Admin MUST be able to attach downloadable files to a video, limited
  to PDF, DOCX, PPTX, and ZIP; other types MUST be refused on the server.
- **FR-015**: A course MUST have one of two states: Draft or Published. New courses
  MUST start as Draft.
- **FR-016**: A course MUST NOT be publishable without at least one section containing
  at least one uploaded video; attempts MUST be rejected with an explanatory message.
- **FR-017**: Draft courses MUST NOT be visible to visitors or Students in any list,
  search, or detail page.
- **FR-018**: Published courses MUST be visible in the public catalog, which MUST
  show the title, description, price, thumbnail, section titles, and video titles.
- **FR-019**: Video playback MUST be locked on the public catalog view until the
  Student has an active enrollment in that course.
- **FR-020**: The Admin MUST be able to Unpublish a Published course; it MUST then
  disappear from the public catalog but MUST remain accessible to already-enrolled
  Students.
- **FR-021**: The Admin MUST NOT be able to Delete a course that has at least one
  enrolled Student; the Admin MUST be offered Unpublish instead.
- **FR-022**: Deleting a course with no enrollments MUST remove it and its sections,
  videos, and attachments from the system.

#### Manual payment and enrollment

- **FR-030**: Each course page MUST display the Admin's configured InstaPay account
  and the course price to a logged-in Student who is not yet enrolled.
- **FR-031**: A Student MUST be able to submit a Payment for a course by uploading
  a screenshot of the transfer, entering the amount they transferred (required),
  and optionally entering a transaction reference string.
- **FR-032**: On submission, a Payment MUST be created with status Pending; it MUST
  record the Student, course, screenshot, Student-declared amount, course price
  snapshot taken at that moment, optional reference, and submission time. The
  snapshot MUST be used for Admin review and MUST NOT change if the Admin later
  edits the course price.
- **FR-033**: A Student MUST NOT have more than one Payment with status Pending for
  the same course at the same time. A second submission MUST be refused and MUST
  show the existing Pending Payment.
- **FR-034**: Payment and Enrollment MUST be distinct records. A Payment MUST NOT
  grant access by itself.
- **FR-035**: The Admin MUST see every Payment on a Payments page, filterable at
  least by status (Pending, Approved, Declined), with the screenshot, the
  Student, the course, the Student-declared amount, the course price snapshot
  taken at submission time, the submission time, the reference if any, and any
  flags set on the Payment (duplicate-screenshot flag, amount-mismatch flag).
  The screenshot MUST be shown as an inline preview in the payment detail view;
  the Admin MUST be able to click it to open a full-resolution lightbox with zoom
  and download capability.
- **FR-036**: When the Admin approves a Pending Payment, the system MUST atomically
  set the Payment status to Approved and create an Enrollment for that Student in
  that course. Either both changes land or neither does.
- **FR-037**: When the Admin declines a Pending Payment, the system MUST require a
  non-empty decline reason, set the Payment status to Declined, and store the reason.
- **FR-038**: A Student whose Payment was Declined MUST be able to submit a new
  Payment for the same course; the declined Payment MUST remain visible in history.
- **FR-039**: Only two actions MUST be permitted on a Payment in status Pending:
  Approve and Decline. Any attempt to review a Payment that is no longer Pending MUST
  be refused with a clear "already reviewed" response.
- **FR-040**: The Admin MUST be able to Revoke an existing Enrollment; this MUST
  remove the Student's access to that course immediately for any new request, change
  the Enrollment status to Revoked, and does not change the Payment status.
- **FR-041**: On every new payment, the system MUST compare the uploaded screenshot's
  content against previously stored payment screenshots. If an exact match is found,
  the new Payment MUST be flagged on the Admin review queue.
- **FR-042**: On every new Payment, the system MUST compare the Student-declared
  amount against the course price snapshot taken at submission time. If they differ,
  the Payment MUST be flagged on the Admin review queue (same mechanism as the
  duplicate-screenshot flag). The flag MUST NOT auto-decline the Payment; the Admin
  remains the sole decider. The payment detail view MUST display both the
  Student-declared amount and the course price snapshot side-by-side, with a visual
  mismatch warning (e.g., a highlighted badge) when they differ.

#### Access control over course content

- **FR-050**: Watching any video, downloading any attachment, and reading or writing
  any video comment MUST be allowed only to the Admin or to a Student with an active
  Enrollment in that course.
- **FR-051**: Payment screenshots MUST be visible only to the Admin and to the
  Student who uploaded them.
- **FR-052**: Access to any protected file MUST be delivered through short-lived
  pre-signed URLs; the files themselves MUST live in private storage.
- **FR-053**: Expired or revoked signed URLs MUST stop working on subsequent requests.

#### Video comments

- **FR-060**: Under each video, enrolled Students and the Admin MUST be able to post
  top-level comments and single-level replies.
- **FR-061**: Replies MUST be limited to one level; the UI and server MUST NOT allow
  replying to a reply.
- **FR-062**: Comment authors MUST be able to edit and delete their own comments.
  Edited comments MUST be marked as edited.
- **FR-063**: The Admin MUST be able to delete any comment on any video.
- **FR-064**: Non-authors (except the Admin) MUST NOT see edit or delete actions on
  comments they did not write.
- **FR-065**: When a top-level comment is deleted (by its author or the Admin), all
  its replies MUST be permanently removed together (cascade delete). No orphaned
  replies or placeholder text MUST remain.

#### Chat

- **FR-070**: Each Student MUST have exactly one private conversation thread with the
  Admin. A Student MUST NOT be able to see or address any other Student's
  conversation.
- **FR-071**: A Student MUST be able to send a message to the Admin without having
  purchased any course.
- **FR-072**: The Admin MUST see a unified inbox listing every Student conversation
  with the latest message preview and an unread count.
- **FR-073**: Messages sent by either side MUST be delivered to the other side in
  real time while they are connected, without a page reload.
- **FR-074**: Each side MUST see an accurate unread count that resets to zero when
  that side opens the conversation.
- **FR-075**: Realtime delivery MUST require authentication; room membership MUST be
  re-verified on every message so no caller can push into another conversation.
- **FR-076**: Chat messages MUST be immutable after sending. Neither the Student nor
  the Admin MUST be able to edit or delete a sent message. The chat log MUST be
  preserved in its entirety for conversation integrity and dispute resolution.

#### UX, accessibility, and empty/error states

- **FR-080**: Every form MUST validate inline, show per-field errors, and prevent
  submission while required fields are invalid.
- **FR-081**: Every destructive action (delete course, delete comment, decline
  payment, revoke access) MUST require an explicit confirmation step
  that names the target.
- **FR-082**: Every list page MUST render a dedicated empty-state view when there
  are no items; blank screens MUST NOT ship.
- **FR-083**: Every page MUST remain usable, with no overlapping or clipped content,
  from a viewport width of 360 pixels upward.
- **FR-084**: The interface MUST meet accessibility baseline requirements for color
  contrast, visible keyboard focus, keyboard operability of all interactive
  elements, and labeled form controls.

### Key Entities

- **User**: Represents an Admin or a Student. Attributes: role, email (unique), name,
  hashed password, created-at. One Admin exists.
- **Course**: A sellable unit. Attributes: title, description, price, thumbnail,
  status (Draft or Published), created-at. Owns an ordered list of Sections.
- **Section**: A named bucket inside a Course that groups Videos in order.
- **Video**: A playable item inside a Section. Attributes: title, description,
  stored-file reference, position, created-at. Owns Attachments and Comments.
- **Attachment**: A downloadable file (PDF, DOCX, PPTX, or ZIP) bound to a Video.
- **Payment**: A Student's request for access to a Course. Attributes: student,
  course, screenshot reference, Student-declared amount, course price snapshot
  (captured at submission time; immutable thereafter), optional reference
  string, status (Pending, Approved, Declined), decline reason (when
  Declined), submission time, duplicate-screenshot flag, amount-mismatch flag.
  A Student may have at most one Pending Payment per Course.
- **Enrollment**: The actual access right of a Student to a Course. Created only
  when a Payment is Approved; revoking changes the Enrollment status to Revoked
  and does not change the Payment status. Unique per Student-and-Course pair.
- **Comment**: A message under a Video. Attributes: author, text, parent-comment
  (optional, limited to one level), created-at, edited flag.
- **Conversation**: Exactly one per Student; always between that Student and the
  Admin. Owns Messages. Tracks unread counts per side.
- **Message**: A single chat message. Attributes: conversation, sender, text,
  sent-at, read-by-recipient flag.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new Student can complete the end-to-end "register → submit payment
  proof → get approved → watch a video → leave a comment → send a chat message"
  journey without ever leaving the platform, in a single session.
- **SC-002**: The Admin can review a Pending payment, see the screenshot, and reach
  an Approve or Decline decision in under 1 minute per payment.
- **SC-003**: The public catalog page loads in under 2 seconds for a Student on a
  typical broadband connection.
- **SC-004**: A chat message sent by either side arrives on the other side's open
  Messages view in under 2 seconds.
- **SC-005**: 100% of Admin-only pages and actions refuse Student and anonymous
  callers on the server when probed directly, independent of the frontend.
- **SC-006**: 100% of locked videos, attachments, and payment screenshots are
  inaccessible to users without a current Enrollment (or, for screenshots, to users
  other than the paying Student and the Admin), when probed with direct URLs.
- **SC-007**: Across simulated concurrent reviews, a single Payment approved at the
  same time by two Admin sessions produces exactly one Enrollment and exactly one
  Approved Payment, never two.
- **SC-008**: A Student with a Pending Payment for a Course cannot create a second
  Pending Payment for the same Course under any sequence of UI or direct-API actions.
- **SC-009**: A Draft course is never surfaced on any public page or in any public
  API response, verified for every list and detail route.
- **SC-010**: A course that has at least one Enrollment cannot be deleted by any
  path; attempts return an explanatory refusal.

## Assumptions

- The Admin's single InstaPay account identifier is configured by the Admin in their
  dashboard settings and is editable; it is not hard-coded.
- The product is launching in Egypt; prices are stored and displayed in Egyptian
  Pounds (EGP). Multi-currency support is out of scope for this version.
- Students authenticate with email and password only. Social login, SSO, and
  two-factor authentication are out of scope for this version.
- A password-reset flow (email-based) is in scope at the baseline web-app standard,
  even though the user description does not call it out, because without it a
  forgotten password locks a paying customer out.
- Reasonable upload size limits apply (illustrative targets: video ≤ 2 GB per file,
  thumbnail ≤ 5 MB, attachment ≤ 50 MB per file, payment screenshot ≤ 10 MB). Final
  limits are an implementation decision as long as they are enforced on the server.
- Screenshot-duplicate detection compares exact file content (byte-identical). Near-
  duplicate detection (visually similar but not byte-identical) is out of scope for
  this version and may be considered later.
- Chat history is retained indefinitely for this version. A retention policy may be
  added later.
- The Student sees the Admin's decline reason verbatim; the Admin is expected to
  write it with the Student as the audience.
- Enrollment is lifetime by default once granted; time-boxed enrollments are out of
  scope for this version.
- The public catalog is browsable without login. Login is only required to submit a
  payment, watch a video, read or write a comment, or use chat.
- "Real time" chat means best-effort delivery within 2 seconds on an open connection;
  offline recipients see new messages on their next load with correct unread counts.
- The out-of-scope list from the user description is binding for this version:
  automated payment-gateway integration, native mobile app, certificates, affiliate
  system, live streaming, multiple instructors, reviews and ratings, and coupons.
