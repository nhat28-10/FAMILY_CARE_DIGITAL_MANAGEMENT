# AI Chatbot contract

Updated: 2026-08-08

## Rich UI hints

Every message now includes `uiHints` so FE can render the chatbot as a richer
Family Copilot experience without parsing natural language.

`aiMessage.uiHints`:

- `displayStyle`: `TEXT`, `INSIGHT_CARD`, `ACTION_CARD`,
  `ACTION_PLAN_CARD`, `RESULT_CARD`, or `PERMISSION_NOTICE`.
- `intent`: `GENERAL`, `INSIGHT`, `ACTION_PROPOSAL`, `ACTION_RESULT`, or
  `ACTION_PLAN`, `PERMISSION_LIMIT`.
- `title`: short card title, for example `Đề xuất cần bạn xác nhận`.
- `icon`: one of `bot`, `wallet`, `check-square`, `calendar`, `shield`,
  `sparkles`.
- `confidenceLabel`: `Tham khảo`, `Có dữ liệu`, or `Chờ xác nhận`.
- `quickActions`: contextual prompt chips the FE can show under the message.

Recommended FE mapping:

- `TEXT`: normal assistant bubble.
- `INSIGHT_CARD`: compact insight card with title, confidence label, and chips.
- `ACTION_CARD`: action proposal card; render `pendingAction.uiHints`.
- `ACTION_PLAN_CARD`: multi-step action proposal card; render
  `pendingActions[]`.
- `RESULT_CARD`: completed-state card.
- `PERMISSION_NOTICE`: neutral warning/info card; do not show confirm CTA.

Do not parse `content` to decide CTA state. Use `pendingAction.status`,
`pendingActions[].status`, and `uiHints.displayStyle`.

## Pending action

AI write actions are proposals only. The app should render a confirm/reject card
only when the API response contains `pendingAction`.

`pendingAction` is kept as a legacy alias of `pendingActions[0]`. New FE should
prefer `pendingActions[]`.

Each pending action includes:

- `messageId`
- `actionIndex`
- `actionType`
- `preview`
- `expiresAt`
- `status`
- `uiHints`
- `result` after confirmation

Supported `actionType` values:

- `CREATE_LEDGER_ENTRY`
- `CREATE_BUDGET_PLAN`
- `CREATE_BUDGET_LINE`
- `CREATE_FINANCIAL_GOAL`
- `CREATE_GOAL_ALLOCATION`
- `CREATE_GOAL_CONTRIBUTION_PLAN`
- `ALLOCATE_FUND_BY_MODEL`
- `CREATE_TASK`
- `CREATE_CALENDAR_EVENT`

Recommended FE refresh after a confirmed action:

- `CREATE_LEDGER_ENTRY`, `ALLOCATE_FUND_BY_MODEL`, `CREATE_GOAL_ALLOCATION`:
  refresh wallet/ledger, finance overview, goals if currently visible.
- `CREATE_BUDGET_PLAN`, `CREATE_BUDGET_LINE`: refresh wallet budget screens,
  budget plan list/detail, and finance overview if currently visible.
- `CREATE_FINANCIAL_GOAL`, `CREATE_GOAL_CONTRIBUTION_PLAN`: refresh wallet goal
  screens and goal contribution plan detail/list if currently visible.
- `CREATE_TASK`: refresh task list/detail and assignment views.
- `CREATE_CALENDAR_EVENT`: refresh calendar event list/detail.

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
  does not provide an edit endpoint for pending actions yet. If FE does not
  have a suitable prefilled form, the intended fallback is to reject the current
  proposal and let the user send a corrected request.

## Action plan

Sprint 3 adds multi-step action plans. A single AI message can contain multiple
pending actions.

When `aiMessage.uiHints.displayStyle === "ACTION_PLAN_CARD"`:

- Render a plan card inside the existing chat box.
- Render each `aiMessage.pendingActions[]` item as one step.
- Use `pendingActions[n].actionIndex` when confirming or rejecting a step.
- Keep step-level states from `pendingActions[n].status`.

Confirm one step:

`POST /families/:familyId/ai-chatbot/conversations/:conversationId/messages/:messageId/actions/:actionIndex/confirm`

Reject one step:

`POST /families/:familyId/ai-chatbot/conversations/:conversationId/messages/:messageId/actions/:actionIndex/reject`

The legacy confirm/reject endpoints still work and target action index `0`.

## Permission behavior

Members who do not have permission to create shared finance/task/calendar data
must not receive a pendingAction. Backend returns a normal AI answer explaining
that the member should ask a `FAMILY_MANAGER` or `DEPUTY_MEMBER`.

Finance manager-only write actions (`CREATE_LEDGER_ENTRY`,
`CREATE_BUDGET_PLAN`, `CREATE_BUDGET_LINE`, `CREATE_FINANCIAL_GOAL`,
`CREATE_GOAL_CONTRIBUTION_PLAN`, `ALLOCATE_FUND_BY_MODEL`) are currently
allowed only for:

- `FAMILY_MANAGER`
- `DEPUTY_MEMBER`

`CREATE_GOAL_ALLOCATION` is exposed to all roles and the finance goal service
re-checks whether the member can allocate to the selected goal at confirm time.

## Feature flags

These keys are official subscription featureAccess keys:

- `ai.assistant`
- `ai.financeSummary`
- `ai.taskSummary`
- `ai.savingSuggestions`

At the moment, `ai.financeSummary`, `ai.taskSummary`, and
`ai.savingSuggestions` are feature flags for chatbot/tool behavior, not separate
REST endpoints.

## Daily Brief

Sprint 2 adds a proactive assistant brief:

`GET /families/:familyId/ai-chatbot/daily-brief`

The response data contains:

- `generatedAt`
- `family`
- `scope`: timezone, today, month, year, financeScope
- `task`: overdueCount, dueTodayCount, nextAssignments
- `calendar`: upcomingCount, nextEvents
- `finance`: monthlyCashflow, activeBudgetPlan, budgetAlerts, goals,
  atRiskGoalCount, missedContributionPlanCount
- `insights`: prioritized cards with title, message, severity, relatedModule,
  actionPrompt
- `suggestedPrompts`: chips FE can send as new chat messages

The existing chat endpoint can also invoke the same data via tool
`get_daily_brief`. When that happens, `aiMessage.uiHints.displayStyle` is
`INSIGHT_CARD` and `aiMessage.uiHints.title` is `Tổng quan hôm nay`.
