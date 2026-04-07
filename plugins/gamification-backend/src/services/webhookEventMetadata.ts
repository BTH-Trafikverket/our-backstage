type WebhookEventMetadataDefinition = {
  labels: readonly string[];
  template: Record<string, unknown>;
};

const WEBHOOK_EVENT_METADATA = {
  'quest.completed': {
    labels: ['username', 'quest_title', 'total_xp', 'xp_reward'],
    template: {
      content:
        '{{username}} completed {{quest_title}} and earned {{xp_reward}} XP.',
    },
  },
  'user.leveled_up': {
    labels: ['username', 'level', 'total_xp'],
    template: {
      content:
        '{{username}} reached level {{level}} with {{total_xp}} total XP.',
    },
  },
  'badge.earned': {
    labels: ['username', 'badge_title', 'total_xp', 'xp_reward'],
    template: {
      content:
        '{{username}} earned {{badge_title}} and gained {{xp_reward}} XP.',
    },
  },
  daily: {
    labels: ['period_key', 'time_zone', 'period_start', 'period_end_exclusive'],
    template: {
      content: 'Daily webhook for {{period_key}} in {{time_zone}}.',
      window: {
        start: '{{period_start}}',
        end_exclusive: '{{period_end_exclusive}}',
      },
    },
  },
  weekly: {
    labels: ['period_key', 'time_zone', 'period_start', 'period_end_exclusive'],
    template: {
      content: 'Weekly webhook for {{period_key}} in {{time_zone}}.',
      window: {
        start: '{{period_start}}',
        end_exclusive: '{{period_end_exclusive}}',
      },
    },
  },
  monthly: {
    labels: ['period_key', 'time_zone', 'period_start', 'period_end_exclusive'],
    template: {
      content: 'Monthly webhook for {{period_key}} in {{time_zone}}.',
      window: {
        start: '{{period_start}}',
        end_exclusive: '{{period_end_exclusive}}',
      },
    },
  },
} satisfies Record<string, WebhookEventMetadataDefinition>;

export type WebhookMetadataEventName = keyof typeof WEBHOOK_EVENT_METADATA;

export type WebhookEventMetadata = {
  event: WebhookMetadataEventName;
  labels: string[];
  template: Record<string, unknown>;
};

export function getStaticWebhookEventMetadata(
  event: string,
): WebhookEventMetadata | undefined {
  const metadata =
    WEBHOOK_EVENT_METADATA[event as keyof typeof WEBHOOK_EVENT_METADATA];

  if (!metadata) {
    return undefined;
  }

  return {
    event: event as WebhookMetadataEventName,
    labels: [...metadata.labels],
    template: structuredClone(metadata.template),
  };
}
