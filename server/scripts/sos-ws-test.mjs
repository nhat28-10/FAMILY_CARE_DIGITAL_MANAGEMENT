// Quick Socket.IO client to exercise the SOS realtime gateway.
//
// Usage (PowerShell):
//   $env:TOKEN="<accessToken from POST /api/v1/auth/login>"
//   $env:WORKSPACE="<familyId you are a member of>"
//   node scripts/sos-ws-test.mjs
//
// Then, in another terminal, drive the REST endpoints and watch events here:
//   POST   /api/v1/families/:familyId/sos/alerts
//   POST   /api/v1/families/:familyId/sos/alerts/:alertId/locations
//   POST   /api/v1/families/:familyId/sos/alerts/:alertId/responses
//   PATCH  /api/v1/families/:familyId/sos/alerts/:alertId/resolve
import { io } from 'socket.io-client';

const URL = process.env.SOS_WS_URL ?? 'http://localhost:3000/sos';
const TOKEN = process.env.TOKEN;
const WORKSPACE = process.env.WORKSPACE;

if (!TOKEN || !WORKSPACE) {
  console.error('Missing env. Set TOKEN and WORKSPACE first.');
  process.exit(1);
}

const socket = io(URL, { auth: { token: TOKEN } });

// Re-join on every (re)connect — rooms are not restored automatically.
socket.on('connect', () => {
  console.log('✅ connected', socket.id);
  socket.emit('sos:join', { workspaceId: WORKSPACE }, (ack) =>
    console.log('join ack:', ack),
  );
});

for (const event of [
  'sos:new',
  'sos:location',
  'sos:response',
  'sos:resolved',
  'sos:error',
  'sos:kicked',
]) {
  socket.on(event, (payload) =>
    console.log(`📨 ${event}:`, JSON.stringify(payload)),
  );
}

socket.on('disconnect', (reason) => console.log('🔌 disconnect:', reason));
socket.on('connect_error', (err) => console.log('⛔ connect_error:', err.message));
