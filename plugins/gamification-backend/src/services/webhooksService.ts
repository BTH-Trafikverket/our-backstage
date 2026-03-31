import type {
  CreateWebhookRow,
  WebhookRow,
} from '../repositories/webhooksRepository';
import { WebhooksRepository } from '../repositories/webhooksRepository';

export class WebhooksService {
  constructor(private readonly webhooksRepo: WebhooksRepository) {}

  async createWebhook(data: CreateWebhookRow): Promise<WebhookRow> {
    return this.webhooksRepo.createWebhook(data);
  }

  async listWebhooks(): Promise<WebhookRow[]> {
    return this.webhooksRepo.listWebhooks();
  }

  async getWebhooksByEvent(event: string): Promise<WebhookRow[]> {
    return this.webhooksRepo.getWebhooksByEvent(event);
  }

  async getScheduledWebhooks(): Promise<WebhookRow[]> {
    return this.webhooksRepo.getScheduledWebhooks();
  }
}
