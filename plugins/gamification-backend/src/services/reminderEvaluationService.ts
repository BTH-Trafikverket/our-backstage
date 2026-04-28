import type { LoggerService } from '@backstage/backend-plugin-api';
import type { ReminderReasonPayload } from '../repositories/reminderRepository';
import {
  ReminderRepository,
  type ReminderRow,
} from '../repositories/reminderRepository';
import type { QuestRow } from '../repositories/questsRepository';
import { QuestsRepository } from '../repositories/questsRepository';

export type ReminderActivitySource = 'quest_event_receipts';

export type ReminderEvaluationRule = {
  key: string;
  questId?: string;
  questTitle?: string;
  inactivityDays: number;
  activityDescription: string;
  activitySource?: ReminderActivitySource | string;
};

export type ReminderEvaluationOptions = {
  force?: boolean;
};

export type ReminderRuleEvaluationResult = {
  ruleKey: string;
  questId?: string;
  questTitle?: string;
  createdCount: number;
  refreshedCount: number;
  suppressedCount: number;
  notificationCount: number;
  notificationFailureCount: number;
  skippedReason?:
    | 'missing_quest'
    | 'unsupported_subject_type'
    | 'unsupported_activity_source';
};

export type ReminderEvaluationSummary = {
  createdCount: number;
  refreshedCount: number;
  suppressedCount: number;
  notificationCount: number;
  notificationFailureCount: number;
  skippedRuleCount: number;
  ruleResults: ReminderRuleEvaluationResult[];
};

export type ReminderNotificationSender = {
  sendReminderNotification(params: {
    reminder: ReminderRow;
    questTitle: string;
  }): Promise<void>;
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
  private readonly notificationSender?: ReminderNotificationSender;

  constructor(options: {
    questsRepo: QuestsRepository;
    reminderRepo: ReminderRepository;
    rules: ReminderEvaluationRule[];
    logger: LoggerService;
    now?: () => Date;
    notificationSender?: ReminderNotificationSender;
  }) {
    this.questsRepo = options.questsRepo;
    this.reminderRepo = options.reminderRepo;
    this.rules = options.rules;
    this.logger = options.logger;
    this.now = options.now ?? (() => new Date());
    this.notificationSender = options.notificationSender;
  }

  async evaluateConfiguredRules(
    options: ReminderEvaluationOptions = {},
  ): Promise<ReminderEvaluationSummary> {
    const results: ReminderRuleEvaluationResult[] = [];

    for (const rule of this.rules) {
      results.push(await this.evaluateRule(rule, options));
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
      notificationCount: results.reduce(
        (sum, result) => sum + result.notificationCount,
        0,
      ),
      notificationFailureCount: results.reduce(
        (sum, result) => sum + result.notificationFailureCount,
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

  private async getQuestForRule(
    rule: ReminderEvaluationRule,
  ): Promise<QuestRow | undefined> {
    if (rule.questId) {
      return this.questsRepo.getQuestById(rule.questId);
    }

    if (rule.questTitle) {
      return this.questsRepo.getQuestByTitle(rule.questTitle);
    }

    return undefined;
  }

  private async sendNotification(params: {
    result: ReminderRuleEvaluationResult;
    reminder: ReminderRow;
    quest: QuestRow;
  }): Promise<void> {
    if (!this.notificationSender) {
      return;
    }

    try {
      await this.notificationSender.sendReminderNotification({
        reminder: params.reminder,
        questTitle: params.quest.title,
      });
      params.result.notificationCount += 1;
    } catch (error) {
      params.result.notificationFailureCount += 1;
      this.logger.warn(
        `Failed to send reminder notification for rule '${params.reminder.rule_key}' and subject '${params.reminder.target_subject_ref}': ${error}`,
      );
    }
  }

  private async evaluateRule(
    rule: ReminderEvaluationRule,
    options: ReminderEvaluationOptions,
  ): Promise<ReminderRuleEvaluationResult> {
    const now = this.now();
    const activitySource = rule.activitySource ?? 'quest_event_receipts';
    const baseResult: ReminderRuleEvaluationResult = {
      ruleKey: rule.key,
      questId: rule.questId,
      questTitle: rule.questTitle,
      createdCount: 0,
      refreshedCount: 0,
      suppressedCount: 0,
      notificationCount: 0,
      notificationFailureCount: 0,
    };

    if (activitySource !== 'quest_event_receipts') {
      this.logger.warn(
        `Skipping reminder rule '${rule.key}' for quest '${
          rule.questId ?? rule.questTitle ?? 'unknown'
        }': unsupported activity source '${activitySource}'`,
      );
      return {
        ...baseResult,
        skippedReason: 'unsupported_activity_source',
      };
    }

    const quest = await this.getQuestForRule(rule);
    if (!quest) {
      this.logger.warn(
        `Skipping reminder rule '${rule.key}': quest '${
          rule.questId ?? rule.questTitle ?? 'unknown'
        }' was not found or is archived`,
      );
      return {
        ...baseResult,
        skippedReason: 'missing_quest',
      };
    }

    baseResult.questId = quest.id;
    baseResult.questTitle = quest.title;

    if (quest.subject_type !== 'user') {
      this.logger.warn(
        `Skipping reminder rule '${rule.key}' for quest '${quest.id}': only user-scoped reminder evaluation is supported in v1`,
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

      if (!options.force) {
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

      const reminder = await this.reminderRepo.createOrRefreshReminder({
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

      await this.sendNotification({
        result: baseResult,
        reminder,
        quest,
      });
    }

    return baseResult;
  }
}
