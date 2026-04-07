import { resolveScheduledWebhookPeriod } from '../services/scheduledWebhookPeriod';

describe('scheduled webhook period resolution', () => {
  it('resolves the previous local day for daily events', () => {
    const period = resolveScheduledWebhookPeriod({
      event: 'daily',
      now: new Date('2026-04-01T10:30:00.000Z'),
      timeZone: 'Europe/Stockholm',
    });

    expect(period).toEqual({
      event: 'daily',
      periodKey: '2026-03-31',
      timeZone: 'Europe/Stockholm',
      periodStart: new Date('2026-03-30T22:00:00.000Z'),
      periodEndExclusive: new Date('2026-03-31T22:00:00.000Z'),
    });
  });

  it('resolves the previous local week starting on Monday for weekly events', () => {
    const period = resolveScheduledWebhookPeriod({
      event: 'weekly',
      now: new Date('2026-04-01T10:30:00.000Z'),
      timeZone: 'Europe/Stockholm',
    });

    expect(period).toEqual({
      event: 'weekly',
      periodKey: 'week:2026-03-23',
      timeZone: 'Europe/Stockholm',
      periodStart: new Date('2026-03-22T23:00:00.000Z'),
      periodEndExclusive: new Date('2026-03-29T22:00:00.000Z'),
    });
  });

  it('resolves the previous local month for monthly events', () => {
    const period = resolveScheduledWebhookPeriod({
      event: 'monthly',
      now: new Date('2026-04-01T10:30:00.000Z'),
      timeZone: 'Europe/Stockholm',
    });

    expect(period).toEqual({
      event: 'monthly',
      periodKey: '2026-03',
      timeZone: 'Europe/Stockholm',
      periodStart: new Date('2026-02-28T23:00:00.000Z'),
      periodEndExclusive: new Date('2026-03-31T22:00:00.000Z'),
    });
  });
});
