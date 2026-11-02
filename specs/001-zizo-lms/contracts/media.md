# API Contracts: Media & Signed URLs

All endpoints prefixed under `/api/v1/media`.

---

### 1. Get Video Stream Signed URL
- **Method**: `GET`
- **Path**: `/api/v1/media/video-stream/:videoId`
- **Access**: Enrolled Student or Admin (or free preview)
- **Security Check**:
  - If `Video.isFreePreview === true`: Allowed for all registered users.
  - Else: Verifies `Enrollment` exists where `userId === caller.id` and `courseId === video.section.courseId` and `status === 'ACTIVE'`.
- **Response `200 OK`**:
```json
{
  "streamUrl": "https://s3-eu-west-1.amazonaws.com/bucket/videos/lecture-1.mp4?X-Amz-Signature=...",
  "expiresInSeconds": 900
}
```
- **Error Responses**:
  - `401 Unauthorized`: Not logged in.
  - `403 Forbidden`: User is not enrolled in this course.

---

### 2. Get Attachment Download Signed URL
- **Method**: `GET`
- **Path**: `/api/v1/media/attachment/:attachmentId`
- **Access**: Enrolled Student or Admin
- **Response `200 OK`**:
```json
{
  "downloadUrl": "https://s3.amazonaws.com/bucket/attachments/cheatsheet.pdf?X-Amz-Signature=...",
  "fileName": "cheatsheet.pdf"
}
```

---

### 3. Admin: Request Video Upload Pre-signed URL
- **Method**: `POST`
- **Path**: `/api/v1/media/video-upload-url`
- **Access**: Admin only
- **Request Body**:
```json
{
  "sectionId": "sec-uuid",
  "fileName": "lecture-2.mp4",
  "fileSize": 450000000,
  "mimeType": "video/mp4"
}
```
- **Response `200 OK`**: Pre-signed `PutObject` URL for browser direct S3 upload.
