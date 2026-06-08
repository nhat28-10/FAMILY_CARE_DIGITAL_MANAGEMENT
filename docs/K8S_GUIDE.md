# Kubernetes Guide

Tài liệu này hướng dẫn chạy demo Kubernetes local cho project Family Care Digital Management.

Kubernetes dùng trong project này để phục vụ triển khai/demo, không phải workflow chính khi code hằng ngày.

Workflow chính hiện tại vẫn là Docker Compose:

```bash
docker compose up -d --build
```

## Prerequisites

Cần có:

```txt
- Docker Desktop
- Kubernetes enabled trong Docker Desktop
- kubectl
```

Kiểm tra context Kubernetes:

```bash
kubectl config current-context
```

Nếu dùng Docker Desktop, context thường là:

```txt
docker-desktop
```

Kiểm tra cluster:

```bash
kubectl cluster-info
```

## Kubernetes Files

Folder `k8s/` gồm:

```txt
k8s/
├── namespace.yaml
├── postgres-secret.yaml
├── postgres-pvc.yaml
├── postgres-deployment.yaml
├── postgres-service.yaml
├── server-configmap.yaml
├── server-secret.yaml
├── server-deployment.yaml
└── server-service.yaml
```

## Build Server Image

Vì demo local dùng Docker Desktop Kubernetes, build image server local:

```bash
docker build -t family-care-server:demo ./server
```

Nếu trong `server-deployment.yaml` đang dùng image khác, hãy chỉnh image về:

```yml
image: family-care-server:demo
```

Với local image, nên dùng:

```yml
imagePullPolicy: IfNotPresent
```

hoặc:

```yml
imagePullPolicy: Never
```

nếu chắc chắn image chỉ có local.

## Apply Kubernetes Manifests

Tại root project:

```bash
kubectl apply -f ./k8s/namespace.yaml
kubectl apply -f ./k8s/postgres-secret.yaml
kubectl apply -f ./k8s/postgres-pvc.yaml
kubectl apply -f ./k8s/postgres-deployment.yaml
kubectl apply -f ./k8s/postgres-service.yaml
kubectl apply -f ./k8s/server-configmap.yaml
kubectl apply -f ./k8s/server-secret.yaml
kubectl apply -f ./k8s/server-deployment.yaml
kubectl apply -f ./k8s/server-service.yaml
```

Hoặc apply toàn bộ folder:

```bash
kubectl apply -f ./k8s
```

## Check Status

```bash
kubectl get all -n family-care
```

Kiểm tra pod:

```bash
kubectl get pods -n family-care
```

Xem log server:

```bash
kubectl logs -f deployment/family-care-server -n family-care
```

Xem log postgres:

```bash
kubectl logs -f deployment/family-care-postgres -n family-care
```

## Kubernetes Database Host

Khi chạy trong Kubernetes, server pod gọi PostgreSQL qua Kubernetes Service name:

```env
DB_HOST=family-care-postgres
DB_PORT=5432
```

Không dùng:

```env
DB_HOST=postgres
```

vì `postgres` là service name trong Docker Compose, không nhất thiết tồn tại trong Kubernetes.

Không dùng:

```env
DB_HOST=127.0.0.1
```

vì `127.0.0.1` trong pod server là chính pod server, không phải PostgreSQL pod.

## Open API / Swagger

Nếu `server-service.yaml` dùng NodePort hoặc port mapping phù hợp, thử mở:

```txt
http://localhost:3000/api/docs
```

Nếu chưa mở được, dùng port-forward:

```bash
kubectl port-forward svc/family-care-server 3000:3000 -n family-care
```

Sau đó mở:

```txt
http://localhost:3000/api/docs
```

## Check PostgreSQL From Inside Cluster

Vào PostgreSQL pod:

```bash
kubectl exec -it deployment/family-care-postgres -n family-care -- psql -U postgres -d postgres
```

Liệt kê database:

```sql
\l
```

Hoặc chạy trực tiếp:

```bash
kubectl exec -it deployment/family-care-postgres -n family-care -- psql -U postgres -d postgres -c "SELECT datname FROM pg_database ORDER BY datname;"
```

## Delete Kubernetes Demo

Xóa toàn bộ namespace:

```bash
kubectl delete namespace family-care
```

Lệnh này xóa các resource trong namespace `family-care`.

## Recommended Kubernetes Demo Flow

```bash
# 1. Build image
docker build -t family-care-server:demo ./server

# 2. Apply manifests
kubectl apply -f ./k8s

# 3. Check status
kubectl get pods -n family-care
kubectl get svc -n family-care

# 4. View logs
kubectl logs -f deployment/family-care-server -n family-care

# 5. Port forward if needed
kubectl port-forward svc/family-care-server 3000:3000 -n family-care
```

## Notes

- Docker Compose dùng cho dev/test local nhanh.
- Kubernetes dùng cho demo triển khai.
- Không nên debug business logic hằng ngày trực tiếp trên Kubernetes nếu chưa cần.
- Với Kubernetes, nên quản lý biến môi trường bằng ConfigMap và Secret thay vì `.env` thật.
