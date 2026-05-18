# Git Workflow

Tài liệu này mô tả quy trình Git được khuyến nghị cho team Family Care Digital Management.

## Branch Naming

Nên đặt branch theo format:

```txt
feature/<module-or-task>
fix/<bug-name>
setup/<setup-name>
docs/<document-name>
refactor/<scope>
```

Ví dụ:

```txt
feature/auth-login
feature/family-management
feature/task-reward
fix/docker-db-host
setup/deployment-foundation
docs/docker-guide
refactor/typeorm-config
```

## Commit Message Convention

Nên dùng format:

```txt
<type>: <short description>
```

Các type phổ biến:

| Type | Dùng khi nào |
|---|---|
| `feat` | Thêm chức năng mới |
| `fix` | Sửa bug |
| `docs` | Sửa/thêm tài liệu |
| `setup` | Cấu hình project, Docker, K8s, CI/CD |
| `refactor` | Refactor code không đổi behavior |
| `test` | Thêm/sửa test |
| `chore` | Việc phụ: package, ignore, cleanup |

Ví dụ:

```txt
setup: add docker compose for backend and postgres
fix: correct database host for docker environment
docs: add docker and environment guides
feat: add auth module skeleton
refactor: clean up app module configuration
```

## Before Commit Checklist

Trước khi commit code backend:

```bash
cd server
npm run build
npm run lint
```

Nếu đang thay đổi Docker setup:

```bash
docker compose down
docker compose up -d --build
docker compose logs -f server
```

Nếu thay đổi Kubernetes:

```bash
kubectl apply -f ./k8s
kubectl get pods -n family-care
```

## Pull Latest Code

Ở branch hiện tại:

```bash
git pull
```

Pull từ main:

```bash
git pull origin main
```

## Create New Branch

```bash
git checkout -b feature/module-name
```

Ví dụ:

```bash
git checkout -b setup/deployment-foundation
```

## Check Changed Files

```bash
git status
```

Xem diff:

```bash
git diff
```

## Stage Files

Stage toàn bộ:

```bash
git add .
```

Stage file cụ thể:

```bash
git add README.md DOCKER_GUIDE.md ENVIRONMENT_GUIDE.md
```

## Commit

```bash
git commit -m "docs: add project setup guides"
```

## Push Branch

Nếu branch chưa có upstream:

```bash
git push --set-upstream origin branch-name
```

Ví dụ:

```bash
git push --set-upstream origin setup/deployment-foundation
```

Các lần sau chỉ cần:

```bash
git push
```

## Files That Should Not Be Committed

Không commit:

```txt
.env
.env.local
.env.docker
.env.k8s
node_modules/
dist/
coverage/
postgres-data/
```

Nếu cần chia sẻ cấu hình env, tạo file mẫu:

```txt
.env.example
.env.docker.example
.env.k8s.example
```

## Recommended Pull Request Checklist

Trước khi tạo Pull Request:

```txt
[ ] Code build thành công
[ ] Lint pass
[ ] Docker Compose chạy được nếu có thay đổi setup
[ ] Không commit secret thật
[ ] Không commit node_modules/dist/coverage
[ ] Tài liệu được cập nhật nếu thay đổi cách chạy project
```

## Suggested Workflow For Each Member

```bash
# 1. Cập nhật code mới nhất
git pull origin main

# 2. Tạo branch mới
git checkout -b feature/your-task

# 3. Chạy project
docker compose up -d --build

# 4. Code và test
cd server
npm run build
npm run lint

# 5. Commit
git status
git add .
git commit -m "feat: implement your task"

# 6. Push
git push --set-upstream origin feature/your-task
```
