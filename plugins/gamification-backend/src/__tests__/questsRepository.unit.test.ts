import { QuestsRepository } from '../repositories/questsRepository';

describe('QuestsRepository unit behavior', () => {
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
