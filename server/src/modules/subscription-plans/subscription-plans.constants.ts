/**
 * Reserved plan code for the default (free) plan every family starts on.
 * `planCode` is now a free-form string (admins can add arbitrary tiers), but
 * `FREE` stays special: it's the fallback on family creation and when a paid
 * subscription is canceled.
 */
export const FREE_PLAN_CODE = 'FREE';
