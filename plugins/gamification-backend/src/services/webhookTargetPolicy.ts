import { isIP } from 'node:net';
import type { RootConfigService } from '@backstage/backend-plugin-api';

export type WebhookTargetPolicy = {
  allowedHosts?: string[];
  allowHttp?: boolean;
  allowPrivateTargets?: boolean;
};

export type WebhookDeliveryConfig = WebhookTargetPolicy & {
  requestTimeoutMs: number;
};

export type NormalizedWebhookTargetPolicy = {
  allowedHosts: Set<string>;
  allowHttp: boolean;
  allowPrivateTargets: boolean;
};

export type WebhookTargetValidationCode =
  | 'embeddedCredentials'
  | 'protocolNotAllowed'
  | 'hostNotAllowed'
  | 'privateTargetNotAllowed';

export class WebhookTargetValidationError extends Error {
  readonly code: WebhookTargetValidationCode;
  readonly hostname?: string;

  constructor(code: WebhookTargetValidationCode, hostname?: string) {
    super(`Webhook target validation failed: ${code}`);
    this.name = 'WebhookTargetValidationError';
    this.code = code;
    this.hostname = hostname;
  }
}

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

export function readWebhookDeliveryConfig(
  config: RootConfigService,
): WebhookDeliveryConfig {
  return {
    requestTimeoutMs:
      config.getOptionalNumber(
        'gamification.webhooks.delivery.requestTimeoutMs',
      ) ?? 10_000,
    allowedHosts:
      config.getOptionalStringArray(
        'gamification.webhooks.delivery.allowedHosts',
      ) ?? [],
    allowHttp:
      config.getOptionalBoolean('gamification.webhooks.delivery.allowHttp') ??
      false,
    allowPrivateTargets:
      config.getOptionalBoolean(
        'gamification.webhooks.delivery.allowPrivateTargets',
      ) ?? false,
  };
}

export function normalizeWebhookTargetPolicy(
  policy: WebhookTargetPolicy = {},
): NormalizedWebhookTargetPolicy {
  return {
    allowedHosts: new Set(
      (policy.allowedHosts ?? []).map(host => host.toLocaleLowerCase('en-US')),
    ),
    allowHttp: policy.allowHttp ?? false,
    allowPrivateTargets: policy.allowPrivateTargets ?? false,
  };
}

export function validateWebhookTargetUrl(
  urlString: string,
  policy: NormalizedWebhookTargetPolicy,
): URL {
  const url = new URL(urlString);
  const hostname = url.hostname.toLocaleLowerCase('en-US');

  if (url.username || url.password) {
    throw new WebhookTargetValidationError('embeddedCredentials');
  }

  if (
    url.protocol !== 'https:' &&
    !(policy.allowHttp && url.protocol === 'http:')
  ) {
    throw new WebhookTargetValidationError('protocolNotAllowed');
  }

  if (policy.allowedHosts.size > 0 && !policy.allowedHosts.has(hostname)) {
    throw new WebhookTargetValidationError('hostNotAllowed', hostname);
  }

  if (
    !policy.allowPrivateTargets &&
    (hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      (isIP(hostname) === 4 && isPrivateIpv4Address(hostname)) ||
      (isIP(hostname) === 6 && isPrivateIpv6Address(hostname)))
  ) {
    throw new WebhookTargetValidationError('privateTargetNotAllowed', hostname);
  }

  return url;
}
