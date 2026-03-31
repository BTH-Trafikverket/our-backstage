import { WebhookDeliveryService } from '../services/webhookDeliveryService';

describe('WebhookDeliveryService', () => {
  it('sends the stored webhook json as the default POST payload', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });

    const service = new WebhookDeliveryService(
      fetchImpl as unknown as typeof fetch,
    );

    await service.sendWebhook({
      id: 'webhook-1',
      url: 'https://example.com/webhook',
      json: { event: 'quest_completion' },
    });

    expect(fetchImpl).toHaveBeenCalledWith('https://example.com/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ event: 'quest_completion' }),
    });
  });

  it('allows the caller to override the payload at send time', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });

    const service = new WebhookDeliveryService(
      fetchImpl as unknown as typeof fetch,
    );

    await service.sendWebhook(
      {
        id: 'webhook-2',
        url: 'https://example.com/webhook',
        json: { event: 'stored' },
      },
      { event: 'runtime' },
    );

    expect(fetchImpl).toHaveBeenCalledWith('https://example.com/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ event: 'runtime' }),
    });
  });

  it('throws when the webhook target returns a non-2xx response', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    const service = new WebhookDeliveryService(
      fetchImpl as unknown as typeof fetch,
    );

    await expect(
      service.sendWebhook({
        id: 'webhook-3',
        url: 'https://example.com/webhook',
        json: {},
      }),
    ).rejects.toThrow(`Webhook 'webhook-3' failed with status 500`);
  });
});
