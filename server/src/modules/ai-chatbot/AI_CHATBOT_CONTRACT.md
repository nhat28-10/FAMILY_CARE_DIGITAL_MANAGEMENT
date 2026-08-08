# AI Chatbot contract

Updated: 2026-08-08

## Rich UI hints

Every message now includes `uiHints` so FE can render the chatbot as a richer
Family Copilot experience without parsing natural language.

`aiMessage.uiHints`:

- `displayStyle`: `TEXT`, `INSIGHT_CARD`, `ACTION_CARD`, `RESULT_CARD`, or
  `PERMISSION_NOTICE`.
- `intent`: `GENERAL`, `INSIGHT`, `ACTION_PROPOSAL`, `ACTION_RESULT`, or
  `PERMISSION_LIMIT`.
- `title`: short card title, for example `Đề xuất cần bạn xác nhận`.
- `icon`: one of `bot`, `wallet`, `check-square`, `calendar`, `shield`,
  `sparkles`.
- `confidenceLabel`: `Tham khảo`, `Có dữ liệu`, or `Chờ xác nhận`.
- `quickActions`: contextual prompt chips the FE can show under the message.

Recommended FE mapping:

- `TEXT`: normal assistant bubble.
- `INSIGHT_CARD`: compact insight card with title, confidence label, and chips.
- `ACTION_CARD`: action proposal card; render `pendingAction.uiHints`.
- `RESULT_CARD`: completed-state card.
- `PERMISSION_NOTICE`: neutral warning/info card; do not show confirm CTA.

Do not parse `content` to decide CTA state. Use `pendingAction.status` and
`uiHints.displayStyle`.

## Pending action

AI write actions are proposals only. The app should render a confirm/reject card
only when the API response contains `pendingAction`.

Supported `actionType` values:

- `CREATE_LEDGER_ENTRY`
- `CREATE_TASK`
- `CREATE_CALENDAR_EVENT`

Supported `status` values:

- `PENDING`: waiting for user confirmation.
- `CONFIRMED`: confirm-action executed successfully.
- `REJECTED`: user rejected the proposal.
- `EXPIRED`: proposal expired before confirmation.

There is no `CANCELED` or `FAILED` pendingAction status at the moment.

After successful confirm, status stored in the original AI message is
`CONFIRMED`, and `result.id` is the created record id.

`expiresAt` is ISO UTC from `Date.toISOString()`, for example
`2026-08-07T12:15:00.000Z`.

`pendingAction.uiHints` provides confirm-card copy:

- `title`
- `description`
- `icon`
- `primaryActionLabel`
- `secondaryActionLabel`
- `editActionLabel`
- `fields`: label/value preview rows derived from the validated payload.

FE should render:

- Primary CTA: call
  `POST /families/:familyId/ai-chatbot/conversations/:conversationId/messages/:messageId/confirm-action`.
- Secondary CTA: call
  `POST /families/:familyId/ai-chatbot/conversations/:conversationId/messages/:messageId/reject-action`.
- Edit CTA: open a prefilled module form using `pendingAction.preview`; backend
  does not provide an edit endpoint for pending actions yet.

## Permission behavior

Members who do not have permission to create shared finance/task/calendar data
must not receive a pendingAction. Backend returns a normal AI answer explaining
that the member should ask a `FAMILY_MANAGER` or `DEPUTY_MEMBER`.

Finance write actions (`CREATE_LEDGER_ENTRY`) are currently allowed only for:

- `FAMILY_MANAGER`
- `DEPUTY_MEMBER`

## Feature flags

These keys are official subscription featureAccess keys:

- `ai.assistant`
- `ai.financeSummary`
- `ai.taskSummary`
- `ai.savingSuggestions`

At the moment, `ai.financeSummary`, `ai.taskSummary`, and
`ai.savingSuggestions` are feature flags for chatbot/tool behavior, not separate
REST endpoints.
