import { InputError, NotFoundError } from '@backstage/errors';
import type {
  BadgesRepository,
  BadgeRow,
} from '../repositories/badgesRepository';
import type { QuestsRepository } from '../repositories/questsRepository';
import type {
  BadgeCreationInput,
  BadgeCriteriaInput,
} from '../schemas/badges/badgeCreationSchema';
import type { BadgeEditInput } from '../schemas/badges/badgeEditSchema';

type BadgeServiceOpts = {
  credentials: any;
};

export type BadgeResponse = BadgeRow & {
  criterias: BadgeCriteriaInput[];
};

export type EarnedBadgesResponse = {
  subjectRef: string;
  badges: BadgeResponse[];
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

  private async validateCriterias(criterias: BadgeCriteriaInput[]) {
    for (const criteria of criterias) {
      const quest = await this.questsRepo.getQuestById(criteria.quest_id);
      if (!quest) {
        throw new NotFoundError(`Quest '${criteria.quest_id}' not found`);
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
      ...badge,
      criterias,
    };
  }

  async createBadge(data: BadgeCreationInput, _opts: BadgeServiceOpts) {
    await this.validateCriterias(data.criterias);

    return this.badgesRepo.withTransaction(async repo => {
      const badge = await repo.createBadge({
        title: data.title,
        description: data.description,
      });

      await repo.insertBadgeCriteria(badge.id, data.criterias);

      return this.buildBadge(badge, data.criterias);
    });
  }

  async getBadges(
    searchTitle?: string,
    _opts?: BadgeServiceOpts,
  ): Promise<BadgeResponse[]> {
    const badges = await this.badgesRepo.getBadges(searchTitle);
    const criteriaRows = await this.badgesRepo.getCriteriaForBadges(
      badges.map(badge => badge.id),
    );

    const criteriaByBadgeId = new Map<string, BadgeCriteriaInput[]>();
    for (const row of criteriaRows) {
      const entries = criteriaByBadgeId.get(row.badge_id) ?? [];
      entries.push({ quest_id: row.quest_id, target_count: row.target_count });
      criteriaByBadgeId.set(row.badge_id, entries);
    }

    return badges.map(badge =>
      this.buildBadge(badge, criteriaByBadgeId.get(badge.id) ?? []),
    );
  }

  async getEarnedBadges(
    subjectRef: string,
    _opts?: BadgeServiceOpts,
  ): Promise<EarnedBadgesResponse> {
    const badges = await this.badgesRepo.getEarnedBadges(subjectRef);
    const criteriaRows = await this.badgesRepo.getCriteriaForBadges(
      badges.map(badge => badge.id),
    );

    const criteriaByBadgeId = new Map<string, BadgeCriteriaInput[]>();
    for (const row of criteriaRows) {
      const entries = criteriaByBadgeId.get(row.badge_id) ?? [];
      entries.push({ quest_id: row.quest_id, target_count: row.target_count });
      criteriaByBadgeId.set(row.badge_id, entries);
    }

    return {
      subjectRef,
      badges: badges.map(badge =>
        this.buildBadge(badge, criteriaByBadgeId.get(badge.id) ?? []),
      ),
    };
  }

  async getBadgeById(
    id: string,
    _opts: BadgeServiceOpts,
  ): Promise<BadgeResponse | undefined> {
    const badge = await this.badgesRepo.getBadgeById(id);
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
    const currentBadge = await this.badgesRepo.getBadgeById(id);
    if (!currentBadge) {
      return undefined;
    }

    if (data.criterias) {
      await this.validateCriterias(data.criterias);
    }

    return this.badgesRepo.withTransaction(async repo => {
      let badge = currentBadge;

      if (data.title !== undefined || data.description !== undefined) {
        const updated = await repo.updateBadge(id, {
          title: data.title,
          description: data.description,
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
