import { XpRepository } from '../repositories/xpRepository';

export type XpStatus = {
  userRef: string;
  totalXp: number;

  level: number;
  currentLevelXp: number;
  nextLevelXp: number;

  xpIntoLevel: number;
  xpToNextLevel: number;

  progress: number;
};

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

export class XpService {
  constructor(
    private readonly repo: XpRepository,
    private readonly baseXp: number = 100,
  ) {}

  private xpToReachLevel(level: number): number {
    return this.baseXp * Math.pow(level - 1, 2);
  }

  private compute(totalXp: number) {
    const level = Math.floor(Math.sqrt(totalXp / this.baseXp)) + 1;
    const currentLevelXp = this.xpToReachLevel(level);
    const nextLevelXp = this.xpToReachLevel(level + 1);

    const xpIntoLevel = totalXp - currentLevelXp;
    const denom = nextLevelXp - currentLevelXp || 1;

    return {
      level,
      currentLevelXp,
      nextLevelXp,
      xpIntoLevel,
      xpToNextLevel: Math.max(0, nextLevelXp - totalXp),
      progress: clamp01(xpIntoLevel / denom),
    };
  }

  async getStatus(userRef: string): Promise<XpStatus> {
    const totalXp = await this.repo.getTotalXp(userRef);
    return { userRef, totalXp, ...this.compute(totalXp) };
  }
}
