# Video Call — Hướng dẫn tích hợp cho FE

Tính năng gọi video/audio gắn với 1 `Conversation` (chat 1-1 hoặc nhóm) đã có sẵn. Backend
**không truyền media** — chỉ lo xác thực + phát tín hiệu ("ai đang gọi", "ai vừa join/rời").
Âm thanh/hình ảnh đi thẳng giữa client và **LiveKit Cloud** (SFU quản lý) qua SDK riêng của
LiveKit, không qua server NestJS.

## 0. Cần cài gì ở FE

- **Web**: `npm install livekit-client`
- **React Native (mobile app sau này)**: `@livekit/react-native` + `@livekit/react-native-webrtc`
- Không cần cài gì để dùng REST/WS — 2 phần đó dùng `fetch`/`axios` và `socket.io-client` như
  các module khác.

## 1. Kiến trúc tổng quan

```
FE (A)                    Backend (NestJS)                    LiveKit Cloud              FE (B)
  |--- POST /calls ---------->|                                    |                         |
  |<-- {token, livekitUrl} ---|                                    |                         |
  |--- room.connect(token) -------------------------------------->|                          |
  |                            |--- call:incoming (qua /chat) ------------------------------->|
  |                            |--- push FCM (nếu B đang nền) ------------------------------->|
  |                            |                                    |                          |
  |                            |                          |<-- POST /calls/:id/join ----------|
  |                            |<-- {token, livekitUrl} -----------------------------------> |
  |                            |                          B: room.connect(token) ----------->|
  |                            |<====== webhook participant_joined ============================|
  |<-- call:accepted (qua /chat) --- call:participant-update -------------------------------->|
  |                            |                                    |                          |
  ...cuộc gọi diễn ra (media P2P qua LiveKit SFU, không qua backend)...
  |--- POST /calls/:id/leave->|                                    |                          |
  |                            |--- chat:message:new (log cuộc gọi) ----------------------->  |
  |                            |--- call:ended --------------------------------------------->  |
```

Tín hiệu "có người gọi/chấp nhận/từ chối/rời" **không đi qua namespace WS riêng** — nó cưỡi lên
namespace `/chat` đã có (room `conversation:<id>` mà client join sẵn khi `chat:join`). Nghĩa là
**FE phải đã connect + `chat:join` vào workspace trước** thì mới nhận được các event `call:*` bên
dưới.

## 2. REST API

Base path: `/api/v1`. Mọi endpoint (trừ webhook) yêu cầu `Authorization: Bearer <accessToken>`.
Quyền không dựa vào family-role — chỉ cần bạn là `ConversationParticipant` đang hoạt động của
đúng conversation đó (tự backend resolve từ `conversationId`/`callId`, không cần truyền
`familyId`).

### `POST /calls` — khởi tạo cuộc gọi

Request:

```json
{ "conversationId": "uuid-của-conversation" }
```

Response (`data`):

```json
{
  "callId": "uuid",
  "roomName": "call-uuid",
  "token": "eyJhbGciOi...",
  "livekitUrl": "wss://family-care-xxxxx.livekit.cloud",
  "call": {
    "id": "uuid",
    "conversationId": "uuid",
    "initiatedByMemberId": "uuid",
    "roomName": "call-uuid",
    "status": "RINGING",
    "startedAt": "2026-08-10T12:23:11.000Z",
    "connectedAt": null,
    "endedAt": null,
    "endedReason": null,
    "initiatedByMember": { "id": "...", "displayName": "...", "familyRole": "FAMILY_MEMBER", "user": { "id": "...", "fullName": "...", "email": "...", "avatarUrl": "..." } },
    "participants": [
      {
        "id": "uuid",
        "callId": "uuid",
        "memberId": "uuid",
        "status": "INVITED",
        "invitedAt": "2026-08-10T12:23:11.000Z",
        "joinedAt": null,
        "leftAt": null,
        "member": { "id": "...", "displayName": "...", "familyRole": "...", "user": {...} }
      }
    ]
  }
}
```

Dùng ngay `token` + `livekitUrl` để connect vào LiveKit room (xem mục 4) — **không cần chờ ai bắt
máy**, người gọi vào phòng trước và đợi.

Lỗi thường gặp: `400` nếu hội thoại đang có cuộc gọi khác (RINGING/ONGOING), hoặc hội thoại
`ARCHIVED`, hoặc hội thoại có dưới 2 thành viên active.

### `POST /calls/:callId/join` — tham gia cuộc gọi

Không body. Response:

```json
{
  "callId": "uuid",
  "roomName": "call-uuid",
  "token": "eyJhbGciOi...",
  "livekitUrl": "wss://family-care-xxxxx.livekit.cloud"
}
```

`403` nếu bạn không nằm trong danh sách được mời (không phải participant của conversation lúc
tạo call). `400` nếu call đã kết thúc.

### `POST /calls/:callId/decline` — từ chối cuộc gọi đến

Không body, không cần connect LiveKit. Response: `{ "callId": "uuid" }`.

### `POST /calls/:callId/leave` — rời cuộc gọi đang diễn ra

Gọi **song song** với `room.disconnect()` phía LiveKit SDK (2 việc độc lập — 1 báo backend, 1 rời
phòng media). Response: `{ "callId": "uuid" }`.

### `POST /calls/:callId/end` — kết thúc cho tất cả

Chỉ **người khởi tạo** gọi được (`403` nếu không phải). Buộc mọi participant còn lại rời phòng
(backend tự đóng room LiveKit). Response: `{ "callId": "uuid" }`.

### `GET /calls/conversations/:conversationId` — lịch sử cuộc gọi

Query: `?cursor=<callId>&limit=30` (cursor pagination, mới → cũ, giống
`GET .../messages`). Response:

```json
{ "items": [ /* Call[], cùng shape như field "call" ở POST /calls */ ], "nextCursor": "uuid|null" }
```

## 3. WS events (namespace `/chat`, room `conversation:<id>`)

Không có event Client → Server nào riêng cho call — mọi hành động đi qua REST ở mục 2. Server →
Client:

| Event                     | Payload                                                                | Khi nào                                                                    |
| ------------------------- | ----------------------------------------------------------------------| --------------------------------------------------------------------------|
| `call:incoming`           | `{ callId, conversationId, roomName, initiatedByMemberId, callerName, participants }` | Ngay sau khi `POST /calls` tạo thành công — hiển thị màn hình "cuộc gọi đến" cho mọi thành viên khác trong conversation đang online. |
| `call:accepted`           | `{ callId, memberId }`                                                 | LiveKit xác nhận (qua webhook) người đầu tiên **thực sự** đã join phòng — lúc này call chuyển `ONGOING`. |
| `call:declined`           | `{ callId, memberId }`                                                 | Một người bấm "từ chối" (`POST .../decline`).                              |
| `call:participant-update` | `{ callId, memberId, status: "JOINED" \| "LEFT" }`                     | Một người join/rời phòng LiveKit thật sự (xác nhận qua webhook, hoặc qua `.../leave`). |
| `call:ended`               | `{ callId, status, endedReason, endedAt }`                            | Call kết thúc (mọi lý do — xem bảng status ở mục 5).                        |
| `chat:message:new`        | `Message` với `messageType: "CALL"`, `relatedCallId`                   | Bắn kèm `call:ended` — dòng tóm tắt cuộc gọi ("Cuộc gọi video · 5:32", "Cuộc gọi nhỡ"...) xuất hiện trong khung chat như tin nhắn bình thường. **Không cho** edit/react/pin loại message này (backend trả `400` nếu FE lỡ gọi). |

## 4. Kết nối LiveKit (media) — ví dụ web

```js
import { Room, RoomEvent, Track } from 'livekit-client';

const room = new Room();

room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
  if (track.kind === Track.Kind.Video || track.kind === Track.Kind.Audio) {
    const el = track.attach();
    el.dataset.participantId = participant.identity; // = memberId, không phải userId
    remoteContainer.appendChild(el);
  }
});

room.on(RoomEvent.ParticipantDisconnected, (participant) => {
  document
    .querySelectorAll(`[data-participant-id="${participant.identity}"]`)
    .forEach((el) => el.remove());
});

// token + livekitUrl lấy từ POST /calls hoặc POST /calls/:callId/join
await room.connect(livekitUrl, token);
await room.localParticipant.setCameraEnabled(true);
await room.localParticipant.setMicrophoneEnabled(true);

// Khi rời:
await room.disconnect();
await fetch(`/api/v1/calls/${callId}/leave`, { method: 'POST', headers: authHeaders });
```

Lưu ý: `participant.identity` trong LiveKit chính là **`memberId`** (không phải `userId`) — dùng
để map với `participants[].memberId` trả về từ REST khi cần hiển thị tên/avatar.

React Native: cùng API `Room`/`room.connect(url, token)`, chỉ khác import từ
`@livekit/react-native`.

## 5. Enum trạng thái

`CallStatus`: `RINGING` (đang đổ chuông, chưa ai join) → `ONGOING` (đã có người join) →
`ENDED` (kết thúc bình thường) | `MISSED` (không dùng ở bản hiện tại — dành cho phase timeout sau
này) | `DECLINED` (bị từ chối, chưa ai từng join) | `CANCELED` (người gọi tự huỷ trước khi ai bắt
máy).

`CallParticipantStatus` (trong `participants[]`): `INVITED` → `JOINED` → `LEFT`, hoặc `DECLINED`.
`NO_ANSWER` cũng chưa dùng ở bản hiện tại (dành cho gọi nhóm + timeout — chưa triển khai).

## 6. Push notification khi app ở nền

Khi có cuộc gọi đến, các thành viên khác nhận FCM data payload chuẩn (giống mọi loại
notification khác — xem `server/src/modules/notifications/NOTIFICATIONS_REALTIME.md`):

```json
{
  "referenceType": "CALL",
  "referenceId": "<callId>",
  "title": "<tên người gọi>",
  "body": "Cuộc gọi video đến"
}
```

FE bấm vào push → điều hướng thẳng tới màn hình cuộc gọi với `callId` đó, gọi
`POST /calls/:callId/join` nếu người dùng chọn "Nghe máy".

## 7. Giới hạn hiện tại (bản MVP — chỉ 1-1)

- Chỉ hỗ trợ ổn định cuộc gọi **1-1**. Gọi nhóm dùng chung API nhưng **chưa có** timeout tự động
  cho người không bắt máy (`NO_ANSWER`) — để phase sau.
- Không có endpoint `GET /calls/:callId` lấy 1 call theo id. Nếu FE cần biết trạng thái call hiện
  tại sau khi socket reconnect (vd rớt mạng đúng lúc đang đổ chuông), tạm dùng
  `GET /calls/conversations/:conversationId?limit=1` rồi kiểm tra `items[0].status`.
- Nếu server chưa cấu hình `LIVEKIT_API_KEY/SECRET/URL`, `POST /calls` và `.../join` trả `503`.
