import { InputError, NotFoundError } from '@backstage/errors';
import { BadgesService } from '../services/badgesService';
import { BadgesRepository } from '../repositories/badgesRepository';
import { QuestsRepository } from '../repositories/questsRepository';

jest.mock('../repositories/badgesRepository');
jest.mock('../repositories/questsRepository');

describe('BadgesService', () => {
  let service: BadgesService;
  let badgesRepo: jest.Mocked<BadgesRepository>;
  let questsRepo: jest.Mocked<QuestsRepository>;

  const makeQuest = (overrides: Partial<any> = {}) =>
    ({
      id: 'quest-1',
      title: 'Review PRs',
      description: '',
      target_count: 1,
      xp_reward: 100,
      subject_type: 'user',
      completion_policy: 'REPEATABLE',
      cooldown_days: null,
      created_at: new Date(),
      updated_at: new Date(),
      ...overrides,
    } as any);

  const makeBadge = (overrides: Partial<any> = {}) =>
    ({
      id: 'badge-1',
      title: 'Reviewer',
      description: 'User badge',
      subject_type: 'user',
      archived_at: null,
      created_at: new Date(),
      updated_at: new Date(),
      ...overrides,
    } as any);

  beforeEach(() => {
    badgesRepo = {
      withTransaction: jest.fn(async fn => fn(badgesRepo)),
      createBadge: jest.fn(),
      insertBadgeCriteria: jest.fn(),
      getBadges: jest.fn(),
      getCriteriaForBadges: jest.fn(),
      getBadgeProgress: jest.fn(),
      getBadgeById: jest.fn(),
      getBadgeCriteria: jest.fn(),
      updateBadge: jest.fn(),
      replaceBadgeCriteria: jest.fn(),
      touchBadge: jest.fn(),
      deleteBadge: jest.fn(),
    } as any;

    questsRepo = {
      getQuestById: jest.fn(),
      getQuestsByIds: jest.fn(),
    } as any;

    service = new BadgesService({
      badgesRepo,
      questsRepo,
    });
  });

  describe('createBadge', () => {
    it('creates a user badge only from user quests', async () => {
      questsRepo.getQuestById.mockResolvedValue(makeQuest());
      badgesRepo.createBadge.mockResolvedValue(makeBadge());

      await service.createBadge(
        {
          title: 'Reviewer',
          description: 'User badge',
          subject_type: 'user',
          criterias: [{ quest_id: 'quest-1', target_count: 3 }],
        },
        { credentials: {} as any },
      );

      expect(badgesRepo.createBadge).toHaveBeenCalledWith({
        title: 'Reviewer',
        description: 'User badge',
        xp_reward: 75,
        subject_type: 'user',
      });
      expect(badgesRepo.insertBadgeCriteria).toHaveBeenCalledWith('badge-1', [
        { quest_id: 'quest-1', target_count: 3 },
      ]);
    });

    it('rejects badges that mix badge type and quest type', async () => {
      questsRepo.getQuestById.mockResolvedValue(
        makeQuest({ subject_type: 'team' }),
      );

      await expect(
        service.createBadge(
          {
            title: 'Reviewer',
            description: 'User badge',
            subject_type: 'user',
            criterias: [{ quest_id: 'quest-1', target_count: 1 }],
          },
          { credentials: {} as any },
        ),
      ).rejects.toThrow(InputError);

      expect(badgesRepo.createBadge).not.toHaveBeenCalled();
    });

    it('rejects missing quests before creating the badge', async () => {
      questsRepo.getQuestById.mockResolvedValue(undefined);

      await expect(
        service.createBadge(
          {
            title: 'Reviewer',
            description: 'User badge',
            subject_type: 'user',
            criterias: [{ quest_id: 'missing-quest', target_count: 1 }],
          },
          { credentials: {} as any },
        ),
      ).rejects.toThrow(NotFoundError);

      expect(badgesRepo.createBadge).not.toHaveBeenCalled();
    });

    it('rejects ONE_TIME quest criteria with target counts above one', async () => {
      questsRepo.getQuestById.mockResolvedValue(
        makeQuest({ completion_policy: 'ONE_TIME' }),
      );

      await expect(
        service.createBadge(
          {
            title: 'Reviewer',
            description: 'User badge',
            subject_type: 'user',
            criterias: [{ quest_id: 'quest-1', target_count: 2 }],
          },
          { credentials: {} as any },
        ),
      ).rejects.toThrow(InputError);
    });
    expect(questsRepo.getQuestsByIds).toHaveBeenCalledWith(['quest-1']);
  });

  describe('read models', () => {
    it('returns badges with grouped criteria', async () => {
      badgesRepo.getBadges.mockResolvedValue([
        makeBadge(),
        makeBadge({
          id: 'badge-2',
          title: 'Mentor',
          archived_at: new Date('2026-01-05T00:00:00Z'),
        }),
      ]);
      badgesRepo.getCriteriaForBadges.mockResolvedValue([
        { badge_id: 'badge-1', quest_id: 'quest-1', target_count: 2 },
        { badge_id: 'badge-2', quest_id: 'quest-2', target_count: 1 },
      ] as any);

      const result = await service.getBadges('review', {
        credentials: {} as any,
      });

      expect(badgesRepo.getBadges).toHaveBeenCalledWith('review', {
        includeArchived: true,
      });
      expect(result).toEqual([
        expect.objectContaining({
          id: 'badge-1',
          criterias: [{ quest_id: 'quest-1', target_count: 2 }],
        }),
        expect.objectContaining({
          id: 'badge-2',
          criterias: [{ quest_id: 'quest-2', target_count: 1 }],
        }),
      ]);
    });

    it('returns persisted earned state in badge progress responses', async () => {
      badgesRepo.getBadgeProgress.mockResolvedValue([
        {
          ...makeBadge(),
          is_earned: true,
          earned_at: new Date('2026-01-03T00:00:00Z'),
        },
      ] as any);
      badgesRepo.getCriteriaForBadges.mockResolvedValue([
        { badge_id: 'badge-1', quest_id: 'quest-1', target_count: 2 },
      ] as any);

      const result = await service.getBadgeProgress(
        ['group:default/platform'],
        { credentials: {} as any },
      );

      expect(result).toEqual({
        subjectRefs: ['group:default/platform'],
        badges: [
          expect.objectContaining({
            id: 'badge-1',
            isEarned: true,
            earnedAt: new Date('2026-01-03T00:00:00Z'),
            criterias: [{ quest_id: 'quest-1', target_count: 2 }],
          }),
        ],
      });
    });

    it('returns undefined when a requested badge does not exist', async () => {
      badgesRepo.getBadgeById.mockResolvedValue(undefined);

      await expect(
        service.getBadgeById('missing-badge', { credentials: {} as any }),
      ).resolves.toBeUndefined();
    });

    it('returns a badge by id with its criteria', async () => {
      badgesRepo.getBadgeById.mockResolvedValue(makeBadge());
      badgesRepo.getBadgeCriteria.mockResolvedValue([
        { badge_id: 'badge-1', quest_id: 'quest-1', target_count: 2 },
      ] as any);

      await expect(
        service.getBadgeById('badge-1', { credentials: {} as any }),
      ).resolves.toEqual(
        expect.objectContaining({
          id: 'badge-1',
          criterias: [{ quest_id: 'quest-1', target_count: 2 }],
        }),
      );
    });
  });

  describe('updateBadge', () => {
    it('rejects subject type changes that would invalidate existing criteria', async () => {
      badgesRepo.getBadgeById.mockResolvedValue(makeBadge());
      badgesRepo.getBadgeCriteria.mockResolvedValue([
        { badge_id: 'badge-1', quest_id: 'quest-1', target_count: 1 },
      ] as any);
      questsRepo.getQuestById.mockResolvedValue(makeQuest());

      await expect(
        service.updateBadge(
          'badge-1',
          { subject_type: 'team' },
          { credentials: {} as any },
        ),
      ).rejects.toThrow(InputError);

      expect(badgesRepo.updateBadge).not.toHaveBeenCalled();
    });

    it('returns undefined when the badge does not exist', async () => {
      badgesRepo.getBadgeById.mockResolvedValue(undefined);

      await expect(
        service.updateBadge(
          'missing-badge',
          { title: 'Updated' },
          { credentials: {} as any },
        ),
      ).resolves.toBeUndefined();

      expect(badgesRepo.updateBadge).not.toHaveBeenCalled();
    });

    it('replaces criteria and returns the touched badge snapshot', async () => {
      badgesRepo.getBadgeById.mockResolvedValue(makeBadge());
      questsRepo.getQuestById.mockResolvedValue(makeQuest());
      badgesRepo.touchBadge.mockResolvedValue(
        makeBadge({ updated_at: new Date('2026-01-04T00:00:00Z') }),
      );

      const result = await service.updateBadge(
        'badge-1',
        {
          criterias: [{ quest_id: 'quest-1', target_count: 4 }],
        },
        { credentials: {} as any },
      );

      expect(badgesRepo.replaceBadgeCriteria).toHaveBeenCalledWith('badge-1', [
        { quest_id: 'quest-1', target_count: 4 },
      ]);
      expect(badgesRepo.touchBadge).toHaveBeenCalledWith('badge-1');
      expect(result).toEqual(
        expect.objectContaining({
          id: 'badge-1',
          criterias: [{ quest_id: 'quest-1', target_count: 4 }],
        }),
      );
    });

    it('returns undefined when the badge update disappears inside the transaction', async () => {
      badgesRepo.getBadgeById.mockResolvedValue(makeBadge());
      badgesRepo.updateBadge.mockResolvedValue(undefined);

      await expect(
        service.updateBadge(
          'badge-1',
          { title: 'Updated title' },
          { credentials: {} as any },
        ),
      ).resolves.toBeUndefined();
    });

    it('returns the updated badge with existing criteria when criteria are unchanged', async () => {
      badgesRepo.getBadgeById.mockResolvedValue(makeBadge());
      badgesRepo.updateBadge.mockResolvedValue(
        makeBadge({ title: 'Updated title' }),
      );
      badgesRepo.getBadgeCriteria.mockResolvedValue([
        { badge_id: 'badge-1', quest_id: 'quest-1', target_count: 2 },
      ] as any);

      await expect(
        service.updateBadge(
          'badge-1',
          { title: 'Updated title' },
          { credentials: {} as any },
        ),
      ).resolves.toEqual(
        expect.objectContaining({
          title: 'Updated title',
          criterias: [{ quest_id: 'quest-1', target_count: 2 }],
        }),
      );
    });

    it('returns undefined when replacing criteria cannot reload the touched badge', async () => {
      badgesRepo.getBadgeById.mockResolvedValue(makeBadge());
      questsRepo.getQuestById.mockResolvedValue(makeQuest());
      badgesRepo.touchBadge.mockResolvedValue(undefined);

      await expect(
        service.updateBadge(
          'badge-1',
          {
            criterias: [{ quest_id: 'quest-1', target_count: 1 }],
          },
          { credentials: {} as any },
        ),
      ).resolves.toBeUndefined();
    });
  });

  describe('deleteBadge', () => {
    it('delegates badge archiving to the repository', async () => {
      badgesRepo.deleteBadge.mockResolvedValue(true);

      await expect(
        service.deleteBadge('badge-1', { credentials: {} as any }),
      ).resolves.toBe(true);

      expect(badgesRepo.deleteBadge).toHaveBeenCalledWith('badge-1');
    });
  });

  it('deduplicates repeated quest ids into a single batched lookup', async () => {
    questsRepo.getQuestsByIds.mockResolvedValue([
      {
        id: 'quest-1',
        title: 'Review PRs',
        description: '',
        target_count: 1,
        xp_reward: 100,
        subject_type: 'user',
        completion_policy: 'REPEATABLE',
        cooldown_days: null,
        created_at: new Date(),
        updated_at: new Date(),
      } as any,
    ]);
    badgesRepo.createBadge.mockResolvedValue({
      id: 'badge-1',
      title: 'Reviewer',
      description: 'User badge',
      subject_type: 'user',
      archived_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    } as any);

    await service.createBadge(
      {
        title: 'Reviewer',
        description: 'User badge',
        subject_type: 'user',
        criterias: [
          { quest_id: 'quest-1', target_count: 1 },
          { quest_id: 'quest-1', target_count: 2 },
        ],
      },
      { credentials: {} as any },
    );

    expect(questsRepo.getQuestsByIds).toHaveBeenCalledWith(['quest-1']);
    expect(questsRepo.getQuestsByIds).toHaveBeenCalledTimes(1);
  });
});
