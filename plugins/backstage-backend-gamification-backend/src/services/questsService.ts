import { QuestCreationInput } from '../schemas/quests/questCreationSchema';
import { QuestEditSchema } from '../schemas/quests/questEditSchema';

import { QuestsRepository } from '../repositories/questsRepository';

type QuestServiceOpts = {
  credentials: any;
};

export class QuestsService {
  private readonly questsRepo: QuestsRepository;

  constructor({ questsRepo }: { questsRepo: QuestsRepository }) {
    this.questsRepo = questsRepo;
  }

  async createQuest(data: QuestCreationInput, _opts: QuestServiceOpts) {
    const id = crypto.randomUUID();

    return this.questsRepo.createQuest({
      id,
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
    return this.questsRepo.completeQuestProgress({
      quest_id: questId,
      user_ref: userRef,
    });
  }
}
