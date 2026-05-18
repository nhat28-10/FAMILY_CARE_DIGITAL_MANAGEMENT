# Troubleshooting

Tài liệu này tổng hợp các lỗi thường gặp khi chạy Family Care Digital Management.

## 1. Error: `getaddrinfo ENOTFOUND postgres`

Ví dụ lỗi:

```txt
Error: getaddrinfo ENOTFOUND postgres
```

## Nguyên nhân

NestJS đang chạy ngoài Docker bằng lệnh như:

```bash
npm run start:local
```

nhưng env lại để:

```env
DB_HOST=postgres
```

Hostname `postgres` chỉ resolve được bên trong Docker network của Docker Compose.

## Cách sửa

Nếu chạy local ngoài Docker:

```env
DB_HOST=127.0.0.1
DB_PORT=5433
```

Nếu chạy server trong Docker Compose:

```env
DB_HOST=postgres
DB_PORT=5432
```

## 2. Error: `database "family_care_dev" does not exist`

Ví dụ lỗi:

```txt
error: database "family_care_dev" does not exist
```

## Nguyên nhân thường gặp

App đã kết nối được tới một PostgreSQL instance, nhưng instance đó không có database `family_care_dev`.

Trường hợp hay gặp là máy có nhiều PostgreSQL:

```txt
- PostgreSQL local trên Windows
- PostgreSQL trong Docker
```

App có thể đang kết nối nhầm PostgreSQL local thay vì PostgreSQL Docker.

## Cách kiểm tra database trong Docker

```bash
docker exec -it family-care-postgres psql -U postgres -d postgres -c "SELECT datname FROM pg_database ORDER BY datname;"
```

Kết quả mong đợi:

```txt
family_care_dev
postgres
template0
template1
```

## Cách tạo database nếu thiếu

```bash
docker exec -it family-care-postgres psql -U postgres -d postgres -c "CREATE DATABASE family_care_dev;"
```

Nếu báo database đã tồn tại thì bỏ qua.

## Cách kiểm tra app local đang nhìn DB nào

Trong thư mục `server`, chạy:

```bash
node -e "require('dotenv').config({ path: '.env.local' }); const { Client } = require('pg'); const c = new Client({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: 'postgres' }); c.connect().then(async () => { console.log('CONNECTED'); const dbs = await c.query('SELECT datname FROM pg_database ORDER BY datname'); console.table(dbs.rows); }).catch(e => console.error('FAIL:', e.message)).finally(() => c.end());"
```

Nếu kết quả không có `family_care_dev`, app đang connect sai PostgreSQL instance hoặc sai port.

## 3. Error: `ECONNREFUSED 127.0.0.1:5433`

Ví dụ lỗi:

```txt
Error: connect ECONNREFUSED 127.0.0.1:5433
```

## Nguyên nhân

App đang gọi PostgreSQL ở:

```txt
127.0.0.1:5433
```

nhưng không có PostgreSQL nào lắng nghe ở port `5433`.

## Cách kiểm tra Docker port

```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

Nếu muốn chạy local với `DB_PORT=5433`, PostgreSQL container phải có port mapping:

```txt
0.0.0.0:5433->5432/tcp
```

## Cách sửa

Kiểm tra `docker-compose.yml`:

```yml
postgres:
  ports:
    - "5433:5432"
```

Sau đó recreate container:

```bash
docker compose down
docker compose up -d postgres
```

Test lại:

```bash
docker ps --format "table {{.Names}}\t{{.Ports}}"
```

## 4. Server chạy Docker nhưng vẫn dùng `127.0.0.1`

## Dấu hiệu

Server container không connect được PostgreSQL.

## Nguyên nhân

`.env.docker` hoặc environment trong Docker đang để:

```env
DB_HOST=127.0.0.1
```

## Cách sửa

Khi server chạy trong Docker Compose, dùng:

```env
DB_HOST=postgres
DB_PORT=5432
```

## 5. Docker đổi `POSTGRES_DB` nhưng database không đổi

## Nguyên nhân

PostgreSQL image chỉ tự tạo database theo `POSTGRES_DB` ở lần khởi tạo volume đầu tiên.

Nếu volume đã tồn tại, đổi `POSTGRES_DB` trong `docker-compose.yml` không tự tạo database mới.

## Cách sửa an toàn

Tạo database thủ công:

```bash
docker exec -it family-care-postgres psql -U postgres -d postgres -c "CREATE DATABASE family_care_dev;"
```

## Cách reset sạch database local

```bash
docker compose down -v
docker compose up -d --build
```

> Cẩn thận: `down -v` sẽ xóa dữ liệu PostgreSQL local.

## 6. Port 3000 đã được sử dụng

## Dấu hiệu

```txt
EADDRINUSE: address already in use 0.0.0.0:3000
```

## Nguyên nhân

Có thể bạn đang chạy cả:

```txt
- family-care-server container
- NestJS local bằng npm
```

cùng lúc.

## Cách sửa

Nếu muốn chạy local:

```bash
docker stop family-care-server
cd server
npm run start:local
```

Nếu muốn chạy Docker:

```bash
docker compose up -d --build
```

không chạy `npm run start:local` nữa.

## 7. Swagger không mở được

## Kiểm tra server logs

```bash
docker compose logs -f server
```

## Kiểm tra container running

```bash
docker ps
```

## URL Swagger

```txt
http://localhost:3000/api/docs
```

Nếu có global prefix `api/v1`, Swagger vẫn đang được setup ở:

```txt
/api/docs
```

không phải:

```txt
/api/v1/docs
```

trừ khi code `main.ts` được đổi.

## 8. `npm run build` chỉ tạo folder `dist`

Đây là hành vi đúng.

```bash
npm run build
```

chỉ compile TypeScript sang JavaScript trong folder:

```txt
dist/
```

Nó không chạy server.

## 9. `npm run lint` không chạy server

Đây là hành vi đúng.

```bash
npm run lint
```

chỉ kiểm tra/sửa code style bằng ESLint.

## 10. Lệnh chạy server

Chạy bằng Docker Compose:

```bash
docker compose up -d --build
```

Chạy local ngoài Docker:

```bash
cd server
npm run start:local
```

Chạy production từ `dist`:

```bash
cd server
npm run build
npm run start:prod
```
