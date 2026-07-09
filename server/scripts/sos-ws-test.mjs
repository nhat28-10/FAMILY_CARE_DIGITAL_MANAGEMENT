// Quick Socket.IO client to exercise the SOS realtime gateway.
//
// Two roles, selected by the ROLE env var:
//
//   ROLE=watcher (default) — join the workspace room and log every event,
//     including the `sos:snapshot` handed out on join and live `sos:location`.
//
//   ROLE=trigger — join, then stream live GPS points over the socket
//     (`sos:location:push`). It auto-starts streaming when the server sends
//     `sos:track:start` (i.e. after you POST the create-alert REST endpoint as
//     this same user) and auto-stops on `sos:track:stop` / `sos:resolved`.
//
// Usage (PowerShell), two terminals:
//   # terminal 1 — watcher
//   $env:TOKEN="<watcher accessToken>"; $env:WORKSPACE="<familyId>"; node scripts/sos-ws-test.mjs
//   # terminal 2 — trigger (streams once you create an alert as this user)
//   $env:TOKEN="<trigger accessToken>"; $env:WORKSPACE="<familyId>"; $env:ROLE="trigger"; node scripts/sos-ws-test.mjs
//
// Create the alert via REST (as the trigger user):
//   POST /api/v1/families/:familyId/sos/alerts
// Close it (as a manager/deputy) to see track:stop + resolved:
//   PATCH /api/v1/families/:familyId/sos/alerts/:alertId/resolve
import { io } from 'socket.io-client';

const URL = process.env.SOS_WS_URL ?? 'http://localhost:3000/sos';
const TOKEN = process.env.TOKEN;
const WORKSPACE = process.env.WORKSPACE;
const ROLE = process.env.ROLE ?? 'watcher';

if (!TOKEN || !WORKSPACE) {
  console.error('Missing env. Set TOKEN and WORKSPACE first.');
  process.exit(1);
}

const socket = io(URL, { auth: { token: TOKEN } });

// A slow random walk around Ho Chi Minh City for the streamed points.
let lat = 10.762622;
let lng = 106.660172;
let streamTimer = null;

function startStreaming(alertId) {
  if (streamTimer) return;
  console.log(`🛰️  streaming location for alert ${alertId} every 5s`);
  streamTimer = setInterval(() => {
    lat += (Math.random() - 0.5) * 0.001;
    lng += (Math.random() - 0.5) * 0.001;
    socket.emit(
      'sos:location:push',
      {
        workspaceId: WORKSPACE,
        alertId,
        latitude: Number(lat.toFixed(7)),
        longitude: Number(lng.toFixed(7)),
        accuracy: 8.5,
        sourceType: 'MOBILE_GPS',
      },
      (ack) => console.log('push ack:', JSON.stringify(ack)),
    );
  }, 5000);
}

function stopStreaming() {
  if (!streamTimer) return;
  clearInterval(streamTimer);
  streamTimer = null;
  console.log('🛑 stopped streaming');
}

// Re-join on every (re)connect — rooms are not restored automatically.
socket.on('connect', () => {
  console.log(`✅ connected as ${ROLE}`, socket.id);
  socket.emit('sos:join', { workspaceId: WORKSPACE }, (ack) =>
    console.log('join ack:', JSON.stringify(ack)),
  );
});

for (const event of [
  'sos:new',
  'sos:snapshot',
  'sos:location',
  'sos:response',
  'sos:resolved',
  'sos:track:start',
  'sos:track:stop',
  'sos:error',
  'sos:kicked',
]) {
  socket.on(event, (payload) =>
    console.log(`📨 ${event}:`, JSON.stringify(payload)),
  );
}

if (ROLE === 'trigger') {
  socket.on('sos:track:start', (payload) => startStreaming(payload.alertId));
  socket.on('sos:track:stop', stopStreaming);
  socket.on('sos:resolved', stopStreaming);
}

socket.on('disconnect', (reason) => console.log('🔌 disconnect:', reason));
socket.on('connect_error', (err) =>
  console.log('⛔ connect_error:', err.message),
);
