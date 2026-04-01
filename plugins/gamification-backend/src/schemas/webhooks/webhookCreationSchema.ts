import { z } from 'zod';

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
    event: z
      .string({ required_error: 'Event is required' })
      .trim()
      .min(1, 'Event is required'),
    payload: z.record(z.unknown()).default({}),
  })
  .strict();

export type WebhookCreationInput = z.infer<typeof webhookCreationSchema>;
