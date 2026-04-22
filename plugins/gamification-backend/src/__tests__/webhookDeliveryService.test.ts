import { WebhookDeliveryService } from '../services/webhookDeliveryService';

describe('WebhookDeliveryService', () => {
  it('sends the stored webhook payload as the default POST body', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });

    const service = new WebhookDeliveryService({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await service.sendWebhook({
      id: 'webhook-1',
      url: 'https://example.com/webhook',
      payload: { event: 'quest_completion' },
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.com/webhook',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ event: 'quest_completion' }),
        redirect: 'error',
        signal: expect.any(Object),
      }),
    );
  });

  it('allows the caller to override the payload at send time', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });

    const service = new WebhookDeliveryService({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await service.sendWebhook(
      {
        id: 'webhook-2',
        url: 'https://example.com/webhook',
        payload: { event: 'stored' },
      },
      { event: 'runtime' },
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.com/webhook',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ event: 'runtime' }),
        redirect: 'error',
        signal: expect.any(Object),
      }),
    );
  });

  it('throws when the webhook target returns a non-2xx response', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    const service = new WebhookDeliveryService({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(
      service.sendWebhook({
        id: 'webhook-3',
        url: 'https://example.com/webhook',
        payload: {},
      }),
    ).rejects.toThrow(`Webhook 'webhook-3' failed with status 500`);
  });

  it('rejects insecure webhook targets by default', async () => {
    const fetchImpl = jest.fn();
    const service = new WebhookDeliveryService({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(
      service.sendWebhook({
        id: 'webhook-4',
        url: 'http://localhost:7007/webhook',
        payload: {},
      }),
    ).rejects.toThrow(`Webhook 'webhook-4' must use HTTPS`);

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('supports an explicit host allowlist', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });
    const service = new WebhookDeliveryService({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      allowedHosts: ['hooks.example.com'],
    });

    await expect(
      service.sendWebhook({
        id: 'webhook-5',
        url: 'https://example.com/webhook',
        payload: {},
      }),
    ).rejects.toThrow(
      `Webhook 'webhook-5' target host 'example.com' is not allowed`,
    );
  });
});
