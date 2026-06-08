# Family Care Digital Management

Family Care Digital Management là hệ thống quản lý gia đình số, phục vụ các chức năng như quản lý thành viên gia đình, vai trò/quyền hạn, gói đăng ký, ví, giao dịch, nhiệm vụ, phần thưởng, chat, thông báo, SOS, vị trí, thiết bị, lịch, album và AI chatbot.

Repository hiện tại tập trung vào phần backend sử dụng NestJS, PostgreSQL, Docker Compose và Kubernetes demo.

## Tech Stack

| Thành phần | Công nghệ |
|---|---|
| Backend | NestJS, TypeScript |
| Database | PostgreSQL |
| ORM | TypeORM |
| API Docs | Swagger |
| Realtime | WebSocket / Socket.IO |
| Auth | JWT, Passport |
| Container | Docker, Docker Compose |
| Deployment demo | Kubernetes |

## Repository Structure

```txt
FAMILY_CARE_DIGITAL_MANAGEMENT
├── admin/                         # Admin web app, hiện đang để khung
├── mobile/                        # Mobile app, hiện đang để khung
├── k8s/                           # Kubernetes manifests
├── server/                        # NestJS backend
│   ├── src/
│   │   ├── common/                # Shared constants, decorators, guards, pipes, filters
│   │   ├── config/                # App configuration
│   │   ├── database/              # TypeORM config, datasource, migrations, seeders
│   │   ├── integrations/          # External integrations: mail, FCM, OpenAI, payment, storage
│   │   ├── modules/               # Business modules
│   │   ├── realtime/              # WebSocket gateways/events
│   │   ├── app.module.ts
│   │   └── main.ts
│   ├── Dockerfile
│   ├── package.json
│   └── README.md
├── docker-compose.yml             # Docker Compose setup
├── DEPLOYMENT_SETUP_GUIDE.md      # Tổng quan setup/deploy
├── DOCKER_GUIDE.md                # Hướng dẫn Docker Compose
├── ENVIRONMENT_GUIDE.md           # Giải thích .env.local/.env.docker/.env.k8s
├── K8S_GUIDE.md                   # Hướng dẫn Kubernetes demo
├── TROUBLESHOOTING.md             # Tổng hợp lỗi thường gặp
├── GIT_WORKFLOW.md                # Quy ước Git cho team
├── CONTRIBUTING.md                # Checklist đóng góp code
└── README.md
```

## Quick Start With Docker

Đây là cách chạy chính của project hiện tại. Server và PostgreSQL đều chạy trong Docker Compose.

Tại thư mục root của project:

```bash
docker compose up -d --build
```

Xem log server:

```bash
docker compose logs -f server
```

Mở Swagger:

```txt
http://localhost:3000/api/docs
```

Dừng container:

```bash
docker compose down
```

Dừng container và xóa volume database local:

```bash
docker compose down -v
```

> Cẩn thận: `docker compose down -v` sẽ xóa dữ liệu PostgreSQL trong volume local.

## Main Docker Services

| Service | Container name | Port host | Port container |
|---|---|---:|---:|
| Backend server | `family-care-server` | `3000` | `3000` |
| PostgreSQL | `family-care-postgres` | `5433` | `5432` |

Trong Docker network, backend kết nối database bằng:

```env
DB_HOST=postgres
DB_PORT=5432
```

Không dùng `localhost` hoặc `127.0.0.1` khi server đang chạy trong Docker container.

## Useful Commands

```bash
# Build và chạy toàn bộ stack
docker compose up -d --build

# Xem container đang chạy
docker ps

# Xem log server
docker compose logs -f server

# Xem log postgres
docker compose logs -f postgres

# Rebuild riêng server
docker compose up -d --build server

# Restart toàn bộ service
docker compose restart

# Dừng toàn bộ service
docker compose down
```

## Backend Commands

Nếu cần kiểm tra code trong thư mục `server`:

```bash
cd server
npm install
npm run build
npm run lint
```

Chạy server local ngoài Docker chỉ dùng khi cần debug bằng IDE:

```bash
cd server
npm run start:local
```

Khi chạy local, database vẫn có thể chạy bằng Docker, nhưng app local phải dùng host port, ví dụ:

```env
DB_HOST=127.0.0.1
DB_PORT=5433
```

## Documentation

| File | Mục đích |
|---|---|
| [server/README.md](./server/README.md) | Hướng dẫn backend NestJS |
| [ENVIRONMENT_GUIDE.md](./ENVIRONMENT_GUIDE.md) | Giải thích các file môi trường |
| [DOCKER_GUIDE.md](./DOCKER_GUIDE.md) | Cách chạy bằng Docker Compose |
| [K8S_GUIDE.md](./K8S_GUIDE.md) | Cách chạy Kubernetes demo |
| [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | Cách xử lý lỗi thường gặp |
| [GIT_WORKFLOW.md](./GIT_WORKFLOW.md) | Quy trình branch/commit/push |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Checklist trước khi đóng góp code |
| [DEPLOYMENT_SETUP_GUIDE.md](./DEPLOYMENT_SETUP_GUIDE.md) | Tổng quan setup Docker/Kubernetes |

## Recommended Team Workflow

1. Pull code mới nhất.
2. Chạy backend stack bằng Docker Compose.
3. Code trong branch riêng.
4. Trước khi push, chạy build/lint.
5. Nếu thay đổi setup, cập nhật tài liệu tương ứng.

```bash
git pull

docker compose up -d --build

cd server
npm run build
npm run lint
```

## Notes For Team Members

- Không commit `.env`, `.env.local`, `.env.docker`, `.env.k8s` nếu chứa secret thật.
- Chỉ commit file mẫu như `.env.example`, `.env.docker.example`, `.env.k8s.example` nếu cần.
- Không commit `node_modules/`, `dist/`, `coverage/`, `postgres-data/`.
- Khi server chạy trong Docker, `DB_HOST` phải là `postgres`.
- Khi server chạy local ngoài Docker, `DB_HOST` thường là `127.0.0.1`.
