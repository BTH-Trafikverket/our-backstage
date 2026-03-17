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
      xp_reward: 150,
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
      getPaginatedBadges: jest.fn(),
      getBadges: jest.fn(),
      getPaginatedBadgeProgress: jest.fn(),
      getCriteriaForBadges: jest.fn(),
      getCriteriaProgressForBadges: jest.fn(),
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
      questsRepo.getQuestsByIds.mockResolvedValue([makeQuest()]);
      badgesRepo.createBadge.mockResolvedValue(makeBadge());

      await service.createBadge(
        {
          title: 'Reviewer',
          description: 'User badge',
          xp_reward: 75,
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
      expect(questsRepo.getQuestsByIds).toHaveBeenCalledWith(['quest-1']);
      expect(badgesRepo.insertBadgeCriteria).toHaveBeenCalledWith('badge-1', [
        { quest_id: 'quest-1', target_count: 3 },
      ]);
    });

    it('rejects badges that mix badge type and quest type', async () => {
      questsRepo.getQuestsByIds.mockResolvedValue([
        makeQuest({ subject_type: 'team' }),
      ]);

      await expect(
        service.createBadge(
          {
            title: 'Reviewer',
            description: 'User badge',
            xp_reward: 75,
            subject_type: 'user',
            criterias: [{ quest_id: 'quest-1', target_count: 1 }],
          },
          { credentials: {} as any },
        ),
      ).rejects.toThrow(InputError);

      expect(badgesRepo.createBadge).not.toHaveBeenCalled();
    });

    it('rejects missing quests before creating the badge', async () => {
      questsRepo.getQuestsByIds.mockResolvedValue([]);

      await expect(
        service.createBadge(
          {
            title: 'Reviewer',
            description: 'User badge',
            xp_reward: 75,
            subject_type: 'user',
            criterias: [{ quest_id: 'missing-quest', target_count: 1 }],
          },
          { credentials: {} as any },
        ),
      ).rejects.toThrow(NotFoundError);

      expect(badgesRepo.createBadge).not.toHaveBeenCalled();
    });

    it('rejects ONE_TIME quest criteria with target counts above one', async () => {
      questsRepo.getQuestsByIds.mockResolvedValue([
        makeQuest({ completion_policy: 'ONE_TIME' }),
      ]);

      await expect(
        service.createBadge(
          {
            title: 'Reviewer',
            description: 'User badge',
            xp_reward: 75,
            subject_type: 'user',
            criterias: [{ quest_id: 'quest-1', target_count: 2 }],
          },
          { credentials: {} as any },
        ),
      ).rejects.toThrow(InputError);
    });
  });

  describe('read models', () => {
    it('returns badges with grouped criteria', async () => {
      badgesRepo.getPaginatedBadges.mockResolvedValue({
        data: [
          makeBadge(),
          makeBadge({
            id: 'badge-2',
            title: 'Mentor',
            archived_at: new Date('2026-01-05T00:00:00Z'),
          }),
        ],
        pagination: { page: 1, limit: 10, total: 2, totalPages: 1 },
      });
      badgesRepo.getCriteriaForBadges.mockResolvedValue([
        { badge_id: 'badge-1', quest_id: 'quest-1', target_count: 2 },
        { badge_id: 'badge-2', quest_id: 'quest-2', target_count: 1 },
      ] as any);

      const result = await service.getBadges('review', {
        credentials: {} as any,
      });

      expect(badgesRepo.getPaginatedBadges).toHaveBeenCalledWith({
        searchTitle: 'review',
        includeArchived: true,
        page: undefined,
        limit: undefined,
      });
      expect(result).toEqual({
        data: [
          expect.objectContaining({
            id: 'badge-1',
            xp_reward: 150,
            criterias: [{ quest_id: 'quest-1', target_count: 2 }],
          }),
          expect.objectContaining({
            id: 'badge-2',
            criterias: [{ quest_id: 'quest-2', target_count: 1 }],
          }),
        ],
        pagination: { page: 1, limit: 10, total: 2, totalPages: 1 },
      });
    });

    it('returns persisted earned state in badge progress responses', async () => {
      badgesRepo.getPaginatedBadgeProgress.mockResolvedValue({
        data: [
          {
            ...makeBadge(),
            is_earned: true,
            earned_at: new Date('2026-01-03T00:00:00Z'),
          },
        ],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
      } as any);
      badgesRepo.getCriteriaProgressForBadges.mockResolvedValue([
        {
          badge_id: 'badge-1',
          quest_id: 'quest-1',
          target_count: 2,
          quest_title: 'Review PRs',
          quest_target_count: 1,
          completion_policy: 'REPEATABLE',
          subject_ref: 'group:default/platform',
          completion_count: 2,
        },
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
            xp_reward: 150,
            isEarned: true,
            earnedAt: new Date('2026-01-03T00:00:00Z'),
            progressSubjectRef: 'group:default/platform',
            progress: {
              completedRequirements: 1,
              totalRequirements: 1,
              percent: 100,
            },
            criterias: [
              expect.objectContaining({
                quest_id: 'quest-1',
                quest_title: 'Review PRs',
                target_count: 2,
                progress: {
                  current: 2,
                  target: 2,
                  percent: 100,
                  done: true,
                },
              }),
            ],
          }),
        ],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
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
      questsRepo.getQuestsByIds.mockResolvedValue([makeQuest()]);

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
      questsRepo.getQuestsByIds.mockResolvedValue([makeQuest()]);
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
      questsRepo.getQuestsByIds.mockResolvedValue([makeQuest()]);
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
        xp_reward: 75,
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

  it('returns enriched criteria progress in getBadgeProgress', async () => {
    badgesRepo.getPaginatedBadgeProgress.mockResolvedValue({
      data: [
        {
          id: 'badge-1',
          title: 'First Badge',
          description: 'A badge',
          subject_type: 'user',
          created_at: new Date(),
          updated_at: new Date(),
          archived_at: null,
          is_earned: false,
          earned_at: null,
        },
      ],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });

    badgesRepo.getCriteriaProgressForBadges.mockResolvedValue([
      {
        badge_id: 'badge-1',
        quest_id: 'quest-1',
        target_count: 3,
        quest_title: 'Review PRs',
        quest_target_count: 1,
        completion_policy: 'REPEATABLE',
        subject_ref: 'user:default/alice',
        completion_count: 2,
      },
      {
        badge_id: 'badge-1',
        quest_id: 'quest-2',
        target_count: 1,
        quest_title: 'Fix Bug',
        quest_target_count: 1,
        completion_policy: 'ONE_TIME',
        subject_ref: 'user:default/alice',
        completion_count: 1,
      },
    ]);

    const result = await service.getBadgeProgress(['user:default/alice'], {
      credentials: {} as any,
    });

    expect(result.badges).toHaveLength(1);
    const badge = result.badges[0];

    expect(badge.progressSubjectRef).toBe('user:default/alice');
    expect(badge.progress).toEqual({
      completedRequirements: 1,
      totalRequirements: 2,
      percent: 50,
    });
    expect(badge.criterias).toHaveLength(2);

    const crit1 = badge.criterias[0] as any;
    expect(crit1.quest_id).toBe('quest-1');
    expect(crit1.quest_title).toBe('Review PRs');
    expect(crit1.progress).toEqual({
      current: 2,
      target: 3,
      percent: 67,
      done: false,
    });

    const crit2 = badge.criterias[1] as any;
    expect(crit2.quest_id).toBe('quest-2');
    expect(crit2.progress).toEqual({
      current: 1,
      target: 1,
      percent: 100,
      done: true,
    });
    expect(crit2.quest_progress.done).toBe(true);
  });

  it('uses a single best-fit subject when multiple subjects exist', async () => {
    badgesRepo.getPaginatedBadgeProgress.mockResolvedValue({
      data: [
        {
          id: 'badge-1',
          title: 'Team Badge',
          description: 'A team badge',
          subject_type: 'team',
          created_at: new Date(),
          updated_at: new Date(),
          archived_at: null,
          is_earned: false,
          earned_at: null,
        },
      ],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });

    badgesRepo.getCriteriaProgressForBadges.mockResolvedValue([
      {
        badge_id: 'badge-1',
        quest_id: 'quest-1',
        target_count: 5,
        quest_title: 'Deploy',
        quest_target_count: 1,
        completion_policy: 'REPEATABLE',
        subject_ref: 'group:default/team-a',
        completion_count: 4,
      },
      {
        badge_id: 'badge-1',
        quest_id: 'quest-2',
        target_count: 1,
        quest_title: 'Incident Review',
        quest_target_count: 1,
        completion_policy: 'ONE_TIME',
        subject_ref: 'group:default/team-a',
        completion_count: 0,
      },
      {
        badge_id: 'badge-1',
        quest_id: 'quest-1',
        target_count: 5,
        quest_title: 'Deploy',
        quest_target_count: 1,
        completion_policy: 'REPEATABLE',
        subject_ref: 'group:default/team-b',
        completion_count: 2,
      },
      {
        badge_id: 'badge-1',
        quest_id: 'quest-2',
        target_count: 1,
        quest_title: 'Incident Review',
        quest_target_count: 1,
        completion_policy: 'ONE_TIME',
        subject_ref: 'group:default/team-b',
        completion_count: 1,
      },
    ]);

    const result = await service.getBadgeProgress(
      ['group:default/team-a', 'group:default/team-b'],
      { credentials: {} as any },
    );

    const badge = result.badges[0];
    expect(badge.progressSubjectRef).toBe('group:default/team-b');
    expect(badge.progress).toEqual({
      completedRequirements: 1,
      totalRequirements: 2,
      percent: 50,
    });
    expect(badge.criterias.map(criteria => criteria.quest_id)).toEqual([
      'quest-1',
      'quest-2',
    ]);
    expect(badge.criterias[0].progress.current).toBe(2);
    expect(badge.criterias[1].progress.done).toBe(true);
  });
});
