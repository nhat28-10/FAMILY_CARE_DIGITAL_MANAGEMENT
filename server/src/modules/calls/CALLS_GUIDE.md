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

Không body, không cần connect LiveKit. Response: `{ "callId": "uuid", "status": "RINGING" }` —
`status` là trạng thái **sau** thao tác (vd 1-1: callee decline → `status: "DECLINED"` ngay lập
tức vì không còn ai khác chờ phản hồi; gọi nhóm còn người khác chưa trả lời thì `status` vẫn
`RINGING`/`ONGOING`).

### `POST /calls/:callId/leave` — rời cuộc gọi đang diễn ra

Gọi **song song** với `room.disconnect()` phía LiveKit SDK (2 việc độc lập — 1 báo backend, 1 rời
phòng media). Response: `{ "callId": "uuid", "status": "..." }`.

Lưu ý: nếu bạn là **người khởi tạo** và gọi `leave` lúc cuộc gọi còn `RINGING` (chưa ai bắt máy),
backend coi như bạn huỷ cuộc gọi — `status` trả về sẽ là `"CANCELED"`, tương đương gọi `end`. Dùng
`leave` hay `end` trong tình huống này đều an toàn, không còn cần phân biệt.

### `POST /calls/:callId/end` — kết thúc cho tất cả

Chỉ **người khởi tạo** gọi được (`403` nếu không phải). Buộc mọi participant còn lại rời phòng
(backend tự đóng room LiveKit). Response: `{ "callId": "uuid", "status": "ENDED" | "CANCELED" }`
(`CANCELED` nếu chưa từng ai kết nối, `ENDED` nếu đã có người trong phòng).

### `GET /calls/conversations/:conversationId` — lịch sử cuộc gọi

Query: `?cursor=<callId>&limit=30` (cursor pagination, mới → cũ, giống
`GET .../messages`). Response:

```json
{ "items": [ /* Call[], cùng shape như field "call" ở POST /calls */ ], "nextCursor": "uuid|null" }
```

### `GET /calls/:callId` — lấy 1 cuộc gọi theo id

Response: `Call` object (đúng shape field `call` ở `POST /calls`). Dùng để phục hồi trạng thái sau
khi socket `/chat` reconnect (vd rớt mạng đúng lúc đang đổ chuông) — gọi endpoint này với `callId`
đã lưu ở client để biết cuộc gọi hiện `RINGING`/`ONGOING`/đã kết thúc.

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
`ENDED` (kết thúc bình thường) | `MISSED` (**không ai bắt máy trong 30 giây** — tự động, xem mục
7) | `DECLINED` (bị từ chối, chưa ai từng join) | `CANCELED` (người gọi tự huỷ trước khi ai bắt
máy — qua `end` hoặc `leave`, xem mục 2).

`CallParticipantStatus` (trong `participants[]`): `INVITED` → `JOINED` → `LEFT`, hoặc `DECLINED`.
`NO_ANSWER` **chưa dùng** ở bản hiện tại — timeout hiện xử lý ở cấp **cả cuộc gọi** (`Call.status`
→ `MISSED`), chưa đánh dấu riêng từng participant không trả lời trong gọi nhóm (để phase sau).

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

**Push "Cuộc gọi nhỡ"**: nếu không ai bắt máy trong 30 giây, ngoài các event WS ở mục 3, những
người **chưa từng bắt máy** (participant còn `status: "INVITED"` lúc timeout) còn nhận thêm 1 push
riêng: `{ referenceType: "CALL", referenceId: "<callId>", title: "<tên người gọi>", body: "Cuộc
gọi nhỡ" }` — cùng shape, chỉ khác `body`.

## 7. Mã lỗi ổn định

Mọi lỗi từ `/calls/*` giờ có `code`/`errorCode` trong response body (không chỉ `message` tiếng
Việt) — bắt theo `code`, không bắt theo chuỗi `message`:

| `code` | HTTP | Endpoint áp dụng |
|---|---|---|
| `CALL_ALREADY_ACTIVE` | 400 | `POST /calls` |
| `CONVERSATION_ARCHIVED` | 400 | `POST /calls` |
| `CONVERSATION_TOO_FEW_MEMBERS` | 400 | `POST /calls` |
| `CALL_ALREADY_ENDED` | 400 | `.../join` |
| `NOT_FAMILY_MEMBER` | 403 | mọi endpoint |
| `NOT_INVITED` | 403 | `.../join`, `.../decline` |
| `NOT_IN_CALL` | 403 | `.../leave` |
| `NOT_INITIATOR` | 403 | `.../end` |
| `CALL_NOT_FOUND` | 404 | mọi endpoint có `:callId` |
| `CONVERSATION_NOT_FOUND` | 404 | `POST /calls`, `GET .../conversations/:id` |
| `LIVEKIT_NOT_CONFIGURED` | 503 | `POST /calls`, `.../join` |

## 8. Timeout & webhook — đã xử lý triệt để cho cả 1-1 và nhóm

- Không ai bắt máy trong **30 giây** kể từ `POST /calls` → `Call.status` tự chuyển `MISSED`,
  backend tự ghi Message "Cuộc gọi nhỡ" + bắn `call:ended` + push riêng (xem mục 6) — hội thoại
  **không còn bị khoá** (`POST /calls` gọi lại được ngay sau đó). Áp dụng như nhau cho hội thoại
  `PRIVATE` và `GROUP`.
- App bị kill/rớt mạng đột ngột giữa cuộc gọi: backend nhận cả 2 loại webhook LiveKit
  (`participant_left` và `participant_connection_aborted`) và xử lý giống nhau — dọn dẹp participant
  đó ngay, không cần chờ.
- Đa thiết bị cùng tài khoản join 1 call: backend **không** chặn — dùng mặc định của LiveKit (thiết
  bị join sau sẽ ngắt kết nối thiết bị cũ cùng `identity`).
- Gọi hội thoại `GROUP`: backend **không chặn** — quyết định có hiện nút gọi cho hội thoại nhóm hay
  không là lựa chọn UI của FE. Phần còn thiếu cho gọi nhóm (chỉ mang tính UX, không phải bug chặn):
  chưa có timeout/`NO_ANSWER` **riêng từng người**, chỉ có timeout **chung cho cả cuộc gọi** như
  mục trên.
- Nếu server chưa cấu hình `LIVEKIT_API_KEY/SECRET/URL`: `POST /calls` và `.../join` trả `503`
  (`code: "LIVEKIT_NOT_CONFIGURED"`).
