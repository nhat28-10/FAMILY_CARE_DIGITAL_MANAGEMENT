# Deployment Setup Guide

Tài liệu này tổng hợp cách setup và chạy Family Care Digital Management ở các môi trường: Docker Compose và Kubernetes demo.

## 1. Overview

Project hiện tại gồm các phần chính:

```txt
server/     NestJS backend
admin/      Admin app placeholder
mobile/     Mobile app placeholder
k8s/        Kubernetes manifests
docker-compose.yml
```

Backend sử dụng:

```txt
NestJS + TypeScript + PostgreSQL + TypeORM + Swagger
```

## 2. Recommended Development/Testing Flow

Với team hiện tại, khuyến nghị chạy backend bằng Docker Compose:

```bash
docker compose up -d --build
```

Lý do:

```txt
- Server và PostgreSQL chạy cùng Docker network
- Member không cần tự cài PostgreSQL local
- Môi trường chạy đồng nhất hơn giữa các máy
- Dễ kiểm tra trước khi chuyển sang Kubernetes
```

## 3. Docker Compose Setup

### 3.1. Required Files

Các file cần có:

```txt
docker-compose.yml
server/Dockerfile
server/.env.docker
server/package.json
server/package-lock.json
```

Nếu team không commit `.env.docker`, hãy tạo từ file mẫu:

```bash
cp server/.env.example server/.env.docker
```

Trên Windows PowerShell:

```powershell
Copy-Item .\server\.env.example .\server\.env.docker
```

### 3.2. Docker Environment

`server/.env.docker` nên có:

```env
APP_NAME=Family Care API
APP_ENV=docker
APP_PORT=3000
APP_PREFIX=api/v1

DB_HOST=postgres
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=123456789
DB_DATABASE=family_care_dev

JWT_ACCESS_SECRET=change_me_access_secret_at_least_32_chars
JWT_REFRESH_SECRET=change_me_refresh_secret_at_least_32_chars
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

BCRYPT_SALT_ROUNDS=10
SWAGGER_ENABLED=true
```

Điểm quan trọng:

```txt
DB_HOST=postgres
```

vì `postgres` là tên service trong Docker Compose.

### 3.3. Run Docker Compose

Tại root project:

```bash
docker compose up -d --build
```

Kiểm tra container:

```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

Kỳ vọng:

```txt
family-care-postgres   Up ... healthy   0.0.0.0:5433->5432/tcp
family-care-server     Up ...           0.0.0.0:3000->3000/tcp
```

### 3.4. View Logs

```bash
docker compose logs -f server
```

Nếu server chạy thành công, mở:

```txt
http://localhost:3000/api/docs
```

## 4. Local Run Setup

Local run chỉ dùng khi muốn debug NestJS trực tiếp trên máy.

### 4.1. Start PostgreSQL Only

```bash
docker compose up -d postgres
```

### 4.2. Local Env

`server/.env.local` nên có:

```env
APP_NAME=Family Care API
APP_ENV=local
APP_PORT=3000
APP_PREFIX=api/v1

DB_HOST=127.0.0.1
DB_PORT=5433
DB_USERNAME=postgres
DB_PASSWORD=123456789
DB_DATABASE=family_care_dev

JWT_ACCESS_SECRET=change_me_access_secret_at_least_32_chars
JWT_REFRESH_SECRET=change_me_refresh_secret_at_least_32_chars
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

BCRYPT_SALT_ROUNDS=10
SWAGGER_ENABLED=true
```

### 4.3. Run Server Local

```bash
cd server
npm install
npm run start:local
```

## 5. Kubernetes Demo Setup

### 5.1. Build Image

```bash
docker build -t family-care-server:demo ./server
```

### 5.2. Apply Manifests

```bash
kubectl apply -f ./k8s
```

### 5.3. Check Pods

```bash
kubectl get pods -n family-care
```

### 5.4. View Server Logs

```bash
kubectl logs -f deployment/family-care-server -n family-care
```

### 5.5. Port Forward

```bash
kubectl port-forward svc/family-care-server 3000:3000 -n family-care
```

Open:

```txt
http://localhost:3000/api/docs
```

## 6. Build And Lint Before Commit

Trước khi commit backend:

```bash
cd server
npm run build
npm run lint
```

`npm run build` tạo folder `dist/`.

`npm run lint` kiểm tra/sửa code style.

Hai lệnh này không dùng để chạy server.

## 7. Common Problems

### 7.1. `getaddrinfo ENOTFOUND postgres`

Nguyên nhân:

```txt
Server chạy ngoài Docker nhưng DB_HOST=postgres.
```

Sửa local env:

```env
DB_HOST=127.0.0.1
DB_PORT=5433
```

### 7.2. `ECONNREFUSED 127.0.0.1:5433`

Nguyên nhân:

```txt
Không có PostgreSQL nào lắng nghe ở port 5433.
```

Kiểm tra:

```bash
docker ps --format "table {{.Names}}\t{{.Ports}}"
```

PostgreSQL phải có:

```txt
0.0.0.0:5433->5432/tcp
```

### 7.3. `database "family_care_dev" does not exist`

Kiểm tra database:

```bash
docker exec -it family-care-postgres psql -U postgres -d postgres -c "SELECT datname FROM pg_database ORDER BY datname;"
```

Tạo database nếu thiếu:

```bash
docker exec -it family-care-postgres psql -U postgres -d postgres -c "CREATE DATABASE family_care_dev;"
```

## 8. Clean Reset Local Docker

Nếu muốn reset sạch môi trường Docker local:

```bash
docker compose down -v
docker compose up -d --build
```

> Cảnh báo: `down -v` xóa dữ liệu PostgreSQL local.
