import { XpRepository } from '../repositories/xpRepository';

export type XpStatus = {
  subjectRef: string;
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
  constructor(private readonly repo: XpRepository) {}

  async getStatus(subjectRef: string): Promise<XpStatus> {
    const state = await this.repo.getSubjectState(subjectRef);
    const xpIntoLevel = state.total_xp - state.current_level_xp;
    const denom = state.next_level_xp - state.current_level_xp || 1;

    return {
      subjectRef,
      totalXp: state.total_xp,
      level: state.level,
      currentLevelXp: state.current_level_xp,
      nextLevelXp: state.next_level_xp,
      xpIntoLevel,
      xpToNextLevel: Math.max(0, state.next_level_xp - state.total_xp),
      progress: clamp01(xpIntoLevel / denom),
    };
  }
}
