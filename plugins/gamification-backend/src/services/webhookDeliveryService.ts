import type { WebhookRow } from '../repositories/webhookRepository';

export class WebhookDeliveryService {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async sendWebhook(
    webhook: Pick<WebhookRow, 'id' | 'url' | 'payload'>,
    payload: unknown = webhook.payload,
  ): Promise<void> {
    const response = await this.fetchImpl(webhook.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(
        `Webhook '${webhook.id}' failed with status ${response.status}`,
      );
    }
  }
}
