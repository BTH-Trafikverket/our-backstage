import { QuestsRepository } from '../repositories/questsRepository';

describe('QuestsRepository unit behavior', () => {
  it('returns the first enabled trigger for an event key', async () => {
    const query = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue({
        id: 'trigger-1',
        event_key: 'github.pr_merged',
        quest_id: 'quest-1',
        increment_by: 1,
        enabled: true,
      }),
    };
    const db = jest.fn().mockReturnValue(query);
    const repository = new QuestsRepository(db as any);

    await expect(
      repository.getTriggerByEvent('github.pr_merged'),
    ).resolves.toEqual({
      id: 'trigger-1',
      event_key: 'github.pr_merged',
      quest_id: 'quest-1',
      increment_by: 1,
      enabled: true,
    });

    expect(db).toHaveBeenCalledWith('quest_event_triggers');
    expect(query.where).toHaveBeenCalledWith({
      event_key: 'github.pr_merged',
      enabled: true,
    });
    expect(query.orderBy).toHaveBeenCalledWith('created_at', 'asc');
  });

  it('rethrows receipt insert failures that are not duplicate-key errors', async () => {
    const query = {
      insert: jest.fn().mockRejectedValue(new Error('database unavailable')),
    };
    const db = jest.fn().mockReturnValue(query);
    const repository = new QuestsRepository(db as any);

    await expect(
      repository.tryInsertReceipt({
        event_id: 'evt-1',
        event_key: 'github.pr_merged',
        subject_ref: 'user:default/alice',
        caller_subject: 'plugin:test-listener',
      }),
    ).rejects.toThrow('database unavailable');
  });
});
