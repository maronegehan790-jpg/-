# API Contracts: Authentication

All endpoints prefixed under `/api/v1/auth`.

---

### 1. Register Student
- **Method**: `POST`
- **Path**: `/api/v1/auth/register`
- **Rate Limit**: 10 requests / 15 minutes per IP
- **Request Body**:
```json
{
  "email": "student@example.com",
  "password": "Password123!",
  "name": "Ahmed Wael"
}
```
- **Responses**:
  - `201 Created`:
  ```json
  {
    "user": {
      "id": "uuid-v4",
      "email": "student@example.com",
      "name": "Ahmed Wael",
      "role": "STUDENT"
    },
    "accessToken": "jwt-token-string"
  }
  ```
  - `400 Bad Request`: Validation failure (e.g., password too weak).
  - `409 Conflict`: Email already exists.

---

### 2. Login
- **Method**: `POST`
- **Path**: `/api/v1/auth/login`
- **Rate Limit**: 5 attempts / 15 minutes per IP/account
- **Request Body**:
```json
{
  "email": "user@example.com",
  "password": "Password123!"
}
```
- **Responses**:
  - `200 OK`:
  ```json
  {
    "user": {
      "id": "uuid-v4",
      "email": "user@example.com",
      "name": "User Name",
      "role": "ADMIN | STUDENT"
    },
    "accessToken": "jwt-token-string"
  }
  ```
  - Note: Sets `refreshToken` as an `HttpOnly`, `SameSite=Strict`, `Secure` cookie.
  - `401 Unauthorized`: Invalid credentials.

---

### 3. Refresh Access Token
- **Method**: `POST`
- **Path**: `/api/v1/auth/refresh`
- **Cookie Required**: `refreshToken`
- **Responses**:
  - `200 OK`:
  ```json
  {
    "accessToken": "new-jwt-token-string"
  }
  ```
  - `401 Unauthorized`: Token expired or revoked.

---

### 4. Logout
- **Method**: `POST`
- **Path**: `/api/v1/auth/logout`
- **Authorization**: Bearer JWT
- **Responses**:
  - `200 OK`: Clears cookie and marks refreshToken revoked in database.

---

### 5. Get Current User Profile
- **Method**: `GET`
- **Path**: `/api/v1/auth/me`
- **Authorization**: Bearer JWT
- **Responses**:
  - `200 OK`: Returns current user entity with role and active enrollment IDs.

---

### 6. Request Password Reset
- **Method**: `POST`
- **Path**: `/api/v1/auth/forgot-password`
- **Rate Limit**: 5 requests / 15 minutes per IP AND 3 requests / hour per account
- **Rules**:
  - Issues a single-use reset token valid for 60 minutes; only the token hash is stored.
  - Issuing a new token invalidates any outstanding token for that account.
  - The token is delivered by email through the `EmailSender` interface; it is never returned in the response body.
  - The response MUST be byte-identical whether or not the email belongs to an account, and the response time MUST NOT reveal existence (no account enumeration).
- **Request Body**:
```json
{
  "email": "student@example.com"
}
```
- **Responses**:
  - `202 Accepted` (returned for both known and unknown emails):
  ```json
  {
    "message": "If an account exists for that email, a password reset link has been sent."
  }
  ```
  - `400 Bad Request`: Malformed email.
  - `429 Too Many Requests`: Rate limit exceeded.

---

### 7. Reset Password
- **Method**: `POST`
- **Path**: `/api/v1/auth/reset-password`
- **Rate Limit**: 5 attempts / 15 minutes per IP AND 5 attempts / hour per token
- **Rules**:
  - The token is single-use: it is consumed on success and cannot be replayed.
  - An expired token (older than 60 minutes) is rejected and no password change occurs.
  - The new password is hashed with bcrypt (cost ≥ 12) and must satisfy the same strength rules as registration.
  - All of the user's refresh tokens are revoked on success, forcing re-login.
- **Request Body**:
```json
{
  "token": "opaque-reset-token-string",
  "password": "NewPassword123!"
}
```
- **Responses**:
  - `200 OK`:
  ```json
  {
    "message": "Password has been reset. Please log in."
  }
  ```
  - `400 Bad Request`: Validation failure (e.g., password too weak).
  - `410 Gone`: Token is expired, already used, or unknown (single generic message for all three, to avoid revealing token state).
  - `429 Too Many Requests`: Rate limit exceeded.
