import { QuestCreationInput } from '../schemas/schemaBarrel';
import { QuestsRepository } from '../repositories/questsRepository';

type CreateQuestOpts = {
  credentials: any;
};

export class QuestsService {
  private readonly questsRepo: QuestsRepository;

  constructor({ questsRepo }: { questsRepo: QuestsRepository }) {
    this.questsRepo = questsRepo;
  }

  async createQuest(data: QuestCreationInput, _opts: CreateQuestOpts) {
    const id = crypto.randomUUID();

    return this.questsRepo.createQuest({
      id,
      title: data.title,
      description: data.description,
      interval: data.interval,
      xp_reward: data.xp_reward,
    });
  }

  async getQuests(_opts: { credentials: any }) {
    return this.questsRepo.getQuests();
  }

  async getQuestById(id: string, _opts: { credentials: any }) {
    return this.questsRepo.getQuestById(id);
  }
}
