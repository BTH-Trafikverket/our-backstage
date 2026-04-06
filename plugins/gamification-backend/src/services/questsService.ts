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
import { parseEntityRef, stringifyEntityRef } from '@backstage/catalog-model';
import type { QuestEventActor } from '../schemas/quests/questEventSchema';
import type { EarnedBadgeForQuestRow } from '../repositories/questsRepository';
import type { WebhookDispatchEvent, WebhookService } from './webhookService';

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

export type GithubCatalogUser = {
  entityRef: string;
  displayName: string;
  githubLogin: string;
  githubId?: string;
  email?: string;
  picture?: string;
};

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
  private readonly webhookService?: WebhookService;

  constructor(opts: {
    questsRepo: QuestsRepository;
    catalogClient: CatalogClient;
    auth: AuthService;
    actorResolutionProviders?: ActorResolutionProviders;
    webhookService?: WebhookService;
  }) {
    this.questsRepo = opts.questsRepo;
    this.catalogClient = opts.catalogClient;
    this.auth = opts.auth;
    this.actorResolutionProviders = this.mergeActorResolutionProviders(
      DEFAULT_ACTOR_RESOLUTION_PROVIDERS,
      opts.actorResolutionProviders ?? {},
    );
    this.webhookService = opts.webhookService;
  }

  private normalizeQuestSubjectType(subjectType: QuestSubjectType | undefined) {
    return subjectType ?? ('user' as const);
  }

  private async getCatalogToken(credentials: QuestServiceOpts['credentials']) {
    return this.auth.getPluginRequestToken({
      onBehalfOf: credentials,
      targetPluginId: 'catalog',
    });
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

  async listGithubUsers(params: {
    credentials: QuestServiceOpts['credentials'];
  }): Promise<GithubCatalogUser[]> {
    const { token } = await this.getCatalogToken(params.credentials);
    const res = await this.catalogClient.getEntities(
      {
        filter: [{ kind: 'User' }],
      },
      { token },
    );

    const users: GithubCatalogUser[] = [];

    for (const entity of res.items ?? []) {
      const annotations = entity.metadata.annotations ?? {};
      const profile = (
        entity.spec as
          | {
              profile?: {
                displayName?: string;
                email?: string;
                picture?: string;
              };
            }
          | undefined
      )?.profile;
      const githubLogin = annotations['github.com/user-login']?.trim();
      const githubId = annotations['github.com/user-id']?.trim();

      if (!githubLogin && !githubId) {
        continue;
      }

      const displayName =
        profile?.displayName?.trim() ||
        entity.metadata.title?.trim() ||
        profile?.email?.trim() ||
        entity.metadata.name;

      users.push({
        entityRef: stringifyEntityRef(entity),
        displayName,
        githubLogin: githubLogin || entity.metadata.name,
        githubId: githubId || undefined,
        email: profile?.email || undefined,
        picture: profile?.picture || undefined,
      });
    }

    return users.sort((left, right) =>
      `${left.displayName} ${left.githubLogin}`.localeCompare(
        `${right.displayName} ${right.githubLogin}`,
        'en-US',
        { sensitivity: 'base' },
      ),
    );
  }

  async resolveActorToUserRef(params: {
    actor: QuestEventActor;
    credentials: QuestServiceOpts['credentials'];
  }): Promise<string> {
    const { actor, credentials } = params;

    if (actor.entityRef) return actor.entityRef;

    const { token } = await this.getCatalogToken(credentials);

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

  private getSubjectIdentity(subjectRef: string) {
    try {
      const parsed = parseEntityRef(subjectRef);
      return {
        kind: parsed.kind.toLocaleLowerCase('en-US'),
        namespace: parsed.namespace.toLocaleLowerCase('en-US'),
        name: parsed.name,
      };
    } catch {
      return {
        kind: 'entity',
        namespace: 'default',
        name: subjectRef,
      };
    }
  }

  private buildBaseWebhookContext(params: {
    eventName: WebhookDispatchEvent['name'];
    quest: QuestRow;
    subjectRef: string;
    actor?: QuestEventActor;
    completionCount: number;
    totalXpBefore: number;
    totalXpAfter: number;
  }) {
    const {
      eventName,
      quest,
      subjectRef,
      actor,
      completionCount,
      totalXpBefore,
      totalXpAfter,
    } = params;
    const subject = this.getSubjectIdentity(subjectRef);
    const xpGained = Math.max(0, totalXpAfter - totalXpBefore);

    return {
      event: {
        name: eventName,
      },
      subject: {
        ref: subjectRef,
        type: quest.subject_type,
        kind: subject.kind,
        namespace: subject.namespace,
        name: subject.name,
        displayName: subject.name,
      },
      actor: actor ?? null,
      quest: {
        id: quest.id,
        title: quest.title,
        description: quest.description,
        targetCount: quest.target_count,
        xpReward: quest.xp_reward,
        subjectType: quest.subject_type,
        completionPolicy: quest.completion_policy,
        cooldownDays: quest.cooldown_days,
      },
      completion: {
        count: completionCount,
        milestoneCount: Math.floor(completionCount / quest.target_count),
      },
      xp: {
        previousTotal: totalXpBefore,
        total: totalXpAfter,
        gained: xpGained,
      },
      subject_ref: subjectRef,
      subject_type: quest.subject_type,
      subject_kind: subject.kind,
      subject_namespace: subject.namespace,
      subject_name: subject.name,
      subject_display_name: subject.name,
      username: quest.subject_type === 'user' ? subject.name : undefined,
      quest_id: quest.id,
      quest_title: quest.title,
      quest_description: quest.description,
      quest_target_count: quest.target_count,
      quest_subject_type: quest.subject_type,
      completion_count: completionCount,
      completed_milestone: Math.floor(completionCount / quest.target_count),
      previous_total_xp: totalXpBefore,
      total_xp: totalXpAfter,
      xp_gained: xpGained,
    };
  }

  private buildWebhookEvents(params: {
    quest: QuestRow;
    subjectRef: string;
    actor?: QuestEventActor;
    previousCompletionCount: number;
    completionCount: number;
    totalXpBefore: number;
    totalXpAfter: number;
    earnedBadgesBefore: EarnedBadgeForQuestRow[];
    earnedBadgesAfter: EarnedBadgeForQuestRow[];
  }): WebhookDispatchEvent[] {
    const {
      quest,
      subjectRef,
      actor,
      previousCompletionCount,
      completionCount,
      totalXpBefore,
      totalXpAfter,
      earnedBadgesBefore,
      earnedBadgesAfter,
    } = params;

    const events: WebhookDispatchEvent[] = [];
    const previousMilestone = Math.floor(
      previousCompletionCount / quest.target_count,
    );
    const currentMilestone = Math.floor(completionCount / quest.target_count);

    if (currentMilestone > previousMilestone) {
      const baseContext = this.buildBaseWebhookContext({
        eventName: 'quest.completed',
        quest,
        subjectRef,
        actor,
        completionCount,
        totalXpBefore,
        totalXpAfter,
      });

      events.push({
        name: 'quest.completed',
        context: {
          ...baseContext,
          xp_reward: quest.xp_reward,
        },
      });
    }

    const earnedBeforeIds = new Set(earnedBadgesBefore.map(badge => badge.id));
    const newlyEarnedBadges = earnedBadgesAfter.filter(
      badge => !earnedBeforeIds.has(badge.id),
    );

    for (const badge of newlyEarnedBadges) {
      const baseContext = this.buildBaseWebhookContext({
        eventName: 'badge.earned',
        quest,
        subjectRef,
        actor,
        completionCount,
        totalXpBefore,
        totalXpAfter,
      });

      events.push({
        name: 'badge.earned',
        context: {
          ...baseContext,
          badge: {
            id: badge.id,
            title: badge.title,
            description: badge.description,
            xpReward: badge.xp_reward,
            subjectType: badge.subject_type,
            earnedAt: badge.earned_at.toISOString(),
          },
          badge_id: badge.id,
          badge_title: badge.title,
          badge_description: badge.description,
          badge_xp_reward: badge.xp_reward,
          earned_at: badge.earned_at.toISOString(),
          xp_reward: badge.xp_reward,
        },
      });
    }

    return events;
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

    const transactionResult = await this.questsRepo.withTransaction(
      async repo => {
        await repo.lockSubjectQuest(resolvedSubjectRef, questId);

        const insertedReceipt = await repo.tryInsertReceipt({
          event_id: eventId,
          event_key: `quest:${questId}`,
          subject_ref: resolvedSubjectRef,
          caller_subject: callerSubject,
        });

        if (!insertedReceipt) {
          return {
            response: {
              duplicate: true,
              blocked: false,
              subjectRef: resolvedSubjectRef,
              questId,
            },
            webhookEvents: [] as WebhookDispatchEvent[],
          };
        }

        try {
          await this.enforceCompletionPolicy(repo, quest, resolvedSubjectRef);
        } catch (err: any) {
          if (err instanceof ConflictError) {
            return {
              response: {
                duplicate: false,
                blocked: true,
                reason: err.message,
                subjectRef: resolvedSubjectRef,
                questId,
              },
              webhookEvents: [] as WebhookDispatchEvent[],
            };
          }
          throw err;
        }

        const previousProgress = await repo.getProgressForSubjectQuest(
          resolvedSubjectRef,
          questId,
        );
        const totalXpBefore = await repo.getTotalXpForSubject(
          resolvedSubjectRef,
        );
        const earnedBadgesBefore = await repo.getEarnedBadgesForSubjectByQuest(
          resolvedSubjectRef,
          questId,
        );
        const progress = await repo.incrementQuestProgress({
          subject_ref: resolvedSubjectRef,
          quest_id: questId,
          by: 1,
        });
        const totalXpAfter = await repo.getTotalXpForSubject(
          resolvedSubjectRef,
        );
        const earnedBadgesAfter = await repo.getEarnedBadgesForSubjectByQuest(
          resolvedSubjectRef,
          questId,
        );

        return {
          response: {
            duplicate: false,
            blocked: false,
            subjectRef: resolvedSubjectRef,
            questId,
            completionCount: progress.completion_count,
          },
          webhookEvents: this.buildWebhookEvents({
            quest,
            subjectRef: resolvedSubjectRef,
            actor,
            previousCompletionCount: previousProgress?.completion_count ?? 0,
            completionCount: progress.completion_count,
            totalXpBefore,
            totalXpAfter,
            earnedBadgesBefore,
            earnedBadgesAfter,
          }),
        };
      },
    );

    if (transactionResult.webhookEvents.length > 0) {
      await this.webhookService?.dispatchEvents(
        transactionResult.webhookEvents,
      );
    }

    return transactionResult.response;
  }
}
