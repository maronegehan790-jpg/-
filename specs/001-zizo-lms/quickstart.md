# Quickstart Guide: Zizo LMS Development Setup

**Feature Branch**: `001-zizo-lms`  
**Spec Reference**: `specs/001-zizo-lms/spec.md`

---

## 1. Prerequisites
- **Node.js**: v20+ LTS
- **Package Manager**: npm or yarn (standard multi-folder, no monorepo)
- **Database**: PostgreSQL 15+ (local or Docker)
- **Cache & Rate Limiting**: Redis 7+ (local or Docker)
- **Object Storage**: AWS S3 or MinIO for local development

---

## 2. Environment Variables

### Backend (`backend/.env`)
```bash
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/zizo_lms?schema=public

# Test database (separate database so integration tests never touch dev data)
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/zizo_lms_test?schema=public
TEST_REDIS_URL=redis://localhost:6379/1

# Redis (sessions, rate-limit counters, hot-path caches)
REDIS_URL=redis://localhost:6379

# JWT Authentication
JWT_ACCESS_SECRET=your_super_secret_access_key_min_32_chars
JWT_REFRESH_SECRET=your_super_secret_refresh_key_min_32_chars
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# S3 Compatible Storage (AWS / MinIO / Cloudflare R2)
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET=zizo-lms-private
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_FORCE_PATH_STYLE=true

# Admin Seed
INITIAL_ADMIN_EMAIL=admin@zizo.com
INITIAL_ADMIN_PASSWORD=AdminPassword123!
```

### Frontend (`frontend/.env`)
```bash
VITE_API_URL=http://localhost:5000/api/v1
VITE_SOCKET_URL=http://localhost:5000
```

---

## 3. Local Infrastructure with Docker Compose

Create a `docker-compose.yml` in root to spin up Postgres, Redis, and MinIO locally:

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16-alpine
    container_name: zizo-postgres
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: zizo_lms
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    container_name: zizo-redis
    command: redis-server --appendonly yes
    ports:
      - "6379:6379"
    volumes:
      - redisdata:/data

  minio:
    image: minio/minio:latest
    container_name: zizo-minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - miniodata:/data

volumes:
  pgdata:
  redisdata:
  miniodata:
```

Run infrastructure:
```bash
docker compose up -d
```

---

## 4. Setup & Running the Backend

```bash
cd backend

# Install dependencies
npm install

# Run database migrations
npx prisma migrate dev --name init

# Seed database with initial Admin user and sample course
npm run seed

# Start development server
npm run dev
# Server listening at http://localhost:5000
```

---

## 5. Setup & Running the Frontend

```bash
cd frontend

# Install dependencies
npm install

# Run Vite dev server
npm run dev
# App running at http://localhost:5173
```

---

## 6. Testing & Quality Checks

```bash
# In backend/
npm run test:unit
npm run test:integration
npm run lint

# In frontend/
npm run typecheck
npm run test
```
