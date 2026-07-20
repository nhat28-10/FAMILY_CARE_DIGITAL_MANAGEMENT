export const FEATURE_ACCESS_KEYS = {
  CALENDAR_EVENTS: 'calendar.enabled',
  CALENDAR_REMINDERS: 'calendar.reminders',
  CALENDAR_RECURRING_EVENTS: 'calendar.recurringEvents',

  FINANCE_BUDGET_PLANNING: 'finance.budgetPlanning',
  FINANCE_FINANCIAL_GOALS: 'finance.financialGoals',
  FINANCE_BUDGET_ALERTS: 'finance.budgetAlerts',
  FINANCE_SUPPORT_REQUESTS: 'finance.supportRequests',
  FINANCE_REPORT_EXPORT: 'finance.reportExport',
  FINANCE_AI_OCR_SUGGESTION: 'finance.aiOcrSuggestion',

  TASKS_RECURRING_TASKS: 'tasks.recurringTasks',
  TASKS_PROOF_UPLOAD: 'tasks.proofUpload',
  TASKS_REWARD_SETTLEMENT: 'tasks.rewardSettlement',
  TASKS_REWARD_ALLOCATION: 'tasks.rewardAllocation',

  ALBUM_VIDEO_UPLOAD: 'album.videoUpload',
  ALBUM_FACE_SUGGESTIONS: 'album.faceSuggestions',

  AI_ASSISTANT: 'ai.assistant',
  AI_FINANCE_SUMMARY: 'ai.financeSummary',
  AI_TASK_SUMMARY: 'ai.taskSummary',
  AI_SAVING_SUGGESTIONS: 'ai.savingSuggestions',

  SOS_WEARABLE_PAIRING: 'sos.wearablePairing',
  SOS_FALL_DETECTION: 'sos.fallDetection',
  SOS_LIVE_LOCATION: 'sos.liveLocation',
  SOS_ROUTE_HISTORY: 'sos.routeHistory',

  CHAT_PRIVATE_CHAT: 'chat.privateChat',
  CHAT_ATTACHMENTS: 'chat.attachments',
  CHAT_ANNOUNCEMENTS: 'chat.announcements',
} as const;

export type FeatureAccessKey =
  (typeof FEATURE_ACCESS_KEYS)[keyof typeof FEATURE_ACCESS_KEYS];
