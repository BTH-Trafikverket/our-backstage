import type { WebhookRow } from '../repositories/webhookRepository';
import {
  normalizeWebhookTargetPolicy,
  validateWebhookTargetUrl,
  WebhookTargetValidationError,
} from './webhookTargetPolicy';

export class WebhookDeliveryService {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly targetPolicy: ReturnType<
    typeof normalizeWebhookTargetPolicy
  >;

  constructor(options?: {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    allowedHosts?: string[];
    allowHttp?: boolean;
    allowPrivateTargets?: boolean;
  }) {
    this.fetchImpl = options?.fetchImpl ?? fetch;
    this.timeoutMs = options?.timeoutMs ?? 10_000;
    this.targetPolicy = normalizeWebhookTargetPolicy(options);
  }

  private validateTarget(webhook: Pick<WebhookRow, 'id' | 'url'>): URL {
    try {
      return validateWebhookTargetUrl(webhook.url, this.targetPolicy);
    } catch (error) {
      if (!(error instanceof WebhookTargetValidationError)) {
        throw error;
      }

      switch (error.code) {
        case 'embeddedCredentials':
          throw new Error(
            `Webhook '${webhook.id}' URL must not include embedded credentials`,
          );
        case 'protocolNotAllowed':
          throw new Error(`Webhook '${webhook.id}' must use HTTPS`);
        case 'hostNotAllowed':
        case 'privateTargetNotAllowed':
          throw new Error(
            `Webhook '${webhook.id}' target host '${error.hostname}' is not allowed`,
          );
        default:
          throw error;
      }
    }
  }

  async sendWebhook(
    webhook: Pick<WebhookRow, 'id' | 'url' | 'payload'>,
    payload: unknown = webhook.payload,
  ): Promise<void> {
    const url = this.validateTarget(webhook);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(url.toString(), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
        redirect: 'error',
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(
          `Webhook '${webhook.id}' timed out after ${this.timeoutMs}ms`,
        );
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new Error(
        `Webhook '${webhook.id}' failed with status ${response.status}`,
      );
    }
  }
}
