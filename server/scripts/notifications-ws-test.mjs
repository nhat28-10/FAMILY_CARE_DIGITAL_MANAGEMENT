// Quick Socket.IO client to exercise the personal notifications gateway.
//
// Usage:
//   node scripts/notifications-ws-test.mjs <email> <password>
//
// Login qua REST → connect namespace `/notifications` (auto-join room
// `user:<userId>`, không cần emit join thủ công) → in ra mọi
// notification:new / notification:unread-count / notification:error.
//
// Thử full luồng (theo SDD task-14 brief):
//   terminal 1: npm run start:dev
//   terminal 2: node scripts/notifications-ws-test.mjs <manager-email> <pass>
//   terminal 3: dùng Swagger/curl tạo join request bằng invite code của family
//   → terminal 2 phải in `🔔 new:` với type JOIN_REQUEST trong ~1-2 giây.
import { io } from 'socket.io-client';

const BASE = process.env.API_BASE ?? 'http://localhost:3000';
const [email, password] = process.argv.slice(2);

if (!email || !password) {
  console.error(
    'Usage: node scripts/notifications-ws-test.mjs <email> <password>',
  );
  process.exit(1);
}

const res = await fetch(`${BASE}/api/v1/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
const json = await res.json();
if (!json.success) {
  console.error('Login thất bại:', json.message);
  process.exit(1);
}
const token = json.data.accessToken;

const socket = io(`${BASE}/notifications`, { auth: { token } });
socket.on('connect', () => console.log('✅ connected', socket.id));
socket.on('notification:new', (n) => console.log('🔔 new:', n));
socket.on('notification:unread-count', (c) => console.log('🔢 unread:', c));
socket.on('notification:error', (e) => console.log('❌ error:', e));
socket.on('disconnect', (r) => console.log('disconnected:', r));
socket.on('connect_error', (err) =>
  console.log('⛔ connect_error:', err.message),
);
