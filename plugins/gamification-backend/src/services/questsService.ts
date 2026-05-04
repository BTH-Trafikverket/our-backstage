import {
  QuestCreationInput,
  QuestSubjectType,
} from '../schemas/quests/questCreationSchema';
import { QuestEditSchema } from '../schemas/quests/questEditSchema';
import { QuestsRepository } from '../repositories/questsRepository';
import { ReminderRepository } from '../repositories/reminderRepository';
import type {
  LinkedQuestConfig,
  QuestRow,
  QuestAudienceFilter,
  QuestStatusFilter,
  QuestSortField,
  SortOrder,
} from '../repositories/questsRepository';
import { CatalogClient } from '@backstage/catalog-client';
import { AuthService } from '@backstage/backend-plugin-api';
import { ConflictError, InputError, NotFoundError } from '@backstage/errors';
import { stringifyEntityRef, type Entity } from '@backstage/catalog-model';
import type { QuestEventActor } from '../schemas/quests/questEventSchema';
import {
  getCatalogRule,
  getCatalogRuleFromConfig,
  type CatalogRule,
} from './catalogRules';
import { CatalogService } from './catalogService';

type QuestServiceOpts = {
  credentials: any;
};

export type CatalogLinkedQuestRunResult = {
  teamRef: string;
  evaluatedQuests: number;
  skippedQuests: number;
  matchedEntities: number;
  triggeredEvents: number;
  duplicateEvents: number;
  blockedEvents: number;
  unknownEvaluations: number;
  unknownCatalogFetches: number;
  unknownMissingEntities: number;
  unknownRuleErrors: number;
};

export type CatalogLinkedQuestRunAllResult = {
  teamRefs: string[];
  results: CatalogLinkedQuestRunResult[];
  totals: Omit<CatalogLinkedQuestRunResult, 'teamRef'>;
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
  private readonly reminderRepo?: ReminderRepository;
  private readonly catalogService?: CatalogService;
  private readonly catalogClient: CatalogClient;
  private readonly auth: AuthService;
  private readonly actorResolutionProviders: ActorResolutionProviders;

  constructor(opts: {
    questsRepo: QuestsRepository;
    reminderRepo?: ReminderRepository;
    catalogService?: CatalogService;
    catalogClient: CatalogClient;
    auth: AuthService;
    actorResolutionProviders?: ActorResolutionProviders;
  }) {
    this.questsRepo = opts.questsRepo;
    this.reminderRepo = opts.reminderRepo;
    this.catalogService = opts.catalogService;
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

  private getReminderConfig(quest: QuestRow) {
    const linkedConfig = (quest.linked_config ?? {}) as LinkedQuestConfig;
    const reminder = linkedConfig.reminder;

    if (!reminder) {
      return undefined;
    }

    if (!reminder.description?.trim()) {
      return undefined;
    }

    if (!Number.isFinite(reminder.day) || reminder.day < 1) {
      return undefined;
    }

    return {
      description: reminder.description.trim(),
      day: Math.floor(reminder.day),
    };
  }

  private async getCatalogToken(credentials: QuestServiceOpts['credentials']) {
    return this.auth.getPluginRequestToken({
      onBehalfOf: credentials,
      targetPluginId: 'catalog',
    });
  }

  private async listAudienceSubjectRefs(params: {
    subjectType: QuestSubjectType;
    credentials: QuestServiceOpts['credentials'];
  }): Promise<string[]> {
    const { token } = await this.getCatalogToken(params.credentials);
    const kind = params.subjectType === 'team' ? 'Group' : 'User';
    const res = await this.catalogClient.getEntities(
      {
        filter: [{ kind }],
      },
      { token },
    );

    const refs = (res.items ?? [])
      .map(entity => stringifyEntityRef(entity))
      .filter(Boolean);

    return [...new Set(refs)];
  }

  private async syncQuestRemindersForAudience(params: {
    quest: QuestRow;
    credentials: QuestServiceOpts['credentials'];
  }): Promise<void> {
    if (!this.reminderRepo) {
      return;
    }

    const reminderConfig = this.getReminderConfig(params.quest);

    await this.reminderRepo.updateReminderStatusForQuest({
      questId: params.quest.id,
      status: 'disabled',
      ruleKind: 'event_driven',
    });

    if (!reminderConfig) {
      return;
    }

    const subjectRefs = await this.listAudienceSubjectRefs({
      subjectType: params.quest.subject_type,
      credentials: params.credentials,
    });

    for (const subjectRef of subjectRefs) {
      await this.reminderRepo.createOrRefreshReminder({
        questId: params.quest.id,
        targetSubjectRef: subjectRef,
        targetSubjectType: params.quest.subject_type,
        ruleKey: `event-reminder-${reminderConfig.day}d`,
        ruleKind: 'event_driven',
        reasonPayload: {
          description: reminderConfig.description,
          day: reminderConfig.day,
          source: 'quest_definition',
          questId: params.quest.id,
          questTitle: params.quest.title,
        },
      });
    }
  }

  async createQuest(data: QuestCreationInput, opts: QuestServiceOpts) {
    const policy = data.completion_policy ?? 'REPEATABLE';
    const target_count = data.target_count;
    const cooldown = policy === 'ONE_TIME' ? null : data.cooldown_days ?? null;

    const quest = await this.questsRepo.createQuest({
      title: data.title,
      description: data.description,
      target_count,
      xp_reward: data.xp_reward,
      subject_type: this.normalizeQuestSubjectType(data.subject_type),
      completion_policy: policy,
      cooldown_days: cooldown,
      quest_mode: data.quest_mode,
      linked_config: data.linked_config,
    });

    await this.syncQuestRemindersForAudience({
      quest,
      credentials: opts.credentials,
    });

    return quest;
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

  async editQuest(id: string, data: QuestEditSchema, opts: QuestServiceOpts) {
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

    const updated = await this.questsRepo.editQuest(id, {
      ...data,
      subject_type: this.normalizeQuestSubjectType(
        data.subject_type ?? current.subject_type,
      ),
      completion_policy: completionPolicy,
      target_count,
      cooldown_days: cooldown,
      quest_mode: data.quest_mode ?? current.quest_mode,
      linked_config: data.linked_config ?? current.linked_config,
    });

    if (updated) {
      await this.syncQuestRemindersForAudience({
        quest: updated,
        credentials: opts.credentials,
      });
    }

    return updated;
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

  async runCatalogLinkedQuestsForTeam(
    teamRef: string,
    opts: QuestServiceOpts,
  ): Promise<CatalogLinkedQuestRunResult> {
    if (!teamRef.startsWith('group:')) {
      throw new InputError('teamRef must be a group entity ref');
    }

    if (!this.catalogService) {
      throw new InputError('Catalog runner is not configured');
    }

    const catalogQuests: QuestRow[] = [];
    let page = 1;
    let hasMorePages = true;

    while (hasMorePages) {
      const pageResult = await this.questsRepo.getQuests({
        audience: 'team',
        includeArchived: false,
        page,
        limit: 100,
      });

      catalogQuests.push(
        ...pageResult.data.filter(
          quest =>
            quest.quest_mode === 'catalog' &&
            Boolean(
              quest.linked_config?.catalog_rule ||
                quest.linked_config?.catalog_condition,
            ),
        ),
      );

      hasMorePages =
        pageResult.pagination.totalPages > 0 &&
        page < pageResult.pagination.totalPages;

      if (hasMorePages) {
        page += 1;
      }
    }

    let skippedQuests = 0;
    let matchedEntities = 0;
    let triggeredEvents = 0;
    let duplicateEvents = 0;
    let blockedEvents = 0;
    let unknownEvaluations = 0;
    let unknownCatalogFetches = 0;
    let unknownMissingEntities = 0;
    let unknownRuleErrors = 0;

    let teamOwnedEntities: Entity[] | undefined;
    let teamEntitiesUnavailable = false;

    try {
      teamOwnedEntities = await this.catalogService.getTeamOwnedEntities(
        teamRef,
        opts.credentials,
      );
    } catch {
      teamEntitiesUnavailable = true;
      unknownCatalogFetches = catalogQuests.length;
    }

    for (const quest of catalogQuests) {
      const resolved = this.resolveCatalogRuleForQuest(quest);
      if (!resolved) {
        skippedQuests += 1;
        continue;
      }

      if (teamEntitiesUnavailable || !teamOwnedEntities) {
        unknownEvaluations += 1;
        continue;
      }

      const evaluations = this.catalogService.evaluateRuleAgainstEntities(
        teamOwnedEntities,
        resolved.rule,
      );
      const passingEntities = evaluations.filter(
        result => result.status === 'pass',
      );
      const unknownResults = evaluations.filter(
        result => result.status === 'unknown',
      );
      unknownEvaluations += unknownResults.length;
      unknownMissingEntities += unknownResults.filter(
        result => result.unknownReason === 'missing_or_deleted_entity',
      ).length;
      unknownRuleErrors += unknownResults.filter(
        result => result.unknownReason === 'rule_evaluation_error',
      ).length;

      matchedEntities += passingEntities.length;

      const shouldCompleteOnAllClear =
        resolved.ruleKey.startsWith('missing_') ||
        resolved.ruleKey.startsWith('required_annotation:');

      if (shouldCompleteOnAllClear) {
        if (unknownResults.length > 0 || passingEntities.length > 0) {
          continue;
        }

        const result = await this.handleQuestEvent({
          eventId: `catalog:${quest.id}:${teamRef}:${resolved.ruleKey}:all-clear`,
          questId: quest.id,
          subjectRef: teamRef,
          callerSubject: 'internal:catalog-linked-runner',
          opts,
        });

        triggeredEvents += 1;

        if (result.duplicate) {
          duplicateEvents += 1;
        }
        if (result.blocked) {
          blockedEvents += 1;
        }

        continue;
      }

      for (const match of passingEntities) {
        const result = await this.handleQuestEvent({
          eventId: `catalog:${quest.id}:${teamRef}:${resolved.ruleKey}:${match.entityRef}`,
          questId: quest.id,
          subjectRef: teamRef,
          callerSubject: 'internal:catalog-linked-runner',
          opts,
        });

        triggeredEvents += 1;

        if (result.duplicate) {
          duplicateEvents += 1;
        }
        if (result.blocked) {
          blockedEvents += 1;
        }
      }
    }

    return {
      teamRef,
      evaluatedQuests: catalogQuests.length,
      skippedQuests,
      matchedEntities,
      triggeredEvents,
      duplicateEvents,
      blockedEvents,
      unknownEvaluations,
      unknownCatalogFetches,
      unknownMissingEntities,
      unknownRuleErrors,
    };
  }

  async runCatalogLinkedQuestsForAllTeams(
    opts: QuestServiceOpts,
  ): Promise<CatalogLinkedQuestRunAllResult> {
    const teamRefs = await this.listAudienceSubjectRefs({
      subjectType: 'team',
      credentials: opts.credentials,
    });
    const results: CatalogLinkedQuestRunResult[] = [];

    for (const teamRef of teamRefs) {
      results.push(await this.runCatalogLinkedQuestsForTeam(teamRef, opts));
    }

    const totals = results.reduce<Omit<CatalogLinkedQuestRunResult, 'teamRef'>>(
      (acc, result) => ({
        evaluatedQuests: acc.evaluatedQuests + result.evaluatedQuests,
        skippedQuests: acc.skippedQuests + result.skippedQuests,
        matchedEntities: acc.matchedEntities + result.matchedEntities,
        triggeredEvents: acc.triggeredEvents + result.triggeredEvents,
        duplicateEvents: acc.duplicateEvents + result.duplicateEvents,
        blockedEvents: acc.blockedEvents + result.blockedEvents,
        unknownEvaluations: acc.unknownEvaluations + result.unknownEvaluations,
        unknownCatalogFetches:
          acc.unknownCatalogFetches + result.unknownCatalogFetches,
        unknownMissingEntities:
          acc.unknownMissingEntities + result.unknownMissingEntities,
        unknownRuleErrors: acc.unknownRuleErrors + result.unknownRuleErrors,
      }),
      {
        evaluatedQuests: 0,
        skippedQuests: 0,
        matchedEntities: 0,
        triggeredEvents: 0,
        duplicateEvents: 0,
        blockedEvents: 0,
        unknownEvaluations: 0,
        unknownCatalogFetches: 0,
        unknownMissingEntities: 0,
        unknownRuleErrors: 0,
      },
    );

    return {
      teamRefs,
      results,
      totals,
    };
  }

  private resolveCatalogRuleForQuest(
    quest: QuestRow,
  ): { ruleKey: string; rule: CatalogRule } | undefined {
    const config = quest.linked_config;
    if (!config) {
      return undefined;
    }

    if (config.catalog_rule) {
      const rule = getCatalogRuleFromConfig(config.catalog_rule);
      if (!rule) {
        return undefined;
      }

      return {
        ruleKey: rule.id,
        rule,
      };
    }

    if (config.catalog_condition) {
      const rule = getCatalogRule(config.catalog_condition);
      if (!rule) {
        return undefined;
      }

      return {
        ruleKey: config.catalog_condition,
        rule,
      };
    }

    return undefined;
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

      const reminderConfig = this.getReminderConfig(quest);
      if (reminderConfig && this.reminderRepo) {
        await this.reminderRepo.createOrRefreshReminder({
          questId,
          targetSubjectRef: resolvedSubjectRef,
          targetSubjectType: quest.subject_type,
          ruleKey: `event-reminder-${reminderConfig.day}d`,
          ruleKind: 'event_driven',
          reasonPayload: {
            description: reminderConfig.description,
            day: reminderConfig.day,
            source: 'quest_event',
            questId,
            questTitle: quest.title,
          },
        });
      }

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
