# Contributing Guide

Tài liệu này dành cho member tham gia phát triển Family Care Digital Management.

## 1. Clone Project

```bash
git clone <repo-url>
cd FAMILY_CARE_DIGITAL_MANAGEMENT
```

## 2. Run Project With Docker

Workflow chính của team là chạy bằng Docker Compose:

```bash
docker compose up -d --build
```

Mở Swagger:

```txt
http://localhost:3000/api/docs
```

Xem log backend:

```bash
docker compose logs -f server
```

## 3. Backend Development

Backend nằm trong folder:

```txt
server/
```

Cấu trúc chính:

```txt
server/src
├── common/
├── config/
├── database/
├── integrations/
├── modules/
├── realtime/
├── app.module.ts
└── main.ts
```

Các module nghiệp vụ nằm trong:

```txt
server/src/modules/
```

## 4. Code Style

Trước khi push code backend:

```bash
cd server
npm run build
npm run lint
```

`npm run build` kiểm tra TypeScript build.

`npm run lint` kiểm tra/sửa code style bằng ESLint.

## 5. Environment Rules

Không hard-code database host/port trong source code.

Dùng biến môi trường:

```env
DB_HOST=
DB_PORT=
DB_USERNAME=
DB_PASSWORD=
DB_DATABASE=
```

Khi chạy Docker Compose:

```env
DB_HOST=postgres
DB_PORT=5432
```

Khi chạy local ngoài Docker:

```env
DB_HOST=127.0.0.1
DB_PORT=5433
```

Khi chạy Kubernetes:

```env
DB_HOST=family-care-postgres
DB_PORT=5432
```

## 6. Do Not Commit Secrets

Không commit các file chứa secret thật:

```txt
.env
.env.local
.env.docker
.env.k8s
```

Nên commit file mẫu:

```txt
.env.example
.env.docker.example
.env.k8s.example
```

Các giá trị như JWT secret, API key, payment secret, FCM key phải được thay bằng placeholder trong file mẫu.

## 7. Docker Rules

Nếu sửa Dockerfile hoặc docker-compose:

```bash
docker compose down
docker compose up -d --build
docker compose logs -f server
```

Kiểm tra container:

```bash
docker ps
```

## 8. Database Rules

Project dùng PostgreSQL và TypeORM.

Không bật `synchronize: true` cho môi trường deploy thật.

Khi thay đổi schema, nên dùng migration.

Migration commands:

```bash
cd server
npm run migration:generate -- src/database/migrations/MigrationName
npm run migration:run
npm run migration:revert
```

## 9. Pull Request Checklist

Trước khi tạo PR, kiểm tra:

```txt
[ ] Code build thành công
[ ] Lint pass
[ ] Docker Compose chạy được nếu có thay đổi setup
[ ] Không commit secret thật
[ ] Không commit node_modules/dist/coverage
[ ] Có cập nhật tài liệu nếu thay đổi cách chạy/setup
[ ] Tên branch đúng convention
[ ] Commit message rõ nghĩa
```

## 10. Communication Rules

Khi báo lỗi cho team, nên gửi đủ:

```txt
1. Lệnh đã chạy
2. Log lỗi đầy đủ
3. File env đang dùng, che secret nếu có
4. Kết quả docker ps
5. Môi trường đang chạy: local, Docker hay Kubernetes
```

Ví dụ:

```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

và log:

```bash
docker compose logs -f server
```
