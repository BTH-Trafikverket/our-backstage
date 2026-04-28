import type {
  AuthService,
  DiscoveryService,
  LoggerService,
} from '@backstage/backend-plugin-api';
import type { ReminderRow } from '../repositories/reminderRepository';

type NotificationPayload = {
  title: string;
  description?: string;
  link?: string;
  severity?: 'critical' | 'high' | 'normal' | 'low';
  topic?: string;
  scope?: string;
  icon?: string;
  metadata?: Record<string, unknown>;
};

type NotificationSendOptions = {
  recipients: {
    type: 'entity';
    entityRef: string;
  };
  payload: NotificationPayload;
};

export class ReminderNotificationService {
  private readonly auth: AuthService;
  private readonly discovery: DiscoveryService;
  private readonly logger: LoggerService;

  constructor(options: {
    auth: AuthService;
    discovery: DiscoveryService;
    logger: LoggerService;
  }) {
    this.auth = options.auth;
    this.discovery = options.discovery;
    this.logger = options.logger;
  }

  private getReminderMessage(reminder: ReminderRow): string {
    const message = reminder.reason_payload.message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }

    const description = reminder.reason_payload.activityDescription;
    if (typeof description === 'string' && description.trim()) {
      return `You have a pending reminder to ${description}.`;
    }

    return 'You have a pending gamification reminder.';
  }

  async sendReminderNotification(params: {
    reminder: ReminderRow;
    questTitle: string;
  }): Promise<void> {
    const { reminder, questTitle } = params;
    const baseUrl = await this.discovery.getBaseUrl('notifications');
    const credentials = await this.auth.getOwnServiceCredentials();
    const { token } = await this.auth.getPluginRequestToken({
      onBehalfOf: credentials,
      targetPluginId: 'notifications',
    });
    const body: NotificationSendOptions = {
      recipients: {
        type: 'entity',
        entityRef: reminder.target_subject_ref,
      },
      payload: {
        title: `Quest reminder: ${questTitle}`,
        description: this.getReminderMessage(reminder),
        link: '/gamification',
        severity: 'normal',
        topic: 'gamification-reminders',
        scope: `gamification-reminder:${reminder.quest_id}:${reminder.target_subject_ref}:${reminder.rule_key}`,
        icon: 'notifications',
        metadata: {
          reminderId: reminder.id,
          questId: reminder.quest_id,
          ruleKey: reminder.rule_key,
          targetSubjectRef: reminder.target_subject_ref,
        },
      },
    };

    const response = await fetch(baseUrl, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => '');
      this.logger.warn(
        `Failed to send gamification reminder notification for reminder '${reminder.id}' with status ${response.status}`,
      );
      throw new Error(
        `Notification request failed with status ${response.status}${
          responseText ? `: ${responseText}` : ''
        }`,
      );
    }
  }
}
