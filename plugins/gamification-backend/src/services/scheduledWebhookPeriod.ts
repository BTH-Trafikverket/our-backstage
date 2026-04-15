import type { ScheduledWebhookEvent } from '../repositories/webhookRepository';

type LocalDateParts = {
  year: number;
  month: number;
  day: number;
};

export const DEFAULT_SCHEDULED_WEBHOOK_TIME_ZONE = 'Europe/Stockholm';

export type ScheduledWebhookPeriod = {
  event: ScheduledWebhookEvent;
  periodKey: string;
  timeZone: string;
  periodStart: Date;
  periodEndExclusive: Date;
};

function getLocalDateParts(date: Date, timeZone: string): LocalDateParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = Number(parts.find(part => part.type === 'year')?.value);
  const month = Number(parts.find(part => part.type === 'month')?.value);
  const day = Number(parts.find(part => part.type === 'day')?.value);

  return { year, month, day };
}

function getLocalWeekday(date: Date, timeZone: string): number {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
  }).format(date);

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  const dayOfWeek = weekdayMap[weekday];
  if (dayOfWeek === undefined) {
    throw new Error(`Unsupported weekday '${weekday}' for ${timeZone}`);
  }

  return dayOfWeek;
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date);
  const timeZoneName = parts.find(part => part.type === 'timeZoneName')?.value;

  if (!timeZoneName) {
    throw new Error(`Unable to read timezone offset for ${timeZone}`);
  }

  if (timeZoneName === 'GMT') {
    return 0;
  }

  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(timeZoneName);
  if (!match) {
    throw new Error(
      `Unsupported timezone offset '${timeZoneName}' for ${timeZone}`,
    );
  }

  const sign = match[1] === '+' ? 1 : -1;
  const hours = Number(match[2]);
  const minutes = Number(match[3]);

  return sign * (hours * 60 + minutes) * 60 * 1000;
}

function getUtcDateForLocalMidnight(
  parts: LocalDateParts,
  timeZone: string,
): Date {
  let utcMs = Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0);

  for (let i = 0; i < 2; i += 1) {
    const offsetMs = getTimeZoneOffsetMs(new Date(utcMs), timeZone);
    utcMs =
      Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0) - offsetMs;
  }

  return new Date(utcMs);
}

function formatDayKey(parts: LocalDateParts): string {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(
    parts.day,
  ).padStart(2, '0')}`;
}

function formatMonthKey(parts: Pick<LocalDateParts, 'year' | 'month'>): string {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}`;
}

function getPreviousDay(parts: LocalDateParts): LocalDateParts {
  const currentDate = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day),
  );
  currentDate.setUTCDate(currentDate.getUTCDate() - 1);

  return {
    year: currentDate.getUTCFullYear(),
    month: currentDate.getUTCMonth() + 1,
    day: currentDate.getUTCDate(),
  };
}

function getStartOfWeek(
  parts: LocalDateParts,
  dayOfWeek: number,
): LocalDateParts {
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const currentDate = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day),
  );
  currentDate.setUTCDate(currentDate.getUTCDate() - daysSinceMonday);

  return {
    year: currentDate.getUTCFullYear(),
    month: currentDate.getUTCMonth() + 1,
    day: currentDate.getUTCDate(),
  };
}

function formatWeekKey(parts: LocalDateParts): string {
  return `week:${formatDayKey(parts)}`;
}

function getStartOfPreviousWeek(parts: LocalDateParts): LocalDateParts {
  const currentDate = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day),
  );
  currentDate.setUTCDate(currentDate.getUTCDate() - 7);

  return {
    year: currentDate.getUTCFullYear(),
    month: currentDate.getUTCMonth() + 1,
    day: currentDate.getUTCDate(),
  };
}

function getPreviousMonth(
  parts: Pick<LocalDateParts, 'year' | 'month'>,
): LocalDateParts {
  if (parts.month === 1) {
    return { year: parts.year - 1, month: 12, day: 1 };
  }

  return { year: parts.year, month: parts.month - 1, day: 1 };
}

export function resolveScheduledWebhookPeriod(options: {
  event: ScheduledWebhookEvent;
  now?: Date;
  timeZone?: string;
}): ScheduledWebhookPeriod {
  const now = options.now ?? new Date();
  const timeZone = options.timeZone ?? DEFAULT_SCHEDULED_WEBHOOK_TIME_ZONE;
  const localToday = getLocalDateParts(now, timeZone);

  if (options.event === 'daily') {
    const previousDay = getPreviousDay(localToday);
    return {
      event: 'daily',
      periodKey: formatDayKey(previousDay),
      timeZone,
      periodStart: getUtcDateForLocalMidnight(previousDay, timeZone),
      periodEndExclusive: getUtcDateForLocalMidnight(localToday, timeZone),
    };
  }

  if (options.event === 'weekly') {
    const dayOfWeek = getLocalWeekday(now, timeZone);
    const currentWeekStart = getStartOfWeek(localToday, dayOfWeek);
    const previousWeekStart = getStartOfPreviousWeek(currentWeekStart);

    return {
      event: 'weekly',
      periodKey: formatWeekKey(previousWeekStart),
      timeZone,
      periodStart: getUtcDateForLocalMidnight(previousWeekStart, timeZone),
      periodEndExclusive: getUtcDateForLocalMidnight(
        currentWeekStart,
        timeZone,
      ),
    };
  }

  const currentMonthStart = {
    year: localToday.year,
    month: localToday.month,
    day: 1,
  };
  const previousMonthStart = getPreviousMonth(currentMonthStart);
  return {
    event: 'monthly',
    periodKey: formatMonthKey(previousMonthStart),
    timeZone,
    periodStart: getUtcDateForLocalMidnight(previousMonthStart, timeZone),
    periodEndExclusive: getUtcDateForLocalMidnight(currentMonthStart, timeZone),
  };
}
