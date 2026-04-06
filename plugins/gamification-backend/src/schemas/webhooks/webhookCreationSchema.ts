import { z } from 'zod';

const supportedWebhookEvents = ['quest.completed', 'badge.earned'] as const;

export const webhookCreationSchema = z
  .object({
    title: z
      .string({ required_error: 'Title is required' })
      .trim()
      .min(1, 'Title is required'),
    description: z.string().trim().default(''),
    url: z
      .string({ required_error: 'URL is required' })
      .trim()
      .url('URL must be a valid URL'),
    event: z.enum(supportedWebhookEvents, {
      required_error: 'Event is required',
      invalid_type_error: 'Event is required',
    }),
    payload: z.record(z.unknown()).default({}),
  })
  .strict();

export type WebhookCreationInput = z.infer<typeof webhookCreationSchema>;
