export const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';
export const VIETNAM_TIMEZONE_OFFSET = '+07:00';

interface VietnamDateTimeParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
}

interface ParsedLocalDateTime {
  date: string;
  hour: string;
  minute: string;
  second: string;
  timezone?: string;
}

export function vietnamDateTimeWithTimezone(date = new Date()): string {
  const parts = vietnamDateTimeParts(date);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${VIETNAM_TIMEZONE_OFFSET}`;
}

export function vietnamDateTimeParts(date: Date): VietnamDateTimeParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: VIETNAM_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '00';
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

export function vietnamDateKey(date = new Date()): string {
  const parts = vietnamDateTimeParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function vietnamNowHasExplicitPhrase(text?: string): boolean {
  if (!text) return false;
  const normalized = normalizeVietnamese(text);
  return /\b(ngay bay gio|bay gio|hien tai|luc nay|vua xong)\b/.test(
    normalized,
  );
}

export function vietnamWeekendThisPhrase(text?: string): boolean {
  if (!text) return false;
  const normalized = normalizeVietnamese(text);
  return /\b(cuoi tuan nay|cuoi tuan)\b/.test(normalized);
}

export function normalizeVietnamDateTime(value: unknown, now = new Date()) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const dateOnly = trimmed.match(/^(\d{4}-\d{2}-\d{2})$/);
    if (dateOnly) {
      return `${dateOnly[1]}T00:00:00${VIETNAM_TIMEZONE_OFFSET}`;
    }

    const parsed = parseLocalDateTime(trimmed);
    if (parsed) {
      return `${parsed.date}T${parsed.hour}:${parsed.minute}:${parsed.second}${parsed.timezone ?? VIETNAM_TIMEZONE_OFFSET}`;
    }

    const nativeDate = new Date(trimmed);
    if (!Number.isNaN(nativeDate.getTime())) {
      return nativeDate.toISOString();
    }
  }

  return vietnamDateTimeWithTimezone(now);
}

export function normalizeVietnamDateTimeForText(
  value: unknown,
  userContent?: string,
  now = new Date(),
) {
  if (vietnamNowHasExplicitPhrase(userContent)) {
    return vietnamDateTimeWithTimezone(now);
  }
  return normalizeVietnamDateTime(value, now);
}

export function normalizeVietnamCalendarDateTime(
  value: unknown,
  userContent?: string,
  now = new Date(),
) {
  const normalized = normalizeVietnamDateTime(value, now);
  if (!vietnamWeekendThisPhrase(userContent)) {
    return normalized;
  }

  const [year, month, day] = vietnamDateKey(now).split('-').map(Number);
  const currentDate = new Date(Date.UTC(year, month - 1, day));
  const currentDay = currentDate.getUTCDay();
  const daysUntilSaturday = currentDay === 6 ? 7 : (6 - currentDay + 7) % 7;
  const saturday = new Date(
    currentDate.getTime() + daysUntilSaturday * 24 * 60 * 60_000,
  );
  const targetDate = saturday.toISOString().slice(0, 10);
  const parsed =
    typeof value === 'string'
      ? parseLocalDateTime(value.trim())
      : value instanceof Date
        ? parseLocalDateTime(normalized)
        : null;
  const hour = parsed?.hour ?? '19';
  const minute = parsed?.minute ?? '00';
  const second = parsed?.second ?? '00';
  return `${targetDate}T${hour}:${minute}:${second}${VIETNAM_TIMEZONE_OFFSET}`;
}

function parseLocalDateTime(value: string): ParsedLocalDateTime | null {
  const match = value.match(
    /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/,
  );
  if (!match) return null;
  const [, date, hour, minute, second = '00', timezone] = match;
  return { date, hour, minute, second, timezone };
}

function normalizeVietnamese(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}
