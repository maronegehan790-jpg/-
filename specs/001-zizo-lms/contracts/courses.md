# API Contracts: Courses, Sections & Lessons

All endpoints prefixed under `/api/v1/courses`.

---

### 1. List Courses (Public Catalog)
- **Method**: `GET`
- **Path**: `/api/v1/courses`
- **Query Params**: `page=1&limit=12&search=math`
- **Access**: Public
- **Response `200 OK`**:
```json
{
  "items": [
    {
      "id": "uuid",
      "title": "Full Stack Mastery",
      "slug": "full-stack-mastery",
      "description": "Comprehensive course...",
      "price": "499.00",
      "thumbnailUrl": "https://s3.../thumb.jpg",
      "status": "PUBLISHED",
      "sectionCount": 4,
      "videoCount": 24
    }
  ],
  "total": 1,
  "page": 1,
  "totalPages": 1
}
```

---

### 2. Get Course Detail & Curriculum
- **Method**: `GET`
- **Path**: `/api/v1/courses/:slugOrId`
- **Access**: Public / Authenticated
- **Behavior**:
  - Unenrolled users see sections, video titles, and duration, but `s3Key` is withheld and `isLocked: true`.
  - Enrolled users (`status: ACTIVE`) see `isLocked: false` and can access video details.
- **Response `200 OK`**:
```json
{
  "id": "uuid",
  "title": "Full Stack Mastery",
  "slug": "full-stack-mastery",
  "price": "499.00",
  "isEnrolled": true,
  "sections": [
    {
      "id": "sec-uuid",
      "title": "Getting Started",
      "order": 1,
      "videos": [
        {
          "id": "vid-uuid",
          "title": "Welcome & Setup",
          "order": 1,
          "duration": 480,
          "isFreePreview": true,
          "isLocked": false,
          "completed": true
        }
      ]
    }
  ]
}
```

---

### 3. Admin: Create Course
- **Method**: `POST`
- **Path**: `/api/v1/courses`
- **Access**: Admin only (`requireRole('ADMIN')`)
- **Request Body**:
```json
{
  "title": "Advanced Node.js",
  "slug": "advanced-nodejs",
  "description": "In-depth backend architecture...",
  "price": 750.00,
  "thumbnailKey": "courses/thumbnails/thumb-123.jpg"
}
```

---

### 4. Admin: Publish / Unpublish Course
- **Method**: `PATCH`
- **Path**: `/api/v1/courses/:id/status`
- **Access**: Admin only
- **Rules**:
  - Cannot publish if course has 0 videos.
  - Cannot delete if course has enrolled students (returns `400` suggesting unpublish instead).

---

### 5. Admin: Manage Sections & Videos
- `POST /api/v1/courses/:id/sections` - Add section
- `PATCH /api/v1/sections/:id` - Update section title / order
- `DELETE /api/v1/sections/:id` - Delete section
- `POST /api/v1/sections/:id/videos` - Add video metadata
- `PATCH /api/v1/videos/:id` - Update video
- `DELETE /api/v1/videos/:id` - Delete video
