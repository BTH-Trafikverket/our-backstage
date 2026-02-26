import { QuestCreationInput } from '../schemas/quests/questCreationSchema';
import { QuestEditSchema } from '../schemas/quests/questEditSchema';
import { QuestsRepository } from '../repositories/questsRepository';
import { CatalogClient } from '@backstage/catalog-client';
import { AuthService } from '@backstage/backend-plugin-api';
import { InputError, NotFoundError } from '@backstage/errors';
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

  async createQuest(data: QuestCreationInput, _opts: QuestServiceOpts) {
    return this.questsRepo.createQuest({
      title: data.title,
      description: data.description,
      interval: data.interval,
      xp_reward: data.xp_reward,
    });
  }

  async getQuests(_opts: QuestServiceOpts) {
    return this.questsRepo.getQuests();
  }

  async getQuestById(id: string, _opts: QuestServiceOpts) {
    return this.questsRepo.getQuestById(id);
  }

  async editQuest(id: string, data: QuestEditSchema, _opts: QuestServiceOpts) {
    return this.questsRepo.editQuest(id, data);
  }

  async deleteQuest(id: string, _opts: QuestServiceOpts) {
    return this.questsRepo.deleteQuest(id);
  }

  async completeQuest(questId: string, userRef: string) {
    return this.questsRepo.incrementQuestProgress({
      quest_id: questId,
      user_ref: userRef,
      by: 1,
    });
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

  async getQuestsWithProgress(userRef: string, _opts: QuestServiceOpts) {
    return this.questsRepo.getQuestsWithProgress({ user_ref: userRef });
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

    const inserted = await this.questsRepo.tryInsertReceipt({
      event_id: eventId,
      event_key: eventKey,
      user_ref: userRef,
      caller_subject: callerSubject,
    });

    if (!inserted) {
      return {
        duplicate: true,
        userRef,
        questId: trigger.quest_id,
      };
    }

    const progress = await this.questsRepo.incrementQuestProgress({
      user_ref: userRef,
      quest_id: trigger.quest_id,
      by: trigger.increment_by,
    });

    return {
      duplicate: false,
      userRef,
      questId: trigger.quest_id,
      completionCount: progress.completion_count,
    };
  }
}
