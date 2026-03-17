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
});
