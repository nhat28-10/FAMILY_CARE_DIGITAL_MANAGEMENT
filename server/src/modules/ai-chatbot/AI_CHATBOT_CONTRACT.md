# AI Chatbot contract

Updated: 2026-08-07

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
