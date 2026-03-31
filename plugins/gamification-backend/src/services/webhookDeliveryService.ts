import type { WebhookRow } from '../repositories/webhooksRepository';

export class WebhookDeliveryService {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async sendWebhook(
    webhook: Pick<WebhookRow, 'id' | 'url' | 'json'>,
    payload: unknown = webhook.json,
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
