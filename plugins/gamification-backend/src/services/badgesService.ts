import { InputError, NotFoundError } from '@backstage/errors';
import type {
  BadgeAdminSortField,
  BadgesRepository,
  BadgePagination,
  BadgeProgressSortField,
  BadgeProgressStatusFilter,
  BadgeSortOrder,
  BadgeRow,
  CriteriaProgressRow,
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

export type CriteriaProgress = {
  quest_id: string;
  quest_title: string;
  target_count: number;
  completion_policy: string;
  progress: {
    current: number;
    target: number;
    percent: number;
    done: boolean;
  };
  quest_progress: {
    current: number;
    target: number;
    percent: number;
    done: boolean;
  };
};

export type BadgeProgress = {
  completedRequirements: number;
  totalRequirements: number;
  percent: number;
};

export type BadgeProgressBadge = Omit<BadgeResponse, 'criterias'> & {
  isEarned: boolean;
  earnedAt: Date | null;
  progressSubjectRef: string | null;
  progress: BadgeProgress;
  criterias: CriteriaProgress[];
};

export type BadgeProgressResponse = {
  subjectRefs: string[];
  badges: BadgeProgressBadge[];
  pagination: BadgePagination;
};

type BadgePaginationOpts = BadgeServiceOpts & {
  searchTitle?: string;
  sortBy?: BadgeProgressSortField | BadgeAdminSortField;
  order?: BadgeSortOrder;
  status?: BadgeProgressStatusFilter;
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

  private getProgressPercent(current: number, target: number): number {
    if (target <= 0) {
      return 0;
    }

    return Math.min(100, Math.round((current / target) * 100));
  }

  private buildCriteriaProgress(row: CriteriaProgressRow): CriteriaProgress {
    const completionCount = Number(row.completion_count);
    const targetCount = Number(row.target_count);
    const questTargetCount = Math.max(1, Number(row.quest_target_count));
    const questCompletionCount = Math.floor(completionCount / questTargetCount);
    const requirementCurrent = Math.min(questCompletionCount, targetCount);
    const requirementDone = questCompletionCount >= targetCount;
    const questRemainder = completionCount % questTargetCount;
    const isOneTimeQuest = row.completion_policy === 'ONE_TIME';

    let questDone = false;
    if (isOneTimeQuest) {
      questDone = completionCount >= questTargetCount;
    } else {
      questDone = completionCount >= questTargetCount && questRemainder === 0;
    }

    let questCurrent = 0;
    if (completionCount === 0) {
      questCurrent = 0;
    } else if (isOneTimeQuest) {
      questCurrent = Math.min(completionCount, questTargetCount);
    } else if (questDone) {
      questCurrent = questTargetCount;
    } else {
      questCurrent = questRemainder;
    }

    return {
      quest_id: row.quest_id,
      quest_title: row.quest_title,
      target_count: targetCount,
      completion_policy: row.completion_policy,
      progress: {
        current: requirementCurrent,
        target: targetCount,
        percent: this.getProgressPercent(requirementCurrent, targetCount),
        done: requirementDone,
      },
      quest_progress: {
        current: questCurrent,
        target: questTargetCount,
        percent: questDone
          ? 100
          : this.getProgressPercent(questCurrent, questTargetCount),
        done: questDone,
      },
    };
  }

  private buildBadgeProgress(
    badge: BadgeRow & { is_earned: boolean; earned_at: Date | null },
    progressSubjectRef: string | null,
    criterias: CriteriaProgress[],
  ): BadgeProgressBadge {
    const completedRequirements = criterias.filter(
      criteria => criteria.progress.done,
    ).length;
    const totalRequirements = criterias.length;

    return {
      id: badge.id,
      title: badge.title,
      description: badge.description,
      xp_reward: badge.xp_reward,
      subject_type: badge.subject_type,
      created_at: badge.created_at,
      updated_at: badge.updated_at,
      archived_at: badge.archived_at,
      isEarned: badge.is_earned,
      earnedAt: badge.earned_at,
      progressSubjectRef,
      progress: {
        completedRequirements,
        totalRequirements,
        percent:
          totalRequirements > 0
            ? Math.round((completedRequirements / totalRequirements) * 100)
            : 0,
      },
      criterias,
    };
  }

  private pickBestProgressSubject(
    rows: CriteriaProgressRow[],
    subjectRefs: string[],
  ): string | null {
    const refs = [
      ...new Set(subjectRefs.map(ref => ref.trim()).filter(Boolean)),
    ];

    if (rows.length === 0 || refs.length === 0) {
      return null;
    }

    let bestSubjectRef: string | null = null;
    let bestCompletedRequirements = -1;
    let bestPercentTotal = -1;
    let bestCompletionCountTotal = -1;

    for (const subjectRef of refs) {
      const subjectRows = rows.filter(row => row.subject_ref === subjectRef);
      if (subjectRows.length === 0) {
        continue;
      }

      const criterias = subjectRows.map(row => this.buildCriteriaProgress(row));
      const completedRequirements = criterias.filter(
        criteria => criteria.progress.done,
      ).length;
      const percentTotal = criterias.reduce(
        (total, criteria) => total + criteria.progress.percent,
        0,
      );
      const completionCountTotal = subjectRows.reduce(
        (total, row) => total + Number(row.completion_count),
        0,
      );

      const isBetterCandidate =
        completedRequirements > bestCompletedRequirements ||
        (completedRequirements === bestCompletedRequirements &&
          percentTotal > bestPercentTotal) ||
        (completedRequirements === bestCompletedRequirements &&
          percentTotal === bestPercentTotal &&
          completionCountTotal > bestCompletionCountTotal);

      if (isBetterCandidate) {
        bestSubjectRef = subjectRef;
        bestCompletedRequirements = completedRequirements;
        bestPercentTotal = percentTotal;
        bestCompletionCountTotal = completionCountTotal;
      }
    }

    return bestSubjectRef;
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
      sortBy:
        opts?.sortBy === 'title' ||
        opts?.sortBy === 'xp_reward' ||
        opts?.sortBy === 'created_at' ||
        opts?.sortBy === 'criteria_count' ||
        opts?.sortBy === 'status'
          ? opts.sortBy
          : undefined,
      order: opts?.order,
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
    const refs = [
      ...new Set(subjectRefs.map(ref => ref.trim()).filter(Boolean)),
    ];
    const paginated = await this.badgesRepo.getPaginatedBadgeProgress(refs, {
      searchTitle: opts?.searchTitle,
      sortBy: opts?.sortBy,
      order: opts?.order,
      status: opts?.status,
      page: opts?.page,
      limit: opts?.limit,
    });

    const badgeIds = paginated.data.map(badge => badge.id);
    const criteriaProgressRows =
      await this.badgesRepo.getCriteriaProgressForBadges(badgeIds, refs);

    return {
      subjectRefs: refs,
      badges: paginated.data.map(badge => {
        const badgeRows = criteriaProgressRows.filter(
          row => row.badge_id === badge.id,
        );
        const progressSubjectRef = this.pickBestProgressSubject(
          badgeRows,
          refs,
        );
        const criterias = progressSubjectRef
          ? badgeRows
              .filter(row => row.subject_ref === progressSubjectRef)
              .map(row => this.buildCriteriaProgress(row))
          : [];

        return this.buildBadgeProgress(badge, progressSubjectRef, criterias);
      }),
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
