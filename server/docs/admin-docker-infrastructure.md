# Admin Docker infrastructure

The Docker infrastructure endpoints are supported in production only when the API container can access the host Docker socket.

Required runtime config:

```env
ADMIN_DOCKER_ENABLED=true
DOCKER_SOCKET_PATH=/var/run/docker.sock
```

Required compose config for the API service:

```yaml
user: root
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
```

If production should not expose Docker monitoring, set:

```env
ADMIN_DOCKER_ENABLED=false
```

FE behavior:

- Show the Docker section only when `GET /admin/infrastructure/docker/containers` returns `dockerAvailable: true`.
- Hide the Docker section when `dockerAvailable: false`.
- `reason` can be one of `DISABLED`, `SOCKET_MISSING`, `SOCKET_PERMISSION`, or `PING_FAILED`.

Unavailable response example:

```json
{
  "dockerAvailable": false,
  "status": "UNAVAILABLE",
  "reason": "SOCKET_MISSING",
  "socketPath": "/var/run/docker.sock",
  "message": "Docker socket khong kha dung hoac server khong co quyen truy cap Docker.",
  "items": []
}
```
