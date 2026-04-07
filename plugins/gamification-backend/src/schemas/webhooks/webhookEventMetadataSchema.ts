import { z } from 'zod';

export const webhookEventMetadataParamsSchema = z
  .object({
    event: z
      .string({ required_error: 'Event is required' })
      .trim()
      .min(1, 'Event is required'),
  })
  .strict();

export type WebhookEventMetadataParams = z.infer<
  typeof webhookEventMetadataParamsSchema
>;
