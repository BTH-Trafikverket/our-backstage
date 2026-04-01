import type { Webhook, WebhookApiResponse, WebhookFormData } from './types';

export function validateWebhookForm(formData: WebhookFormData): string | null {
  if (!formData.title.trim()) {
    return 'Title is required';
  }

  if (!formData.url.trim()) {
    return 'URL is required';
  }

  if (!formData.event.trim()) {
    return 'Event is required';
  }

  try {
    const parsed = JSON.parse(formData.payload || '{}');
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      return 'Payload must be a JSON object';
    }
  } catch {
    return 'Invalid JSON in payload';
  }

  return null;
}

export function buildWebhookPayload(formData: WebhookFormData) {
  return {
    title: formData.title.trim(),
    description: formData.description.trim(),
    url: formData.url.trim(),
    event: formData.event,
    payload: JSON.parse(formData.payload || '{}') as Record<string, unknown>,
  };
}

export function normalizeWebhook(webhook: WebhookApiResponse): Webhook {
  const payload =
    webhook.payload &&
    !Array.isArray(webhook.payload) &&
    typeof webhook.payload === 'object'
      ? webhook.payload
      : {};

  return {
    id: webhook.id,
    title: webhook.title,
    description: webhook.description ?? '',
    url: webhook.url,
    events: Array.isArray(webhook.events) ? webhook.events : [],
    payload,
    createdAt: webhook.created_at,
  };
}

export async function readErrorMessage(response: Response): Promise<string> {
  const body = await response.text();

  if (!body) {
    return `Error: ${response.status} ${response.statusText}`;
  }

  try {
    const parsed = JSON.parse(body);
    return parsed.error?.message ?? parsed.message ?? body;
  } catch {
    return body;
  }
}
