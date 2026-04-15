import { isIP } from 'node:net';
import type { WebhookRow } from '../repositories/webhookRepository';

function isPrivateIpv4Address(hostname: string): boolean {
  const octets = hostname.split('.').map(part => Number(part));
  if (octets.length !== 4 || octets.some(octet => Number.isNaN(octet))) {
    return false;
  }

  const [first, second] = octets;
  return (
    first === 10 ||
    first === 127 ||
    first === 0 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function isPrivateIpv6Address(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:') ||
    normalized.startsWith('::ffff:127.')
  );
}

export class WebhookDeliveryService {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly allowedHosts: Set<string>;
  private readonly allowHttp: boolean;
  private readonly allowPrivateTargets: boolean;

  constructor(options?: {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    allowedHosts?: string[];
    allowHttp?: boolean;
    allowPrivateTargets?: boolean;
  }) {
    this.fetchImpl = options?.fetchImpl ?? fetch;
    this.timeoutMs = options?.timeoutMs ?? 10_000;
    this.allowedHosts = new Set(
      (options?.allowedHosts ?? []).map(host =>
        host.toLocaleLowerCase('en-US'),
      ),
    );
    this.allowHttp = options?.allowHttp ?? false;
    this.allowPrivateTargets = options?.allowPrivateTargets ?? false;
  }

  private validateTarget(webhook: Pick<WebhookRow, 'id' | 'url'>): URL {
    const url = new URL(webhook.url);
    const hostname = url.hostname.toLocaleLowerCase('en-US');

    if (url.username || url.password) {
      throw new Error(
        `Webhook '${webhook.id}' URL must not include embedded credentials`,
      );
    }

    if (
      url.protocol !== 'https:' &&
      !(this.allowHttp && url.protocol === 'http:')
    ) {
      throw new Error(`Webhook '${webhook.id}' must use HTTPS`);
    }

    if (this.allowedHosts.size > 0 && !this.allowedHosts.has(hostname)) {
      throw new Error(
        `Webhook '${webhook.id}' target host '${hostname}' is not allowed`,
      );
    }

    if (
      !this.allowPrivateTargets &&
      (hostname === 'localhost' ||
        hostname.endsWith('.localhost') ||
        (isIP(hostname) === 4 && isPrivateIpv4Address(hostname)) ||
        (isIP(hostname) === 6 && isPrivateIpv6Address(hostname)))
    ) {
      throw new Error(
        `Webhook '${webhook.id}' target host '${hostname}' is not allowed`,
      );
    }

    return url;
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
