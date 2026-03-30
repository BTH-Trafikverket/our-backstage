import type {
  LeaderboardRepository,
  LeaderboardSubjectType,
  LeaderboardTimeRange,
} from '../repositories/leaderboardRepository';

export type LeaderboardEntry = {
  rank: number;
  subjectRef: string;
  subjectType: LeaderboardSubjectType;
  totalXp: number;
};

export type LeaderboardPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type PaginatedLeaderboardResponse = {
  subjectType: LeaderboardSubjectType;
  timeRange: LeaderboardTimeRange;
  data: LeaderboardEntry[];
  pagination: LeaderboardPagination;
};

type TimeRangeWindow = {
  createdAtGte?: Date;
  createdAtLt?: Date;
};

type LocalDateParts = {
  year: number;
  month: number;
  day: number;
};

export class LeaderboardService {
  constructor(
    private readonly repo: LeaderboardRepository,
    private readonly defaultLimit: number = 25,
    private readonly maxLimit: number = 100,
    private readonly now: () => Date = () => new Date(),
    private readonly timeZone: string = 'Europe/Stockholm',
  ) {}

  private getLocalDateParts(date: Date): LocalDateParts {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: this.timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);

    const year = Number(parts.find(part => part.type === 'year')?.value);
    const month = Number(parts.find(part => part.type === 'month')?.value);
    const day = Number(parts.find(part => part.type === 'day')?.value);

    return { year, month, day };
  }

  private getLocalWeekday(date: Date): number {
    const weekday = new Intl.DateTimeFormat('en-US', {
      timeZone: this.timeZone,
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
      throw new Error(`Unsupported weekday '${weekday}' for ${this.timeZone}`);
    }

    return dayOfWeek;
  }

  private getTimeZoneOffsetMs(date: Date): number {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: this.timeZone,
      timeZoneName: 'longOffset',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(date);
    const timeZoneName = parts.find(
      part => part.type === 'timeZoneName',
    )?.value;

    if (!timeZoneName) {
      throw new Error(`Unable to read timezone offset for ${this.timeZone}`);
    }

    if (timeZoneName === 'GMT') {
      return 0;
    }

    const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(timeZoneName);
    if (!match) {
      throw new Error(
        `Unsupported timezone offset '${timeZoneName}' for ${this.timeZone}`,
      );
    }

    const sign = match[1] === '+' ? 1 : -1;
    const hours = Number(match[2]);
    const minutes = Number(match[3]);

    return sign * (hours * 60 + minutes) * 60 * 1000;
  }

  private getUtcDateForLocalMidnight(parts: LocalDateParts): Date {
    let utcMs = Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0);

    for (let i = 0; i < 2; i += 1) {
      const offsetMs = this.getTimeZoneOffsetMs(new Date(utcMs));
      utcMs =
        Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0) - offsetMs;
    }

    return new Date(utcMs);
  }

  private getTimeRangeWindow(timeRange: LeaderboardTimeRange): TimeRangeWindow {
    if (timeRange === 'alltime') {
      return {};
    }

    const now = this.now();
    const localToday = this.getLocalDateParts(now);

    if (timeRange === 'monthly') {
      const nextMonth =
        localToday.month === 12
          ? { year: localToday.year + 1, month: 1, day: 1 }
          : { year: localToday.year, month: localToday.month + 1, day: 1 };

      return {
        createdAtGte: this.getUtcDateForLocalMidnight({
          year: localToday.year,
          month: localToday.month,
          day: 1,
        }),
        createdAtLt: this.getUtcDateForLocalMidnight(nextMonth),
      };
    }

    const dayOfWeek = this.getLocalWeekday(now);
    const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const currentLocalDate = new Date(
      Date.UTC(localToday.year, localToday.month - 1, localToday.day),
    );
    const startOfWeekLocalDate = new Date(currentLocalDate);
    startOfWeekLocalDate.setUTCDate(
      startOfWeekLocalDate.getUTCDate() - daysSinceMonday,
    );

    const startOfNextWeekLocalDate = new Date(startOfWeekLocalDate);
    startOfNextWeekLocalDate.setUTCDate(
      startOfNextWeekLocalDate.getUTCDate() + 7,
    );

    return {
      createdAtGte: this.getUtcDateForLocalMidnight({
        year: startOfWeekLocalDate.getUTCFullYear(),
        month: startOfWeekLocalDate.getUTCMonth() + 1,
        day: startOfWeekLocalDate.getUTCDate(),
      }),
      createdAtLt: this.getUtcDateForLocalMidnight({
        year: startOfNextWeekLocalDate.getUTCFullYear(),
        month: startOfNextWeekLocalDate.getUTCMonth() + 1,
        day: startOfNextWeekLocalDate.getUTCDate(),
      }),
    };
  }

  async getLeaderboard(options: {
    subjectType: LeaderboardSubjectType;
    timeRange?: LeaderboardTimeRange;
    page?: number;
    limit?: number;
  }): Promise<PaginatedLeaderboardResponse> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(
      this.maxLimit,
      Math.max(1, options.limit ?? this.defaultLimit),
    );
    const timeRange = options.timeRange ?? 'alltime';
    const window = this.getTimeRangeWindow(timeRange);

    const leaderboardPage = await this.repo.getLeaderboardPage({
      subjectType: options.subjectType,
      page,
      limit,
      ...window,
    });
    const rankOffset = (page - 1) * limit;

    return {
      subjectType: options.subjectType,
      timeRange,
      data: leaderboardPage.data.map((row, index) => ({
        rank: rankOffset + index + 1,
        subjectRef: row.subject_ref,
        subjectType: options.subjectType,
        totalXp: row.total_xp,
      })),
      pagination: leaderboardPage.pagination,
    };
  }
}
