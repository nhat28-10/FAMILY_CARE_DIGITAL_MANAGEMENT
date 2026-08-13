# Thiết kế: AI chatbot chủ động dùng tool + dự đoán chi tiêu

- **Ngày**: 2026-08-08
- **Module**: `server/src/modules/ai-chatbot`
- **Mục tiêu**: AI chatbot (OpenAI function calling) tự động gọi tool lấy dữ liệu thật khi
  câu hỏi cần dữ liệu hệ thống để trả lời đúng — kể cả câu hỏi phân tích/dự đoán — thay vì
  yêu cầu người dùng tự chỉ định (vd phải nói "dùng dữ liệu tháng 7" thì mới trả lời được).
  Ví dụ đầu tiên để thiết kế + kiểm thử: "Dự đoán chi tiêu tháng tới".

## 1. Bối cảnh & vấn đề

`ai-chatbot` đã có agent loop function-calling đầy đủ (`AiChatService.runAgentLoop`,
`server/src/modules/ai-chatbot/services/ai-chat.service.ts`), tool registry theo domain
(`finance.tools.ts`, `tasks.tools.ts`, `calendar.tools.ts`, `safety.tools.ts`) với tool đọc
(`kind: 'read'`, chạy ngay) và tool ghi (`kind: 'write'`, chỉ tạo đề xuất chờ xác nhận).
`maxToolRounds` mặc định 5 (đủ ngân sách cho vài lượt gọi tool liên tiếp).

**Vấn đề**: system prompt hiện tại (`buildSystemPrompt()`,
[ai-chat.service.ts:299-312](../../../server/src/modules/ai-chatbot/services/ai-chat.service.ts#L299-L312))
chỉ dặn model gọi tool khi ghi sổ hoặc khi có tool khớp trực tiếp câu hỏi — không có quy tắc
nào bảo model **tự suy luận cần dữ liệu gì rồi chủ động gọi tool** cho câu hỏi mang tính phân
tích/dự đoán/gợi ý. Với câu như "Dự đoán chi tiêu tháng tới", model coi đây là câu hỏi chung
chung, trả lời chay hoặc yêu cầu người dùng cung cấp số liệu — chỉ khi user tự nói rõ "dùng dữ
liệu tháng 7" model mới chịu gọi tool.

Ngoài ra, với riêng bài toán dự đoán chi tiêu, để model tự cộng/trừ/ước lượng số liệu tài
chính qua ngôn ngữ tự nhiên có rủi ro sai số / bịa số. Cần một tool tính toán bằng code
(deterministic) trả thẳng con số cho model trình bày lại.

## 2. Quyết định thiết kế (đã chốt)

| Vấn đề | Quyết định |
|--------|-----------|
| Phạm vi | Nguyên tắc "chủ động dùng tool" áp dụng **chung cho mọi module** (finance/tasks/calendar), không riêng dự đoán chi tiêu |
| Nguồn số liệu dự đoán | Tool tính toán riêng bằng code, không để LLM tự suy luận số |
| Vị trí tool mới | Gộp vào `FinanceAiTools` (cùng nhóm với `get_finance_overview`), không tạo domain mới |
| Quyền truy cập | Giống `get_finance_overview` — `FINANCE_MANAGER_ROLES` |
| Số tháng phân tích | Tham số `monthsToAnalyze`, tùy chọn, 2–6, mặc định 3 |
| Tháng tính | N tháng liền trước tháng hiện tại (tháng hiện tại đang dở, không tính vào lịch sử) |
| Công thức | Trung bình có trọng số tăng dần theo thời gian gần (tháng gần nhất trọng số cao nhất) |
| Xu hướng | So tháng gần nhất với trung bình các tháng còn lại, ngưỡng ±10% → `increasing`/`decreasing`/`stable` |
| Test | Tách hàm tính thuần (không đụng Prisma) để unit test độc lập |

## 3. Thiết kế chi tiết

### 3.1 System prompt — nguyên tắc chủ động dùng tool

Thêm bullet mới vào mảng rules trong `buildSystemPrompt()`
(`server/src/modules/ai-chatbot/services/ai-chat.service.ts`), đặt ngay sau dòng "Số liệu về
gia đình CHỈ được lấy từ kết quả tools":

```
- Khi câu hỏi cần dữ liệu thật của gia đình để trả lời đúng (tài chính, công việc, lịch...) —
  kể cả câu hỏi mang tính phân tích/dự đoán/xu hướng/gợi ý — LUÔN tự gọi tool phù hợp TRƯỚC khi
  trả lời, tự chọn tham số hợp lý (tháng hiện tại, N tháng gần nhất, hôm nay...) nếu người dùng
  không nói rõ. TUYỆT ĐỐI không yêu cầu người dùng tự cung cấp số liệu hay hỏi lại "bạn muốn
  dùng dữ liệu tháng nào" — nếu chưa rõ khoảng thời gian, mặc định lấy dữ liệu gần nhất/hiện tại
  rồi nêu rõ khoảng thời gian đã dùng trong câu trả lời.
```

Không đổi gì khác trong prompt. Không đổi `maxToolRounds` (5 là đủ).

### 3.2 Tool mới: `predict_next_month_expense`

Thêm vào `getTools()` của `FinanceAiTools`
(`server/src/modules/ai-chatbot/tools/finance.tools.ts`), kind `read`:

```ts
{
  name: 'predict_next_month_expense',
  description:
    'Dự đoán/ước tính chi tiêu tháng tới dựa trên dữ liệu chi tiêu thật của N tháng gần nhất ' +
    '(tự tính toán bằng công thức trung bình có trọng số, KHÔNG tự đoán số). Dùng khi người ' +
    'dùng hỏi dự đoán/ước tính/xu hướng chi tiêu, kế hoạch chi tiêu tháng tới.',
  parameters: {
    type: 'object',
    properties: {
      monthsToAnalyze: {
        type: 'integer',
        minimum: 2,
        maximum: 6,
        description: 'Số tháng lịch sử dùng để phân tích (mặc định 3)',
      },
    },
    additionalProperties: false,
  },
  module: AiRelatedModule.FINANCE,
  kind: 'read',
  allowedRoles: [...FINANCE_MANAGER_ROLES],
  execute: (args, ctx) => this.predictNextMonthExpense(ctx, args.monthsToAnalyze),
}
```

**Method `predictNextMonthExpense`** trong `FinanceAiTools`:

1. Chuẩn hóa `monthsToAnalyze` (clamp 2–6, mặc định 3 — dùng helper tương tự `clampLimit`).
2. Tính N tháng liền trước tháng hiện tại (tháng/năm hiện tại theo `Date` server, lùi dần,
   xử lý tràn năm).
3. Gọi `financeService.getOverview(ctx.familyId, ctx.memberId, { month, year })` cho từng
   tháng (song song bằng `Promise.all`), lấy `totalExpense` (convert `Prisma.Decimal` → `number`
   qua `.toNumber()`).
4. Gọi hàm thuần `predictNextMonthExpense(monthlyTotals: number[], nextPeriod)` (xem 3.3) để
   tính kết quả.
5. Trả JSON:

```json
{
  "monthsAnalyzed": 3,
  "monthlyExpenses": [
    { "month": 6, "year": 2026, "totalExpense": 7800000 },
    { "month": 7, "year": 2026, "totalExpense": 8200000 },
    { "month": 8, "year": 2026, "totalExpense": 9100000 }
  ],
  "averageExpense": 8366667,
  "trend": "increasing",
  "predictedNextMonth": { "month": 9, "year": 2026, "estimatedExpense": 8716667 },
  "note": null
}
```

Nếu tổng chi tiêu cả N tháng đều bằng 0 (gia đình mới/chưa có giao dịch), set
`"note": "Chưa có đủ dữ liệu lịch sử chi tiêu, đây chỉ là ước tính rất sơ bộ."` để model truyền
đạt đúng mức độ tin cậy — không chặn kết quả, vẫn trả về (nhất quán với cách `list_finance_categories`
xử lý danh sách rỗng).

### 3.3 Hàm tính thuần — `finance-prediction.util.ts`

File mới `server/src/modules/ai-chatbot/tools/finance-prediction.util.ts`, export hàm không
phụ thuộc Prisma/NestJS để unit test trực tiếp:

```ts
export interface MonthPoint { month: number; year: number; totalExpense: number }

export interface SpendingPrediction {
  averageExpense: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  predictedNextMonth: { month: number; year: number; estimatedExpense: number };
  note: string | null;
}

export function predictNextMonthExpense(
  history: MonthPoint[], // thứ tự cũ → mới, đã có >= 2 phần tử
  nextPeriod: { month: number; year: number },
): SpendingPrediction
```

Logic:
- `averageExpense` = trung bình cộng thường (để hiển thị tham chiếu, không phải số dự đoán).
- Trọng số `w_i = i` với `i = 1..N` (N = tháng mới nhất), chuẩn hóa tổng = 1 →
  `estimatedExpense = Σ(w_i * expense_i)`, làm tròn về số nguyên (đồng).
- `trend`: so `expense` tháng cuối với trung bình các tháng còn lại (`prevAvg`).
  - `> prevAvg * 1.1` → `increasing`
  - `< prevAvg * 0.9` → `decreasing`
  - còn lại → `stable`
  - N = 2: `prevAvg` = tháng đầu tiên (so trực tiếp).
- `note`: `null` trừ khi mọi `totalExpense` trong `history` đều = 0.

### 3.4 Test

- **Unit test mới** `finance-prediction.util.spec.ts`: các case — xu hướng tăng/giảm/ổn định,
  N=2 (biên dưới), toàn bộ 0 (note), số lẻ/làm tròn.
- **`ai-chat.service.spec.ts`** (đã có): thêm case agent loop tự gọi tool khi câu hỏi không nêu
  rõ tham số thời gian (vd assert model KHÔNG trả lời "vui lòng cung cấp dữ liệu" mà gọi tool
  trước) — nếu spec hiện tại mock `OpenAiClientService`, thêm kịch bản 2 lượt: model gọi
  `predict_next_month_expense` rồi trả text.
- **`tool-registry.service.spec.ts`** (đã có): assert tool mới có mặt trong danh sách theo role.

## 4. Không đổi / ngoài phạm vi

- Không tạo bảng DB mới, không đổi `FinanceService.getOverview` hiện có.
- Không đụng tool của `tasks`/`calendar` — nguyên tắc chủ động dùng tool ở mục 3.1 áp dụng
  cho các module đó thông qua system prompt chung, không cần tool mới riêng.
- Không xây mô hình dự đoán thống kê phức tạp (ARIMA, regression đa biến...) — trung bình có
  trọng số là đủ cho quy mô chi tiêu hộ gia đình và giữ tính minh bạch/giải thích được.
- Không đổi `maxToolRounds`, không đổi cấu trúc `AiToolDefinition`/`ToolRegistryService`.

## 5. Rủi ro / giới hạn đã biết

- `getOverview` không phân biệt được "tháng đó chưa có sổ" với "tháng đó chi tiêu = 0" — nếu
  gia đình mới tạo sổ giữa chừng N tháng, số trung bình có thể bị kéo thấp giả tạo. Chấp nhận
  giới hạn này ở v1 (đã có `note` cảnh báo khi toàn bộ = 0, nhưng không detect được trường hợp
  1/N tháng thiếu dữ liệu thật). Có thể cải thiện sau bằng cách check `ledger.createdAt` nếu
  phát sinh nhu cầu.
