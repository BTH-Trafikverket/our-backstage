import {
  buildMonthlyProgressIdempotencyKey,
  resolveMonthlyProgressReportingPeriod,
} from '../services/monthlyProgressPeriod';

describe('monthly progress reporting period', () => {
  it('defaults to the previous completed month in the configured timezone', () => {
    const period = resolveMonthlyProgressReportingPeriod({
      now: new Date('2026-03-31T22:05:00.000Z'),
      timeZone: 'Europe/Stockholm',
    });

    expect(period).toEqual({
      periodKey: '2026-03',
      timeZone: 'Europe/Stockholm',
      periodStart: new Date('2026-02-28T23:00:00.000Z'),
      periodEndExclusive: new Date('2026-03-31T22:00:00.000Z'),
    });
  });

  it('handles previous-month selection across year boundaries', () => {
    const period = resolveMonthlyProgressReportingPeriod({
      now: new Date('2026-01-05T10:00:00.000Z'),
      timeZone: 'Europe/Stockholm',
    });

    expect(period).toEqual({
      periodKey: '2025-12',
      timeZone: 'Europe/Stockholm',
      periodStart: new Date('2025-11-30T23:00:00.000Z'),
      periodEndExclusive: new Date('2025-12-31T23:00:00.000Z'),
    });
  });

  it('supports explicit month reruns without depending on the current date', () => {
    const period = resolveMonthlyProgressReportingPeriod({
      now: new Date('2026-08-12T09:00:00.000Z'),
      timeZone: 'UTC',
      month: '2024-02',
    });

    expect(period).toEqual({
      periodKey: '2024-02',
      timeZone: 'UTC',
      periodStart: new Date('2024-02-01T00:00:00.000Z'),
      periodEndExclusive: new Date('2024-03-01T00:00:00.000Z'),
    });
  });

  it('builds the same idempotency key for the same reporting period on rerun', () => {
    const scheduledPeriod = resolveMonthlyProgressReportingPeriod({
      now: new Date('2026-04-15T12:00:00.000Z'),
      timeZone: 'UTC',
    });
    const rerunPeriod = resolveMonthlyProgressReportingPeriod({
      now: new Date('2026-09-01T00:00:00.000Z'),
      timeZone: 'UTC',
      month: '2026-03',
    });

    expect(buildMonthlyProgressIdempotencyKey(scheduledPeriod)).toBe(
      buildMonthlyProgressIdempotencyKey(rerunPeriod),
    );
  });

  it('rejects invalid rerun month values', () => {
    expect(() =>
      resolveMonthlyProgressReportingPeriod({
        month: '2026-13',
      }),
    ).toThrow('month must be a valid calendar month in YYYY-MM format');

    expect(() =>
      resolveMonthlyProgressReportingPeriod({
        month: '2026-3',
      }),
    ).toThrow('month must be in YYYY-MM format');
  });
});
