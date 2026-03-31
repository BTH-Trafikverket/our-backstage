export const WEBHOOK_EVENTS = [
  { id: 'quest.completed', label: 'Quest Completed' },
  { id: 'user.leveled_up', label: 'User Leveled Up' },
  { id: 'badge.earned', label: 'Badge Earned' },
] as const;

export type WebhookEventId = (typeof WEBHOOK_EVENTS)[number]['id'];

export type WebhookFormData = {
  title: string;
  description: string;
  url: string;
  event: WebhookEventId | '';
  payload: string;
};

export type Webhook = {
  id: string;
  title: string;
  description: string;
  url: string;
  events: string[];
  payload: Record<string, unknown>;
  createdAt: string;
};

export type WebhookTableRow = {
  id: string;
  webhook: Webhook;
};
