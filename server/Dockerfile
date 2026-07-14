# ============================================================================
# Build stage — install deps, generate Prisma Client, compile TypeScript
# ============================================================================
FROM node:20-slim AS build
WORKDIR /app

# Prisma needs OpenSSL (even at `prisma generate` time on slim images).
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

# Install dependencies first (better layer caching). `npm ci` runs the
# `postinstall` script which calls `prisma generate`, so the schema must be
# present beforehand.
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

# Compile the app.
COPY . .
RUN npm run build

# ============================================================================
# Runtime stage — slim image that runs the compiled app
# ============================================================================
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ffmpeg postgresql-client \
  && rm -rf /var/lib/apt/lists/*

# node_modules is copied as-is (it includes the Prisma CLI) so that
# `prisma migrate deploy` can run on container start.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json

EXPOSE 3000

# Apply pending migrations, then start the server.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main.js"]
