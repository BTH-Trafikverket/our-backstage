import { InputError } from '@backstage/errors';
import { BadgesService } from '../services/badgesService';
import { BadgesRepository } from '../repositories/badgesRepository';
import { QuestsRepository } from '../repositories/questsRepository';

jest.mock('../repositories/badgesRepository');
jest.mock('../repositories/questsRepository');

describe('BadgesService', () => {
  let service: BadgesService;
  let badgesRepo: jest.Mocked<BadgesRepository>;
  let questsRepo: jest.Mocked<QuestsRepository>;

  beforeEach(() => {
    badgesRepo = {
      withTransaction: jest.fn(async fn => fn(badgesRepo)),
      createBadge: jest.fn(),
      insertBadgeCriteria: jest.fn(),
      getBadgeById: jest.fn(),
      getBadgeCriteria: jest.fn(),
      getCriteriaForBadges: jest.fn(),
      getCriteriaProgressForBadges: jest.fn(),
      getPaginatedBadgeProgress: jest.fn(),
      updateBadge: jest.fn(),
      replaceBadgeCriteria: jest.fn(),
      touchBadge: jest.fn(),
    } as any;

    questsRepo = {
      getQuestById: jest.fn(),
    } as any;

    service = new BadgesService({
      badgesRepo,
      questsRepo,
    });
  });

  it('creates a user badge only from user quests', async () => {
    questsRepo.getQuestById.mockResolvedValue({
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
    } as any);

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
        criterias: [{ quest_id: 'quest-1', target_count: 3 }],
      },
      { credentials: {} as any },
    );

    expect(badgesRepo.createBadge).toHaveBeenCalledWith({
      title: 'Reviewer',
      description: 'User badge',
      subject_type: 'user',
    });
  });

  it('rejects badges that mix badge type and quest type', async () => {
    questsRepo.getQuestById.mockResolvedValue({
      id: 'quest-1',
      title: 'Security Sweep',
      description: '',
      target_count: 1,
      xp_reward: 100,
      subject_type: 'team',
      completion_policy: 'REPEATABLE',
      cooldown_days: null,
      created_at: new Date(),
      updated_at: new Date(),
    } as any);

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

  it('rejects subject type changes that would invalidate existing criteria', async () => {
    badgesRepo.getBadgeById.mockResolvedValue({
      id: 'badge-1',
      title: 'Reviewer',
      description: 'User badge',
      subject_type: 'user',
      archived_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    } as any);
    badgesRepo.getBadgeCriteria.mockResolvedValue([
      { badge_id: 'badge-1', quest_id: 'quest-1', target_count: 1 },
    ]);
    questsRepo.getQuestById.mockResolvedValue({
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
    } as any);

    await expect(
      service.updateBadge(
        'badge-1',
        { subject_type: 'team' },
        { credentials: {} as any },
      ),
    ).rejects.toThrow(InputError);

    expect(badgesRepo.updateBadge).not.toHaveBeenCalled();
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
