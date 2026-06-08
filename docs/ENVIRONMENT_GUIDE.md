# Environment Guide

Tài liệu này giải thích cách dùng các file môi trường trong project Family Care Digital Management.

Project có thể chạy theo 3 ngữ cảnh khác nhau:

```txt
1. Local Node.js run      NestJS chạy trực tiếp trên máy
2. Docker Compose run    NestJS và PostgreSQL đều chạy trong Docker
3. Kubernetes run        NestJS và PostgreSQL chạy trong Kubernetes
```

Mỗi ngữ cảnh cần `DB_HOST` và `DB_PORT` khác nhau. Đây là nguyên nhân phổ biến nhất gây lỗi kết nối database.

## Environment Files

| File | Dùng khi nào | Có nên commit? |
|---|---|---|
| `server/.env.example` | File mẫu cho team | Có |
| `server/.env.local` | Chạy NestJS trực tiếp ngoài Docker | Không, nếu có secret |
| `server/.env.docker` | Chạy server bằng Docker Compose | Không, nếu có secret |
| `server/.env.k8s` | Tham khảo cho Kubernetes | Không, nếu có secret |
| `server/.env.docker.example` | File mẫu Docker cho team | Có |
| `server/.env.k8s.example` | File mẫu Kubernetes cho team | Có |

## Docker Compose Environment

Khi server chạy bằng Docker Compose, server container và postgres container nằm chung Docker network.

Khi đó backend phải gọi PostgreSQL bằng tên service:

```env
DB_HOST=postgres
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=123456789
DB_DATABASE=family_care_dev
```

Lý do:

```txt
postgres là tên service trong docker-compose.yml.
Trong Docker network, các container gọi nhau bằng service name.
```

Không dùng:

```env
DB_HOST=localhost
```

hoặc:

```env
DB_HOST=127.0.0.1
```

vì bên trong container server, `localhost` là chính container server, không phải container PostgreSQL.

## Local Environment

Local chỉ dùng khi chạy NestJS trực tiếp bằng npm trên máy:

```bash
cd server
npm run start:local
```

Khi đó NestJS không nằm trong Docker network. Nó phải gọi PostgreSQL thông qua port được Docker publish ra máy thật.

Nếu `docker-compose.yml` map port như sau:

```yml
ports:
  - "5433:5432"
```

thì `server/.env.local` nên là:

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
CORS_ORIGINS=http://localhost:5173,http://localhost:3000,http://localhost:8081,http://localhost:19006
```

Điểm quan trọng:

```txt
5433 là port trên máy thật.
5432 là port bên trong container PostgreSQL.
```

App local phải dùng port bên trái trong mapping `5433:5432`.

## Kubernetes Environment

Khi chạy trong Kubernetes, server pod gọi PostgreSQL thông qua Kubernetes Service name.

Ví dụ:

```env
APP_NAME=Family Care API
APP_ENV=k8s
APP_PORT=3000
APP_PREFIX=api/v1

DB_HOST=family-care-postgres
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

Lý do:

```txt
family-care-postgres là tên Kubernetes Service của PostgreSQL.
```

## Recommended Setup For This Project

Hiện tại team nên ưu tiên workflow Docker Compose:

```bash
docker compose up -d --build
```

Với workflow này, file quan trọng nhất là:

```txt
server/.env.docker
```

Giá trị database trong Docker nên là:

```env
DB_HOST=postgres
DB_PORT=5432
```

## Common Mistakes

### Mistake 1: Dùng `postgres` khi chạy local

Sai:

```env
DB_HOST=postgres
```

Nếu NestJS chạy bằng `npm run start:local` ngoài Docker, máy local thường không resolve được hostname `postgres`.

Đúng:

```env
DB_HOST=127.0.0.1
DB_PORT=5433
```

### Mistake 2: Dùng `127.0.0.1` trong Docker container

Sai:

```env
DB_HOST=127.0.0.1
```

Nếu server đang chạy trong Docker, `127.0.0.1` là chính container server.

Đúng:

```env
DB_HOST=postgres
DB_PORT=5432
```

### Mistake 3: DB_PORT không khớp Docker port mapping

Nếu Docker Compose là:

```yml
ports:
  - "5433:5432"
```

thì local env phải là:

```env
DB_PORT=5433
```

Còn Docker env phải là:

```env
DB_PORT=5432
```

## Suggested Git Ignore Rule

Nếu chưa có, nên đảm bảo `.gitignore` có:

```gitignore
.env
.env.*
!.env.example
!.env.docker.example
!.env.k8s.example
```

Như vậy team có file mẫu để copy, nhưng không commit secret thật.
