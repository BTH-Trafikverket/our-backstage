import type { LoggerService } from '@backstage/backend-plugin-api';
import type { ReminderReasonPayload } from '../repositories/reminderRepository';
import { ReminderRepository } from '../repositories/reminderRepository';
import type { QuestRow } from '../repositories/questsRepository';
import { QuestsRepository } from '../repositories/questsRepository';

export type ReminderActivitySource = 'quest_event_receipts';

export type ReminderEvaluationRule = {
  key: string;
  questId: string;
  inactivityDays: number;
  activityDescription: string;
  activitySource?: ReminderActivitySource | string;
};

export type ReminderRuleEvaluationResult = {
  ruleKey: string;
  questId: string;
  createdCount: number;
  refreshedCount: number;
  suppressedCount: number;
  skippedReason?:
    | 'missing_quest'
    | 'unsupported_subject_type'
    | 'unsupported_activity_source';
};

export type ReminderEvaluationSummary = {
  createdCount: number;
  refreshedCount: number;
  suppressedCount: number;
  skippedRuleCount: number;
  ruleResults: ReminderRuleEvaluationResult[];
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const NUMBER_WORDS: Record<number, string> = {
  1: 'one',
  2: 'two',
  3: 'three',
  4: 'four',
  5: 'five',
  6: 'six',
  7: 'seven',
  8: 'eight',
  9: 'nine',
  10: 'ten',
  11: 'eleven',
  12: 'twelve',
};

function toWordOrNumber(value: number): string {
  return NUMBER_WORDS[value] ?? String(value);
}

function describeInactivityWindow(inactivityDays: number): string {
  if (inactivityDays > 0 && inactivityDays % 7 === 0) {
    const weeks = inactivityDays / 7;
    return `${toWordOrNumber(weeks)} week${weeks === 1 ? '' : 's'}`;
  }

  return `${toWordOrNumber(inactivityDays)} day${
    inactivityDays === 1 ? '' : 's'
  }`;
}

export class ReminderEvaluationService {
  private readonly questsRepo: QuestsRepository;
  private readonly reminderRepo: ReminderRepository;
  private readonly rules: ReminderEvaluationRule[];
  private readonly logger: LoggerService;
  private readonly now: () => Date;

  constructor(options: {
    questsRepo: QuestsRepository;
    reminderRepo: ReminderRepository;
    rules: ReminderEvaluationRule[];
    logger: LoggerService;
    now?: () => Date;
  }) {
    this.questsRepo = options.questsRepo;
    this.reminderRepo = options.reminderRepo;
    this.rules = options.rules;
    this.logger = options.logger;
    this.now = options.now ?? (() => new Date());
  }

  async evaluateConfiguredRules(): Promise<ReminderEvaluationSummary> {
    const results: ReminderRuleEvaluationResult[] = [];

    for (const rule of this.rules) {
      results.push(await this.evaluateRule(rule));
    }

    return {
      createdCount: results.reduce(
        (sum, result) => sum + result.createdCount,
        0,
      ),
      refreshedCount: results.reduce(
        (sum, result) => sum + result.refreshedCount,
        0,
      ),
      suppressedCount: results.reduce(
        (sum, result) => sum + result.suppressedCount,
        0,
      ),
      skippedRuleCount: results.filter(result => result.skippedReason).length,
      ruleResults: results,
    };
  }

  private buildReasonPayload(params: {
    rule: ReminderEvaluationRule;
    latestActivityAt: Date;
  }): ReminderReasonPayload {
    return {
      message: `You have not ${
        params.rule.activityDescription
      } in ${describeInactivityWindow(params.rule.inactivityDays)}`,
      activitySource: 'quest_event_receipts',
      activityDescription: params.rule.activityDescription,
      latestActivityAt: params.latestActivityAt.toISOString(),
      inactivityDays: params.rule.inactivityDays,
    };
  }

  private async getCooldownReminderEligibleAt(params: {
    quest: QuestRow;
    subjectRef: string;
    inactivityDays: number;
  }): Promise<Date | undefined> {
    const { quest, subjectRef, inactivityDays } = params;

    if (
      quest.completion_policy !== 'REPEATABLE' ||
      quest.cooldown_days === null
    ) {
      return undefined;
    }

    const lastAwardedAt = await this.questsRepo.getLastAwardedAt(
      subjectRef,
      quest.id,
    );
    if (!lastAwardedAt) {
      return undefined;
    }

    return new Date(
      lastAwardedAt.getTime() +
        (quest.cooldown_days + inactivityDays) * DAY_IN_MS,
    );
  }

  private async evaluateRule(
    rule: ReminderEvaluationRule,
  ): Promise<ReminderRuleEvaluationResult> {
    const now = this.now();
    const activitySource = rule.activitySource ?? 'quest_event_receipts';
    const baseResult: ReminderRuleEvaluationResult = {
      ruleKey: rule.key,
      questId: rule.questId,
      createdCount: 0,
      refreshedCount: 0,
      suppressedCount: 0,
    };

    if (activitySource !== 'quest_event_receipts') {
      this.logger.warn(
        `Skipping reminder rule '${rule.key}' for quest '${rule.questId}': unsupported activity source '${activitySource}'`,
      );
      return {
        ...baseResult,
        skippedReason: 'unsupported_activity_source',
      };
    }

    const quest = await this.questsRepo.getQuestById(rule.questId);
    if (!quest) {
      this.logger.warn(
        `Skipping reminder rule '${rule.key}': quest '${rule.questId}' was not found or is archived`,
      );
      return {
        ...baseResult,
        skippedReason: 'missing_quest',
      };
    }

    if (quest.subject_type !== 'user') {
      this.logger.warn(
        `Skipping reminder rule '${rule.key}' for quest '${rule.questId}': only user-scoped reminder evaluation is supported in v1`,
      );
      return {
        ...baseResult,
        skippedReason: 'unsupported_subject_type',
      };
    }

    const subjects = await this.questsRepo.listSubjectsWithQuestActivity(
      quest.id,
      quest.subject_type,
    );

    for (const subjectRef of subjects) {
      const latestActivityAt = await this.questsRepo.getLatestQuestActivityAt(
        quest.id,
        subjectRef,
      );
      if (!latestActivityAt) {
        continue;
      }

      const cooldownReminderEligibleAt =
        await this.getCooldownReminderEligibleAt({
          quest,
          subjectRef,
          inactivityDays: rule.inactivityDays,
        });
      if (cooldownReminderEligibleAt) {
        if (now.getTime() < cooldownReminderEligibleAt.getTime()) {
          continue;
        }
      } else if (
        now.getTime() - latestActivityAt.getTime() <
        rule.inactivityDays * DAY_IN_MS
      ) {
        continue;
      }

      const existingReminder = await this.reminderRepo.getReminderByIdentity(
        quest.id,
        subjectRef,
        rule.key,
      );

      if (existingReminder?.status === 'disabled') {
        baseResult.suppressedCount += 1;
        continue;
      }

      if (existingReminder) {
        const viewerState = await this.reminderRepo.getViewerState(
          existingReminder.id,
          subjectRef,
        );
        if (viewerState === 'dismissed' || viewerState === 'disabled') {
          baseResult.suppressedCount += 1;
          continue;
        }
      }

      await this.reminderRepo.createOrRefreshReminder({
        questId: quest.id,
        targetSubjectRef: subjectRef,
        targetSubjectType: 'user',
        ruleKey: rule.key,
        ruleKind: 'activity',
        reasonPayload: this.buildReasonPayload({
          rule,
          latestActivityAt,
        }),
        status: 'active',
        lastGeneratedAt: now,
      });

      if (existingReminder) {
        baseResult.refreshedCount += 1;
      } else {
        baseResult.createdCount += 1;
      }
    }

    return baseResult;
  }
}
