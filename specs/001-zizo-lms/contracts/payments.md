# API Contracts: Payments (InstaPay Manual Verification)

All endpoints prefixed under `/api/v1/payments`.

---

### 1. Request Screenshot Upload Presigned URL
- **Method**: `POST`
- **Path**: `/api/v1/payments/upload-url`
- **Access**: Student (`requireRole('STUDENT')`)
- **Request Body**:
```json
{
  "courseId": "course-uuid",
  "fileName": "receipt.png",
  "mimeType": "image/png",
  "fileSize": 1250000
}
```
- **Response `200 OK`**:
```json
{
  "uploadUrl": "https://s3.amazonaws.com/bucket/payments/receipt-uuid.png?AWSAccessKeyId=...",
  "s3Key": "payments/receipt-uuid.png"
}
```

---

### 2. Submit Manual Payment Proof
- **Method**: `POST`
- **Path**: `/api/v1/payments`
- **Access**: Student
- **Rules**:
  - Cannot submit if user already has a `PENDING` payment for this course.
  - Computes `priceSnapshot` from current `Course.price`.
  - Computes or receives `screenshotHash` (SHA-256) of receipt.
- **Request Body**:
```json
{
  "courseId": "course-uuid",
  "declaredAmount": 499.00,
  "transactionRef": "INSTA-987654321",
  "screenshotKey": "payments/receipt-uuid.png",
  "screenshotHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
}
```
- **Response `201 Created`**:
```json
{
  "id": "payment-uuid",
  "status": "PENDING",
  "declaredAmount": "499.00",
  "priceSnapshot": "499.00",
  "createdAt": "2026-10-30T22:00:00Z"
}
```

---

### 3. Admin: List Payment Submissions
- **Method**: `GET`
- **Path**: `/api/v1/payments/admin/queue`
- **Access**: Admin (`requireRole('ADMIN')`)
- **Query Params**: `status=PENDING&page=1&limit=20`
- **Response `200 OK`**:
```json
{
  "items": [
    {
      "id": "payment-uuid",
      "student": {
        "id": "user-uuid",
        "name": "Ahmed Wael",
        "email": "ahmed@example.com"
      },
      "course": {
        "id": "course-uuid",
        "title": "Full Stack Mastery"
      },
      "declaredAmount": "450.00",
      "priceSnapshot": "499.00",
      "hasAmountMismatch": true,
      "isDuplicateScreenshot": true,
      "screenshotSignedUrl": "https://s3.../receipt.png?token=...",
      "transactionRef": "INSTA-987654321",
      "status": "PENDING",
      "createdAt": "2026-10-30T21:45:00Z"
    }
  ]
}
```

---

### 4. Admin: Approve or Decline Payment
- **Method**: `PATCH`
- **Path**: `/api/v1/payments/admin/:id/status`
- **Access**: Admin
- **Request Body**:
```json
{
  "status": "APPROVED | DECLINED",
  "declineReason": "Amount declared is less than required course fee (450 vs 499 EGP)."
}
```
- **Atomic Execution**:
  - If `APPROVED`: Sets `status: APPROVED`, records `reviewedById`, creates/reactivates `Enrollment` in single Prisma transaction, and emits `payment:status_updated` socket event + Notification.
  - If `DECLINED`: Sets `status: DECLINED`, saves `declineReason`, emits notification to student.

---

### 5. Admin: Revoke Enrollment
Note: this endpoint is scoped under `/api/v1/enrollments`, not `/api/v1/payments`, because it acts on the access right rather than on the payment record.

- **Method**: `POST`
- **Path**: `/api/v1/enrollments/:enrollmentId/revoke`
- **Access**: Admin only (`requireRole('ADMIN')`)
- **Rules**:
  - Sets `Enrollment.status` to `REVOKED` and records `revokedById` and `revokedAt`.
  - MUST NOT change the related `Payment` in any way: its `status`, `declineReason`, and audit fields are left untouched, so an approved payment stays `APPROVED`.
  - Blocks new signed URLs immediately: every subsequent playback or attachment request fails the enrollment check and returns `403`.
  - Does NOT terminate existing Socket.IO connections, and does not invalidate signed URLs already issued; those expire naturally within their ≤ 15 minute window.
  - Idempotent: revoking an already-revoked enrollment returns `409` and changes nothing.
- **Request Body**:
```json
{
  "reason": "Chargeback reported by the student's bank."
}
```
  - `reason` is optional, max 500 characters, stored for audit.
- **Responses**:
  - `200 OK`:
  ```json
  {
    "id": "enrollment-uuid",
    "userId": "user-uuid",
    "courseId": "course-uuid",
    "status": "REVOKED",
    "revokedAt": "2026-11-02T10:15:00Z",
    "revokedById": "admin-uuid",
    "paymentStatus": "APPROVED"
  }
  ```
- **Errors**:
  - `400 Bad Request`: `enrollmentId` is not a valid UUID, or `reason` exceeds 500 characters.
  - `401 Unauthorized`: Missing or invalid access token.
  - `403 Forbidden`: Caller is authenticated but is not an Admin.
  - `404 Not Found`: No enrollment with that ID.
  - `409 Conflict`: Enrollment is already `REVOKED`.
