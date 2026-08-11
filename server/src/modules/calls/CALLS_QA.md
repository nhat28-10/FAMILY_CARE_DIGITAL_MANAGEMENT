# Video Call — Q&A đối chiếu BE/FE (đã cập nhật sau đợt 2)

File này lưu lại toàn bộ câu hỏi FE đặt ra khi review Swagger/source trước khi code tầng
LiveKit/WebSocket/UI, cùng câu trả lời chính thức. Các câu có đánh dấu **⟳ đã đổi ở đợt 2** nghĩa
là câu trả lời gốc đã lỗi thời — làm theo phiên bản mới nhất ở đây, không dùng lại câu trả lời cũ
trong lịch sử chat.

> Hành vi hiện tại (sau đợt 2) đã được phản ánh đầy đủ trong `CALLS_GUIDE.md` — file đó là tài
> liệu API sống, cập nhật liên tục. File `CALLS_QA.md` này là **bản ghi lịch sử quyết định**, giữ
> lại lý do "vì sao" đằng sau từng thiết kế để tra cứu khi cần, không phải nơi đọc API đầu tiên.

## 1. Response 6 endpoint

**1.1** Đúng, khớp field-for-field. Chi tiết đầy đủ + shape từng response nằm ở `CALLS_GUIDE.md` mục 2.

**1.2** Đúng — `callId` (ngoài) và `call.id` (trong) ở `POST /calls` luôn cùng giá trị.

**1.3 ⟳ đã đổi ở đợt 2** — trước đây `decline`/`leave`/`end` chỉ trả `{ callId }`. **Giờ trả thêm
`status`** (trạng thái sau thao tác): `{ callId, status }`. Xem `CALLS_GUIDE.md` mục 2.

**1.4** Không đổi — `nextCursor` luôn có field, giá trị `null` khi hết trang (không bao giờ thiếu field).

## 2. Envelope

**2.1** Đúng — `TransformInterceptor` global (`main.ts:48`), không có ngoại lệ cho `/calls/*`, kể cả webhook.

## 3. Enum

**3.1** Không đổi — `schema.prisma`, `CallStatus` (`RINGING|ONGOING|ENDED|MISSED|DECLINED|CANCELED`)
và `CallParticipantStatus` (`INVITED|JOINED|DECLINED|LEFT|NO_ANSWER`).

**3.2 ⟳ đã đổi ở đợt 2** — trước đây `MISSED` **chưa có code path nào set**. **Giờ đã dùng**: timeout
job 30 giây (`RINGING_TIMEOUT_MS` trong `calls.service.ts`) tự chuyển `Call.status = MISSED` khi
không ai bắt máy. `NO_ANSWER` (per-participant, cho gọi nhóm) **vẫn chưa dùng** — timeout hiện xử
lý ở cấp cả cuộc gọi, chưa đánh dấu riêng từng người không trả lời.

## 4. Signaling `/chat`

**4.1** Không đổi — client tự `emit('chat:join', { workspaceId })` (field tên `workspaceId`, không
phải `conversationId`/`familyId`), 1 lần join là đủ cho mọi hội thoại trong family.

**4.2** Không đổi — 5 event `call:*` đúng như bảng trong `CALLS_GUIDE.md` mục 3. `participants`
trong `call:incoming` là mảng **object đầy đủ**, không phải mảng `memberId`.

**4.3** Không đổi — `/chat` là namespace chat đầy đủ (tin nhắn, typing, presence, reaction, pin...),
không riêng cho call.

**4.4** Không đổi — `chat:join` 1 lần join tất cả room hội thoại của member đó, không cần đang mở
màn chat cụ thể nào để nhận `call:incoming`.

## 5. Vòng đời & edge case

**5.1 ⟳ đã đổi ở đợt 2** — trước đây: không ai bắt máy → `RINGING` **vô thời hạn thật**, hội thoại
bị khoá không gọi lại được (rủi ro demo thật sự). **Giờ đã sửa**: timeout 30 giây tự chuyển
`MISSED`, hội thoại **tự giải phóng**, không còn deadlock. Áp dụng cho cả 1-1 và nhóm.

**5.2** Không đổi — `leave()` chỉ tự finalize khi `call.status === ONGOING` lúc gọi (đã từng có
người kết nối thật). Xem thêm 5.4 — trường hợp còn lại (`RINGING`) đã được xử lý riêng.

**5.3** Không đổi — gọi 1-1, callee `decline` → tự `DECLINED` ngay, người gọi nhận cả `call:declined`
và `call:ended` liên tiếp.

**5.4 ⟳ đã đổi ở đợt 2** — trước đây: initiator phải dùng đúng `end`, nếu gọi nhầm `leave` lúc
`RINGING` thì cuộc gọi **không** kết thúc ngay (dễ nhầm). **Giờ đã sửa**: `leave()` do initiator gọi
lúc `call.status === RINGING` được xử lý **tương đương `end()`** — tự chuyển `CANCELED` ngay. Dùng
`leave` hay `end` trong tình huống này đều an toàn như nhau.

**5.5 ⟳ đã đổi ở đợt 2** — trước đây chỉ xử lý webhook `participant_joined`/`participant_left`/
`room_finished`, **chưa** xử lý `participant_connection_aborted` (app kill/rớt mạng đột ngột — khác
với `participant_left` chủ động). **Giờ đã thêm**: `participant_connection_aborted` được xử lý
giống hệt `participant_left` (dọn dẹp participant ngay, không cần đợi `room_finished` làm lưới an
toàn trễ như trước).

## 6. LiveKit token

**6.1** Không đổi — TTL 10 phút, token cũ dùng lại được để reconnect trong 10 phút, không bắt buộc
gọi `join` lại.

**6.2** Không đổi — `participant.identity` = `memberId`, xác nhận đúng.

**6.3** Không đổi — đa thiết bị cùng `identity`: **không thêm logic chặn ở BE** (quyết định đã chốt
ở đợt 2), giữ mặc định LiveKit tự ngắt kết nối thiết bị cũ.

**6.4** Không đổi — `livekitUrl` cố định cho toàn hệ thống, đọc từ ENV `LIVEKIT_URL`.

## 7. Push notification

**7.1 ⟳ đã đổi ở đợt 2** — giá trị runtime `"CALL"` vẫn luôn đúng. Gap Swagger (thiếu `'CALL'` trong
`NotificationResponseDto.referenceType`) **đã sửa** — file
`server/src/modules/notifications/dto/notification-response.dto.ts`.

**7.2** Không đổi — push gửi cho mọi participant khác trừ người gọi, đúng 1 lần lúc `initiate()`.

**7.3 ⟳ đã đổi ở đợt 2** — trước đây: **không** có push riêng khi call kết thúc/nhỡ. **Giờ đã
thêm**: khi timeout → `MISSED`, những người **chưa từng bắt máy** nhận thêm 1 push riêng
(`body: "Cuộc gọi nhỡ"`). Chỉ áp dụng cho case `MISSED` — các case kết thúc khác (`ENDED`,
`CANCELED`, `DECLINED`) vẫn không có push riêng (không cần thiết, người trong cuộc đều đã ở trong
app/phòng gọi).

## 8. Message log cuộc gọi

**8.1** Không đổi — `relatedCallId` cùng cấp `content`, top-level field trên `Message`.

**8.2** Không đổi — chuỗi tóm tắt ("Cuộc gọi video · 5:32", "Cuộc gọi nhỡ"...) do BE sinh sẵn
trong `content`.

**8.3** Không đổi — chặn edit/react/pin trên `messageType: CALL`, trả `400`.

## 9. Gọi nhóm

**9.1 — đã chốt sau khi giải thích thêm**: **không chặn ở BE**. Lý do ban đầu để cân nhắc chặn
(bug 5.1 — kẹt `RINGING` mãi mãi) đã được sửa ở đợt 2 bằng timeout 30 giây, áp dụng như nhau cho cả
1-1 và nhóm. Việc có hiện nút gọi cho hội thoại `GROUP` hay không là lựa chọn UI của FE, backend
không giới hạn.

## 10. Mã lỗi

**10.1 ⟳ đã đổi ở đợt 2** — trước đây: chưa có `code`/`errorCode`, chỉ có `message` tiếng Việt thô.
**Giờ đã thêm**: 11 mã lỗi ổn định theo pattern `WEARABLE_ERROR_CODES`, bảng đầy đủ ở
`CALLS_GUIDE.md` mục 7. Bắt lỗi theo `code`, không bắt theo `message`.

**10.2** Không đổi — `503` là lỗi cấu hình server (thiếu `LIVEKIT_*`), không phải lỗi mạng người
dùng, FE không nên gợi ý thử lại.

## Các mục bổ sung ngoài phạm vi câu hỏi gốc (phát sinh trong lúc sửa)

- **`GET /calls/:callId`** (endpoint mới) — lấy 1 cuộc gọi theo id, dùng để FE tự phục hồi trạng
  thái sau khi socket `/chat` reconnect. Trước đây phải lách qua
  `GET /calls/conversations/:id?limit=1`.
- **Swagger đầy đủ** cho cả 7 endpoint `/calls/*` (trước đó hoàn toàn trống — 0 schema, 0 mã lỗi
  khai báo). Có thể đối chiếu trực tiếp trên `/api/docs`.
