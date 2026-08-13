# 2. Installation Guide

> Scope: `server/` (NestJS backend, active) + `face-ai-service/` (optional). `admin/` and
> `mobile/` are empty scaffolds — no install steps exist for them yet. Source of truth:
> `server/SETUP.md`, `server/.env.example`, `server/docker-compose.yml` (the root-level
> `README.md` / `docs/*.md` predate the Prisma migration and are out of date).

## 2.1 System Requirements

### Hardware

| Component | Minimum | Notes |
|---|---|---|
| Processor | Dual-core (Intel i3 or equivalent) | — |
| Memory | 8 GB | 16 GB recommended if running Face AI locally — the InsightFace model loads fully into memory |
| Storage | 3 GB free | Node modules + Postgres data + ONNX face model weights |
| Network | Broadband | Required for install and third-party integrations |

### Software

**Backend API (`server/`)**

| Requirement | Version | |
|---|---|---|
| Node.js | ≥ 20 | required |
| npm | bundled with Node | required |
| PostgreSQL | 14+ (16 via Docker Compose) | required |
| Redis | any recent | required — `start:dev` hangs at boot without it (BullMQ queue init) |

**Face AI Service (`face-ai-service/`)** — optional, album face-recognition only
- Python 3.11
- Docker (recommended run path)

**Admin (`admin/`) / Mobile (`mobile/`)**
- Not started — empty placeholders, no install steps yet.

**Additional tools**
- Git
- Docker + Docker Compose
- REST client: Swagger UI (built in at `/api/docs`) or `server/test-api.http` (VS Code REST Client extension)

### Network

Every integration below is optional at boot — an empty env var disables that feature instead of crashing the app.

| Service | Used for | If unset |
|---|---|---|
| Stripe | Subscription payments (test mode) | degrades |
| Firebase | Google login + FCM push | push disabled, WS still works |
| Cloudflare R2 | Chat / album file storage | degrades |
| Resend / Brevo / SMTP | Email OTP | OTP printed to console |
| OpenAI | AI chatbot | endpoint returns 503 |
| Cloudflare Workers AI | Album moderation | degrades |

## 2.2 Installation Instruction

### Step 1 — Clone the source

```bash
git clone <repository-url>
cd FAMILY_CARE_DIGITAL_MANAGEMENT
```

Monorepo: `server/` (backend, active), `admin/` and `mobile/` (empty), `face-ai-service/` (optional Python service).

### Step 2 — Start PostgreSQL + Redis (required)

```bash
cd server
docker compose up -d db redis
```

Postgres 16 on `localhost:5432`, Redis on `localhost:6379` — identical on every dev machine. If a native Postgres already holds port 5432, stop it or remap the port in `docker-compose.yml`.

### Step 3 — Configure environment variables

```bash
cp .env.example .env
# Windows PowerShell:
Copy-Item .env.example .env
```

`server/.env` is **gitignored** — never commit it, and never paste its real contents into chat, tickets, or docs (Stripe/Resend/OpenAI/R2/Firebase keys inside it are live credentials for those services). If a real `.env` has ever been shared outside your machine, rotate the exposed keys.

**3.1 — Core (required to boot)**

```env
APP_NAME=Family Care API
APP_ENV=development
APP_PORT=3000
APP_PREFIX=api/v1

DATABASE_URL="postgresql://<user>:<password>@localhost:5432/<db_name>?schema=public"

JWT_ACCESS_SECRET=<openssl rand -hex 32>
JWT_REFRESH_SECRET=<openssl rand -hex 32>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

BCRYPT_SALT_ROUNDS=10

REDIS_HOST=localhost
REDIS_PORT=6379
```

- `DATABASE_URL` must match the Postgres you started in Step 2 — same user/password/db name.
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` only need to be strong and consistent on your machine, not shared across the team.

**3.2 — Optional integrations** (blank = feature disabled, app still boots)

| Group | Key vars | If unset |
|---|---|---|
| Admin seed | `ADMIN_EMAIL`, `ADMIN_PASSWORD` | used only by `npm run seed` |
| Stripe (**test mode only** — never a live key, see project policy) | `STRIPE_SECRET_KEY=sk_test_…`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PLUS`, `STRIPE_PRICE_PREMIUM` | payment endpoints disabled |
| Mail | `MAIL_PROVIDER` (`resend` \| `brevo` \| `smtp`, blank = OTP printed to console), `MAIL_FROM`, `RESEND_API_KEY` / `BREVO_API_KEY` / `SMTP_*` | OTP printed to console |
| Cloudflare R2 (chat/album storage) | `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL` | file upload disabled |
| Firebase (Google login + FCM push) | `FIREBASE_SERVICE_ACCOUNT` — base64 of the full service-account JSON, single var enables both | push disabled, WS still works |
| OpenAI (AI chatbot) | `OPENAI_API_KEY`, `OPENAI_MODEL` | chatbot endpoint returns 503 |
| Face AI (album face profiles) | `FACE_EMBEDDING_ENCRYPTION_KEY` — base64 of exactly 32 random bytes: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` | face features disabled |

Fill in only what your current task touches — a Stripe key isn't needed to work on `finance`, an R2 key isn't needed to work on `auth`, etc.

### Step 4 — Install dependencies

```bash
npm install
```

Runs `prisma generate` automatically via the `postinstall` hook.

### Step 5 — Apply database migrations

```bash
npx prisma migrate dev
```

Applies every committed migration in `server/prisma/migrations/`.

Optional — seed an admin account and Stripe price IDs:

```bash
npm run seed
```

### Step 6 — Run the backend

```bash
npm run start:dev
```

- API: `http://localhost:3000/api/v1`
- Swagger: `http://localhost:3000/api/docs`

Register / login via Swagger to get a JWT, then Authorize to reach protected routes.

### Step 7 — Run the Face AI service (optional)

```bash
docker compose --profile full up --build
```

Builds and runs `db`, `redis`, `api`, and `face-ai-service` (FastAPI + InsightFace, port `8000`) together. Standalone alternative:

```bash
cd face-ai-service
docker build -t face-ai .
docker run -p 8000:8000 face-ai
```

### Step 8 — Admin portal / Mobile app

Not applicable yet — both are empty scaffolds, nothing to install.

## Appendix — Notes vs. the reference template

- **Backend**: NestJS (Node.js), not Spring Boot / Java.
- **Data layer**: Prisma ORM, not JPA/JDBC — TypeORM was fully removed from this project.
- **AI service**: a dedicated Python/FastAPI/InsightFace service for face recognition, separate from the chatbot (OpenAI, inside the main API).
- **Redis**: mandatory for dev boot (BullMQ notification queue) — easy to miss since the older root-level docs don't mention it.
- **Admin / Mobile**: no fabricated install steps — both folders are genuinely empty placeholders today.
