import {
  QuestCreationInput,
  QuestSubjectType,
} from '../schemas/quests/questCreationSchema';
import { QuestEditSchema } from '../schemas/quests/questEditSchema';
import { QuestsRepository } from '../repositories/questsRepository';
import type { QuestRow } from '../repositories/questsRepository';
import { CatalogClient } from '@backstage/catalog-client';
import { AuthService } from '@backstage/backend-plugin-api';
import { ConflictError, InputError, NotFoundError } from '@backstage/errors';
import { stringifyEntityRef } from '@backstage/catalog-model';
import type { QuestEventActor } from '../schemas/quests/questEventSchema';

type QuestServiceOpts = {
  credentials: any;
};

export class QuestsService {
  private readonly questsRepo: QuestsRepository;
  private readonly catalogClient: CatalogClient;
  private readonly auth: AuthService;

  constructor(opts: {
    questsRepo: QuestsRepository;
    catalogClient: CatalogClient;
    auth: AuthService;
  }) {
    this.questsRepo = opts.questsRepo;
    this.catalogClient = opts.catalogClient;
    this.auth = opts.auth;
  }

  private normalizeQuestTarget(
    subjectType: QuestSubjectType,
    subjectRef: string | null | undefined,
  ) {
    if (subjectType === 'user') {
      return {
        subject_type: 'user' as const,
        subject_ref: null,
      };
    }

    if (!subjectRef) {
      throw new InputError('subject_ref is required for team quests');
    }

    if (!subjectRef.startsWith('group:')) {
      throw new InputError(
        'subject_ref for team quests must be a group entity ref',
      );
    }

    return {
      subject_type: 'team' as const,
      subject_ref: subjectRef,
    };
  }

  async createQuest(data: QuestCreationInput, _opts: QuestServiceOpts) {
    const policy = data.completion_policy ?? 'REPEATABLE';
    const interval = policy === 'ONE_TIME' ? 1 : data.interval;
    const cooldown = policy === 'ONE_TIME' ? null : data.cooldown_days ?? null;
    const target = this.normalizeQuestTarget(
      data.subject_type ?? 'user',
      data.subject_ref,
    );

    return this.questsRepo.createQuest({
      title: data.title,
      description: data.description,
      interval,
      xp_reward: data.xp_reward,
      subject_type: target.subject_type,
      subject_ref: target.subject_ref,
      completion_policy: policy,
      cooldown_days: cooldown,
    });
  }

  async getQuests(searchTitle?: string, _opts?: QuestServiceOpts) {
    return this.questsRepo.getQuests(searchTitle);
  }

  async getQuestById(id: string, _opts: QuestServiceOpts) {
    return this.questsRepo.getQuestById(id);
  }

  async editQuest(id: string, data: QuestEditSchema, _opts: QuestServiceOpts) {
    const current = await this.questsRepo.getQuestById(id);
    if (!current) {
      return undefined;
    }

    const subjectType = data.subject_type ?? current.subject_type;
    const subjectRef =
      data.subject_ref !== undefined ? data.subject_ref : current.subject_ref;
    const target = this.normalizeQuestTarget(subjectType, subjectRef);

    const completionPolicy =
      data.completion_policy ?? current.completion_policy;
    const interval =
      completionPolicy === 'ONE_TIME' ? 1 : data.interval ?? current.interval;
    const cooldown =
      completionPolicy === 'ONE_TIME'
        ? null
        : data.cooldown_days !== undefined
        ? data.cooldown_days
        : current.cooldown_days;

    return this.questsRepo.editQuest(id, {
      ...data,
      subject_type: target.subject_type,
      subject_ref: target.subject_ref,
      completion_policy: completionPolicy,
      interval,
      cooldown_days: cooldown,
    });
  }

  async deleteQuest(id: string, _opts: QuestServiceOpts) {
    return this.questsRepo.deleteQuest(id);
  }

  async completeQuest(questId: string, subjectRef: string) {
    const quest = await this.questsRepo.getQuestById(questId);
    if (!quest) throw new NotFoundError(`Quest '${questId}' not found`);
    await this.enforceCompletionPolicy(quest, subjectRef);
    return this.questsRepo.incrementQuestProgress({
      quest_id: questId,
      subject_ref: subjectRef,
      by: 1,
    });
  }

  /**
   * Throws ConflictError when the quest's completion policy blocks the user
   * from making further progress.
   *
   *  - ONE_TIME:  blocks once completion_count has reached the interval
   *               (i.e. XP was already awarded).
   *  - REPEATABLE with cooldown_days: blocks while the user is still within
   *               the cooldown window after the last XP award.
   */
  private async enforceCompletionPolicy(
    quest: QuestRow,
    subjectRef: string,
  ): Promise<void> {
    if (quest.completion_policy === 'ONE_TIME') {
      const progress = await this.questsRepo.getProgressForSubjectQuest(
        subjectRef,
        quest.id,
      );
      if (progress && progress.completion_count >= quest.interval) {
        throw new ConflictError(
          `Quest "${quest.title}" can only be completed once and has already been completed by this user.`,
        );
      }
      return;
    }

    if (
      quest.completion_policy === 'REPEATABLE' &&
      quest.cooldown_days !== null
    ) {
      const lastAwardedAt = await this.questsRepo.getLastAwardedAt(
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

  async resolveActorToUserRef(params: {
    actor: QuestEventActor;
    credentials: QuestServiceOpts['credentials'];
  }): Promise<string> {
    const { actor, credentials } = params;

    if (actor.entityRef) return actor.entityRef;

    if (!actor.provider) {
      throw new InputError(
        'actor.provider is required when actor.entityRef is not provided',
      );
    }

    const { token } = await this.auth.getPluginRequestToken({
      onBehalfOf: credentials,
      targetPluginId: 'catalog',
    });

    if (actor.provider === 'github' && actor.id) {
      const res = await this.catalogClient.getEntities(
        {
          filter: [
            {
              kind: 'User',
              'metadata.annotations.github.com/user-id': actor.id,
            },
          ],
        },
        { token },
      );

      const entity = res.items[0];
      if (!entity) throw new NotFoundError('User not found in catalog');
      return stringifyEntityRef(entity);
    }

    if (actor.provider === 'github' && actor.login) {
      const res = await this.catalogClient.getEntities(
        {
          filter: [
            {
              kind: 'User',
              'metadata.annotations.github.com/user-login': actor.login,
            },
          ],
        },
        { token },
      );

      const entity = res.items[0];
      if (!entity) throw new NotFoundError('User not found in catalog');
      return stringifyEntityRef(entity);
    }

    throw new NotFoundError('Actor could not be mapped to a Backstage user');
  }

  async getQuestsWithProgress(
    userRef: string,
    ownershipEntityRefs: string[],
    _opts: QuestServiceOpts,
    searchTitle?: string,
  ) {
    const teamRefs = ownershipEntityRefs.filter(
      ref => ref !== userRef && ref.startsWith('group:'),
    );

    return this.questsRepo.getQuestsWithProgress({
      userRef,
      teamRefs,
      searchTitle,
    });
  }

  async handleQuestEvent(params: {
    eventId: string;
    eventKey: string;
    actor: QuestEventActor;
    callerSubject: string;
    opts: QuestServiceOpts;
  }) {
    const { eventId, eventKey, actor, callerSubject, opts } = params;

    const userRef = await this.resolveActorToUserRef({
      actor,
      credentials: opts.credentials,
    });

    const trigger = await this.questsRepo.getTriggerByEvent(eventKey);
    if (!trigger) {
      throw new NotFoundError(`No trigger found for eventKey '${eventKey}'`);
    }

    const quest = await this.questsRepo.getQuestById(trigger.quest_id);
    if (!quest) {
      throw new NotFoundError(`Quest '${trigger.quest_id}' not found`);
    }

    const subjectRef =
      quest.subject_type === 'team' ? quest.subject_ref ?? userRef : userRef;

    const inserted = await this.questsRepo.tryInsertReceipt({
      event_id: eventId,
      event_key: eventKey,
      subject_ref: subjectRef,
      caller_subject: callerSubject,
    });

    if (!inserted) {
      return {
        duplicate: true,
        userRef,
        subjectRef,
        questId: trigger.quest_id,
      };
    }

    await this.enforceCompletionPolicy(quest, subjectRef);

    const progress = await this.questsRepo.incrementQuestProgress({
      subject_ref: subjectRef,
      quest_id: trigger.quest_id,
      by: trigger.increment_by,
    });

    return {
      duplicate: false,
      userRef,
      subjectRef,
      questId: trigger.quest_id,
      completionCount: progress.completion_count,
    };
  }
}
