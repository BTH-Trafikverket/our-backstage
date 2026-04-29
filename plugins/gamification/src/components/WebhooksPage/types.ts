export const WEBHOOK_EVENTS = [
  { id: 'quest.completed', label: 'Quest Completed' },
  { id: 'badge.earned', label: 'Badge Earned' },
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
] as const;

export type WebhookEventId = (typeof WEBHOOK_EVENTS)[number]['id'];

export type WebhookFormData = {
  title: string;
  description: string;
  url: string;
  event: WebhookEventId | '';
  payload: string;
};

export type WebhookEventMetadata = {
  event: string;
  labels: string[];
  template: Record<string, unknown>;
};

export type Webhook = {
  id: string;
  title: string;
  description: string;
  url: string;
  events: string[];
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type WebhookTableRow = {
  id: string;
  webhook: Webhook;
};

export type WebhookApiResponse = {
  id: string;
  title: string;
  description?: string;
  url: string;
  events?: string[];
  payload?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type WebhookReachabilityWarning = {
  message: string;
  url: string;
  canOverride: boolean;
};
