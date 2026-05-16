# Family Care Deployment Setup Guide

Mục tiêu của setup này: Backend chạy bằng Docker Compose trên máy local/VPS; FE Admin và Mobile chỉ cần gọi `API_BASE_URL`; Kubernetes chỉ dùng local demo bằng Docker Desktop.

## 1. Local Docker Compose

Tạo file env:

```powershell
cd FAMILY_CARE_DIGITAL_MANAGEMENT
Copy-Item .\server\.env.example .\server\.env
```

Chạy backend + PostgreSQL:

```powershell
docker compose up -d --build
docker compose logs -f server
```

Swagger local:

```text
http://localhost:3000/api/docs
```

Dừng:

```powershell
docker compose down
```

Dừng và xóa database volume local:

```powershell
docker compose down -v
```

## 2. VPS Docker Compose

Trên VPS, clone repo rồi tạo `server/.env` từ `server/.env.example`.

Ví dụ `server/.env` cho staging:

```env
APP_NAME=Family Care API
APP_ENV=staging
APP_PORT=3000
APP_PREFIX=api/v1

DB_HOST=postgres
DB_PORT=5432
DB_USERNAME=family_care_user
DB_PASSWORD=CHANGE_THIS_STRONG_PASSWORD
DB_DATABASE=family_care_staging

POSTGRES_USER=family_care_user
POSTGRES_PASSWORD=CHANGE_THIS_STRONG_PASSWORD
POSTGRES_DB=family_care_staging

JWT_ACCESS_SECRET=CHANGE_THIS_ACCESS_SECRET_AT_LEAST_32_CHARS
JWT_REFRESH_SECRET=CHANGE_THIS_REFRESH_SECRET_AT_LEAST_32_CHARS
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

BCRYPT_SALT_ROUNDS=10
SWAGGER_ENABLED=true
CORS_ORIGINS=http://localhost:5173,http://YOUR_VPS_IP:3000
```

Deploy:

```bash
docker compose up -d --build
docker compose logs -f server
```

Swagger VPS:

```text
http://YOUR_VPS_IP:3000/api/docs
```

## 3. FE/Mobile API URL

Admin Vite `.env`:

```env
VITE_API_BASE_URL=http://YOUR_VPS_IP:3000/api/v1
```

Mobile `.env`:

```env
API_BASE_URL=http://YOUR_VPS_IP:3000/api/v1
```

Swagger cho thầy/tester:

```text
http://YOUR_VPS_IP:3000/api/docs
```

## 4. Kubernetes local demo bằng Docker Desktop

Build image local cho Kubernetes:

```powershell
docker build -t family-care-server:demo .\server
```

Apply manifests:

```powershell
kubectl apply -f .\k8s\namespace.yaml
kubectl apply -f .\k8s\postgres-secret.yaml
kubectl apply -f .\k8s\postgres-pvc.yaml
kubectl apply -f .\k8s\postgres-deployment.yaml
kubectl apply -f .\k8s\postgres-service.yaml
kubectl apply -f .\k8s\server-configmap.yaml
kubectl apply -f .\k8s\server-secret.yaml
kubectl apply -f .\k8s\server-deployment.yaml
kubectl apply -f .\k8s\server-service.yaml
```

Kiểm tra:

```powershell
kubectl get pods -n family-care
kubectl logs -f deployment/family-care-server -n family-care
```

Swagger qua NodePort:

```text
http://localhost:30080/api/docs
```

Hoặc dùng port-forward:

```powershell
kubectl port-forward svc/family-care-server 3000:3000 -n family-care
```

Sau đó mở:

```text
http://localhost:3000/api/docs
```

Xóa demo Kubernetes:

```powershell
kubectl delete namespace family-care
```

## 5. Workflow code thay đổi

Backend sửa code:

```bash
git pull
docker compose up -d --build
docker compose logs -f server
```

Backend thêm package:

```powershell
cd server
npm install package-name
cd ..
docker compose up -d --build
```

Database migration sau này:

```powershell
cd server
npm run migration:generate -- src/database/migrations/NameOfMigration
npm run migration:run
```

Trên VPS/container production sau khi có migration JS trong `dist`:

```bash
docker compose exec server npm run migration:run:prod
```
