import {
  QuestCreationInput,
  QuestSubjectType,
} from '../schemas/quests/questCreationSchema';
import { QuestEditSchema } from '../schemas/quests/questEditSchema';
import { QuestsRepository } from '../repositories/questsRepository';
import type {
  QuestRow,
  QuestAudienceFilter,
  QuestStatusFilter,
  QuestSortField,
  SortOrder,
} from '../repositories/questsRepository';
import { CatalogClient } from '@backstage/catalog-client';
import { AuthService } from '@backstage/backend-plugin-api';
import { ConflictError, InputError, NotFoundError } from '@backstage/errors';
import { stringifyEntityRef } from '@backstage/catalog-model';
import type { QuestEventActor } from '../schemas/quests/questEventSchema';

type QuestServiceOpts = {
  credentials: any;
};

export type ActorResolutionProviderConfig = {
  idAnnotations?: string[];
  loginAnnotations?: string[];
};

export type ActorResolutionProviders = Record<
  string,
  ActorResolutionProviderConfig
>;

const DEFAULT_ACTOR_RESOLUTION_PROVIDERS: ActorResolutionProviders = {
  github: {
    idAnnotations: ['metadata.annotations.github.com/user-id'],
    loginAnnotations: ['metadata.annotations.github.com/user-login'],
  },
};

export class QuestsService {
  private readonly questsRepo: QuestsRepository;
  private readonly catalogClient: CatalogClient;
  private readonly auth: AuthService;
  private readonly actorResolutionProviders: ActorResolutionProviders;

  constructor(opts: {
    questsRepo: QuestsRepository;
    catalogClient: CatalogClient;
    auth: AuthService;
    actorResolutionProviders?: ActorResolutionProviders;
  }) {
    this.questsRepo = opts.questsRepo;
    this.catalogClient = opts.catalogClient;
    this.auth = opts.auth;
    this.actorResolutionProviders = this.mergeActorResolutionProviders(
      DEFAULT_ACTOR_RESOLUTION_PROVIDERS,
      opts.actorResolutionProviders ?? {},
    );
  }

  private normalizeQuestSubjectType(subjectType: QuestSubjectType | undefined) {
    return subjectType ?? ('user' as const);
  }

  async createQuest(data: QuestCreationInput, _opts: QuestServiceOpts) {
    const policy = data.completion_policy ?? 'REPEATABLE';
    const target_count = data.target_count;
    const cooldown = policy === 'ONE_TIME' ? null : data.cooldown_days ?? null;

    return this.questsRepo.createQuest({
      title: data.title,
      description: data.description,
      target_count,
      xp_reward: data.xp_reward,
      subject_type: this.normalizeQuestSubjectType(data.subject_type),
      completion_policy: policy,
      cooldown_days: cooldown,
    });
  }

  async getQuests(
    filters?: {
      searchTitle?: string;
      audience?: QuestAudienceFilter;
      sortBy?: QuestSortField;
      order?: SortOrder;
      includeArchived?: boolean;
      page?: number;
      limit?: number;
    },
    _opts?: QuestServiceOpts,
  ) {
    return this.questsRepo.getQuests({
      searchTitle: filters?.searchTitle,
      audience: filters?.audience,
      sortBy: filters?.sortBy,
      order: filters?.order,
      includeArchived: filters?.includeArchived,
      page: filters?.page,
      limit: filters?.limit,
    });
  }

  async getQuestById(id: string, _opts: QuestServiceOpts) {
    return this.questsRepo.getQuestById(id);
  }

  async editQuest(id: string, data: QuestEditSchema, _opts: QuestServiceOpts) {
    const current = await this.questsRepo.getQuestById(id);
    if (!current) {
      return undefined;
    }

    const completionPolicy =
      data.completion_policy ?? current.completion_policy;
    const target_count = data.target_count ?? current.target_count;
    let cooldown = current.cooldown_days;
    if (completionPolicy === 'ONE_TIME') {
      cooldown = null;
    } else if (data.cooldown_days !== undefined) {
      cooldown = data.cooldown_days;
    }

    return this.questsRepo.editQuest(id, {
      ...data,
      subject_type: this.normalizeQuestSubjectType(
        data.subject_type ?? current.subject_type,
      ),
      completion_policy: completionPolicy,
      target_count,
      cooldown_days: cooldown,
    });
  }

  async deleteQuest(id: string, _opts: QuestServiceOpts) {
    const badgeUsage = await this.questsRepo.getBadgeCriteriaUsage(id);
    if (badgeUsage.length > 0) {
      const referencedBadges = badgeUsage.map(row => row.badge_title);
      const preview = referencedBadges.slice(0, 3).join(', ');
      const suffix =
        referencedBadges.length > 3
          ? ` and ${referencedBadges.length - 3} more`
          : '';

      throw new ConflictError(
        `Quest cannot be deleted because it is used by badge criteria: ${preview}${suffix}`,
      );
    }

    return this.questsRepo.deleteQuest(id);
  }

  async completeQuest(questId: string, subjectRef: string) {
    return this.questsRepo.withTransaction(async repo => {
      const quest = await repo.getQuestById(questId);
      if (!quest) throw new NotFoundError(`Quest '${questId}' not found`);

      await repo.lockSubjectQuest(subjectRef, questId);
      await this.enforceCompletionPolicy(repo, quest, subjectRef);

      return repo.incrementQuestProgress({
        quest_id: questId,
        subject_ref: subjectRef,
        by: 1,
      });
    });
  }

  /**
   * Throws ConflictError when the quest's completion policy blocks the subject
   * from making further progress.
   *
   *  - ONE_TIME:  blocks once completion_count has reached the target_count
   *               (i.e. XP was already awarded).
   *  - REPEATABLE with cooldown_days: blocks while the subject is still within
   *               the cooldown window after the last XP award.
   */
  private async enforceCompletionPolicy(
    questsRepo: QuestsRepository,
    quest: QuestRow,
    subjectRef: string,
  ): Promise<void> {
    if (quest.completion_policy === 'ONE_TIME') {
      const progress = await questsRepo.getProgressForSubjectQuest(
        subjectRef,
        quest.id,
      );
      if (progress && progress.completion_count >= quest.target_count) {
        throw new ConflictError(
          `Quest "${quest.title}" can only be completed once and has already been completed by this subject.`,
        );
      }
      return;
    }

    if (
      quest.completion_policy === 'REPEATABLE' &&
      quest.cooldown_days !== null
    ) {
      const lastAwardedAt = await questsRepo.getLastAwardedAt(
        subjectRef,
        quest.id,
      );
      if (lastAwardedAt) {
        const cooldownMs = quest.cooldown_days * 24 * 60 * 60 * 1000;
        const elapsed = Date.now() - lastAwardedAt.getTime();
        if (elapsed < cooldownMs) {
          const availableAt = new Date(
            lastAwardedAt.getTime() + cooldownMs,
          ).toISOString();
          throw new ConflictError(
            `Quest "${quest.title}" is on cooldown. Available again at ${availableAt}.`,
          );
        }
      }
    }
  }

  private ensureSubjectRefMatchesQuest(quest: QuestRow, subjectRef: string) {
    if (quest.subject_type === 'team' && !subjectRef.startsWith('group:')) {
      throw new InputError(
        'subjectRef must be a group entity ref for team quests',
      );
    }

    if (quest.subject_type === 'user' && !subjectRef.startsWith('user:')) {
      throw new InputError(
        'subjectRef must be a user entity ref for user quests',
      );
    }
  }

  private resolveTeamActorRef(actor: QuestEventActor): string {
    if (!actor.entityRef) {
      throw new InputError(
        'team quest events must provide actor.entityRef as a group entity ref',
      );
    }

    if (!actor.entityRef.startsWith('group:')) {
      throw new InputError(
        'team quest events must provide a group entity ref in actor.entityRef',
      );
    }

    return actor.entityRef;
  }

  private mergeActorResolutionProviders(
    defaults: ActorResolutionProviders,
    custom: ActorResolutionProviders,
  ): ActorResolutionProviders {
    const merged: ActorResolutionProviders = {};
    const providerNames = new Set([
      ...Object.keys(defaults),
      ...Object.keys(custom),
    ]);

    for (const providerName of providerNames) {
      const normalizedProviderName = providerName.toLocaleLowerCase('en-US');
      const defaultConfig =
        defaults[providerName] ?? defaults[normalizedProviderName];
      const customConfig =
        custom[providerName] ?? custom[normalizedProviderName];

      merged[normalizedProviderName] = {
        idAnnotations: [
          ...new Set([
            ...(defaultConfig?.idAnnotations ?? []),
            ...(customConfig?.idAnnotations ?? []),
          ]),
        ],
        loginAnnotations: [
          ...new Set([
            ...(defaultConfig?.loginAnnotations ?? []),
            ...(customConfig?.loginAnnotations ?? []),
          ]),
        ],
      };
    }

    return merged;
  }

  private async getFirstMatchingUserRef(
    token: string,
    filters: Record<string, string>[],
  ): Promise<string | undefined> {
    for (const filter of filters) {
      const res = await this.catalogClient.getEntities(
        {
          filter: [
            {
              kind: 'User',
              ...filter,
            },
          ],
        },
        { token },
      );

      const entity = res.items[0];
      if (entity) {
        return stringifyEntityRef(entity);
      }
    }

    return undefined;
  }

  async resolveActorToUserRef(params: {
    actor: QuestEventActor;
    credentials: QuestServiceOpts['credentials'];
  }): Promise<string> {
    const { actor, credentials } = params;

    if (actor.entityRef) return actor.entityRef;

    const { token } = await this.auth.getPluginRequestToken({
      onBehalfOf: credentials,
      targetPluginId: 'catalog',
    });

    if (actor.email) {
      const normalizedEmail = actor.email.trim().toLowerCase();
      const userRef =
        (await this.getFirstMatchingUserRef(token, [
          {
            'spec.profile.email': actor.email,
          },
        ])) ??
        (normalizedEmail === actor.email
          ? undefined
          : await this.getFirstMatchingUserRef(token, [
              {
                'spec.profile.email': normalizedEmail,
              },
            ]));

      if (!userRef) throw new NotFoundError('User not found in catalog');
      return userRef;
    }

    if (!actor.provider) {
      throw new InputError(
        'actor.provider is required when actor.entityRef is not provided',
      );
    }

    const providerConfig =
      this.actorResolutionProviders[actor.provider.toLocaleLowerCase('en-US')];

    if (actor.id && providerConfig?.idAnnotations?.length) {
      const userRef = await this.getFirstMatchingUserRef(
        token,
        providerConfig.idAnnotations.map(annotation => ({
          [annotation]: actor.id!,
        })),
      );
      if (userRef) {
        return userRef;
      }
    }

    if (actor.login && providerConfig?.loginAnnotations?.length) {
      const userRef = await this.getFirstMatchingUserRef(
        token,
        providerConfig.loginAnnotations.map(annotation => ({
          [annotation]: actor.login!,
        })),
      );
      if (userRef) {
        return userRef;
      }
    }

    throw new NotFoundError('Actor could not be mapped to a Backstage user');
  }

  async getQuestsWithProgress(
    userRef: string,
    ownershipRefs: string[],
    _opts: QuestServiceOpts,
    filters?: {
      searchTitle?: string;
      audience?: QuestAudienceFilter;
      status?: QuestStatusFilter;
      teamRef?: string;
      sortBy?: QuestSortField;
      order?: SortOrder;
      page?: number;
      limit?: number;
    },
  ) {
    return this.questsRepo.getQuestsWithProgress({
      user_ref: userRef,
      ownership_refs: ownershipRefs,
      searchTitle: filters?.searchTitle,
      audience: filters?.audience,
      status: filters?.status,
      team_ref: filters?.teamRef,
      sortBy: filters?.sortBy,
      order: filters?.order,
      page: filters?.page,
      limit: filters?.limit,
    });
  }

  async handleQuestEvent(params: {
    eventId: string;
    questId: string;
    subjectRef?: string;
    actor?: QuestEventActor;
    callerSubject: string;
    opts: QuestServiceOpts;
  }) {
    const { eventId, questId, subjectRef, actor, callerSubject, opts } = params;

    const quest = await this.questsRepo.getQuestById(questId);
    if (!quest) {
      throw new NotFoundError(`Quest '${questId}' not found`);
    }

    let resolvedSubjectRef: string;

    if (subjectRef) {
      resolvedSubjectRef = subjectRef;
    } else if (actor) {
      resolvedSubjectRef =
        quest.subject_type === 'team'
          ? this.resolveTeamActorRef(actor)
          : await this.resolveActorToUserRef({
              actor,
              credentials: opts.credentials,
            });
    } else {
      throw new InputError('Either subjectRef or actor is required');
    }

    this.ensureSubjectRefMatchesQuest(quest, resolvedSubjectRef);

    return this.questsRepo.withTransaction(async repo => {
      await repo.lockSubjectQuest(resolvedSubjectRef, questId);

      const insertedReceipt = await repo.tryInsertReceipt({
        event_id: eventId,
        event_key: `quest:${questId}`,
        subject_ref: resolvedSubjectRef,
        caller_subject: callerSubject,
      });

      if (!insertedReceipt) {
        return {
          duplicate: true,
          blocked: false,
          subjectRef: resolvedSubjectRef,
          questId,
        };
      }

      try {
        await this.enforceCompletionPolicy(repo, quest, resolvedSubjectRef);
      } catch (err: any) {
        if (err instanceof ConflictError) {
          return {
            duplicate: false,
            blocked: true,
            reason: err.message,
            subjectRef: resolvedSubjectRef,
            questId,
          };
        }
        throw err;
      }

      const progress = await repo.incrementQuestProgress({
        subject_ref: resolvedSubjectRef,
        quest_id: questId,
        by: 1,
      });

      return {
        duplicate: false,
        blocked: false,
        subjectRef: resolvedSubjectRef,
        questId,
        completionCount: progress.completion_count,
      };
    });
  }
}
