import { InputError } from '@backstage/errors';
import { WebhookRepository } from '../repositories/webhookRepository';
import { WebhookService } from '../services/webhookService';

jest.mock('../repositories/webhookRepository');

describe('WebhookService', () => {
  let service: WebhookService;
  let webhookRepo: jest.Mocked<WebhookRepository>;

  beforeEach(() => {
    webhookRepo = {
      createWebhook: jest.fn(),
      getWebhookById: jest.fn(),
      getWebhookTriggerEvent: jest.fn(),
      updateWebhook: jest.fn(),
      deleteWebhook: jest.fn(),
      getPaginatedWebhooks: jest.fn(),
    } as any;

    service = new WebhookService({ webhookRepo });
  });

  it('creates webhooks only for known trigger events', async () => {
    webhookRepo.getWebhookTriggerEvent.mockResolvedValue(undefined);

    await expect(
      service.createWebhook(
        {
          title: 'Webhook',
          description: '',
          url: 'https://example.com/webhook',
          event: 'not.real',
          payload: {},
        },
        { credentials: {} as any },
      ),
    ).rejects.toThrow(InputError);

    expect(webhookRepo.createWebhook).not.toHaveBeenCalled();
  });

  it('returns undefined when editing a missing webhook', async () => {
    webhookRepo.getWebhookById.mockResolvedValue(undefined);

    await expect(
      service.editWebhook(
        'missing-webhook',
        { title: 'Updated Webhook' },
        { credentials: {} as any },
      ),
    ).resolves.toBeUndefined();

    expect(webhookRepo.getWebhookTriggerEvent).not.toHaveBeenCalled();
    expect(webhookRepo.updateWebhook).not.toHaveBeenCalled();
  });

  it('validates provided trigger events before updating a webhook', async () => {
    webhookRepo.getWebhookById.mockResolvedValue({
      id: 'webhook-1',
      title: 'Webhook',
      description: '',
      url: 'https://example.com/webhook',
      trigger_event_name: 'quest.completed',
      payload: {},
      created_at: new Date('2026-03-31T08:00:00.000Z'),
      updated_at: new Date('2026-03-31T08:00:00.000Z'),
    } as any);
    webhookRepo.getWebhookTriggerEvent.mockResolvedValue(undefined);

    await expect(
      service.editWebhook(
        'webhook-1',
        { event: 'not.real' },
        { credentials: {} as any },
      ),
    ).rejects.toThrow(InputError);

    expect(webhookRepo.updateWebhook).not.toHaveBeenCalled();
  });

  it('updates webhooks with mapped repository fields', async () => {
    webhookRepo.getWebhookById.mockResolvedValue({
      id: 'webhook-1',
      title: 'Webhook',
      description: '',
      url: 'https://example.com/webhook',
      trigger_event_name: 'quest.completed',
      payload: {},
      created_at: new Date('2026-03-31T08:00:00.000Z'),
      updated_at: new Date('2026-03-31T08:00:00.000Z'),
    } as any);
    webhookRepo.getWebhookTriggerEvent.mockResolvedValue({
      name: 'badge.earned',
      created_at: new Date('2026-03-31T08:00:00.000Z'),
      updated_at: new Date('2026-03-31T08:00:00.000Z'),
    } as any);
    webhookRepo.updateWebhook.mockResolvedValue({
      id: 'webhook-1',
      title: 'Updated Webhook',
      description: '',
      url: 'https://example.com/updated-webhook',
      trigger_event_name: 'badge.earned',
      payload: { retries: 3 },
      created_at: new Date('2026-03-31T08:00:00.000Z'),
      updated_at: new Date('2026-04-01T09:30:00.000Z'),
    } as any);

    await service.editWebhook(
      'webhook-1',
      {
        title: 'Updated Webhook',
        description: '',
        url: 'https://example.com/updated-webhook',
        event: 'badge.earned',
        payload: { retries: 3 },
      },
      { credentials: {} as any },
    );

    expect(webhookRepo.updateWebhook).toHaveBeenCalledWith('webhook-1', {
      title: 'Updated Webhook',
      description: '',
      url: 'https://example.com/updated-webhook',
      trigger_event_name: 'badge.earned',
      payload: { retries: 3 },
    });
  });

  it('delegates webhook deletion to the repository', async () => {
    webhookRepo.deleteWebhook.mockResolvedValue(true);

    await expect(
      service.deleteWebhook('webhook-1', {
        credentials: {} as any,
      }),
    ).resolves.toBe(true);

    expect(webhookRepo.deleteWebhook).toHaveBeenCalledWith('webhook-1');
  });
});
