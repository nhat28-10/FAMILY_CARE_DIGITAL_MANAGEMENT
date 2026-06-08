# Backend Setup (Family Care API)

NestJS + Prisma + PostgreSQL. Follow these steps after cloning/pulling.

## Prerequisites
- Node.js 20+
- PostgreSQL 14+ running locally (or a connection string to a shared DB)

## First-time setup

```bash
cd server

# 1. Install dependencies (this also runs `prisma generate` via postinstall)
npm install

# 2. Create your local env file from the template, then edit the values
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env

# 3. Create the database in PostgreSQL (once). Example name: family_care_dev
#    Make sure DATABASE_URL in .env matches your DB name / user / password.

# 4. Apply the committed migrations to your local database
npx prisma migrate dev

# 5. Run the API in watch mode
npm run start:dev
```

- API base URL: `http://localhost:3000/api/v1`
- Swagger docs: `http://localhost:3000/api/docs`

## What each teammate must configure themselves
- **`.env`** — never committed (contains secrets). Copy from `.env.example` and fill in:
  - `DATABASE_URL` → their own PostgreSQL connection.
  - `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` → any strong random strings
    (they only need to be consistent on each machine, e.g. `openssl rand -hex 32`).

## Daily workflow
```bash
git pull
npm install            # in case dependencies changed
npx prisma migrate dev # in case a new migration was added
npm run start:dev
```

## Useful commands
| Command | Description |
|---------|-------------|
| `npm run start:dev` | Run with hot reload |
| `npm run prisma:studio` | Visual DB browser (table `users`) |
| `npx prisma migrate dev --name <change>` | Create + apply a new migration after editing `schema.prisma` |
| `npx prisma migrate deploy` | Apply migrations in production/CI (no prompts) |
| `npx prisma generate` | Regenerate Prisma Client manually |

## Running with Docker

Three separate databases: each dev machine + production all use their own DB. Only
the code and `prisma/migrations/` are shared via git.

### Dev — Postgres in Docker (recommended, identical on every machine)
```bash
cd server
docker compose up -d db        # start Postgres (published on localhost:5432)
cp .env.example .env           # if you don't have one yet
npx prisma migrate deploy      # create tables
npm run start:dev              # run the API on the host (hot reload)
```
> If a native Postgres already uses port 5432, stop it first, or change the port
> mapping in `docker-compose.yml` to `"5433:5432"` and update `DATABASE_URL`.

You can also run the API itself in Docker: `docker compose --profile full up --build`.

### Production — API + Postgres in Docker (data persisted in a volume)
```bash
cd server
cp .env.production.example .env.production   # then edit REAL secrets (gitignored)
docker compose -f docker-compose.prod.yml up --build -d
```
- The `api` container runs `prisma migrate deploy` automatically on start.
- Data lives in the `pgdata` volume. `down` keeps it; **`down -v` deletes it**.
- `DATABASE_URL` host in `.env.production` must be `db` (the compose service name).

## Testing the API
Open `test-api.http` with the VS Code **REST Client** extension, or use Swagger
at `/api/docs`. Register/login to get a token, then Authorize to call protected
routes (`/auth/me`, `/auth/logout`).

## Troubleshooting
- **`Cannot find module '@prisma/client'`** → run `npx prisma generate`.
- **`Environment variable not found: DATABASE_URL`** → you have no `.env`; copy it from `.env.example`.
- **DB connection refused** → PostgreSQL isn't running or `DATABASE_URL` is wrong.
- **401 on `/auth/me` right after login** → access token lasts 15 min; log in or refresh again.
