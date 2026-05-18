# Docker Guide

Tài liệu này hướng dẫn cách chạy project bằng Docker Compose.

Đây là workflow chính được khuyến nghị cho project hiện tại: server NestJS và PostgreSQL đều chạy bằng Docker.

## Services

`docker-compose.yml` định nghĩa các service chính:

| Service | Container | Chức năng |
|---|---|---|
| `postgres` | `family-care-postgres` | PostgreSQL database |
| `server` | `family-care-server` | NestJS backend API |

## Ports

| Service | Host port | Container port | Mục đích |
|---|---:|---:|---|
| Server | `3000` | `3000` | FE/Mobile/Postman gọi API |
| PostgreSQL | `5433` | `5432` | Chỉ dùng khi app chạy local ngoài Docker hoặc cần DB client |

## Run Full Stack

Tại thư mục root project:

```bash
docker compose up -d --build
```

Lệnh này sẽ:

```txt
1. Build image backend từ server/Dockerfile
2. Tạo container PostgreSQL
3. Chờ PostgreSQL healthy
4. Tạo container server
5. Publish API ra localhost:3000
```

## Check Running Containers

```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

Kết quả mong đợi:

```txt
family-care-postgres   Up ... healthy   0.0.0.0:5433->5432/tcp
family-care-server     Up ...           0.0.0.0:3000->3000/tcp
```

## View Logs

Server logs:

```bash
docker compose logs -f server
```

PostgreSQL logs:

```bash
docker compose logs -f postgres
```

All logs:

```bash
docker compose logs -f
```

## Open Swagger

Sau khi container chạy thành công:

```txt
http://localhost:3000/api/docs
```

## Stop Containers

```bash
docker compose down
```

Lệnh này dừng và xóa container, nhưng giữ volume database.

## Stop And Remove Database Data

```bash
docker compose down -v
```

> Cảnh báo: lệnh này xóa volume PostgreSQL local. Dữ liệu database sẽ mất.

## Rebuild Server Only

Dùng khi chỉ sửa source backend:

```bash
docker compose up -d --build server
```

## Restart Services

```bash
docker compose restart
```

Restart riêng server:

```bash
docker compose restart server
```

Restart riêng database:

```bash
docker compose restart postgres
```

## Database Connection In Docker

Khi server chạy trong Docker container, server phải kết nối database bằng:

```env
DB_HOST=postgres
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=123456789
DB_DATABASE=family_care_dev
```

Giải thích:

```txt
postgres là tên service trong docker-compose.yml.
5432 là port nội bộ của container PostgreSQL.
```

Không dùng:

```env
DB_HOST=127.0.0.1
```

vì `127.0.0.1` trong container server trỏ về chính container server.

## Connect To PostgreSQL Container

Vào psql trong container:

```bash
docker exec -it family-care-postgres psql -U postgres -d postgres
```

Liệt kê database:

```sql
\l
```

Hoặc chạy trực tiếp từ terminal:

```bash
docker exec -it family-care-postgres psql -U postgres -d postgres -c "SELECT datname FROM pg_database ORDER BY datname;"
```

Database mong đợi:

```txt
family_care_dev
postgres
template0
template1
```

## Create Database Manually

Nếu database `family_care_dev` chưa tồn tại:

```bash
docker exec -it family-care-postgres psql -U postgres -d postgres -c "CREATE DATABASE family_care_dev;"
```

Nếu báo database đã tồn tại thì không cần tạo lại.

## Healthcheck

PostgreSQL có healthcheck:

```yml
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U postgres -d family_care_dev"]
  interval: 10s
  timeout: 5s
  retries: 5
```

Server chỉ start sau khi PostgreSQL healthy:

```yml
depends_on:
  postgres:
    condition: service_healthy
```

## Common Docker Commands

```bash
# Chạy toàn bộ stack
docker compose up -d --build

# Xem trạng thái
docker compose ps

# Xem log server
docker compose logs -f server

# Xem log postgres
docker compose logs -f postgres

# Dừng stack
docker compose down

# Dừng stack và xóa database volume
docker compose down -v

# Rebuild server
docker compose up -d --build server

# Vào shell container server
docker exec -it family-care-server sh

# Vào psql container postgres
docker exec -it family-care-postgres psql -U postgres -d family_care_dev
```

## Recommended Docker Workflow For Team

```bash
git pull

docker compose down

docker compose up -d --build

docker compose logs -f server
```

Nếu có lỗi database khó xử lý trong môi trường local demo:

```bash
docker compose down -v
docker compose up -d --build
```

Chỉ dùng `down -v` khi chấp nhận xóa dữ liệu database local.
