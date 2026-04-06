type LocalDateParts = {
  year: number;
  month: number;
  day: number;
};

type LocalMonthParts = {
  year: number;
  month: number;
};

export const DEFAULT_MONTHLY_PROGRESS_TIME_ZONE = 'Europe/Stockholm';

export type MonthlyProgressReportingPeriod = {
  periodKey: string;
  timeZone: string;
  periodStart: Date;
  periodEndExclusive: Date;
};

const MONTH_KEY_PATTERN = /^(\d{4})-(\d{2})$/;

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

function parseRequestedMonth(month: string): LocalMonthParts {
  const match = MONTH_KEY_PATTERN.exec(month);
  if (!match) {
    throw new Error('month must be in YYYY-MM format');
  }

  const year = Number(match[1]);
  const monthNumber = Number(match[2]);

  if (monthNumber < 1 || monthNumber > 12) {
    throw new Error('month must be a valid calendar month in YYYY-MM format');
  }

  return { year, month: monthNumber };
}

function getPreviousMonth(parts: LocalDateParts): LocalMonthParts {
  if (parts.month === 1) {
    return { year: parts.year - 1, month: 12 };
  }

  return { year: parts.year, month: parts.month - 1 };
}

function getNextMonth(parts: LocalMonthParts): LocalMonthParts {
  if (parts.month === 12) {
    return { year: parts.year + 1, month: 1 };
  }

  return { year: parts.year, month: parts.month + 1 };
}

function formatPeriodKey(parts: LocalMonthParts): string {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}`;
}

export function resolveMonthlyProgressReportingPeriod(options?: {
  now?: Date;
  timeZone?: string;
  month?: string;
}): MonthlyProgressReportingPeriod {
  const now = options?.now ?? new Date();
  const timeZone = options?.timeZone ?? DEFAULT_MONTHLY_PROGRESS_TIME_ZONE;
  // Default runs target the last fully completed local calendar month.
  const targetMonth = options?.month
    ? parseRequestedMonth(options.month)
    : getPreviousMonth(getLocalDateParts(now, timeZone));
  const nextMonth = getNextMonth(targetMonth);

  return {
    periodKey: formatPeriodKey(targetMonth),
    timeZone,
    periodStart: getUtcDateForLocalMidnight(
      {
        year: targetMonth.year,
        month: targetMonth.month,
        day: 1,
      },
      timeZone,
    ),
    periodEndExclusive: getUtcDateForLocalMidnight(
      {
        year: nextMonth.year,
        month: nextMonth.month,
        day: 1,
      },
      timeZone,
    ),
  };
}

export function buildMonthlyProgressIdempotencyKey(
  period: Pick<MonthlyProgressReportingPeriod, 'periodKey' | 'timeZone'>,
): string {
  return `monthly-progress:${period.timeZone}:${period.periodKey}`;
}
