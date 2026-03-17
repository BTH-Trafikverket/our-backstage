import { InputError, NotFoundError } from '@backstage/errors';
import type {
  BadgesRepository,
  BadgePagination,
  BadgeProgressRow,
  BadgeRow,
} from '../repositories/badgesRepository';
import type { QuestsRepository } from '../repositories/questsRepository';
import type {
  BadgeCreationInput,
  BadgeCriteriaInput,
} from '../schemas/badges/badgeCreationSchema';
import type { BadgeEditInput } from '../schemas/badges/badgeEditSchema';
import type { QuestSubjectType } from '../schemas/quests/questCreationSchema';

type BadgeServiceOpts = {
  credentials: any;
};

export type BadgeResponse = BadgeRow & {
  criterias: BadgeCriteriaInput[];
};

export type PaginatedBadgeResponse = {
  data: BadgeResponse[];
  pagination: BadgePagination;
};

export type BadgeProgressResponse = {
  subjectRefs: string[];
  badges: Array<
    BadgeResponse & {
      isEarned: boolean;
      earnedAt: Date | null;
    }
  >;
  pagination: BadgePagination;
};

type BadgePaginationOpts = BadgeServiceOpts & {
  page?: number;
  limit?: number;
};

export class BadgesService {
  private readonly badgesRepo: BadgesRepository;
  private readonly questsRepo: QuestsRepository;

  constructor(options: {
    badgesRepo: BadgesRepository;
    questsRepo: QuestsRepository;
  }) {
    this.badgesRepo = options.badgesRepo;
    this.questsRepo = options.questsRepo;
  }

  private async validateCriterias(
    badgeSubjectType: QuestSubjectType,
    criterias: BadgeCriteriaInput[],
  ) {
    const questIds = [...new Set(criterias.map(criteria => criteria.quest_id))];
    const quests = await this.questsRepo.getQuestsByIds(questIds);
    const questsById = new Map(quests.map(quest => [quest.id, quest]));

    for (const criteria of criterias) {
      const quest = questsById.get(criteria.quest_id);
      if (!quest) {
        throw new NotFoundError(`Quest '${criteria.quest_id}' not found`);
      }

      if (quest.subject_type !== badgeSubjectType) {
        throw new InputError(
          `Quest '${criteria.quest_id}' is a ${quest.subject_type} quest and cannot be used on a ${badgeSubjectType} badge`,
        );
      }

      if (
        quest.completion_policy === 'ONE_TIME' &&
        criteria.target_count !== 1
      ) {
        throw new InputError(
          `Quest '${criteria.quest_id}' is ONE_TIME and requires target_count to be 1`,
        );
      }
    }
  }

  private buildBadge(
    badge: BadgeRow,
    criterias: BadgeCriteriaInput[],
  ): BadgeResponse {
    return {
      id: badge.id,
      title: badge.title,
      description: badge.description,
      xp_reward: badge.xp_reward,
      subject_type: badge.subject_type,
      created_at: badge.created_at,
      updated_at: badge.updated_at,
      archived_at: badge.archived_at,
      criterias,
    };
  }

  private buildBadgeProgress(
    badge: BadgeProgressRow,
    criterias: BadgeCriteriaInput[],
  ): BadgeProgressResponse['badges'][number] {
    return {
      ...this.buildBadge(badge, criterias),
      isEarned: badge.is_earned,
      earnedAt: badge.earned_at,
    };
  }

  async createBadge(data: BadgeCreationInput, _opts: BadgeServiceOpts) {
    await this.validateCriterias(data.subject_type, data.criterias);

    return this.badgesRepo.withTransaction(async repo => {
      const badge = await repo.createBadge({
        title: data.title,
        description: data.description,
        xp_reward: data.xp_reward,
        subject_type: data.subject_type,
      });

      await repo.insertBadgeCriteria(badge.id, data.criterias);

      return this.buildBadge(badge, data.criterias);
    });
  }

  async getBadges(
    searchTitle?: string,
    opts?: BadgePaginationOpts,
  ): Promise<PaginatedBadgeResponse> {
    const paginated = await this.badgesRepo.getPaginatedBadges({
      searchTitle,
      includeArchived: true,
      page: opts?.page,
      limit: opts?.limit,
    });
    const criteriaRows = await this.badgesRepo.getCriteriaForBadges(
      paginated.data.map(badge => badge.id),
    );

    const criteriaByBadgeId = new Map<string, BadgeCriteriaInput[]>();
    for (const row of criteriaRows) {
      const entries = criteriaByBadgeId.get(row.badge_id) ?? [];
      entries.push({ quest_id: row.quest_id, target_count: row.target_count });
      criteriaByBadgeId.set(row.badge_id, entries);
    }

    return {
      data: paginated.data.map(badge =>
        this.buildBadge(badge, criteriaByBadgeId.get(badge.id) ?? []),
      ),
      pagination: paginated.pagination,
    };
  }

  async getBadgeProgress(
    subjectRefs: string[],
    opts?: BadgePaginationOpts,
  ): Promise<BadgeProgressResponse> {
    const paginated = await this.badgesRepo.getPaginatedBadgeProgress(
      subjectRefs,
      {
        page: opts?.page,
        limit: opts?.limit,
      },
    );
    const criteriaRows = await this.badgesRepo.getCriteriaForBadges(
      paginated.data.map(badge => badge.id),
    );

    const criteriaByBadgeId = new Map<string, BadgeCriteriaInput[]>();
    for (const row of criteriaRows) {
      const entries = criteriaByBadgeId.get(row.badge_id) ?? [];
      entries.push({ quest_id: row.quest_id, target_count: row.target_count });
      criteriaByBadgeId.set(row.badge_id, entries);
    }

    return {
      subjectRefs,
      badges: paginated.data.map(badge =>
        this.buildBadgeProgress(badge, criteriaByBadgeId.get(badge.id) ?? []),
      ),
      pagination: paginated.pagination,
    };
  }

  async getBadgeById(
    id: string,
    _opts: BadgeServiceOpts,
  ): Promise<BadgeResponse | undefined> {
    const badge = await this.badgesRepo.getBadgeById(id, {
      includeArchived: true,
    });
    if (!badge) {
      return undefined;
    }

    const criteriaRows = await this.badgesRepo.getBadgeCriteria(id);
    return this.buildBadge(
      badge,
      criteriaRows.map(row => ({
        quest_id: row.quest_id,
        target_count: row.target_count,
      })),
    );
  }

  async updateBadge(
    id: string,
    data: BadgeEditInput,
    _opts: BadgeServiceOpts,
  ): Promise<BadgeResponse | undefined> {
    const currentBadge = await this.badgesRepo.getBadgeById(id, {
      includeArchived: true,
    });
    if (!currentBadge) {
      return undefined;
    }

    const nextSubjectType = data.subject_type ?? currentBadge.subject_type;

    let nextCriterias: BadgeCriteriaInput[];
    if (data.criterias) {
      nextCriterias = data.criterias;
    } else if (data.subject_type !== undefined) {
      const currentCriteria = await this.badgesRepo.getBadgeCriteria(id);
      nextCriterias = currentCriteria.map(row => ({
        quest_id: row.quest_id,
        target_count: row.target_count,
      }));
    } else {
      nextCriterias = [];
    }

    if (nextCriterias.length > 0) {
      await this.validateCriterias(nextSubjectType, nextCriterias);
    }

    return this.badgesRepo.withTransaction(async repo => {
      let badge = currentBadge;

      if (
        data.title !== undefined ||
        data.description !== undefined ||
        data.xp_reward !== undefined ||
        data.subject_type !== undefined
      ) {
        const updated = await repo.updateBadge(id, {
          title: data.title,
          description: data.description,
          xp_reward: data.xp_reward,
          subject_type: data.subject_type,
        });

        if (!updated) {
          return undefined;
        }

        badge = updated;
      }

      let criterias: BadgeCriteriaInput[];
      if (data.criterias) {
        await repo.replaceBadgeCriteria(id, data.criterias);
        const touchedBadge = await repo.touchBadge(id);
        if (!touchedBadge) {
          return undefined;
        }
        badge = touchedBadge;
        criterias = data.criterias;
      } else {
        const currentCriteria = await repo.getBadgeCriteria(id);
        criterias = currentCriteria.map(row => ({
          quest_id: row.quest_id,
          target_count: row.target_count,
        }));
      }

      return this.buildBadge(badge, criterias);
    });
  }

  async deleteBadge(id: string, _opts: BadgeServiceOpts): Promise<boolean> {
    return this.badgesRepo.deleteBadge(id);
  }
}
