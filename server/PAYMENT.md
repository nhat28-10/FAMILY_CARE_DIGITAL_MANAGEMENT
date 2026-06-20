# PAYMENT.md — Thanh toán gói (Stripe) cho BE & FE

> Hướng dẫn để **dev BE khác** chạy/integrate và **dev FE** tích hợp tính năng family
> mua gói **PLUS/PREMIUM** qua **Stripe Checkout (subscription, tự gia hạn hằng năm)**.
> Tiếng Việt, giữ nguyên keyword code. Áp dụng cho `server/`.

---

## 1. Tổng quan

- Mỗi family **luôn có 1 `FamilySubscription`** (family mới = gói **FREE**, không hết hạn).
- Nâng gói: FE gọi BE tạo **Stripe Checkout session** → redirect user sang Stripe trả tiền.
- **Webhook Stripe là nguồn xác nhận chính** (KHÔNG dựa vào success URL). Sau webhook, BE
  kích hoạt/gia hạn `FamilySubscription`.
- `maxMembers` của gói được **enforce** khi thêm thành viên.

**Luồng:**
```
FE chọn gói → POST .../subscription/checkout → BE trả checkoutUrl
   → FE redirect sang Stripe → user trả thẻ → Stripe gửi webhook về BE
   → BE cập nhật FamilySubscription (ACTIVE/PLUS, currentPeriodEnd)
   → FE gọi lại GET .../subscription để hiển thị gói mới
```

**Stripe event được xử lý:** `checkout.session.completed`, `customer.subscription.created/updated`,
`customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`.

---

## 2. Biến môi trường (BE — `server/.env`)

Thêm 4 biến (xem mẫu trong `.env.example`):

```env
STRIPE_SECRET_KEY=sk_test_...        # Secret key (test mode) từ Stripe Dashboard
STRIPE_WEBHOOK_SECRET=whsec_...      # In ra khi chạy `stripe listen` (xem mục 4)
STRIPE_CHECKOUT_SUCCESS_URL=http://localhost:5173/subscription/success
STRIPE_CHECKOUT_CANCEL_URL=http://localhost:5173/subscription/cancel
```

> Mỗi máy/môi trường có **DB riêng + Stripe key riêng** (test) — không commit `.env`.
> Đổi `STRIPE_WEBHOOK_SECRET` thì **phải restart BE**.

---

## 3. Chuẩn bị Database

```bash
npx prisma migrate deploy   # áp migration (gồm family_subscriptions, payment_transactions)
npx prisma generate
npm run seed                # tạo admin + 3 gói FREE/PLUS/PREMIUM + backfill FREE cho family cũ
```

`npm run seed` **idempotent** (chạy lại an toàn). Sau seed, bảng `subscription_plans` có 3 gói;
mọi family đều có row `family_subscriptions` gói FREE.

> Gói FREE **bắt buộc tồn tại**, nếu không family mới sẽ không được seed subscription và
> `GET .../subscription` sẽ 404.

---

## 4. Chuẩn bị Stripe (test mode)

### 4.1 Lấy Secret key
Dashboard (bật **Test mode**) → Developers → API keys → copy `sk_test_...` → điền `.env`.

### 4.2 Tạo 2 **recurring** Price rồi gắn vào DB
Product catalog → Add product → Price: **Recurring**, **Yearly**, nhập giá → Save. Làm cho
Plus & Premium, copy 2 **Price ID** (`price_...`).

> ⚠️ **Bắt buộc là `Recurring`** (không phải One-time/Monthly nếu muốn annual). Price
> one-time sẽ làm checkout lỗi `must provide at least one recurring price in subscription mode`.

Gắn `stripePriceId` cho gói (qua admin API, cần token SYSTEM_ADMIN):
```bash
PATCH /api/v1/admin/subscription-plans/:id
Body: { "stripePriceId": "price_xxx" }
```
(FREE không cần `stripePriceId`.)

### 4.3 Chạy webhook listener (giữ mở khi test local)
Cài Stripe CLI (https://github.com/stripe/stripe-cli/releases), rồi:
```bash
stripe login
stripe listen --forward-to localhost:3000/api/v1/billing/webhooks/stripe
```
Lệnh in ra `whsec_...` → điền vào `STRIPE_WEBHOOK_SECRET` rồi **restart BE**.

> Production: tạo webhook endpoint thật trong Dashboard (Developers → Webhooks) trỏ tới
> `https://<api>/api/v1/billing/webhooks/stripe`, lấy signing secret từ đó.

---

## 5. API contract (cho FE)

Mọi response bọc envelope chuẩn: `{ success, message, data }`. Tiền tố `/api/v1`.

### 5.1 Xem gói hiện tại
```
GET /api/v1/families/:familyId/subscription
Auth: Bearer <accessToken>   (mọi thành viên của family)
```
**Response `data`:**
```json
{
  "id": "037d3ed1-...",
  "familyId": "4ea98bf8-...",
  "planId": "a57f8458-...",
  "status": "ACTIVE",                       // ACTIVE | PAST_DUE | CANCELED
  "stripeCustomerId": "cus_...",
  "stripeSubscriptionId": "sub_...",
  "currentPeriodEnd": "2027-06-20T06:04:41.000Z",  // null cho FREE
  "cancelAtPeriodEnd": false,
  "plan": {
    "planCode": "PLUS",                     // FREE | PLUS | PREMIUM
    "name": "Gói Plus",
    "annualPrice": "990000",
    "maxMembers": 10,
    "storageLimit": 5120,
    "featureAccess": null,
    "stripePriceId": "price_..."
  }
}
```

### 5.2 Tạo link thanh toán (nâng gói)
```
POST /api/v1/families/:familyId/subscription/checkout
Auth: Bearer <accessToken>   (chỉ FAMILY_MANAGER hoặc DEPUTY_MEMBER)
Body: { "planCode": "PLUS" }               // PLUS | PREMIUM
```
**Response `data`:** `{ "checkoutUrl": "https://checkout.stripe.com/c/pay/cs_test_..." }`

→ FE **redirect** trình duyệt sang `checkoutUrl`.

**Lỗi thường gặp:**
- `403` — không phải MANAGER/DEPUTY.
- `400 "Gói này chưa được cấu hình thanh toán"` — gói chưa có `stripePriceId`.
- `400 "Gia đình đang sử dụng gói này"` — đã ở gói đó & ACTIVE.

### 5.3 Webhook (Stripe gọi, FE không dùng)
```
POST /api/v1/billing/webhooks/stripe     // public, verify bằng chữ ký Stripe
```

---

## 6. Tích hợp phía FE

1. **Trang gói**: gọi `GET .../subscription` để hiển thị gói hiện tại + `currentPeriodEnd`.
   Liệt kê gói mua được qua `GET /api/v1/subscription-plans` (chỉ gói active).
2. **Nút "Nâng cấp"** (chỉ hiện cho MANAGER/DEPUTY):
   ```ts
   const { data } = await api.post(
     `/families/${familyId}/subscription/checkout`,
     { planCode: 'PLUS' },
   );
   window.location.href = data.checkoutUrl;   // redirect sang Stripe
   ```
3. **Cấu hình success/cancel URL** (mục 2) trỏ về route FE, ví dụ `/subscription/success`.
4. **Trang success**: ⚠️ KHÔNG coi success URL là "đã thanh toán chắc chắn". Hãy
   **gọi lại `GET .../subscription`** (có thể poll vài lần 1–3s) tới khi `status=ACTIVE` &
   `planCode` đúng → rồi cập nhật UI. Webhook mới là xác nhận thật, có độ trễ ngắn.
5. **Trang cancel**: thông báo huỷ, không đổi gì.
6. **Hết hạn/huỷ**: khi Stripe huỷ subscription, webhook đưa family về FREE
   (`status=CANCELED`, `planCode=FREE`). FE chỉ cần đọc `GET .../subscription`.

---

## 7. Enforce `maxMembers`

Khi thêm thành viên (tạo member / chấp nhận lời mời), BE kiểm tra số thành viên ACTIVE so với
`plan.maxMembers`. Vượt → **403** `"Đã đạt số thành viên tối đa của gói hiện tại"`.
Khi **hạ gói/hết hạn**: giữ nguyên thành viên hiện có, chỉ chặn **thêm mới**.
→ FE nên bắt 403 này ở luồng mời thành viên và gợi ý nâng gói.

---

## 8. Test (test mode)

**Thẻ test:**
- Thành công: `4242 4242 4242 4242`, hết hạn `12/34`, CVC `123`.
- Thất bại: `4000 0000 0000 0341`.

**Các case nên kiểm:**
1. Tạo checkout → mở `checkoutUrl` → trả thẻ 4242 → `GET .../subscription` thành `ACTIVE/PLUS`,
   có `currentPeriodEnd`.
2. Thẻ fail → `status=PAST_DUE`.
3. Resend event trùng (`stripe events resend <evt_id>`) → không đổi state lần 2
   (idempotency theo `payment_transactions.stripeEventId`).
4. Huỷ subscription (Dashboard hoặc `stripe trigger customer.subscription.deleted`) → về FREE.
5. Thêm member vượt `maxMembers` → 403.

Kiểm tra DB nhanh:
```sql
SELECT status, "currentPeriodEnd" FROM family_subscriptions WHERE "familyId"='<id>';
SELECT type, status, amount, currency FROM payment_transactions
  WHERE "familyId"='<id>' ORDER BY "createdAt";
```

---

## 9. Gotchas

- **Price phải `Recurring`** (mục 4.2).
- **`stripe listen` phải đang chạy** thì webhook mới về được localhost.
- Đổi `STRIPE_WEBHOOK_SECRET` → **restart BE**.
- BE chỉ boot được client Stripe khi gọi API thanh toán (lazy-init); thiếu `STRIPE_SECRET_KEY`
  thì app vẫn chạy nhưng checkout sẽ lỗi rõ ràng.
- **Zero-decimal currency**: VND/JPY/KRW… không có "cents"; cột `amount` đã xử lý đúng.
- Bản hiện tại chưa làm: coupon, refund, trial, tax, đổi/huỷ gói trong app (huỷ làm ở Stripe).

---

## 10. File liên quan (BE)

- Schema: `prisma/schema.prisma` (`FamilySubscription`, `PaymentTransaction`, `SubscriptionPlan.stripePriceId`)
- Stripe client: `src/modules/billing/stripe.service.ts`
- Webhook xử lý: `src/modules/billing/webhook.service.ts` + `controllers/stripe-webhook.controller.ts`
- Family-facing: `src/modules/subscriptions/subscriptions.service.ts` + `controllers/family-subscription.controller.ts`
- Seed gói + backfill: `prisma/seed.ts`
- Raw body cho webhook: `src/main.ts` (`rawBody: true`)
- Config: `src/config/configuration.ts` (`stripe.*`)
